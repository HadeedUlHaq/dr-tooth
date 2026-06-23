import { NextRequest, NextResponse } from "next/server"
import { sendToChat, toChatId } from "@/lib/whatsapp/openwaClient"
import { withinSendBudget } from "@/lib/whatsapp/antiBan"
import { appendMessages, getSession } from "@/lib/whatsapp/sessionService"

export const runtime = "nodejs"

type NotifyType = "booked" | "cancelled" | "rescheduled" | "confirmed"

type NotifyBody = {
  type: string
  patientPhone?: string
  patientName?: string
  date?: string
  time?: string
  message?: string
}

function prettyTime(time: string): string {
  if (time === "on-call") return "On Call"
  const m = /^(\d{2}):(\d{2})$/.exec(time)
  if (!m) return time
  let h = Number(m[1])
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  return `${h}:${m[2]} ${ampm}`
}

const TEMPLATES: Record<NotifyType, (p: { name: string; date: string; time: string }) => string> = {
  booked: ({ name, date, time }) =>
    `Hi ${name}! Your appointment at Dr Tooth Dental Clinic has been booked for ${date} at ${prettyTime(time)}. Reply here if you need to reschedule or cancel - or STOP to opt out.`,
  cancelled: ({ name, date, time }) =>
    `Hi ${name}! Your appointment at Dr Tooth Dental Clinic on ${date} at ${prettyTime(time)} has been cancelled. Reply here if you'd like to book a new appointment - or STOP to opt out.`,
  rescheduled: ({ name, date, time }) =>
    `Hi ${name}! Your appointment at Dr Tooth Dental Clinic has been rescheduled to ${date} at ${prettyTime(time)}. Reply here if you need further assistance - or STOP to opt out.`,
  confirmed: ({ name, date, time }) =>
    `Hi ${name}! Your appointment at Dr Tooth Dental Clinic on ${date} at ${prettyTime(time)} has been confirmed. We look forward to seeing you! Reply here if you need to reschedule - or STOP to opt out.`,
}

const VALID_TYPES = new Set<NotifyType>(["booked", "cancelled", "rescheduled", "confirmed"])

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NotifyBody

    if (!VALID_TYPES.has(body.type as NotifyType)) {
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 })
    }

    const phone = body.patientPhone?.replace(/\D/g, "")
    if (!phone) {
      return NextResponse.json({ error: "patientPhone is required" }, { status: 400 })
    }

    const name = body.patientName || "there"
    const date = body.date || ""
    const time = body.time || ""
    const template = TEMPLATES[body.type as NotifyType]
    const text = body.message || template({ name, date, time })

    const session = await getSession(phone)
    if (session.optedOut) {
      return NextResponse.json(
        { error: "Patient has opted out of WhatsApp messages" },
        { status: 409 },
      )
    }

    const budget = await withinSendBudget(phone)
    if (!budget.ok) {
      return NextResponse.json(
        { error: "WhatsApp send budget exceeded. Try again later.", reason: budget.reason },
        { status: 429 },
      )
    }

    // Use the stored chat JID when available. Some WhatsApp sessions are not @c.us.
    const chatId = session.chatId || toChatId(phone)
    await sendToChat(chatId, text)

    try {
      await appendMessages(phone, [
        { role: "assistant", content: text, timestamp: new Date().toISOString(), via: "notification" },
      ])
    } catch (err) {
      // Non-critical - don't fail the request if session logging fails.
      console.error("[notify] Failed to store notification in session:", String(err))
    }

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error("[notify] Error:", String(err))
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }
}
