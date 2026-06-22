"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Send, Pause, Power } from "lucide-react"
import type { WhatsAppSession } from "@/lib/types"
import { authedFetch } from "@/lib/authedFetch"

export default function WhatsAppSessionPage() {
  const params = useParams()
  const phone = decodeURIComponent(params.phone as string)

  const [session, setSession] = useState<WhatsAppSession | null>(null)
  const [fetching, setFetching] = useState(true)
  const [msg, setMsg] = useState("")
  const [sending, setSending] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/whatsapp/sessions/${encodeURIComponent(phone)}`)
      if (res.ok) {
        const data = await res.json()
        setSession(data.session ?? null)
      }
    } finally {
      setFetching(false)
    }
  }, [phone])

  useEffect(() => {
    load()
  }, [load])

  async function toggleBot() {
    if (!session) return
    setTogglingBot(true)
    try {
      await authedFetch("/api/whatsapp/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "session", phone, paused: !session.botPaused }),
      })
      await load()
    } finally {
      setTogglingBot(false)
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!msg.trim()) return
    setSending(true)
    try {
      const res = await authedFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text: msg }),
      })
      if (res.ok) {
        setMsg("")
        await load()
      }
    } finally {
      setSending(false)
    }
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })
    } catch {
      return iso
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0891B2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/whatsapp" className="inline-flex items-center text-sm text-[#A9BFC5] hover:text-[#F0FCFF] transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Portal
        </Link>
        <p className="text-[#A9BFC5] text-sm">Session not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/dashboard/whatsapp" className="inline-flex items-center text-sm text-[#A9BFC5] hover:text-[#F0FCFF] transition-colors">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[#F0FCFF]">{session.patientName ?? "Guest"}</h1>
          <p className="text-xs text-[#A9BFC5] mt-1">
            +{session.phoneNumber} · last active {formatTime(session.lastActiveAt)}
          </p>
        </div>
        <button
          onClick={toggleBot}
          disabled={togglingBot}
          className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 sm:w-auto ${
            session.botPaused
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
              : "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
          }`}
        >
          {session.botPaused ? <Power className="h-4 w-4 mr-1.5" /> : <Pause className="h-4 w-4 mr-1.5" />}
          {session.botPaused ? "Resume bot" : "Take over"}
        </button>
      </div>

      {session.botPaused && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400">
          Bot paused for this chat — your messages are sent as staff. Resume to let the AI reply again.
        </div>
      )}

      <div className="space-y-3">
        {session.messages.length === 0 ? (
          <p className="text-[#A9BFC5] text-sm">No messages yet.</p>
        ) : (
          session.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] rounded-lg px-4 py-2.5 text-sm sm:max-w-[80%] ${
                  m.role === "user"
                    ? "bg-[#0891B2] text-white rounded-tr-sm"
                    : "bg-white/[0.06] text-[#F0FCFF] rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[10px] mt-1 ${m.role === "user" ? "text-white/60" : "text-[#A9BFC5]"}`}>
                  {m.role === "assistant" && m.via === "staff" ? "Staff · " : m.role === "assistant" ? "Bot · " : ""}
                  {formatTime(m.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendReply} className="sticky bottom-0 flex gap-2 bg-[#061417] py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Type a reply to send manually…"
          className="min-h-[44px] flex-1 rounded-lg border border-white/[0.08] bg-[#111113] px-3 py-2 text-sm text-[#F0FCFF] placeholder-[#A9BFC5] focus:border-[#0891B2]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !msg.trim()}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-[#0891B2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E7490] disabled:opacity-50"
        >
          <Send className="h-4 w-4 mr-1.5" />
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  )
}
