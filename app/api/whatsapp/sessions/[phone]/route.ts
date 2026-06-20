import { NextRequest, NextResponse } from "next/server"
import { getSession, deleteSession } from "@/lib/whatsapp/sessionService"

export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params
    const session = await getSession(decodeURIComponent(phone))
    return NextResponse.json({ session })
  } catch (err) {
    console.error("[WhatsApp Session Error]", err)
    return NextResponse.json({ session: null, error: String(err) }, { status: 500 })
  }
}

// Delete a conversation (the stored session). If the patient messages again a
// fresh session is created. Auth-gated by middleware (staff only).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params
    await deleteSession(decodeURIComponent(phone))
    return NextResponse.json({ status: "ok" })
  } catch (err) {
    console.error("[WhatsApp Session Delete Error]", err)
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 })
  }
}
