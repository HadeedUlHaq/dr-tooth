import { timingSafeEqual, createHash, randomBytes } from "crypto"
import type { WhatsAppSession } from "../types"
import { getAdminDb } from "./firebaseAdmin"
import { samePhone } from "./phone"

// ─────────────────────────────────────────────────────────────────────────────
// Staff/doctor elevation for the WhatsApp bot — DOUBLE verified.
//
// A staff member must be registered in the dashboard first (the `whatsapp_staff`
// collection: name, role, phone, hashed code). Login then requires BOTH:
//   (a) the sender's REAL number matches an active registered record, AND
//   (b) the code they send matches THAT record's code.
// So a leaked code is useless from an unregistered number, and a registered
// number is useless without that person's code. The code is verified
// deterministically in the webhook and is NEVER routed through the LLM or stored
// in chat history. On success we mark the session (their stable WhatsApp device)
// elevated for a time-boxed window.
//
// Doctor and receptionist share the same powers — the role is kept only for the
// greeting and the audit trail.
// ─────────────────────────────────────────────────────────────────────────────

export const STAFF_AUTH_TTL_MS = 8 * 60 * 60 * 1000 // 8h, then re-authenticate
export const MAX_PIN_ATTEMPTS = 5 // failed code attempts per session before lockout

export type StaffRole = "doctor" | "receptionist"
export interface StaffIdentity {
  name: string
  role: StaffRole
}

// ── Code hashing (codes are stored salted-hashed, never in plaintext) ──
export const STAFF_COLLECTION = "whatsapp_staff"

// A fresh random salt (hex) for a newly set code.
export function newSalt(): string {
  return randomBytes(16).toString("hex")
}

// Salted SHA-256 of a code → hex. Deterministic for a given (code, salt).
export function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${String(code ?? "")}`).digest("hex")
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

// DOUBLE verification: the sender's real phone must match an ACTIVE registered
// staff record AND the submitted code must match that record's hashed code.
// Returns the registered identity (name/role) or null. Fails CLOSED on error.
export async function verifyStaffMember(
  phone: string,
  code: string
): Promise<StaffIdentity | null> {
  const candidate = String(code ?? "").trim()
  const ph = String(phone ?? "").trim()
  if (!candidate || !ph) return null
  try {
    // Tiny collection — fetch all and match in code (tolerant phone compare).
    const snap = await getAdminDb().collection(STAFF_COLLECTION).get()
    let match: StaffIdentity | null = null
    // Don't short-circuit, so timing doesn't reveal which record matched.
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>
      if (data.active !== true) continue
      if (!samePhone(data.phone, ph)) continue
      const expected = String(data.codeHash ?? "")
      const got = hashCode(candidate, String(data.codeSalt ?? ""))
      if (expected.length === got.length && safeEqual(got, expected)) {
        match = {
          name: String(data.name ?? "Staff"),
          role: data.role === "receptionist" ? "receptionist" : "doctor",
        }
      }
    }
    return match
  } catch (err) {
    console.error("[verifyStaffMember] error", String(err))
    return null
  }
}

export type StaffCommand =
  | { kind: "login"; code: string }
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
    const code = m[1]
    if (code.toLowerCase() === "logout") return { kind: "logout" }
    // Avoid hijacking ordinary patient messages like "staff parking?": only treat
    // it as a login when the user explicitly wrote "login", or the token looks like
    // a login code (alphanumeric AND contains a digit).
    const explicit = /\blogin\b/i.test(t)
    const codeLike = /^[A-Za-z0-9]{3,32}$/.test(code) && /[0-9]/.test(code)
    if (explicit || codeLike) return { kind: "login", code }
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

// Is the session locked out from further login-code attempts?
export function isPinLockedOut(session: WhatsAppSession): boolean {
  return (session.staffPinAttempts ?? 0) >= MAX_PIN_ATTEMPTS
}
