import { NextRequest, NextResponse } from "next/server"
import { getReminderConfig, setReminderConfig } from "@/lib/whatsapp/botControl"

export const runtime = "nodejs"

// Reminder on/off toggles for the portal. Auth-gated by middleware (staff only).
// GET  → current { dayBefore, hourBefore }
// POST → { dayBefore?, hourBefore? } to change either toggle.
export async function GET() {
  try {
    return NextResponse.json(await getReminderConfig())
  } catch (err) {
    return NextResponse.json({ dayBefore: true, hourBefore: true, error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { dayBefore?: boolean; hourBefore?: boolean }
    const next = await setReminderConfig({ dayBefore: body.dayBefore, hourBefore: body.hourBefore })
    return NextResponse.json({ status: "ok", ...next })
  } catch (err) {
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 })
  }
}
