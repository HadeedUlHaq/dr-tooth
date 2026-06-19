import { getAdminDb } from "./firebaseAdmin"
import { getAllSessions, updateSession } from "./sessionService"

// Global on/off switch for the AI auto-reply, plus simple portal stats.
// The global flag lives in a single config doc; per-conversation pause lives on
// the session (WhatsAppSession.botPaused).

const CONFIG_COLLECTION = "whatsapp_config"
const BOT_DOC = "bot"

export async function getGlobalBotPaused(): Promise<boolean> {
  try {
    const snap = await getAdminDb().collection(CONFIG_COLLECTION).doc(BOT_DOC).get()
    return snap.exists ? Boolean(snap.data()?.paused) : false
  } catch {
    return false // fail open — a config read error shouldn't silently mute the bot
  }
}

export async function setGlobalBotPaused(paused: boolean): Promise<void> {
  // The config doc holds only these fields, so a plain set (overwrite) is fine.
  await getAdminDb()
    .collection(CONFIG_COLLECTION)
    .doc(BOT_DOC)
    .set({ paused, updatedAt: new Date().toISOString() })
}

export async function setSessionBotPaused(phoneNumber: string, paused: boolean): Promise<void> {
  await updateSession(phoneNumber, { botPaused: paused })
}

export interface PortalStats {
  globalPaused: boolean
  activeConversations: number
  pausedConversations: number
  messagesToday: number
  sentToday: number
  dailyCap: number
}

const SENT_CAP = 300 // keep in sync with antiBan.GLOBAL_DAILY_MAX

export async function getPortalStats(): Promise<PortalStats> {
  const today = new Date().toISOString().slice(0, 10)
  const [globalPaused, sessions, sentSnap] = await Promise.all([
    getGlobalBotPaused(),
    getAllSessions(),
    getAdminDb().collection("whatsapp_send_budget").doc(`global_${today}`).get(),
  ])

  let messagesToday = 0
  let pausedConversations = 0
  for (const s of sessions) {
    if (s.botPaused) pausedConversations++
    for (const m of s.messages ?? []) {
      if (typeof m.timestamp === "string" && m.timestamp.slice(0, 10) === today) messagesToday++
    }
  }

  return {
    globalPaused,
    activeConversations: sessions.length,
    pausedConversations,
    messagesToday,
    sentToday: sentSnap.exists ? Number(sentSnap.data()?.count ?? 0) : 0,
    dailyCap: SENT_CAP,
  }
}
