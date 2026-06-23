import { getAdminDb } from "./firebaseAdmin"
import {
  supabaseEnabled,
  rpcAlreadyHandled,
  rpcWithinSendBudget,
  rpcAssessInbound,
  rpcWithinAiBudget,
} from "./supabaseAdmin"

// ─────────────────────────────────────────────────────────────────────────────
// Anti-ban controls for the (unofficial, Baileys-based) WhatsApp gateway.
// Goal: behave like a human, never spam, never message invalid recipients —
// the things that get an unofficial WhatsApp number logged out / banned.
// All checks "fail open" (allow) on infra errors so a Firestore blip never
// silently kills the bot — the caps are a safety net, not a hard gate.
// ─────────────────────────────────────────────────────────────────────────────

// Pick the reply address. Modern WhatsApp delivers senders as privacy ids
// ("...@lid"). If the gateway resolves the real phone (`senderPhone`), prefer
// that — reply to "<phone>@s.whatsapp.net" (Baileys JID). Otherwise reply to the
// EXACT JID the message arrived on, INCLUDING "@lid": the gateway delivers to it
// directly (verified), whereas reconstructing "<digits>@c.us"/@s.whatsapp.net
// from a lid sends into the void. For normal senders the inbound JID is already
// a phone and is used as-is.
export function resolveReplyJid(data: {
  from?: string
  chatId?: string
  isLidSender?: boolean
  senderPhone?: string | null
}): string | null {
  const chatId = data.chatId || data.from || ""

  // Use a resolved real phone when the gateway provides one.
  if (data.isLidSender && data.senderPhone) {
    const phone = String(data.senderPhone).replace(/[^\d]/g, "")
    if (phone) return `${phone}@s.whatsapp.net`
  }

  // Otherwise echo back the exact incoming JID (a bare phone JID, or "@lid").
  if (!chatId) return null
  return chatId
}

// Human-like pause before sending, scaled to reply length + a little jitter.
// Capped so we stay well under the gateway's webhook timeout.
export async function humanDelay(text: string): Promise<void> {
  const base = Math.min(1200 + text.length * 12, 3500)
  const ms = base + Math.floor(Math.random() * 600)
  await new Promise((r) => setTimeout(r, ms))
}

// ── Idempotency: never process the same delivery twice (retries = double sends) ──
const DELIVERY_COLLECTION = "whatsapp_deliveries"
export async function alreadyHandled(deliveryId: string): Promise<boolean> {
  if (!deliveryId) return false
  if (supabaseEnabled("counters")) {
    try {
      return await rpcAlreadyHandled(deliveryId)
    } catch (err) {
      console.error("[WA DEDUP supabase] failing open:", String(err))
      return false // fail open
    }
  }
  const db = getAdminDb()
  const ref = db.collection(DELIVERY_COLLECTION).doc(deliveryId)
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (snap.exists) return true
      tx.set(ref, { at: Date.now() })
      return false
    })
  } catch (err) {
    console.error("[WA DEDUP] alreadyHandled failed (failing open):", String(err))
    return false // fail open
  }
}

// ── Send budget: per-contact burst limit + global daily cap ──
const BUDGET_COLLECTION = "whatsapp_send_budget"
const PER_CONTACT_WINDOW_MS = 60_000
const PER_CONTACT_MAX = 8 // replies to one contact per minute
const GLOBAL_DAILY_MAX = 300 // total outbound replies per day

export async function withinSendBudget(
  contactKey: string
): Promise<{ ok: boolean; reason?: string }> {
  if (supabaseEnabled("counters")) {
    try {
      return await rpcWithinSendBudget(contactKey)
    } catch {
      return { ok: true } // fail open
    }
  }
  const db = getAdminDb()
  const now = Date.now()
  const day = new Date().toISOString().slice(0, 10)
  const contactRef = db.collection(BUDGET_COLLECTION).doc(`c_${contactKey}`)
  const globalRef = db.collection(BUDGET_COLLECTION).doc(`global_${day}`)
  try {
    return await db.runTransaction(async (tx) => {
      const cSnap = await tx.get(contactRef)
      const gSnap = await tx.get(globalRef)

      const gCount = gSnap.exists ? (gSnap.data()!.count as number) : 0
      if (gCount >= GLOBAL_DAILY_MAX) return { ok: false, reason: "global_daily_cap" }

      const c = cSnap.exists
        ? (cSnap.data() as { windowStart: number; count: number })
        : null
      let windowStart = now
      let cCount = 1
      if (c && now - c.windowStart < PER_CONTACT_WINDOW_MS) {
        if (c.count >= PER_CONTACT_MAX) return { ok: false, reason: "contact_rate" }
        windowStart = c.windowStart
        cCount = c.count + 1
      }

      tx.set(contactRef, { windowStart, count: cCount })
      tx.set(globalRef, { count: gCount + 1, day })
      return { ok: true }
    })
  } catch {
    return { ok: true } // fail open
  }
}

