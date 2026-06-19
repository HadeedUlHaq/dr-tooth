import { NextRequest, NextResponse } from "next/server"
import { sendToChat, phoneToJid } from "@/lib/whatsapp/openwaClient"
import { appendMessages } from "@/lib/whatsapp/sessionService"
import { withinSendBudget } from "@/lib/whatsapp/antiBan"

export const runtime = "nodejs"

// Manual send from the portal (staff take-over). Body: { phone, text }.
// Goes through the same daily/per-contact budget as the bot so manual sending
// can't blow the anti-ban caps either.
export async function POST(request: NextRequest) {
  try {
    const { phone, text } = (await request.json()) as { phone?: string; text?: string }
    const digits = String(phone ?? "").replace(/[^\d]/g, "")
    const message = String(text ?? "").trim()

    if (!digits || !message) {
      return NextResponse.json({ status: "error", message: "phone and text required" }, { status: 400 })
    }

    const budget = await withinSendBudget(digits)
    if (!budget.ok) {
      return NextResponse.json({ status: "throttled", reason: budget.reason }, { status: 429 })
    }

    await sendToChat(phoneToJid(digits), message)
    await appendMessages(digits, [
      { role: "assistant", content: message, timestamp: new Date().toISOString(), via: "staff" },
    ])

    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[WhatsApp Send Error]", err)
    return NextResponse.json({ status: "error", message: String(err) }, { status: 502 })
  }
}
