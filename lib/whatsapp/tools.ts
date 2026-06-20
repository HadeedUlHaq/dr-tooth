import { getAdminDb, FieldValue, FieldPath, type Firestore, type DocumentSnapshot } from "./firebaseAdmin"
import type { WhatsAppSession } from "../types"
import { requireString, validateDate, validateTime, validateSlot, clinicToday } from "./validate"
import { CLINIC_INFO, SERVICES } from "./clinicInfo"
import { isStaffElevated } from "./staffAuth"
import { sendToChat } from "./openwaClient"
import { getAllSessions, resetSessionMemory } from "./sessionService"
import { normalizePhone } from "./phone"

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

// Staff broadcast safety: hard recipient cap + a pause between sends (anti-ban).
const MAX_BROADCAST = 50
const BROADCAST_DELAY_MS = 800
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Returned by any staff tool invoked without a valid staff session (defense in
// depth — the tool list already hides these from patients, but never trust that).
const NOT_AUTH = JSON.stringify({
  error: "not_authorized",
  message: "Staff session required. Ask them to send their PIN (e.g. 'staff <PIN>').",
})

// Loose date check for staff inputs (they may legitimately query past dates or
// Sundays, which validateDate rejects).
const DATE_FMT = /^\d{4}-\d{2}-\d{2}$/

// (normalizePhone lives in ./phone — shared with sessionService to avoid a cycle.)

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

// Resolve the caller's phone for this session.
// SECURITY: if we have a VERIFIED WhatsApp number (resolved from their @lid), that
// always wins — a number the user TYPES can never override it, so a WhatsApp patient
// can only ever act on their own records (closes the impersonation/IDOR hole).
// Otherwise (e.g. web chat, no verified number) we lock to the first phone supplied.
function resolveCallerPhone(
  session: WhatsAppSession,
  input: Record<string, unknown>
): string | null {
  if (session.realPhone) {
    session.patientPhone = session.realPhone
    return session.realPhone
  }
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
// Failures here must never break the patient-facing action. Staff actions pass the
// authenticated staff member's name so the log attributes the action to a person.
async function writeAudit(
  db: Firestore,
  type: string,
  message: string,
  actorName = "AI Receptionist",
  actorId = "whatsapp_agent"
): Promise<void> {
  try {
    await db.collection("activity_logs").add({
      type,
      message,
      actorName,
      actorId,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error("[audit log failed]", String(err))
  }
}

// ── Time-off blocks (staff mark slots/days unavailable; patient booking respects them) ──
const BLOCKS_COLLECTION = "whatsapp_blocks"

// Blocked times for a date: a full-day flag plus the set of blocked HH:MM slots
// (half-open ranges [startTime, endTime) expanded onto the 30-min booking grid).
async function getBlockedTimes(
  db: Firestore,
  date: string
): Promise<{ fullDay: boolean; times: Set<string> }> {
  const times = new Set<string>()
  let fullDay = false
  try {
    const snap = await db.collection(BLOCKS_COLLECTION).where("date", "==", date).get()
    for (const d of snap.docs) {
      const b = d.data() as { fullDay?: boolean; startTime?: string; endTime?: string }
      if (b.fullDay) {
        fullDay = true
        continue
      }
      if (b.startTime && b.endTime) {
        for (const t of allSlots()) if (t >= b.startTime && t < b.endTime) times.add(t)
      } else if (b.startTime) {
        times.add(b.startTime)
      }
    }
  } catch (err) {
    console.error("[getBlockedTimes failed]", String(err))
  }
  return { fullDay, times }
}

// Find a staff target's appointments by patient NAME or phone, optionally filtered
// by a specific date/time. With no date, returns only UPCOMING ones (today onward),
// soonest first — so "cancel Tim's appointment" resolves without the staff member
// (or the model) having to know the exact date.
async function findStaffAppointments(
  db: Firestore,
  input: Record<string, unknown>
): Promise<DocumentSnapshot[]> {
  const snap = await db
    .collection("appointments")
    .where("status", "in", ["scheduled", "confirmed"])
    .get()
  let docs: DocumentSnapshot[] = snap.docs
  if (input.patientPhone) {
    const want = normalizePhone(input.patientPhone)
    docs = docs.filter((d) => normalizePhone(d.data().patientPhone) === want)
  } else if (input.patientName) {
    docs = docs.filter((d) => nameMatches(input.patientName, d.data().patientName))
  }
  if (input.date) {
    docs = docs.filter((d) => d.data().date === input.date)
  } else {
    const today = clinicToday()
    docs = docs.filter((d) => String(d.data().date) >= today)
  }
  if (input.time) docs = docs.filter((d) => d.data().time === input.time)
  docs.sort((a, b) =>
    `${a.data().date} ${a.data().time}`.localeCompare(`${b.data().date} ${b.data().time}`)
  )
  return docs
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
    name: "reset_conversation",
    description:
      "Forget the previous patient's identity and chat history and start a completely fresh conversation. Call this ONLY when the person indicates they are a NEW or different patient, that they are not the previous person, or they explicitly ask to start over.",
    input_schema: { type: "object", properties: {} },
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

// Staff/doctor-only tools. Exposed to the model ONLY for an authenticated staff
// session (see agent.toOpenAITools); every handler also re-checks elevation.
export const STAFF_TOOLS: ToolDefinition[] = [
  {
    name: "staff_day_overview",
    description:
      "Staff: get the clinic schedule and patient counts for a day. Use for 'how many patients today', today's/any-day appointment list, next appointment.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD. Defaults to today if omitted." },
      },
    },
  },
  {
    name: "staff_upcoming_appointments",
    description:
      "Staff: the NEXT upcoming appointments across all dates (today onward, future times only), soonest first. Use for 'who is my next patient', 'next appointment', 'what's coming up'. Always call this fresh — never answer from memory.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many to return (default 5, max 20)" },
      },
    },
  },
  {
    name: "staff_find_patient",
    description:
      "Staff: look up a patient's FULL details (name, phone, address, treatment, notes) plus their upcoming appointments and outstanding balance. Staff-only — reveals PII.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Patient name or phone number" },
      },
      required: ["query"],
    },
  },
  {
    name: "staff_cancel_appointment",
    description:
      "Staff: cancel ANY patient's appointment. Identify the patient by name (or phone) — the date is OPTIONAL; the tool finds their upcoming appointment(s). Only pass date/time to disambiguate when the tool reports multiple. Call once WITHOUT confirmed to stage it, then again with confirmed:true after the staff member says yes.",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string", description: "Patient's name (provide name or phone)" },
        patientPhone: { type: "string", description: "Patient's phone (provide name or phone)" },
        date: { type: "string", description: "Optional: appointment date YYYY-MM-DD, to disambiguate" },
        time: { type: "string", description: "Optional: appointment time HH:MM, to disambiguate" },
        reason: { type: "string", description: "Optional cancellation reason" },
        confirmed: { type: "boolean", description: "Set true ONLY after the staff member explicitly confirms" },
      },
      required: [],
    },
  },
  {
    name: "staff_reschedule_appointment",
    description:
      "Staff: move ANY patient's appointment to a new time. Identify by name (or phone). The current date is OPTIONAL (the tool finds the upcoming appointment); newDate is OPTIONAL and defaults to the appointment's existing date. Two-step: stage without confirmed, then confirm with confirmed:true.",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string", description: "Patient's name (provide name or phone)" },
        patientPhone: { type: "string", description: "Patient's phone (provide name or phone)" },
        date: { type: "string", description: "Optional: current appointment date YYYY-MM-DD, to disambiguate" },
        time: { type: "string", description: "Optional: current appointment time HH:MM, to disambiguate" },
        newDate: { type: "string", description: "New date YYYY-MM-DD. Omit to keep the same day." },
        newTime: { type: "string", description: "New time HH:MM 24-hour (required)" },
        confirmed: { type: "boolean", description: "Set true ONLY after the staff member explicitly confirms" },
      },
      required: ["newTime"],
    },
  },
  {
    name: "staff_revenue_summary",
    description:
      "Staff: financial summary — amount invoiced on a date, payments collected on that date, and total outstanding balance across all unpaid/partial invoices.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "staff_block_time",
    description:
      "Staff: block off time so the patient bot will NOT offer or book it. Provide a date with either fullDay:true, or a startTime and endTime (HH:MM). Two-step: stage without confirmed, then confirm with confirmed:true.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD" },
        fullDay: { type: "boolean", description: "Block the entire day" },
        startTime: { type: "string", description: "Range start HH:MM (when not fullDay)" },
        endTime: { type: "string", description: "Range end HH:MM, exclusive (when not fullDay)" },
        reason: { type: "string", description: "Optional reason (e.g. 'doctor on leave')" },
        confirmed: { type: "boolean", description: "Set true ONLY after the staff member explicitly confirms" },
      },
      required: ["date"],
    },
  },
  {
    name: "staff_list_blocks",
    description: "Staff: list the time-off blocks currently set (optionally for one date).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Optional date YYYY-MM-DD to filter to" },
      },
    },
  },
  {
    name: "staff_unblock",
    description:
      "Staff: remove time-off blocks for a date (optionally only the block starting at a given time), re-opening those slots for booking.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD" },
        startTime: { type: "string", description: "Optional: only remove the block starting at this HH:MM" },
      },
      required: ["date"],
    },
  },
  {
    name: "staff_broadcast",
    description:
      "Staff: send a WhatsApp message to ALL of a day's patients (e.g. 'running 30 min late'). Two-step: call WITHOUT confirmed to see the recipient count and preview, then confirm with confirmed:true to send.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to send to patients" },
        date: { type: "string", description: "Whose patients (by appointment date) YYYY-MM-DD. Defaults to today." },
        confirmed: { type: "boolean", description: "Set true ONLY after the staff member explicitly confirms sending" },
      },
      required: ["message"],
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

      // Prefer the VERIFIED WhatsApp number over whatever the model passed.
      const newPhone = session.realPhone || String(input.phone).trim()
      const ref = await db.collection("patients").add({
        name: input.name,
        phone: newPhone,
        treatmentRequired: (input.treatmentRequired as string) || "Consultation",
        address: (input.address as string) || null,
        notes: (input.notes as string) || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "whatsapp_agent",
      })
      // New patient becomes the caller's locked identity for this session.
      session.patientId = ref.id
      session.patientName = String(input.name)
      session.patientPhone = newPhone
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
      // Match by NORMALISED phone so the caller's (verified) number matches records
      // saved in any format ("+92 300 …", "0300…", bare digits).
      const want = normalizePhone(phone)
      const snap = await db.collection("appointments").where("status", "in", statuses).get()
      const appointments = snap.docs
        .filter((d) => normalizePhone(d.data().patientPhone) === want)
        .map((d) => ({
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
      const blocked = await getBlockedTimes(db, input.date as string)
      if (blocked.fullDay || blocked.times.has(input.time as string)) {
        return JSON.stringify({ available: false, date: input.date, time: input.time, reason: "blocked" })
      }
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
      const blocked = await getBlockedTimes(db, input.date as string)
      if (blocked.fullDay) return JSON.stringify({ date: input.date, availableSlots: [], reason: "blocked" })
      const free = allSlots().filter((t) => !booked.has(t) && !blocked.times.has(t))
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
        const blocked = await getBlockedTimes(db, input.date as string)
        if (blocked.fullDay || blocked.times.has(input.time as string)) {
          return JSON.stringify({ success: false, reason: "That time is blocked off and not available." })
        }
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
      const wantC = normalizePhone(phone)
      const snap = await db
        .collection("appointments")
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      let docs = snap.docs.filter((d) => normalizePhone(d.data().patientPhone) === wantC)
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

      const wantR = normalizePhone(phone)
      const snap = await db
        .collection("appointments")
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      let docs = snap.docs.filter((d) => normalizePhone(d.data().patientPhone) === wantR)
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

    case "reset_conversation": {
      await resetSessionMemory(session.phoneNumber)
      // Clear the in-memory session too so this turn doesn't re-persist the old identity.
      session.patientId = null
      session.patientName = null
      session.patientPhone = null
      session.phase = "idle"
      session.pendingAction = null
      session.invoiceAttempts = 0
      return JSON.stringify({
        success: true,
        message: "Fresh start — previous identity and history cleared. Greet them as a new patient and collect their name/phone again when needed.",
      })
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

    // ───────────────────────── Staff/doctor tools ─────────────────────────
    // Every staff case re-checks elevation (defense in depth).
    case "staff_day_overview": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const date = (input.date as string) || clinicToday()
      const snap = await db.collection("appointments").where("date", "==", date).get()
      const counts: Record<string, number> = {}
      // The list shows ACTIVE appointments (scheduled/confirmed/completed); cancelled &
      // missed are reflected in `counts` only, so "how many patients" isn't inflated.
      const appointments = snap.docs
        .map((d) => {
          const a = d.data()
          counts[a.status] = (counts[a.status] || 0) + 1
          return {
            date: a.date,
            time: a.time,
            patientName: a.patientName,
            patientPhone: a.patientPhone ?? null,
            status: a.status,
            treatment: a.notes ?? null,
          }
        })
        .filter((a) => a.status !== "cancelled" && a.status !== "missed")
      appointments.sort((x, y) => String(x.time).localeCompare(String(y.time)))
      return JSON.stringify({ date, activeCount: appointments.length, counts, appointments })
    }

    case "staff_upcoming_appointments": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20)
      const today = clinicToday()
      const nowHM = new Date().toLocaleTimeString("en-GB", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
      })
      const snap = await db
        .collection("appointments")
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      const upcoming = snap.docs
        .filter((d) => {
          const dt = String(d.data().date)
          const tm = String(d.data().time)
          if (dt < today) return false
          if (dt === today && tm !== "on-call" && tm < nowHM) return false // already passed today
          return true
        })
        .sort((a, b) =>
          `${a.data().date} ${a.data().time}`.localeCompare(`${b.data().date} ${b.data().time}`)
        )
      const appointments = upcoming.slice(0, limit).map((d) => ({
        date: d.data().date,
        time: d.data().time,
        patientName: d.data().patientName,
        patientPhone: d.data().patientPhone ?? null,
        status: d.data().status,
        treatment: d.data().notes ?? null,
      }))
      return JSON.stringify({ now: `${today} ${nowHM}`, totalUpcoming: upcoming.length, appointments })
    }

    case "staff_find_patient": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const guard = requireString(input, "query")
      if (!guard.ok) return JSON.stringify({ error: "validation", message: guard.message })
      const raw = (input.query as string).trim()
      const digits = raw.replace(/\D/g, "")
      let docs: DocumentSnapshot[]
      if (digits.length >= 7) {
        const snap = await db.collection("patients").where("phone", "==", raw).limit(5).get()
        docs = snap.docs
      } else {
        const high = String.fromCharCode(0xf8ff)
        const snap = await db
          .collection("patients")
          .orderBy("name")
          .startAt(raw)
          .endAt(raw + high)
          .limit(5)
          .get()
        docs = snap.docs
      }
      const patients = []
      for (const doc of docs) {
        const p = doc.data() as Record<string, unknown>
        const phone = String(p.phone ?? "")
        // Upcoming appointments for this patient.
        const apptSnap = await db
          .collection("appointments")
          .where("patientPhone", "==", phone)
          .where("status", "in", ["scheduled", "confirmed"])
          .get()
        // Outstanding balance across their unpaid/partial invoices.
        const wanted = normalizePhone(phone)
        const invSnap = await db.collection("invoices").where("status", "in", ["unpaid", "partial"]).get()
        let outstanding = 0
        for (const inv of invSnap.docs) {
          if (normalizePhone(inv.data().patientPhone) === wanted) outstanding += Number(inv.data().balanceDue || 0)
        }
        patients.push({
          name: p.name,
          phone: p.phone,
          address: p.address ?? null,
          treatmentRequired: p.treatmentRequired ?? null,
          notes: p.notes ?? null,
          upcomingAppointments: apptSnap.docs.map((d) => ({ date: d.data().date, time: d.data().time, status: d.data().status })),
          outstandingBalance: outstanding,
        })
      }
      return JSON.stringify({ found: patients.length > 0, patients })
    }

    case "staff_cancel_appointment": {
      if (!isStaffElevated(session)) return NOT_AUTH
      if (!input.patientName && !input.patientPhone) {
        return JSON.stringify({ error: "validation", message: "Identify the patient by name or phone." })
      }
      const docs = await findStaffAppointments(db, input)
      if (docs.length === 0) return JSON.stringify({ success: false, reason: "No upcoming appointment found for that patient." })
      if (docs.length > 1) {
        return JSON.stringify({
          success: false,
          needsClarification: true,
          message: "Multiple upcoming appointments — ask which date/time to cancel.",
          appointments: docs.map((d) => ({ patientName: d.data().patientName, date: d.data().date, time: d.data().time })),
        })
      }
      const doc = docs[0]
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = { type: "staff_cancel_appointment", appointmentId: doc.id }
        return JSON.stringify({
          needsConfirmation: true,
          action: "cancel",
          appointment: { patientName: doc.data().patientName, date: doc.data().date, time: doc.data().time },
          message: "Confirm with the staff member, then call again with confirmed:true.",
        })
      }
      await doc.ref.update({
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: `staff:${session.staffName}`,
        cancelReason: (input.reason as string) || `Cancelled by ${session.staffName} via WhatsApp`,
      })
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "appointment_status_changed",
        `Appointment cancelled by ${session.staffName} for ${doc.data().patientName} on ${doc.data().date} at ${doc.data().time}`,
        session.staffName || "Staff",
        "whatsapp_staff"
      )
      return JSON.stringify({ success: true, cancelled: { patientName: doc.data().patientName, date: doc.data().date, time: doc.data().time } })
    }

    case "staff_reschedule_appointment": {
      if (!isStaffElevated(session)) return NOT_AUTH
      if (!input.patientName && !input.patientPhone) {
        return JSON.stringify({ error: "validation", message: "Identify the patient by name or phone." })
      }
      if (!input.newTime) {
        return JSON.stringify({ error: "validation", message: "Provide the new time (HH:MM)." })
      }
      const docs = await findStaffAppointments(db, input)
      if (docs.length === 0) return JSON.stringify({ success: false, reason: "No upcoming appointment found for that patient." })
      if (docs.length > 1) {
        return JSON.stringify({
          success: false,
          needsClarification: true,
          message: "Multiple upcoming appointments — ask which one to move.",
          appointments: docs.map((d) => ({ patientName: d.data().patientName, date: d.data().date, time: d.data().time })),
        })
      }
      const doc = docs[0]
      // New date defaults to the appointment's existing date when not specified.
      const newDate = (input.newDate as string) || (doc.data().date as string)
      const slot = validateSlot(newDate, input.newTime)
      if (!slot.ok) return JSON.stringify({ success: false, error: "validation", message: slot.message })
      // New slot must be free (excluding this same appointment) and not blocked.
      if (input.newTime !== "on-call") {
        const blocked = await getBlockedTimes(db, newDate)
        if (blocked.fullDay || blocked.times.has(input.newTime as string)) {
          return JSON.stringify({ success: false, reason: "The new time is blocked off." })
        }
        const clash = await db
          .collection("appointments")
          .where("date", "==", newDate)
          .where("time", "==", input.newTime)
          .where("status", "in", ["scheduled", "confirmed"])
          .get()
        if (clash.docs.some((c) => c.id !== doc.id)) {
          return JSON.stringify({ success: false, reason: "The new time slot is already booked." })
        }
      }
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = { type: "staff_reschedule_appointment", appointmentId: doc.id }
        return JSON.stringify({
          needsConfirmation: true,
          action: "reschedule",
          patientName: doc.data().patientName,
          from: { date: doc.data().date, time: doc.data().time },
          to: { date: newDate, time: input.newTime },
          message: "Confirm with the staff member, then call again with confirmed:true.",
        })
      }
      await doc.ref.update({
        date: newDate,
        time: input.newTime,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: `staff:${session.staffName}`,
      })
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "appointment_updated",
        `Appointment rescheduled by ${session.staffName} for ${doc.data().patientName} to ${newDate} at ${input.newTime}`,
        session.staffName || "Staff",
        "whatsapp_staff"
      )
      return JSON.stringify({ success: true, patientName: doc.data().patientName, newDate, newTime: input.newTime })
    }

    case "staff_revenue_summary": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const date = (input.date as string) || clinicToday()
      // Total outstanding across all unpaid/partial invoices.
      const outSnap = await db.collection("invoices").where("status", "in", ["unpaid", "partial"]).get()
      let outstandingTotal = 0
      for (const d of outSnap.docs) outstandingTotal += Number(d.data().balanceDue || 0)
      // Invoiced on the date.
      const daySnap = await db.collection("invoices").where("date", "==", date).get()
      let invoicedToday = 0
      for (const d of daySnap.docs) invoicedToday += Number(d.data().total || 0)
      // Payments actually collected on the date (a payment may settle an older invoice),
      // scanned over recent invoices.
      let collectedToday = 0
      const recent = await db.collection("invoices").orderBy("date", "desc").limit(500).get()
      for (const d of recent.docs) {
        const pays = (d.data().payments as { date?: string; amount?: number }[]) || []
        for (const p of pays) if (String(p.date ?? "").slice(0, 10) === date) collectedToday += Number(p.amount || 0)
      }
      return JSON.stringify({ date, invoicedToday, collectedToday, outstandingTotal, invoiceCountToday: daySnap.size })
    }

    case "staff_block_time": {
      if (!isStaffElevated(session)) return NOT_AUTH
      if (!DATE_FMT.test(String(input.date ?? ""))) {
        return JSON.stringify({ error: "validation", message: "Provide a date (YYYY-MM-DD)." })
      }
      const fullDay = input.fullDay === true
      if (!fullDay) {
        if (!input.startTime || !input.endTime) {
          return JSON.stringify({ error: "validation", message: "Provide startTime and endTime (HH:MM), or set fullDay:true." })
        }
        const ts = validateTime(input.startTime)
        if (!ts.ok) return JSON.stringify({ error: "validation", message: ts.message })
        const te = validateTime(input.endTime)
        if (!te.ok) return JSON.stringify({ error: "validation", message: te.message })
        if (String(input.endTime) <= String(input.startTime)) {
          return JSON.stringify({ error: "validation", message: "endTime must be after startTime." })
        }
      }
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = { type: "staff_block_time" }
        return JSON.stringify({
          needsConfirmation: true,
          action: "block",
          block: { date: input.date, fullDay, startTime: input.startTime ?? null, endTime: input.endTime ?? null },
          message: "Confirm with the staff member, then call again with confirmed:true.",
        })
      }
      await db.collection(BLOCKS_COLLECTION).add({
        date: input.date,
        fullDay,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        reason: (input.reason as string) || null,
        createdBy: `staff:${session.staffName}`,
        createdAt: FieldValue.serverTimestamp(),
      })
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "appointment_updated",
        `Time blocked by ${session.staffName}: ${input.date} ${fullDay ? "(full day)" : `${input.startTime}-${input.endTime}`}`,
        session.staffName || "Staff",
        "whatsapp_staff"
      )
      return JSON.stringify({ success: true, blocked: { date: input.date, fullDay, startTime: input.startTime ?? null, endTime: input.endTime ?? null } })
    }

    case "staff_list_blocks": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const base = db.collection(BLOCKS_COLLECTION)
      const snap = input.date
        ? await base.where("date", "==", input.date).limit(100).get()
        : await base.orderBy("date").limit(100).get()
      const blocks = snap.docs.map((d) => {
        const b = d.data()
        return { date: b.date, fullDay: !!b.fullDay, startTime: b.startTime ?? null, endTime: b.endTime ?? null, reason: b.reason ?? null }
      })
      return JSON.stringify({ blocks })
    }

    case "staff_unblock": {
      if (!isStaffElevated(session)) return NOT_AUTH
      if (!DATE_FMT.test(String(input.date ?? ""))) {
        return JSON.stringify({ error: "validation", message: "Provide the date (YYYY-MM-DD)." })
      }
      const snap = await db.collection(BLOCKS_COLLECTION).where("date", "==", input.date).get()
      let docs = snap.docs
      if (input.startTime) docs = docs.filter((d) => d.data().startTime === input.startTime)
      if (docs.length === 0) return JSON.stringify({ success: false, reason: "No matching block found." })
      for (const d of docs) await d.ref.delete()
      await writeAudit(
        db,
        "appointment_updated",
        `Time block(s) removed by ${session.staffName}: ${input.date}${input.startTime ? ` ${input.startTime}` : ""}`,
        session.staffName || "Staff",
        "whatsapp_staff"
      )
      return JSON.stringify({ success: true, removed: docs.length })
    }

    case "staff_broadcast": {
      if (!isStaffElevated(session)) return NOT_AUTH
      const guard = requireString(input, "message")
      if (!guard.ok) return JSON.stringify({ error: "validation", message: "Provide the message to send." })
      const date = (input.date as string) || clinicToday()
      const apptSnap = await db
        .collection("appointments")
        .where("date", "==", date)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      // Map each patient phone to a messageable JID via their WhatsApp session.
      const sessions = await getAllSessions()
      const phoneToJid = new Map<string, string>()
      for (const s of sessions) {
        if (!s.chatId) continue
        phoneToJid.set(normalizePhone(s.phoneNumber), s.chatId)
        if (s.patientPhone) phoneToJid.set(normalizePhone(s.patientPhone), s.chatId)
      }
      const recipients = new Map<string, { name: string; jid: string }>() // dedupe by jid
      let unreachable = 0
      for (const d of apptSnap.docs) {
        const a = d.data()
        const jid = phoneToJid.get(normalizePhone(a.patientPhone))
        if (jid) recipients.set(jid, { name: a.patientName, jid })
        else unreachable++
      }
      const list = [...recipients.values()]
      if (input.confirmed !== true) {
        session.phase = "awaiting_confirmation"
        session.pendingAction = { type: "staff_broadcast" }
        return JSON.stringify({
          needsConfirmation: true,
          action: "broadcast",
          date,
          recipientCount: list.length,
          unreachable,
          cappedAt: MAX_BROADCAST,
          sampleNames: list.slice(0, 5).map((r) => r.name),
          messagePreview: String(input.message).slice(0, 200),
          message: "Confirm with the staff member, then call again with confirmed:true to send.",
        })
      }
      const toSend = list.slice(0, MAX_BROADCAST)
      let sent = 0
      for (const r of toSend) {
        try {
          await sendToChat(r.jid, String(input.message))
          sent++
          await sleep(BROADCAST_DELAY_MS)
        } catch (e) {
          console.error("[broadcast send failed]", String(e))
        }
      }
      session.phase = "idle"
      session.pendingAction = null
      await writeAudit(
        db,
        "patient_updated",
        `Broadcast sent by ${session.staffName} to ${sent} patient(s) for ${date}`,
        session.staffName || "Staff",
        "whatsapp_staff"
      )
      return JSON.stringify({ success: true, sent, totalRecipients: list.length, cappedAt: MAX_BROADCAST, unreachable })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}
