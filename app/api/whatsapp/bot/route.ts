import { NextRequest, NextResponse } from "next/server"
import {
  getGlobalBotPaused,
  setGlobalBotPaused,
  setSessionBotPaused,
} from "@/lib/whatsapp/botControl"

export const runtime = "nodejs"

// GET → current global pause state.
export async function GET() {
  try {
    return NextResponse.json({ globalPaused: await getGlobalBotPaused() })
  } catch (err) {
    return NextResponse.json({ globalPaused: false, error: String(err) }, { status: 500 })
  }
}

// POST → toggle the bot. Body: { scope: "global" | "session", phone?, paused }.
export async function POST(request: NextRequest) {
  try {
    const { scope, phone, paused } = (await request.json()) as {
      scope?: "global" | "session"
      phone?: string
      paused?: boolean
    }
    const isPaused = Boolean(paused)

    if (scope === "session") {
      const digits = String(phone ?? "").replace(/[^\d]/g, "")
      if (!digits) {
        return NextResponse.json({ status: "error", message: "phone required" }, { status: 400 })
      }
      await setSessionBotPaused(digits, isPaused)
    } else {
      await setGlobalBotPaused(isPaused)
    }

    return NextResponse.json({ status: "ok", paused: isPaused })
  } catch (err) {
    console.error("[WhatsApp Bot Toggle Error]", err)
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 })
  }
}
