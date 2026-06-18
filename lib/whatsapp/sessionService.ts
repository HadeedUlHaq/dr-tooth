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
    phase: "idle",
    messages: [],
    pendingAction: null,
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

export async function getAllSessions(): Promise<WhatsAppSession[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .orderBy("lastActiveAt", "desc")
    .limit(100)
    .get()
  return snap.docs.map((d) => d.data() as WhatsAppSession)
}
