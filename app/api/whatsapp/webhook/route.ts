import { NextRequest, NextResponse } from "next/server"
import { getSession, appendMessages } from "@/lib/whatsapp/sessionService"
import { runAgent } from "@/lib/whatsapp/agent"
import { sendToChat } from "@/lib/whatsapp/openwaClient"
import {
  resolveReplyJid,
  humanDelay,
  alreadyHandled,
  withinSendBudget,
} from "@/lib/whatsapp/antiBan"
import { getGlobalBotPaused } from "@/lib/whatsapp/botControl"

export const runtime = "nodejs"

// OpenWA signs each webhook delivery with HMAC-SHA256 over the raw request body:
//   X-OpenWA-Signature: sha256=<hex>
// We only enforce it when OPENWA_WEBHOOK_SECRET is set, so setup isn't blocked
// before the secret is configured. Uses Web Crypto so it runs on workerd too.
async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = process.env.OPENWA_WEBHOOK_SECRET
  if (!secret) return true // verification disabled
  if (!header) return false

  const provided = header.startsWith("sha256=") ? header.slice(7) : header
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("")

  // Constant-time compare.
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "Dr Tooth WhatsApp AI" })
}

export async function POST(request: NextRequest) {
  try {
    // Read the raw body once — needed for signature verification, then parsed.
    const rawBody = await request.text()

    if (!(await verifySignature(rawBody, request.headers.get("x-openwa-signature")))) {
      console.warn("[WhatsApp Webhook] invalid signature")
      return NextResponse.json({ status: "unauthorized" }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    if (body?.event !== "message.received") {
      return NextResponse.json({ status: "ignored" })
    }

    const data = body?.data ?? {}

    // Idempotency — never act on the same MESSAGE twice (duplicate processing = a
    // double reply, exactly the behaviour that gets a number flagged).
    // Dedupe on the gateway's `idempotencyKey` (stable per message: it is
    // `msg_<sessionId>_<messageId>` and identical across every (re)delivery of one
    // message), NOT `deliveryId` (freshly random per delivery). The gateway can
    // fire the same message several times — each with a new deliveryId — so keying
    // on deliveryId never dedupes them. Fall back to the message id, then deliveryId.
    const dedupeKey: string = String(
      body?.idempotencyKey || data?.id || body?.deliveryId || ""
    ).replace(/\//g, "_")
    if (await alreadyHandled(dedupeKey)) {
      return NextResponse.json({ status: "ignored", reason: "duplicate" })
    }

    console.log(
      `[WhatsApp Webhook] from=${data?.from} chatId=${data?.chatId} lid=${data?.isLidSender} senderPhone=${data?.senderPhone} group=${data?.isGroup} type=${data?.type}`
    )

    // Skip anything we must not auto-reply to: our own echoes, groups, status
    // broadcasts (stories), and non-text messages.
    if (
      data?.fromMe === true ||
      data?.isGroup === true ||
      data?.isStatusBroadcast === true ||
      (data?.type && data.type !== "text")
    ) {
      return NextResponse.json({ status: "ignored" })
    }

    // Resolve a SAFE reply target. Returns null for an unmessageable @lid privacy
    // id (the thing that logged the device out) — in which case we don't reply.
    const replyJid = resolveReplyJid(data)
    const messageText: string = typeof data?.body === "string" ? data.body : ""
    if (!replyJid || !messageText.trim()) {
      console.warn(`[WhatsApp Webhook] no safe reply target (from=${data?.from})`)
      return NextResponse.json({ status: "ignored", reason: "no_reply_target" })
    }

    const sessionKey = replyJid.replace(/[^\d]/g, "")
    const session = await getSession(sessionKey)

    // Bot paused — globally or for this conversation (staff took it over). Record
    // the inbound message so it shows in the portal, but don't auto-reply.
    if (session.botPaused || (await getGlobalBotPaused())) {
      await appendMessages(sessionKey, [
        { role: "user", content: messageText, timestamp: new Date().toISOString() },
      ])
      return NextResponse.json({ status: "ignored", reason: "bot_paused" })
    }

    // Rate limits: per-contact burst + global daily cap.
    const budget = await withinSendBudget(sessionKey)
    if (!budget.ok) {
      console.warn(`[WhatsApp Webhook] send throttled: ${budget.reason}`)
      await appendMessages(sessionKey, [
        { role: "user", content: messageText, timestamp: new Date().toISOString() },
      ])
      return NextResponse.json({ status: "ignored", reason: budget.reason })
    }

    const replyText = await runAgent(session, messageText)

    await appendMessages(sessionKey, [
      { role: "user", content: messageText, timestamp: new Date().toISOString() },
      { role: "assistant", content: replyText, timestamp: new Date().toISOString(), via: "bot" },
    ])

    // Behave like a human: brief pause, then reply to the resolved phone JID.
    await humanDelay(replyText)
    await sendToChat(replyJid, replyText)

    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[WhatsApp Webhook Error]", err)
    // Always return 200 on processing errors so OpenWA doesn't retry-storm us.
    return NextResponse.json({ status: "error", message: String(err) })
  }
}
