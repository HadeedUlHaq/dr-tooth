"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Smartphone,
  RefreshCw,
  Power,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Pause,
  Activity,
} from "lucide-react"
import type { WhatsAppSession } from "@/lib/types"

interface Connection {
  status: string
  phoneNumber?: string
  pushName?: string
  message?: string
}
interface Stats {
  globalPaused: boolean
  activeConversations: number
  pausedConversations: number
  messagesToday: number
  sentToday: number
  dailyCap: number
}

const CONNECTED = new Set(["connected", "ready"])

export default function WhatsAppPortalPage() {
  const { userData, loading } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [conn, setConn] = useState<Connection | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [fetching, setFetching] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)

  // Manual send composer
  const [toPhone, setToPhone] = useState("")
  const [msg, setMsg] = useState("")
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && userData && userData.role !== "admin" && userData.role !== "receptionist") {
      router.push("/dashboard")
    }
  }, [loading, userData, router])

  const loadAll = useCallback(async () => {
    const [sRes, cRes, stRes] = await Promise.allSettled([
      fetch("/api/whatsapp/sessions").then((r) => r.json()),
      fetch("/api/whatsapp/connect", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/whatsapp/stats").then((r) => r.json()),
    ])
    if (sRes.status === "fulfilled") setSessions(sRes.value.sessions ?? [])
    if (cRes.status === "fulfilled") setConn(cRes.value)
    if (stRes.status === "fulfilled") setStats(stRes.value)
    setFetching(false)
  }, [])

  useEffect(() => {
    loadAll()
    const id = setInterval(loadAll, 15000)
    return () => clearInterval(id)
  }, [loadAll])

  async function reconnect() {
    setReconnecting(true)
    try {
      await fetch("/api/whatsapp/connect", { method: "POST" })
      await new Promise((r) => setTimeout(r, 2000))
      await loadAll()
    } finally {
      setReconnecting(false)
    }
  }

  async function toggleBot() {
    if (!stats) return
    setTogglingBot(true)
    try {
      await fetch("/api/whatsapp/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", paused: !stats.globalPaused }),
      })
      await loadAll()
    } finally {
      setTogglingBot(false)
    }
  }

  async function sendManual(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: toPhone, text: msg }),
      })
      const data = await res.json()
      if (res.ok) {
        setSendResult("✓ Sent")
        setMsg("")
        loadAll()
      } else {
        setSendResult(`✗ ${data.reason || data.message || "Failed"}`)
      }
    } catch (err) {
      setSendResult(`✗ ${String(err)}`)
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

  const phaseLabel: Record<string, string> = {
    idle: "Idle",
    identifying_patient: "Identifying",
    booking_appointment: "Booking",
    rescheduling_appointment: "Rescheduling",
    cancelling_appointment: "Cancelling",
    checking_appointments: "Checking appts",
    checking_invoice: "Checking bill",
    awaiting_confirmation: "Waiting",
  }

  const status = conn?.status ?? "unknown"
  const isConnected = CONNECTED.has(status)
  const isError = status === "ERROR"

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF]">WhatsApp Portal</h1>
          <p className="text-sm text-[#8A8F98] mt-1">Gateway, bot, and conversations</p>
        </div>
        <Link
          href="/dashboard/whatsapp/connect"
          className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-white/[0.04] border border-white/[0.08] text-[#EDEDEF] hover:bg-white/[0.08] transition-colors whitespace-nowrap"
        >
          <Smartphone className="h-4 w-4 mr-1.5" />
          QR / Pairing
        </Link>
      </div>

      {/* Connection + bot controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8A8F98] uppercase tracking-wide">Connection</span>
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <AlertCircle className={`h-5 w-5 ${isError ? "text-red-400" : "text-amber-400"}`} />
            )}
          </div>
          <p className={`text-lg font-medium mt-2 ${isConnected ? "text-emerald-400" : isError ? "text-red-400" : "text-amber-400"}`}>
            {isConnected ? "Connected" : isError ? "Gateway unreachable" : "Not connected"}
          </p>
          <p className="text-sm text-[#8A8F98] mt-1">
            {isConnected && conn?.phoneNumber
              ? `${conn.pushName ? conn.pushName + " · " : ""}+${conn.phoneNumber}`
              : isError
              ? conn?.message?.slice(0, 80)
              : "Scan the QR to link a number"}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={reconnect}
              disabled={reconnecting}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-white/[0.04] border border-white/[0.08] text-[#EDEDEF] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${reconnecting ? "animate-spin" : ""}`} />
              Reconnect
            </button>
            {!isConnected && (
              <Link
                href="/dashboard/whatsapp/connect"
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 text-[#5E6AD2] hover:bg-[#5E6AD2]/20 transition-colors"
              >
                <Smartphone className="h-4 w-4 mr-1.5" />
                Show QR
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8A8F98] uppercase tracking-wide">AI Bot</span>
            <Power className={`h-5 w-5 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`} />
          </div>
          <p className={`text-lg font-medium mt-2 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`}>
            {stats?.globalPaused ? "Paused" : "Active"}
          </p>
          <p className="text-sm text-[#8A8F98] mt-1">
            {stats?.globalPaused
              ? "Auto-replies are off — staff handle chats manually."
              : "Auto-replying to incoming messages."}
          </p>
          <button
            onClick={toggleBot}
            disabled={togglingBot}
            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm mt-4 transition-colors disabled:opacity-50 ${
              stats?.globalPaused
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
            }`}
          >
            {stats?.globalPaused ? <Power className="h-4 w-4 mr-1.5" /> : <Pause className="h-4 w-4 mr-1.5" />}
            {stats?.globalPaused ? "Resume bot" : "Pause bot"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Conversations" value={stats?.activeConversations ?? 0} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Messages today" value={stats?.messagesToday ?? 0} />
        <StatCard
          icon={<Send className="h-4 w-4" />}
          label="Sent today"
          value={`${stats?.sentToday ?? 0} / ${stats?.dailyCap ?? 0}`}
        />
        <StatCard icon={<Pause className="h-4 w-4" />} label="Paused chats" value={stats?.pausedConversations ?? 0} />
      </div>

      {/* Manual send */}
      <form onSubmit={sendManual} className="rounded-xl border border-white/[0.06] bg-[#111113] p-5 space-y-3">
        <h2 className="text-sm font-medium text-[#EDEDEF]">Send a message</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={toPhone}
            onChange={(e) => setToPhone(e.target.value)}
            placeholder="Phone e.g. 923001234567"
            className="sm:w-56 px-3 py-2 rounded-lg bg-[#0a0a0c] border border-white/[0.08] text-sm text-[#EDEDEF] placeholder-[#8A8F98] focus:outline-none focus:border-[#5E6AD2]/50"
          />
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message"
            className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0c] border border-white/[0.08] text-sm text-[#EDEDEF] placeholder-[#8A8F98] focus:outline-none focus:border-[#5E6AD2]/50"
          />
          <button
            type="submit"
            disabled={sending || !toPhone.trim() || !msg.trim() || !isConnected}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-[#5E6AD2] text-white hover:bg-[#5058C8] transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {!isConnected && <p className="text-xs text-amber-400">Connect WhatsApp first to send.</p>}
        {sendResult && (
          <p className={`text-xs ${sendResult.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{sendResult}</p>
        )}
      </form>

      {/* Conversations */}
      <div>
        <h2 className="text-sm font-medium text-[#EDEDEF] mb-3">
          Conversations <span className="text-[#8A8F98]">({sessions.length})</span>
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-12 text-center">
            <p className="text-[#8A8F98] text-sm">No conversations yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-[#111113] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Customer</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Phase</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Bot</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Messages</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.phoneNumber} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                        className="text-[#5E6AD2] hover:underline"
                      >
                        {s.patientName ?? "Guest"}
                      </Link>
                      <div className="text-[10px] text-[#8A8F98]">+{s.phoneNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-white/[0.06] text-[#8A8F98]">
                        {phaseLabel[s.phase] ?? s.phase}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.botPaused ? (
                        <span className="text-xs text-amber-400">Manual</span>
                      ) : (
                        <span className="text-xs text-emerald-400">Auto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#8A8F98]">{s.messages.length}</td>
                    <td className="px-4 py-3 text-[#8A8F98]">{formatTime(s.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-4">
      <div className="flex items-center gap-1.5 text-[#8A8F98]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#EDEDEF] mt-1.5">{value}</p>
    </div>
  )
}
