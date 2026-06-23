import { getAdminDb } from "./firebaseAdmin"
import { supabaseEnabled, rpcCheckRateLimit } from "./supabaseAdmin"
import { normalizePhone, samePhone } from "./phone"
import type { WhatsAppSession, WhatsAppMessage } from "../types"

const COLLECTION = "whatsapp_sessions"
const MAX_MESSAGES = 200

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
  if (supabaseEnabled("counters")) {
    try {
      return await rpcCheckRateLimit(sessionId)
    } catch (err) {
      console.error("[Rate limit check failed - supabase]", String(err))
      return true // fail open
    }
  }
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

// Clear identity + history so a returning chat starts fresh ("I'm a new patient").
// Keeps the session doc (and its block/health state) but wipes who-they-are + the
// message history the agent sees.
export async function resetSessionMemory(phoneNumber: string): Promise<void> {
  await updateSession(phoneNumber, {
    patientId: null,
    patientName: null,
    patientPhone: null,
    phase: "idle",
    pendingAction: null,
    invoiceAttempts: 0,
    messages: [],
  })
}

// Find a patient by phone, tolerant of stored format ("+92 300 …", "0300…", bare
// digits). Cheap exact tries first, then a bounded normalised scan. Used once per
// new WhatsApp contact to auto-recognise a returning patient.
export async function findPatientByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const db = getAdminDb()
  const target = normalizePhone(phone)
  if (!target) return null
  try {
    for (const cand of [phone, `+${phone}`]) {
      const snap = await db.collection("patients").where("phone", "==", cand).limit(1).get()
      if (!snap.empty) return { id: snap.docs[0].id, name: snap.docs[0].data().name as string }
    }
    const all = await db.collection("patients").limit(2000).get()
    for (const d of all.docs) {
      // Tolerant match (handles stray trunk-0 / country-code quirks like
      // "+4407774067432" vs "447774067432" by comparing the last 9 digits).
      if (samePhone(d.data().phone, phone)) {
        return { id: d.id, name: d.data().name as string }
      }
    }
  } catch (err) {
    console.error("[findPatientByPhone] failed:", String(err))
  }
  return null
}

export async function getAllSessions(): Promise<WhatsAppSession[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .orderBy("lastActiveAt", "desc")
    .limit(100)
    .get()
  return snap.docs.map((d) => d.data() as WhatsAppSession)
}
