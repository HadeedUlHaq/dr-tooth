import { getAdminDb } from "./firebaseAdmin"
import { FieldValue } from "firebase-admin/firestore"

type ToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
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
    name: "get_patient_appointments",
    description:
      "Get upcoming scheduled or confirmed appointments for a patient by their phone number.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Patient phone number" },
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
    name: "book_appointment",
    description:
      "Book a new appointment for a patient. Always call check_slot_availability first.",
    input_schema: {
      type: "object",
      properties: {
        patientName: { type: "string" },
        patientPhone: { type: "string", description: "Patient phone number" },
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
      "Cancel a patient's upcoming appointment. Identify it by phone number; if the patient has more than one, also pass the date to pick the right one.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Patient phone number" },
        date: {
          type: "string",
          description: "Appointment date YYYY-MM-DD (use when the patient has multiple bookings)",
        },
        reason: { type: "string", description: "Optional cancellation reason" },
      },
      required: ["patientPhone"],
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedule a patient's upcoming appointment to a new date/time. Identify the existing one by phone number (and current date if they have multiple). Always call check_slot_availability for the new slot first.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Patient phone number" },
        currentDate: {
          type: "string",
          description: "Current appointment date YYYY-MM-DD (use when the patient has multiple bookings)",
        },
        newDate: { type: "string", description: "New date in YYYY-MM-DD" },
        newTime: { type: "string", description: "New time in HH:MM 24-hour" },
      },
      required: ["patientPhone", "newDate", "newTime"],
    },
  },
  {
    name: "get_invoice_balance",
    description: "Get outstanding invoice balance for a patient.",
    input_schema: {
      type: "object",
      properties: {
        patientPhone: { type: "string", description: "Patient phone number" },
      },
      required: ["patientPhone"],
    },
  },
]

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  const db = getAdminDb()

  switch (toolName) {
    case "search_patient": {
      const term = (input.query as string).toLowerCase().trim()
      const snap = await db.collection("patients").get()
      const matches = snap.docs
        .filter((d) => {
          const data = d.data()
          return (
            (data.name as string)?.toLowerCase().includes(term) ||
            (data.phone as string)?.includes(term)
          )
        })
        .slice(0, 5)
        .map((d) => ({ id: d.id, name: d.data().name, phone: d.data().phone }))
      return JSON.stringify({ found: matches.length > 0, patients: matches })
    }

    case "create_patient": {
      const ref = await db.collection("patients").add({
        name: input.name,
        phone: input.phone,
        treatmentRequired: (input.treatmentRequired as string) || "Consultation",
        address: (input.address as string) || null,
        notes: (input.notes as string) || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "whatsapp_agent",
      })
      return JSON.stringify({ success: true, patientId: ref.id })
    }

    case "get_patient_appointments": {
      const phone = input.patientPhone as string
      const statuses = input.includeCompleted
        ? ["scheduled", "confirmed", "completed"]
        : ["scheduled", "confirmed"]
      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", phone)
        .where("status", "in", statuses)
        .get()
      const appointments = snap.docs.map((d) => ({
        id: d.id,
        date: d.data().date,
        time: d.data().time,
        doctorName: d.data().doctorName,
        status: d.data().status,
        notes: d.data().notes,
      }))
      return JSON.stringify({ appointments })
    }

    case "check_slot_availability": {
      const snap = await db
        .collection("appointments")
        .where("date", "==", input.date)
        .where("time", "==", input.time)
        .where("status", "in", ["scheduled", "confirmed"])
        .get()
      return JSON.stringify({
        available: snap.empty,
        date: input.date,
        time: input.time,
      })
    }

    case "book_appointment": {
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
        patientPhone: input.patientPhone,
        date: input.date,
        time: input.time,
        notes: (input.notes as string) || null,
        isFollowUp: (input.isFollowUp as boolean) || false,
        status: "scheduled",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "whatsapp_agent",
      })
      return JSON.stringify({
        success: true,
        appointmentId: ref.id,
        date: input.date,
        time: input.time,
      })
    }

    case "cancel_appointment": {
      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", input.patientPhone)
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
      await doc.ref.update({
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "whatsapp_agent",
        cancelReason: (input.reason as string) || "Cancelled via chat bot",
      })
      return JSON.stringify({
        success: true,
        cancelled: { date: doc.data().date, time: doc.data().time },
      })
    }

    case "reschedule_appointment": {
      const snap = await db
        .collection("appointments")
        .where("patientPhone", "==", input.patientPhone)
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

      await docs[0].ref.update({
        date: input.newDate,
        time: input.newTime,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "whatsapp_agent",
      })
      return JSON.stringify({
        success: true,
        newDate: input.newDate,
        newTime: input.newTime,
      })
    }

    case "get_invoice_balance": {
      const snap = await db
        .collection("invoices")
        .where("patientPhone", "==", input.patientPhone)
        .where("status", "in", ["unpaid", "partial"])
        .get()
      if (snap.empty) {
        return JSON.stringify({ hasBalance: false, totalBalance: 0 })
      }
      let totalBalance = 0
      const invoices = snap.docs.map((d) => {
        const data = d.data()
        totalBalance += (data.balanceDue as number) || 0
        return {
          id: d.id,
          date: data.date,
          total: data.total,
          balanceDue: data.balanceDue,
          status: data.status,
        }
      })
      return JSON.stringify({ hasBalance: true, totalBalance, invoices })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` })
  }
}
