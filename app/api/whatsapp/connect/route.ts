import { NextResponse } from "next/server"
import { getConnection, restartSession } from "@/lib/whatsapp/openwaClient"

export const runtime = "nodejs"

// Server-side proxy so the OpenWA API key never reaches the browser.
// The /dashboard/whatsapp/connect page polls this for status + QR image.
export async function GET() {
  try {
    const conn = await getConnection()
    return NextResponse.json(conn)
  } catch (err) {
    console.error("[WhatsApp Connect Error]", err)
    return NextResponse.json(
      { status: "ERROR", message: String(err) },
      { status: 502 }
    )
  }
}

// Reconnect button on the portal — stop+start the session to refresh the link
// (or surface a new QR when it's disconnected).
export async function POST() {
  try {
    await restartSession()
    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[WhatsApp Reconnect Error]", err)
    return NextResponse.json({ status: "error", message: String(err) }, { status: 502 })
  }
}
