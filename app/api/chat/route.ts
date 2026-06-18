import { NextRequest, NextResponse } from "next/server"
import { getSession, appendMessages, checkRateLimit } from "@/lib/whatsapp/sessionService"
import { runAgent } from "@/lib/whatsapp/agent"

export const runtime = "nodejs"

// Load conversation history for a session
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId")
    if (!sessionId) {
      return NextResponse.json({ messages: [] })
    }
    const session = await getSession(sessionId)
    return NextResponse.json({ messages: session.messages })
  } catch (err) {
    console.error("[Chat API GET Error]", err)
    return NextResponse.json({ messages: [] }, { status: 500 })
  }
}

// Send a message and get the AI reply
export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json()

    if (!sessionId || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Missing sessionId or message" }, { status: 400 })
    }

    // Throttle before doing any expensive work (DB reads + OpenAI call).
    const allowed = await checkRateLimit(sessionId)
    if (!allowed) {
      return NextResponse.json({
        reply: "You're sending messages very quickly — please wait a moment and try again. 🙏",
      })
    }

    const session = await getSession(sessionId)
    const reply = await runAgent(session, message)

    await appendMessages(sessionId, [
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: reply, timestamp: new Date().toISOString() },
    ])

    return NextResponse.json({ reply })
  } catch (err) {
    // Log as a plain string — passing some error objects to console.error
    // can throw in the Next.js dev runtime and mask the real failure.
    const message = err instanceof Error ? err.message : String(err)
    console.error("[Chat API POST Error] " + message)
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined
    const reply =
      status === 429
        ? "We're getting a lot of messages right now — please wait a moment and try again. 🙏"
        : "Sorry, something went wrong on our end. Please try again shortly, or call the clinic directly."
    // Return 200 with a friendly reply so the chat UI stays graceful
    return NextResponse.json({ reply })
  }
}
