import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/whatsapp/sessionService"

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
