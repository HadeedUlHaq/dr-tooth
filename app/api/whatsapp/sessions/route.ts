import { NextResponse } from "next/server"
import { getAllSessions } from "@/lib/whatsapp/sessionService"

export const runtime = "nodejs"

export async function GET() {
  try {
    const sessions = await getAllSessions()
    return NextResponse.json({ sessions })
  } catch (err) {
    console.error("[WhatsApp Sessions Error]", err)
    return NextResponse.json({ sessions: [], error: String(err) }, { status: 500 })
  }
}
