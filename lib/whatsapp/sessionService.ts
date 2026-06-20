import { getAdminDb } from "./firebaseAdmin"
import type { WhatsAppSession, WhatsAppMessage } from "../types"

const COLLECTION = "whatsapp_sessions"
const MAX_MESSAGES = 20

export async function getSession(phoneNumber: string): Promise<WhatsAppSession> {
  const ref = getAdminDb().collection(COLLECTION).doc(phoneNumber)
  const snap = await ref.get()

  if (snap.exists) {
    return snap.data() as WhatsAppSession
  }

  const newSession: WhatsAppSession = {
    phoneNumber,
    patientId: null,
    patientName: null,
    patientPhone: null,
    phase: "idle",
    messages: [],
    pendingAction: null,
    invoiceAttempts: 0,
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  await ref.set(newSession)
  return newSession
}

export async function updateSession(
  phoneNumber: string,
  updates: Partial<WhatsAppSession>
): Promise<void> {
  const ref = getAdminDb().collection(COLLECTION).doc(phoneNumber)
  if (updates.messages) {
    updates.messages = updates.messages.slice(-MAX_MESSAGES)
  }
  await ref.update({ ...updates, lastActiveAt: new Date().toISOString() })
}

export async function appendMessages(
  phoneNumber: string,
  newMessages: WhatsAppMessage[]
): Promise<void> {
  const session = await getSession(phoneNumber)
  const updated = [...session.messages, ...newMessages].slice(-MAX_MESSAGES)
  await updateSession(phoneNumber, { messages: updated })
}

// ── Rate limiting ──
// Per-session sliding-ish window stored in Firestore (serverless-safe — survives
// across stateless invocations). Guards the public chat endpoint from a hammering
// tab running up the OpenAI bill.
const RATE_LIMIT_COLLECTION = "chat_rate_limits"
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_WINDOW = 15

// Returns true if the request is allowed, false if the caller is over the limit.
export async function checkRateLimit(sessionId: string): Promise<boolean> {
  const ref = getAdminDb().collection(RATE_LIMIT_COLLECTION).doc(sessionId)
  try {
    return await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const now = Date.now()
      const data = snap.exists ? (snap.data() as { windowStart: number; count: number }) : null

      if (!data || now - data.windowStart > RATE_WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 })
        return true
      }
      if (data.count >= RATE_MAX_PER_WINDOW) {
        return false
      }
      tx.update(ref, { count: data.count + 1 })
      return true
    })
  } catch (err) {
    // Fail open — never block a genuine patient because the limiter errored.
    console.error("[Rate limit check failed]", String(err))
    return true
  }
}

export async function deleteSession(phoneNumber: string): Promise<void> {
  await getAdminDb().collection(COLLECTION).doc(phoneNumber).delete()
}

export async function getAllSessions(): Promise<WhatsAppSession[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .orderBy("lastActiveAt", "desc")
    .limit(100)
    .get()
  return snap.docs.map((d) => d.data() as WhatsAppSession)
}
