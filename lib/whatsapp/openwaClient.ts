// OpenWA (self-hosted WhatsApp API gateway) client.
// Replaces the previous Evolution API integration.
// Docs: https://github.com/rmyndharis/OpenWA
//
// OpenWA is a stateful NestJS server running headless Chromium — it must run on
// its own always-on container host, NOT on Cloudflare Workers. This app only
// talks to it over HTTP (send messages, read QR/status; receive its webhooks).

interface OpenWaConfig {
  base: string
  sessionId: string
  apiKey: string
}

function config(): OpenWaConfig {
  const base = process.env.OPENWA_API_URL?.replace(/\/$/, "")
  const sessionId = process.env.OPENWA_SESSION_ID
  const apiKey = process.env.OPENWA_API_KEY
  if (!base || !sessionId || !apiKey) {
    throw new Error("OpenWA env not configured (OPENWA_API_URL / OPENWA_SESSION_ID / OPENWA_API_KEY)")
  }
  return { base, sessionId, apiKey }
}

// Turn a stored bare phone number (digits only) into an OpenWA chatId.
// OpenWA's default engine (whatsapp-web.js) uses the "@c.us" suffix, not
// Evolution/Baileys' "@s.whatsapp.net". Sessions store bare digits.
export function toChatId(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^\d]/g, "")
  return `${digits}@c.us`
}

// Baileys JID for a bare phone number — used for manual/portal sends where we
// only have the customer's number (sessions are keyed on these digits).
export function phoneToJid(phoneNumber: string): string {
  const digits = phoneNumber.replace(/[^\d]/g, "")
  return `${digits}@s.whatsapp.net`
}

// Restart the gateway session (stop then start) — surfaces a fresh QR or kicks a
// stuck connection. Used by the portal's "Reconnect" button.
export async function restartSession(): Promise<void> {
  const { base, sessionId, apiKey } = config()
  const headers = { "X-API-Key": apiKey }
  await fetch(`${base}/api/sessions/${sessionId}/stop`, { method: "POST", headers }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  const res = await fetch(`${base}/api/sessions/${sessionId}/start`, { method: "POST", headers })
  if (!res.ok) {
    throw new Error(`OpenWA restart error ${res.status}: ${await res.text()}`)
  }
}

// ── Outbound ──
//   POST {base}/api/sessions/{sessionId}/messages/send-text
//   Header: X-API-Key  Body: { chatId, text }
//
// Reply to the EXACT chatId/JID the message arrived on. With the Baileys engine,
// modern WhatsApp delivers senders as privacy ids (`...@lid`) or `...@s.whatsapp.net`,
// not `...@c.us` — so reconstructing `<digits>@c.us` sends the reply into the void.
// Always echo back the original JID.
export async function sendToChat(chatId: string, text: string): Promise<void> {
  const { base, sessionId, apiKey } = config()
  const res = await fetch(`${base}/api/sessions/${sessionId}/messages/send-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ chatId, text }),
  })
  if (!res.ok) {
    throw new Error(`OpenWA send error ${res.status}: ${await res.text()}`)
  }
}

// Convenience for callers that only have a bare phone number (e.g. notifications).
export async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<void> {
  return sendToChat(toChatId(phoneNumber), text)
}

// ── Connection state + QR (for the in-app pairing screen) ──
//   GET {base}/api/sessions/{sessionId}          → { status, phone, pushName, ... }
//   GET {base}/api/sessions/{sessionId}/qr       → { qrCode: "data:image/png;base64,...", status }
// status (lowercase, verified against the running server):
//   created | initializing | qr_ready | connecting | connected | disconnected | failed
export interface OpenWaConnection {
  status: string
  phoneNumber?: string
  pushName?: string
  qrImage?: string // present only while status === "SCAN_QR"
}

export async function getConnection(): Promise<OpenWaConnection> {
  const { base, sessionId, apiKey } = config()
  const headers = { "X-API-Key": apiKey }

  const sres = await fetch(`${base}/api/sessions/${sessionId}`, { headers })
  if (!sres.ok) {
    throw new Error(`OpenWA status error ${sres.status}: ${await sres.text()}`)
  }
  const session = await sres.json()
  const result: OpenWaConnection = {
    status: session.status ?? "unknown",
    phoneNumber: session.phone, // OpenWA returns `phone`, not `phoneNumber`
    pushName: session.pushName,
  }

  // While waiting to be linked, OpenWA reports status "qr_ready" and the QR is
  // available at /qr as { qrCode: "data:image/png;base64,..." }.
  if (result.status === "qr_ready") {
    const qres = await fetch(`${base}/api/sessions/${sessionId}/qr`, { headers })
    if (qres.ok) {
      const qr = await qres.json()
      result.qrImage = qr.qrCode ?? qr.image ?? qr.qr
    }
  }

  return result
}
