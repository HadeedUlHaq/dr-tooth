import { timingSafeEqual } from "crypto"
import type { WhatsAppSession } from "../types"

// ─────────────────────────────────────────────────────────────────────────────
// Staff/doctor elevation for the WhatsApp bot.
//
// Inbound senders arrive as `@lid` privacy ids, so we can't recognise staff by
// phone number. Instead a staff member sends a secret PIN ("staff <pin>"); on a
// match we mark THIS session (their stable WhatsApp device) as elevated for a
// time-boxed window. The PIN is verified deterministically in the webhook and is
// NEVER routed through the LLM or stored in chat history.
//
// Doctor and receptionist share the same powers — the role is kept only for the
// greeting and the audit trail.
// ─────────────────────────────────────────────────────────────────────────────

export const STAFF_AUTH_TTL_MS = 8 * 60 * 60 * 1000 // 8h, then re-PIN
export const MAX_PIN_ATTEMPTS = 5 // failed PINs per session before lockout

export type StaffRole = "doctor" | "receptionist"
export interface StaffIdentity {
  name: string
  role: StaffRole
}

// Registry from env STAFF_PINS: comma-separated `Name:role:pin` entries, e.g.
//   "Dr Ali:doctor:4821,Reception:receptionist:1107"
// Role defaults to "doctor" if omitted/unrecognised.
function loadStaffRegistry(): { identity: StaffIdentity; pin: string }[] {
  const raw = process.env.STAFF_PINS || ""
  const out: { identity: StaffIdentity; pin: string }[] = []
  for (const entry of raw.split(",")) {
    const parts = entry.split(":").map((p) => p.trim())
    if (parts.length < 2) continue
    const name = parts[0]
    // Support both "Name:pin" and "Name:role:pin".
    const role: StaffRole = parts.length >= 3 && parts[1].toLowerCase() === "receptionist"
      ? "receptionist"
      : "doctor"
    const pin = parts.length >= 3 ? parts[2] : parts[1]
    if (!name || !pin) continue
    out.push({ identity: { name, role }, pin })
  }
  return out
}

// Constant-time string compare that doesn't leak length via early return.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) {
    // Still do a comparison to keep timing roughly uniform, then return false.
    timingSafeEqual(ba, ba)
    return false
  }
  return timingSafeEqual(ba, bb)
}

// Verify a submitted PIN against the registry. Returns the staff identity or null.
export function verifyStaffPin(pin: string): StaffIdentity | null {
  const candidate = String(pin ?? "").trim()
  if (!candidate) return null
  let match: StaffIdentity | null = null
  // Check every entry (don't short-circuit) so timing doesn't reveal which matched.
  for (const { identity, pin: known } of loadStaffRegistry()) {
    if (safeEqual(candidate, known)) match = identity
  }
  return match
}

export type StaffCommand =
  | { kind: "login"; pin: string }
  | { kind: "logout" }
  | { kind: null }

// Deterministically recognise staff auth commands from the raw message text.
//   "staff 4821" / "staff login 4821" / "/staff 4821"  -> login
//   "staff logout" / "logout"                           -> logout
export function parseStaffCommand(text: string): StaffCommand {
  const t = String(text ?? "").trim()
  const lower = t.toLowerCase()
  if (lower === "logout" || lower === "staff logout" || lower === "/staff logout") {
    return { kind: "logout" }
  }
  const m = t.match(/^\/?staff\s+(?:login\s+)?(\S+)$/i)
  if (m) {
    const pin = m[1]
    if (pin.toLowerCase() === "logout") return { kind: "logout" }
    // Avoid hijacking ordinary patient messages like "staff parking?": only treat
    // it as a login when the user explicitly wrote "login", or the token looks like
    // a PIN (alphanumeric AND contains a digit — recommend numeric staff PINs).
    const explicit = /\blogin\b/i.test(t)
    const pinLike = /^[A-Za-z0-9]{3,32}$/.test(pin) && /[0-9]/.test(pin)
    if (explicit || pinLike) return { kind: "login", pin }
  }
  return { kind: null }
}

// Single source of truth: is this session currently an authenticated staff member?
// True only when a name is set AND the last auth is within the TTL.
export function isStaffElevated(session: WhatsAppSession): boolean {
  if (!session.staffName || !session.staffAuthAt) return false
  const at = Date.parse(session.staffAuthAt)
  if (Number.isNaN(at)) return false
  return Date.now() - at < STAFF_AUTH_TTL_MS
}

// Is the session locked out from further PIN attempts?
export function isPinLockedOut(session: WhatsAppSession): boolean {
  return (session.staffPinAttempts ?? 0) >= MAX_PIN_ATTEMPTS
}