// ── Inbound abuse guard + conversation health (heuristic, no AI cost) ──
// Tracked per conversation in its own doc so it never races the session writes.
const ABUSE_COLLECTION = "whatsapp_abuse"
const ABUSE_WINDOW_MS = 60_000 // 1 minute
const ABUSE_HARD_MAX = 12 // > this many inbound/min ⇒ skip the LLM (runaway-cost stop)
const ABUSE_SOFT_MAX = 6 // > this ⇒ "fast" (yellow)
const ABUSE_DECAY_MS = 10 * 60_000 // strikes reset after 10 min of calm
const ABUSE_RED_STRIKES = 3

export type Health = "green" | "yellow" | "red"
export interface InboundAssessment {
  allow: boolean // false ⇒ hard rate-limited; caller must NOT run the LLM
  health: Health
  strikes: number
  reason: string | null
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

// Record an inbound message and assess it. Fails OPEN (treats as green/allowed) on
// any infra error so a Firestore blip never blocks a real patient.
export async function assessInbound(sessionKey: string, text: string): Promise<InboundAssessment> {
  if (supabaseEnabled("counters")) {
    try {
      return await rpcAssessInbound(sessionKey, text)
    } catch (err) {
      console.error("[assessInbound supabase] failed (fail-open):", String(err))
      return { allow: true, health: "green", strikes: 0, reason: null }
    }
  }
  const db = getAdminDb()
  const ref = db.collection(ABUSE_COLLECTION).doc(sessionKey)
  const now = Date.now()
  const body = norm(text)
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const d = snap.exists
        ? (snap.data() as { windowStart: number; count: number; strikes: number; lastText?: string; lastAt?: number })
        : null

      let windowStart = now
      let count = 1
      let strikes = d?.strikes ?? 0
      // Decay strikes after a calm period.
      if (d?.lastAt && now - d.lastAt > ABUSE_DECAY_MS) strikes = 0

      if (d && now - d.windowStart < ABUSE_WINDOW_MS) {
        windowStart = d.windowStart
        count = d.count + 1
      }

      const repeated = !!d?.lastText && d.lastText === body && body.length > 0
      let reason: string | null = null

      if (count > ABUSE_HARD_MAX) {
        strikes += 1
        reason = `flooding (${count} msgs/min)`
      } else if (repeated) {
        strikes += 1
        reason = "repeated identical messages"
      }

      let health: Health = "green"
      if (strikes >= ABUSE_RED_STRIKES || count > ABUSE_HARD_MAX) health = "red"
      else if (count > ABUSE_SOFT_MAX || strikes >= 1 || repeated) {
        health = "yellow"
        if (!reason) reason = count > ABUSE_SOFT_MAX ? "rapid messages" : "flagged"
      }

      tx.set(ref, { windowStart, count, strikes, lastText: body, lastAt: now })
      return { allow: count <= ABUSE_HARD_MAX, health, strikes, reason }
    })
  } catch (err) {
    console.error("[assessInbound] failed (fail-open):", String(err))
    return { allow: true, health: "green", strikes: 0, reason: null }
  }
}

// ── Global daily cap on LLM invocations (protects the OpenAI bill from distributed
//    abuse across many numbers). Fails OPEN. ──
const AI_BUDGET_COLLECTION = "whatsapp_ai_budget"
const AI_DAILY_MAX = 2000

export async function withinAiBudget(): Promise<boolean> {
  if (supabaseEnabled("counters")) {
    try {
      return await rpcWithinAiBudget()
    } catch {
      return true // fail open
    }
  }
  const db = getAdminDb()
  const day = new Date().toISOString().slice(0, 10)
  const ref = db.collection(AI_BUDGET_COLLECTION).doc(`global_${day}`)
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const count = snap.exists ? (snap.data()!.count as number) : 0
      if (count >= AI_DAILY_MAX) return false
      tx.set(ref, { count: count + 1, day })
      return true
    })
  } catch {
    return true // fail open
  }
}
