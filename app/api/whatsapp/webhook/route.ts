import { NextRequest, NextResponse } from "next/server"
import type { WhatsAppSession } from "@/lib/types"
import { getSession, appendMessages, updateSession } from "@/lib/whatsapp/sessionService"
import { runAgent } from "@/lib/whatsapp/agent"
import { sendToChat } from "@/lib/whatsapp/openwaClient"
import {
  resolveReplyJid,
  humanDelay,
  alreadyHandled,
  withinSendBudget,
  assessInbound,
  withinAiBudget,
} from "@/lib/whatsapp/antiBan"
import { getGlobalBotPaused } from "@/lib/whatsapp/botControl"
import {
  parseStaffCommand,
  verifyStaffPin,
  isStaffElevated,
  isPinLockedOut,
} from "@/lib/whatsapp/staffAuth"

export const runtime = "nodejs"

// OpenWA signs each webhook delivery with HMAC-SHA256 over the raw request body:
//   X-OpenWA-Signature: sha256=<hex>
// Returns whether the body carries a VALID signature for OPENWA_WEBHOOK_SECRET.
// Only meaningful once that secret is configured on BOTH the gateway and here.
// Uses Web Crypto so it runs on any runtime.
async function signatureValid(rawBody: string, header: string | null): Promise<boolean> {
  const secret = process.env.OPENWA_WEBHOOK_SECRET
  if (!secret || !header) return false

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

    // Webhook authenticity (C2). Roll-out is two-phase so we never silently drop
    // patient messages: once OPENWA_WEBHOOK_SECRET is set we LOG validity but only
    // REJECT unsigned/invalid deliveries when WEBHOOK_REJECT_UNSIGNED === "true".
    if (process.env.OPENWA_WEBHOOK_SECRET) {
      const sigHeader = request.headers.get("x-openwa-signature")
      const valid = await signatureValid(rawBody, sigHeader)
      console.warn(`[WA SIG] present=${!!sigHeader} valid=${valid}`)
      if (process.env.WEBHOOK_REJECT_UNSIGNED === "true" && !valid) {
        return NextResponse.json({ status: "unauthorized" }, { status: 401 })
      }
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
    // Keep the exact inbound JID so staff broadcasts can message this contact back.
    if (session.chatId !== replyJid) session.chatId = replyJid

    const recordInbound = () =>
      appendMessages(sessionKey, [
        { role: "user", content: messageText, timestamp: new Date().toISOString() },
      ])

    // Blocked conversation — a HARD stop: no staff login, no AI, no reply; just record.
    // Applies even to staff-elevated numbers; unblock from the portal.
    if (session.blocked) {
      await recordInbound()
      return NextResponse.json({ status: "ignored", reason: "blocked" })
    }

    // ── Staff auth (deterministic, BEFORE the LLM) ──
    // The PIN is verified here and never routed to the model or stored verbatim.
    const cmd = parseStaffCommand(messageText)
    if (cmd.kind === "login") {
      if (isPinLockedOut(session)) {
        await sendToChat(replyJid, "🔒 Too many failed attempts. Please try again later.")
        return NextResponse.json({ status: "ok", reason: "pin_locked" })
      }
      const ident = verifyStaffPin(cmd.pin)
      if (ident) {
        await updateSession(sessionKey, {
          chatId: replyJid,
          staffName: ident.name,
          staffRole: ident.role,
          staffAuthAt: new Date().toISOString(),
          staffPinAttempts: 0,
        })
        // Store a REDACTED note (never the PIN) so the conversation stays coherent.
        await appendMessages(sessionKey, [
          { role: "user", content: "[staff login]", timestamp: new Date().toISOString() },
        ])
        await sendToChat(
          replyJid,
          `✅ Logged in as ${ident.name} (${ident.role}). I'll remember this device for 8 hours. Send "logout" to end.`
        )
        return NextResponse.json({ status: "ok", reason: "staff_login" })
      }
      await updateSession(sessionKey, {
        chatId: replyJid,
        staffPinAttempts: (session.staffPinAttempts ?? 0) + 1,
      })
      await sendToChat(replyJid, "❌ Invalid code.")
      return NextResponse.json({ status: "ok", reason: "staff_login_failed" })
    }
    if (cmd.kind === "logout") {
      await updateSession(sessionKey, { staffName: null, staffRole: null, staffAuthAt: null })
      await sendToChat(replyJid, "👋 Logged out.")
      return NextResponse.json({ status: "ok", reason: "staff_logout" })
    }

    const staff = isStaffElevated(session)

    // Per-conversation pause ("Manual" takeover) stops the bot for THIS chat — always,
    // even on a staff-elevated number, since it was paused on purpose.
    if (session.botPaused) {
      await recordInbound()
      return NextResponse.json({ status: "ignored", reason: "bot_paused" })
    }

    // Global pause stops patient auto-replies; staff (logged in) bypass it so the
    // doctor's assistant still works while patients are globally paused.
    if (!staff && (await getGlobalBotPaused())) {
      await recordInbound()
      return NextResponse.json({ status: "ignored", reason: "global_paused" })
    }

    // Abuse guard: per-conversation inbound rate + heuristic health (no AI cost).
    // Staff bypass. Persists health for the portal; auto-pauses a "red" chat.
    if (!staff) {
      const a = await assessInbound(sessionKey, messageText)
      const update: Partial<WhatsAppSession> = { health: a.health, abuseStrikes: a.strikes }
      if (a.health === "red") {
        update.botPaused = true
        update.flaggedReason = a.reason ?? "abusive activity"
        update.flaggedAt = new Date().toISOString()
      }
      await updateSession(sessionKey, update)

      if (!a.allow) {
        // Hard rate-limit: skip the LLM entirely (runaway-cost stop). Silent drop.
        console.warn(`[WhatsApp Webhook] rate-limited ${sessionKey}: ${a.reason}`)
        await recordInbound()
        return NextResponse.json({ status: "ignored", reason: "rate_limited" })
      }
      if (a.health === "red") {
        console.warn(`[WhatsApp Webhook] auto-paused ${sessionKey}: ${a.reason}`)
        await recordInbound()
        return NextResponse.json({ status: "ignored", reason: "auto_paused" })
      }
    }

    // Rate limits: per-contact burst + global daily cap. Staff bypass these.
    if (!staff) {
      const budget = await withinSendBudget(sessionKey)
      if (!budget.ok) {
        console.warn(`[WhatsApp Webhook] send throttled: ${budget.reason}`)
        await recordInbound()
        return NextResponse.json({ status: "ignored", reason: budget.reason })
      }
    }

    // Global daily LLM-call ceiling — protects the OpenAI bill from distributed abuse.
    if (!staff && !(await withinAiBudget())) {
      console.warn("[WhatsApp Webhook] global AI budget exhausted")
      await recordInbound()
      return NextResponse.json({ status: "ignored", reason: "ai_budget" })
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
