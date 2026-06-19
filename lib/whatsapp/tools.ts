import { getAdminDb, FieldValue, FieldPath, type Firestore, type DocumentSnapshot } from "./firebaseAdmin"
import type { WhatsAppSession } from "../types"
import { requireString, validateDate, validateTime, validateSlot } from "./validate"
import { CLINIC_INFO, SERVICES } from "./clinicInfo"

type ToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// Per-request trust context. Tools read the caller's identity from the session
// (established once, then locked) rather than trusting whatever phone/name the
// model extracts from the chat text on each turn.
export type AgentContext = {
  session: WhatsAppSession
}

// After how many failed invoice lookups in one session we stop answering, so the
// short invoice ids can't be brute-forced.
const MAX_INVOICE_ATTEMPTS = 5

// Reduce any Pakistani phone format to its canonical 10-digit local form so
// lookups match regardless of how the number was typed/stored:
//   "+92 324 0010884", "0092-324-0010884", "03240010884" -> "3240010884"
function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "")
  if (d.startsWith("0092")) d = d.slice(4)
  else if (d.startsWith("92")) d = d.slice(2)
  else if (d.startsWith("0")) d = d.slice(1)
  return d
}

// Strip a leading "#" and surrounding whitespace from an invoice number so both
// "kyVSrAbw" and "#kyVSrAbw" resolve to the same Firestore document id.
function sanitizeInvoiceNumber(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^#+/, "").trim()
}

// Collapse a name for comparison: lowercase, single-spaced, trimmed.
function normalizeName(raw: unknown): string {
  return String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim()
}

// True when two names plausibly refer to the same person: identical, or every
// token of the shorter name appears as a whole token in the longer one. This
// rejects loose single-letter substring matches like "a" ~ "Ali Raza".
function nameMatches(a: unknown, b: unknown): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = na.split(" ")
  const tb = nb.split(" ")
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every((t) => long.includes(t))
}

// Resolve the caller's phone for this session. Once a caller has identified
// themselves, the phone is locked for the rest of the conversation; otherwise we
// seed it from the first phone they supply. Returns null if no identity yet.
function resolveCallerPhone(
  session: WhatsAppSession,
  input: Record<string, unknown>
): string | null {
  if (session.patientPhone) return session.patientPhone
  const provided = String(input.patientPhone ?? "").trim()
  if (!provided) return null
  session.patientPhone = provided
  if (input.patientName && !session.patientName) {
    session.patientName = String(input.patientName)
  }
  return provided
}

