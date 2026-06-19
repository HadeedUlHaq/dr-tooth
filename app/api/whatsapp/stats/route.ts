import { NextResponse } from "next/server"
import { getPortalStats } from "@/lib/whatsapp/botControl"

export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json(await getPortalStats())
  } catch (err) {
    console.error("[WhatsApp Stats Error]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
