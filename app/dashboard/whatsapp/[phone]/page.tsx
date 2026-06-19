"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import Link from "next/link"
import { ArrowLeft, Send, Pause, Power } from "lucide-react"
import type { WhatsAppSession } from "@/lib/types"

export default function WhatsAppSessionPage() {
  const { userData, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const phone = decodeURIComponent(params.phone as string)

  const [session, setSession] = useState<WhatsAppSession | null>(null)
  const [fetching, setFetching] = useState(true)
  const [msg, setMsg] = useState("")
  const [sending, setSending] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)

  useEffect(() => {
    if (!loading && userData?.role !== "admin" && userData?.role !== "receptionist") {
      router.push("/dashboard")
    }
  }, [loading, userData, router])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/sessions/${encodeURIComponent(phone)}`)
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
      await fetch("/api/whatsapp/bot", {
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
      const res = await fetch("/api/whatsapp/send", {
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
        <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/whatsapp" className="inline-flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Portal
        </Link>
        <p className="text-[#8A8F98] text-sm">Session not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/dashboard/whatsapp" className="inline-flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#EDEDEF]">{session.patientName ?? "Guest"}</h1>
          <p className="text-xs text-[#8A8F98] mt-1">
            +{session.phoneNumber} · last active {formatTime(session.lastActiveAt)}
          </p>
        </div>
        <button
          onClick={toggleBot}
          disabled={togglingBot}
          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap ${
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
          <p className="text-[#8A8F98] text-sm">No messages yet.</p>
        ) : (
          session.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-[#5E6AD2] text-white rounded-tr-sm"
                    : "bg-white/[0.06] text-[#EDEDEF] rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[10px] mt-1 ${m.role === "user" ? "text-white/60" : "text-[#8A8F98]"}`}>
                  {m.role === "assistant" && m.via === "staff" ? "Staff · " : m.role === "assistant" ? "Bot · " : ""}
                  {formatTime(m.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={sendReply} className="flex gap-2 sticky bottom-0 bg-[#0a0a0c] py-3">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Type a reply to send manually…"
          className="flex-1 px-3 py-2 rounded-lg bg-[#111113] border border-white/[0.08] text-sm text-[#EDEDEF] placeholder-[#8A8F98] focus:outline-none focus:border-[#5E6AD2]/50"
        />
        <button
          type="submit"
          disabled={sending || !msg.trim()}
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-[#5E6AD2] text-white hover:bg-[#5058C8] transition-colors disabled:opacity-50"
        >
          <Send className="h-4 w-4 mr-1.5" />
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  )
}
