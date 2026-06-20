import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, FieldValue } from "@/lib/whatsapp/firebaseAdmin"
import { sendToChat, toChatId } from "@/lib/whatsapp/openwaClient"

export const runtime = "nodejs"

// ─────────────────────────────────────────────────────────────────────────────
// Appointment reminders. A scheduler (cron on the gateway VM) POSTs here every
// ~15 min. We send a WhatsApp reminder ~1 day and ~1 hour before each appointment,
// using the patient's stored phone number (sent as <digits>@c.us — outbound to a
// known number, so no @lid issue). Each reminder is marked on the appointment so
// it's never sent twice.
//
// This route lives OUTSIDE /api/whatsapp so the dashboard auth middleware doesn't
// apply; it is protected by its own shared secret (REMINDER_SECRET).
//
// Test safety: while REMINDER_ALLOWLIST is set, reminders go ONLY to those numbers.
// Clear that env var to go live for all patients.
// ─────────────────────────────────────────────────────────────────────────────

const PKT_OFFSET = "+05:00" // Asia/Karachi, no DST
const MAX_PER_RUN = 100
const SEND_DELAY_MS = 800

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "")

// Lenient phone match (handles +92 / 0092 / 0 / country-code variants): compare
// the last 9 digits.
function samePhone(a: string, b: string): boolean {
  const x = digits(a)
  const y = digits(b)
  if (x.length < 7 || y.length < 7) return false
  return x.slice(-9) === y.slice(-9)
}

function prettyTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  let h = Number(m[1])
  const ampm = h >= 12 ? "PM" : "AM"
  h = h % 12 || 12
  return `${h}:${m[2]} ${ampm}`
}

function todayPlus(days: number): string {
  const now = new Date()
  const local = new Date(now.getTime() + 5 * 3600_000) // shift to PKT wall-clock
  local.setUTCDate(local.getUTCDate() + days)
  return local.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  // Auth: shared secret (header or Bearer). Fail closed if not configured.
  const secret = process.env.REMINDER_SECRET
  if (!secret) {
    return NextResponse.json({ error: "REMINDER_SECRET not configured" }, { status: 500 })
  }
  const authz = request.headers.get("authorization") || ""
  const provided = request.headers.get("x-cron-secret") || (authz.startsWith("Bearer ") ? authz.slice(7) : "")
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const allowlist = (process.env.REMINDER_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const testMode = allowlist.length > 0

  const db = getAdminDb()
  const today = todayPlus(0)
  const tomorrow = todayPlus(1)
  const now = Date.now()

  // Active appointments for today + tomorrow only.
  const snap = await db
    .collection("appointments")
    .where("status", "in", ["scheduled", "confirmed"])
    .get()

  let sent = 0
  let dayCount = 0
  let hourCount = 0
  let skippedNoPhone = 0
  let skippedNotAllowed = 0
  const errors: string[] = []

  for (const doc of snap.docs) {
    if (sent >= MAX_PER_RUN) break
    const a = doc.data() as Record<string, unknown>
    const date = String(a.date || "")
    const time = String(a.time || "")
    if (date !== today && date !== tomorrow) continue
    if (!time || time === "on-call") continue

    const apptMs = Date.parse(`${date}T${time}:00${PKT_OFFSET}`)
    if (Number.isNaN(apptMs)) continue
    const minsUntil = (apptMs - now) / 60000

    // Which reminder, if any, is due now (and not already sent)?
    let kind: "day" | "hour" | null = null
    if (minsUntil >= 1395 && minsUntil <= 1455 && !a.reminderDayBeforeSentAt) kind = "day"
    else if (minsUntil >= 45 && minsUntil <= 75 && !a.reminderHourBeforeSentAt) kind = "hour"
    if (!kind) continue

    const phone = String(a.patientPhone || "")
    if (!digits(phone)) {
      skippedNoPhone++
      continue
    }
    if (testMode && !allowlist.some((p) => samePhone(p, phone))) {
      skippedNotAllowed++
      continue
    }

    const name = String(a.patientName || "there")
    const t = prettyTime(time)
    const text =
      kind === "hour"
        ? `Hi ${name}! ⏰ Reminder: your appointment at Dr Tooth Dental Clinic is *today at ${t}*. See you soon! Reply here if you need to reschedule.`
        : `Hi ${name}! 📅 Reminder: you have an appointment at Dr Tooth Dental Clinic *tomorrow (${date}) at ${t}*. Reply here if you need to reschedule or cancel.`

    try {
      await sendToChat(toChatId(phone), text)
      await doc.ref.update({
        [kind === "hour" ? "reminderHourBeforeSentAt" : "reminderDayBeforeSentAt"]:
          FieldValue.serverTimestamp(),
      })
      sent++
      if (kind === "day") dayCount++
      else hourCount++
      await sleep(SEND_DELAY_MS)
    } catch (err) {
      errors.push(`${name} (${date} ${time}): ${String(err)}`)
    }
  }

  return NextResponse.json({
    status: "ok",
    testMode,
    today,
    tomorrow,
    checked: snap.size,
    sent,
    dayReminders: dayCount,
    hourReminders: hourCount,
    skippedNoPhone,
    skippedNotAllowed,
    errors: errors.slice(0, 10),
  })
}

// Convenience for manual checks (no secret needed for a no-op GET).
export async function GET() {
  return NextResponse.json({ status: "ok", service: "appointment reminders", hint: "POST with X-Cron-Secret to run" })
}
