import { NextRequest, NextResponse } from "next/server"
import { getSession, appendMessages } from "@/lib/whatsapp/sessionService"
import { runAgent } from "@/lib/whatsapp/agent"
import { sendWhatsAppMessage } from "@/lib/whatsapp/evolutionClient"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ status: "ok", service: "Dr Tooth WhatsApp AI" })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const event: string = body?.event ?? ""
    if (!event.toLowerCase().includes("messages")) {
      return NextResponse.json({ status: "ignored" })
    }

    const data = body?.data
    const remoteJid: string = data?.key?.remoteJid ?? ""
    const fromMe: boolean = data?.key?.fromMe ?? false

    if (fromMe || !remoteJid) {
      return NextResponse.json({ status: "ignored" })
    }

    // Skip group messages
    if (remoteJid.includes("@g.us")) {
      return NextResponse.json({ status: "ignored" })
    }

    const phoneNumber = remoteJid.replace("@s.whatsapp.net", "")

    const messageText: string =
      data?.message?.conversation ??
      data?.message?.extendedTextMessage?.text ??
      data?.message?.buttonResponseMessage?.selectedButtonId ??
      ""

    if (!messageText.trim()) {
      return NextResponse.json({ status: "ignored" })
    }

    const session = await getSession(phoneNumber)
    const replyText = await runAgent(session, messageText)

    await appendMessages(phoneNumber, [
      { role: "user", content: messageText, timestamp: new Date().toISOString() },
      { role: "assistant", content: replyText, timestamp: new Date().toISOString() },
    ])

    await sendWhatsAppMessage(phoneNumber, replyText)

    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[WhatsApp Webhook Error]", err)
    // Always return 200 to prevent Evolution API from retrying
    return NextResponse.json({ status: "error", message: String(err) })
  }
}
