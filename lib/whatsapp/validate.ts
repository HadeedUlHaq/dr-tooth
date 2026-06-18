// Shared input validators for the chatbot tools. Each returns a structured
// result so callers can hand a clear, model-friendly error back to the agent
// instead of throwing (which would crash the whole request).

export type ValidationResult = { ok: true } | { ok: false; message: string }

// Clinic business rules (Asia/Karachi, no DST).
const CLINIC_TZ = "Asia/Karachi"
const OPEN_MINUTES = 10 * 60 // 10:00
const CLOSE_MINUTES = 20 * 60 // 20:00 — last bookable start is 19:59
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// Today's calendar date in the clinic's timezone, as YYYY-MM-DD.
export function clinicToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ })
}

// Day of week for a YYYY-MM-DD string: 0 = Sunday … 6 = Saturday.
function weekday(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay()
}

// Require a non-empty string field on a tool input.
export function requireString(
  input: Record<string, unknown>,
  field: string
): ValidationResult {
  const v = input[field]
  if (typeof v !== "string" || !v.trim()) {
    return { ok: false, message: `Missing required value: ${field}.` }
  }
  return { ok: true }
}

// A YYYY-MM-DD date that is a real calendar date, not in the past, and on a day
// the clinic is open (Mon–Sat).
export function validateDate(raw: unknown): ValidationResult {
  const s = String(raw ?? "").trim()
  if (!DATE_RE.test(s)) {
    return { ok: false, message: "Date must be in YYYY-MM-DD format." }
  }
  // Reject impossible dates like 2026-02-31 (Date would roll over).
  const d = new Date(s + "T00:00:00Z")
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return { ok: false, message: "That is not a valid calendar date." }
  }
  if (s < clinicToday()) {
    return { ok: false, message: "That date is in the past. Please pick today or a future date." }
  }
  if (weekday(s) === 0) {
    return { ok: false, message: "The clinic is closed on Sundays (open Monday–Saturday)." }
  }
  return { ok: true }
}

// An HH:MM 24-hour time within business hours, or the literal "on-call".
export function validateTime(raw: unknown): ValidationResult {
  const s = String(raw ?? "").trim()
  if (s === "on-call") return { ok: true }
  if (!TIME_RE.test(s)) {
    return { ok: false, message: "Time must be in HH:MM 24-hour format, e.g. '14:30'." }
  }
  const [h, m] = s.split(":").map(Number)
  const mins = h * 60 + m
  if (mins < OPEN_MINUTES || mins >= CLOSE_MINUTES) {
    return { ok: false, message: "Clinic hours are 10:00–20:00. Please pick a time in that range." }
  }
  return { ok: true }
}

// Convenience for tool handlers: validate a slot (date + time) at once.
export function validateSlot(date: unknown, time: unknown): ValidationResult {
  const d = validateDate(date)
  if (!d.ok) return d
  return validateTime(time)
}
