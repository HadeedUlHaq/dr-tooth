import { NextRequest, NextResponse } from "next/server"
import { setSessionBlocked } from "@/lib/whatsapp/botControl"

export const runtime = "nodejs"

// Block / unblock a conversation. Body: { phone, blocked }. A blocked chat is
// recorded but never gets an AI reply. Auth-gated by middleware (staff only).
export async function POST(request: NextRequest) {
  try {
    const { phone, blocked } = (await request.json()) as { phone?: string; blocked?: boolean }
    const digits = String(phone ?? "").replace(/[^\d]/g, "")
    if (!digits) {
      return NextResponse.json({ status: "error", message: "phone required" }, { status: 400 })
    }
    await setSessionBlocked(digits, Boolean(blocked))
    return NextResponse.json({ status: "ok", blocked: Boolean(blocked) })
  } catch (err) {
    console.error("[WhatsApp Block Error]", err)
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 })
  }
}