// Generate the bookable start times (10:00–19:30, 30-min steps).
function allSlots(): string[] {
  const slots: string[] = []
  for (let m = 10 * 60; m <= 19 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60)
    const min = m % 60
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`)
  }
  return slots
}

// Write an audit trail entry, matching the shape used by lib/activityService.ts.
// Failures here must never break the patient-facing action.
async function writeAudit(
  db: Firestore,
  type: string,
  message: string
): Promise<void> {
  try {
    await db.collection("activity_logs").add({
      type,
      message,
      actorName: "AI Receptionist",
      actorId: "whatsapp_agent",
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error("[audit log failed]", String(err))
  }
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "search_patient",
    description:
      "Search for an existing patient by name or phone number. Call this first when the user identifies themselves.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Patient name or phone number to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "create_patient",
    description: "Register a new patient who does not yet exist in the system.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the patient" },
        phone: { type: "string", description: "Phone number" },
        treatmentRequired: {
          type: "string",
          description: "Initial treatment reason, default 'Consultation'",
        },
        address: { type: "string", description: "Optional home address" },
        notes: { type: "string", description: "Optional additional notes" },
      },
      required: ["name", "phone"],
    },
  },
  {
    name: "get_clinic_info",
    description:
      "Get factual clinic information: name, location, opening hours, and the list of services with their prices (in PKR). Use this to answer ANY question about hours, location, services offered, or how much a treatment costs — never guess these.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_patient_appointments",
    description:
      "Get the caller's upcoming scheduled or confirmed appointments. Uses the phone the caller has identified with.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: {
          type: "string",
          description: "Caller's phone number (used only to identify them the first time)",
        },
        includeCompleted: {
          type: "boolean",
          description: "Whether to include past completed appointments. Default false.",
        },
      },
      required: ["patientPhone"],
    },
  },
  {
    name: "check_slot_availability",
    description:
      "Check whether a specific date and time slot is available (not already booked).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        time: { type: "string", description: "Time in HH:MM 24-hour format, e.g. '10:30'" },
      },
      required: ["date", "time"],
    },
  },
  {
    name: "suggest_available_slots",
    description:
      "List the free appointment times on a given date (within clinic hours). Use this when the patient asks what times are open, instead of guessing.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a new appointment for the caller. Always call check_slot_availability (or suggest_available_slots) first.",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string" },
        patientPhone: { type: "string", description: "Caller's phone number" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM 24-hour, or 'on-call'" },
        notes: { type: "string", description: "Optional notes from the patient" },
        isFollowUp: { type: "boolean", description: "Whether this is a follow-up visit" },
      },
      required: ["patientName", "patientPhone", "date", "time"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Cancel the caller's upcoming appointment. Call once WITHOUT 'confirmed' to stage it and show the patient what will be cancelled; only call again with confirmed:true after the patient explicitly says yes. If they have more than one, pass the date to pick the right one.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Caller's phone number" },
        date: {
          type: "string",
          description: "Appointment date YYYY-MM-DD (use when the patient has multiple bookings)",
        },
        reason: { type: "string", description: "Optional cancellation reason" },
        confirmed: {
          type: "boolean",
          description: "Set true ONLY after the patient has explicitly confirmed the cancellation",
        },
      },
      required: ["patientPhone"],
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedule the caller's upcoming appointment to a new date/time. Always check the new slot first. Call once WITHOUT 'confirmed' to stage it, then again with confirmed:true after the patient explicitly says yes.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Caller's phone number" },
        currentDate: {
          type: "string",
          description: "Current appointment date YYYY-MM-DD (use when the patient has multiple bookings)",
        },
        newDate: { type: "string", description: "New date in YYYY-MM-DD" },
        newTime: { type: "string", description: "New time in HH:MM 24-hour" },
        confirmed: {
          type: "boolean",
          description: "Set true ONLY after the patient has explicitly confirmed the reschedule",
        },
      },
      required: ["patientPhone", "newDate", "newTime"],
    },
  },
  {
    name: "get_invoice_by_number",
    description:
      "Look up a single invoice by its invoice number (the reference printed on the patient's receipt, e.g. 'kyVSrAbw' or '#kyVSrAbw'). PREFERRED for any billing question — ask the patient for their invoice number first. Verifies the caller by name or phone before revealing any amounts.",
    input_schema: {
      type: "object",
      properties: {
        invoiceNumber: {
          type: "string",
          description: "Invoice number from the receipt, with or without a leading '#'",
        },
        patientName: {
          type: "string",
          description: "Name the caller gave, used to verify the invoice belongs to them",
        },
        patientPhone: {
          type: "string",
          description: "Phone the caller gave, used to verify the invoice belongs to them",
        },
      },
      required: ["invoiceNumber"],
    },
  },
  {
    name: "get_invoice_balance",
    description:
      "Fallback summary of the caller's outstanding balance across all their invoices. Use only when the patient does not have their invoice number; otherwise prefer get_invoice_by_number.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Caller's phone number" },
      },
      required: ["patientPhone"],
    },
  },
  {
    name: "request_callback",
    description:
      "Log a request for a staff member to call the patient back. Use this for emergencies, disputes, or anything you cannot handle, so a human follows up.",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string", description: "Patient's name" },
        patientPhone: { type: "string", description: "Phone number to call back" },
        reason: { type: "string", description: "Why they need a callback" },
      },
      required: ["reason"],
    },
  },
]

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<string> {
  const db = getAdminDb()
  const session = ctx.session

  switch (toolName) {
    case "search_patient": {
      const guard = requireString(input, "query")
      if (!guard.ok) return JSON.stringify({ error: "validation", message: guard.message })
      const raw = (input.query as string).trim()
      const digits = raw.replace(/\D/g, "")

      const results: { name: string }[] = []
      if (digits.length >= 7) {
        // Phone path: exact match on the stored phone, capped — no full scan.
        const snap = await db
          .collection("patients")
          .where("phone", "==", raw)
          .limit(5)
          .get()
        for (const d of snap.docs) results.push({ name: d.data().name as string })
      } else {
        // Name path: case-sensitive prefix range on the indexed name field, capped.
        const start = raw
        const end = raw + ""
        const snap = await db
          .collection("patients")
          .orderBy("name")
          .startAt(start)
          .endAt(end)
          .limit(5)
          .get()
        for (const d of snap.docs) results.push({ name: d.data().name as string })
      }
      // Only the name is returned — never other patients' phone numbers.
      return JSON.stringify({ found: results.length > 0, patients: results })
    }

    case "create_patient": {
      const nameGuard = requireString(input, "name")
      if (!nameGuard.ok) return JSON.stringify({ error: "validation", message: nameGuard.message })
      const phoneGuard = requireString(input, "phone")
      if (!phoneGuard.ok) return JSON.stringify({ error: "validation", message: phoneGuard.message })

      const ref = await db.collection("patients").add({
        name: input.name,
        phone: input.phone,
        treatmentRequired: (input.treatmentRequired as string) || "Consultation",
        address: (input.address as string) || null,
        notes: (input.notes as string) || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "whatsapp_agent",
      })
      // New patient becomes the caller's locked identity for this session.
      session.patientId = ref.id
      session.patientName = String(input.name)
      session.patientPhone = String(input.phone).trim()
      await writeAudit(db, "patient_added", `New patient registered via chatbot: ${input.name}`)
      return JSON.stringify({ success: true })
    }

    case "get_clinic_info": {
      return JSON.stringify({
        ...CLINIC_INFO,
        services: SERVICES.map((s) => ({ name: s.name, price: s.price })),
        priceNote: "Prices are starting estimates in PKR; final cost is confirmed at the clinic.",
      })
    }

    case "get_patient_appointments": {
      const phone = resolveCallerPhone(session, input)
      if (!phone) {
        return JSON.stringify({ error: "needs_identification", message: "Ask the patient for their phone number first." })
      }
      const statuses = input.includeCompleted
        ? ["scheduled", "confirmed", "completed"]
        : ["scheduled", "confirmed"]
      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", phone)
        .where("status", "in", statuses)
        .get()
      const appointments = snap.docs.map((d) => ({
        date: d.data().date,
        time: d.data().time,
        doctorName: d.data().doctorName,
        status: d.data().status,
        notes: d.data().notes,
      }))
      return JSON.stringify({ appointments })
    }

    case "check_slot_availability": {
      const slot = validateSlot(input.date, input.time)
      if (!slot.ok) return JSON.stringify({ available: false, error: "validation", message: slot.message })
      const snap = await db
        .collection("appointments")
        .where("date", "==", input.date)
        .where("time", "==", input.time)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      return JSON.stringify({ available: snap.empty, date: input.date, time: input.time })
    }

    case "suggest_available_slots": {
      const dateCheck = validateDate(input.date)
      if (!dateCheck.ok) return JSON.stringify({ error: "validation", message: dateCheck.message })
      const snap = await db
        .collection("appointments")
        .where("date", "==", input.date)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      const booked = new Set(snap.docs.map((d) => d.data().time as string))
      const free = allSlots().filter((t) => !booked.has(t))
      return JSON.stringify({ date: input.date, availableSlots: free })
    }

    case "book_appointment": {
      const nameGuard = requireString(input, "patientName")
      if (!nameGuard.ok) return JSON.stringify({ success: false, error: "validation", message: nameGuard.message })
      const phone = resolveCallerPhone(session, input)
      if (!phone) {
        return JSON.stringify({ success: false, error: "needs_identification", message: "Ask the patient for their phone number first." })
      }
      const slot = validateSlot(input.date, input.time)
      if (!slot.ok) return JSON.stringify({ success: false, error: "validation", message: slot.message })

      if (input.time !== "on-call") {
        const overlapSnap = await db
          .collection("appointments")
          .where("date", "==", input.date)
          .where("time", "==", input.time)
          .where("status", "in", ["scheduled", "confirmed"])
          .get()
        if (!overlapSnap.empty) {
          return JSON.stringify({ success: false, reason: "Time slot already booked" })
        }
      }
      const ref = await db.collection("appointments").add({
        patientName: input.patientName,
        patientPhone: phone,
        date: input.date,
        time: input.time,
        notes: (input.notes as string) || null,
        isFollowUp: (input.isFollowUp as boolean) || false,
        status: "scheduled",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "whatsapp_agent",
      })
      await writeAudit(
        db,
        "appointment_created",
        `Appointment booked via chatbot for ${input.patientName} on ${input.date} at ${input.time}`
      )
      return JSON.stringify({ success: true, appointmentId: ref.id, date: input.date, time: input.time })
    }

    case "cancel_appointment": {
      const phone = resolveCallerPhone(session, input)
      if (!phone) {
        return JSON.stringify({ success: false, error: "needs_identification", message: "Ask the patient for their phone number first." })
      }
      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", phone)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      let docs = snap.docs
      if (input.date) docs = docs.filter((d) => d.data().date === input.date)

      if (docs.length === 0) {
        return JSON.stringify({ success: false, reason: "No matching upcoming appointment found" })
      }
      if (docs.length > 1) {
        return JSON.stringify({
          success: false,
          needsClarification: true,
          message: "Patient has multiple upcoming appointments — ask which date to cancel.",
          appointments: docs.map((d) => ({ date: d.data().date, time: d.data().time })),
        })
      }

      const doc = docs[0]
      // Two-step: stage first, only delete after explicit confirmation.
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = {
          type: "cancel_appointment",
          appointmentId: doc.id,
          date: doc.data().date,
          time: doc.data().time,
        }
        return JSON.stringify({
          needsConfirmation: true,
          action: "cancel",
          appointment: { date: doc.data().date, time: doc.data().time },
          message: "Confirm with the patient before cancelling, then call again with confirmed:true.",
        })
      }

      await doc.ref.update({
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "whatsapp_agent",
        cancelReason: (input.reason as string) || "Cancelled via chat bot",
      })
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "appointment_status_changed",
        `Appointment cancelled via chatbot for ${session.patientName ?? phone} on ${doc.data().date} at ${doc.data().time}`
      )
      return JSON.stringify({ success: true, cancelled: { date: doc.data().date, time: doc.data().time } })
    }

    case "reschedule_appointment": {
      const phone = resolveCallerPhone(session, input)
      if (!phone) {
        return JSON.stringify({ success: false, error: "needs_identification", message: "Ask the patient for their phone number first." })
      }
      const slot = validateSlot(input.newDate, input.newTime)
      if (!slot.ok) return JSON.stringify({ success: false, error: "validation", message: slot.message })

      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", phone)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      let docs = snap.docs
      if (input.currentDate) docs = docs.filter((d) => d.data().date === input.currentDate)

      if (docs.length === 0) {
        return JSON.stringify({ success: false, reason: "No matching upcoming appointment found" })
      }
      if (docs.length > 1) {
        return JSON.stringify({
          success: false,
          needsClarification: true,
          message: "Patient has multiple upcoming appointments — ask which one to reschedule.",
          appointments: docs.map((d) => ({ date: d.data().date, time: d.data().time })),
        })
      }

      // Make sure the new slot isn't already taken
      if (input.newTime !== "on-call") {
        const clash = await db
          .collection("appointments")
          .where("date", "==", input.newDate)
          .where("time", "==", input.newTime)
          .where("status", "in", ["scheduled", "confirmed"])
          .get()
        if (!clash.empty) {
          return JSON.stringify({ success: false, reason: "The new time slot is already booked" })
        }
      }

      const doc = docs[0]
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = {
          type: "reschedule_appointment",
          appointmentId: doc.id,
          from: { date: doc.data().date, time: doc.data().time },
          to: { date: input.newDate, time: input.newTime },
        }
        return JSON.stringify({
          needsConfirmation: true,
          action: "reschedule",
          from: { date: doc.data().date, time: doc.data().time },
          to: { date: input.newDate, time: input.newTime },
          message: "Confirm with the patient before rescheduling, then call again with confirmed:true.",
        })
      }

      await doc.ref.update({
        date: input.newDate,
        time: input.newTime,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "whatsapp_agent",
      })
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "appointment_updated",
        `Appointment rescheduled via chatbot for ${session.patientName ?? phone} to ${input.newDate} at ${input.newTime}`
      )
      return JSON.stringify({ success: true, newDate: input.newDate, newTime: input.newTime })
    }

    case "get_invoice_by_number": {
      if ((session.invoiceAttempts ?? 0) >= MAX_INVOICE_ATTEMPTS) {
        return JSON.stringify({
          found: false,
          locked: true,
          message: "Too many invoice lookup attempts. Please contact the clinic to verify your bill.",
        })
      }
      const num = sanitizeInvoiceNumber(input.invoiceNumber)
      if (!num) {
        return JSON.stringify({ found: false, reason: "No invoice number provided" })
      }

      // The number patients see is the first 8 chars of the full Firestore doc id
      // (invoice.id.slice(0, 8) — see the dashboard + print template). Resolve it:
      // try an exact full-id match first, then a doc-id prefix range for the short
      // number. Case-sensitive, matching how the id is displayed.
      let candidates: DocumentSnapshot[]
      const exact = await db.collection("invoices").doc(num).get()
      if (exact.exists) {
        candidates = [exact]
      } else {
        const high = String.fromCharCode(0xf8ff)
        const snap = await db
          .collection("invoices")
          .orderBy(FieldPath.documentId())
          .startAt(num)
          .endAt(num + high)
          .limit(5)
          .get()
        candidates = snap.docs
      }

      if (candidates.length === 0) {
        session.invoiceAttempts = (session.invoiceAttempts ?? 0) + 1
        return JSON.stringify({ found: false, invoiceNumber: num })
      }

      // Identity check: caller must match the invoice by phone (normalized) or by
      // a meaningful name match before any amounts are revealed.
      const claimedPhone = input.patientPhone
        ? normalizePhone(input.patientPhone)
        : session.patientPhone
        ? normalizePhone(session.patientPhone)
        : ""
      const claimedName = input.patientName ?? session.patientName ?? ""

      if (!claimedPhone && !normalizeName(claimedName)) {
        return JSON.stringify({
          found: true,
          needsVerification: true,
          message: "Ask the caller for the name or phone on the invoice to verify before sharing amounts.",
        })
      }

      const match = candidates.find((c) => {
        const d = c.data() as Record<string, unknown>
        const phoneOk = !!claimedPhone && claimedPhone === normalizePhone(d.patientPhone)
        return phoneOk || nameMatches(claimedName, d.patientName)
      })
      if (!match) {
        session.invoiceAttempts = (session.invoiceAttempts ?? 0) + 1
        return JSON.stringify({
          found: true,
          verified: false,
          message: "Caller details do not match this invoice. Do not reveal amounts; ask them to recheck or contact the clinic.",
        })
      }

      // Verified — report figures EXACTLY as stored. Echo back the short number
      // the patient recognizes, not the full internal doc id.
      const data = match.data() as Record<string, unknown>
      session.invoiceAttempts = 0
      return JSON.stringify({
        found: true,
        verified: true,
        invoiceNumber: match.id.slice(0, 8),
        patientName: data.patientName,
        date: data.date,
        total: data.total ?? 0,
        amountPaid: data.amountPaid ?? 0,
        balanceDue: data.balanceDue ?? 0,
        status: data.status ?? "unpaid",
      })
    }

    case "get_invoice_balance": {
      const phone = resolveCallerPhone(session, input)
      if (!phone) {
        return JSON.stringify({ error: "needs_identification", message: "Ask the patient for their phone number first." })
      }
      const wanted = normalizePhone(phone)
      const snap = await db
        .collection("invoices")
        .where("status", "in", ["unpaid", "partial"])
        .get()
      const matched = snap.docs.filter((d) => normalizePhone(d.data().patientPhone) === wanted)
      if (matched.length === 0) {
        return JSON.stringify({ hasBalance: false, totalBalance: 0 })
      }
      let totalBalance = 0
      const invoices = matched.map((d) => {
        const data = d.data()
        totalBalance += (data.balanceDue as number) || 0
        return {
          invoiceNumber: d.id,
          date: data.date,
          total: data.total,
          balanceDue: data.balanceDue,
          status: data.status,
        }
      })
      return JSON.stringify({ hasBalance: true, totalBalance, invoices })
    }

    case "request_callback": {
      const reasonGuard = requireString(input, "reason")
      if (!reasonGuard.ok) return JSON.stringify({ error: "validation", message: reasonGuard.message })
      const name = (input.patientName as string) || session.patientName || null
      const phone = (input.patientPhone as string) || session.patientPhone || null
      await db.collection("callback_requests").add({
        patientName: name,
        patientPhone: phone,
        reason: input.reason,
        status: "pending",
        source: "web_chat",
        createdAt: FieldValue.serverTimestamp(),
      })
      await writeAudit(db, "patient_updated", `Callback requested via chatbot: ${input.reason}`)
      return JSON.stringify({ success: true, message: "A staff member will call back during clinic hours." })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}
