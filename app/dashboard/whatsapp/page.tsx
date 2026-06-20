"use client"

import { useEffect, useState, useCallback } from "react"
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
  Bell,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Ban,
} from "lucide-react"
import type { WhatsAppSession } from "@/lib/types"
import { authedFetch } from "@/lib/authedFetch"

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
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [conn, setConn] = useState<Connection | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [fetching, setFetching] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [reminders, setReminders] = useState<{ dayBefore: boolean; hourBefore: boolean } | null>(null)
  const [togglingReminder, setTogglingReminder] = useState<"" | "day" | "hour">("")

  // Conversation table: pagination + delete
  const PAGE_SIZE = 8
  const [page, setPage] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<{ phone: string; name: string } | null>(null)
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null)
  const [blockingPhone, setBlockingPhone] = useState<string | null>(null)

  // Manual send composer
  const [toPhone, setToPhone] = useState("")
  const [msg, setMsg] = useState("")
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [sRes, cRes, stRes, rRes] = await Promise.allSettled([
      authedFetch("/api/whatsapp/sessions").then((r) => r.json()),
      authedFetch("/api/whatsapp/connect", { cache: "no-store" }).then((r) => r.json()),
      authedFetch("/api/whatsapp/stats").then((r) => r.json()),
      authedFetch("/api/whatsapp/reminders").then((r) => r.json()),
    ])
    if (sRes.status === "fulfilled") setSessions(sRes.value.sessions ?? [])
    if (cRes.status === "fulfilled") setConn(cRes.value)
    if (stRes.status === "fulfilled") setStats(stRes.value)
    if (rRes.status === "fulfilled")
      setReminders({ dayBefore: rRes.value.dayBefore !== false, hourBefore: rRes.value.hourBefore !== false })
    setFetching(false)
  }, [])

  async function toggleReminder(kind: "day" | "hour") {
    if (!reminders) return
    setTogglingReminder(kind)
    try {
      const key = kind === "day" ? "dayBefore" : "hourBefore"
      const res = await authedFetch("/api/whatsapp/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !reminders[key] }),
      })
      const data = await res.json()
      if (res.ok) setReminders({ dayBefore: data.dayBefore !== false, hourBefore: data.hourBefore !== false })
    } finally {
      setTogglingReminder("")
    }
  }

  async function toggleBlock(phone: string, blocked: boolean) {
    setBlockingPhone(phone)
    try {
      const res = await authedFetch("/api/whatsapp/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, blocked }),
      })
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.phoneNumber === phone ? { ...s, blocked, health: blocked ? "red" : "green" } : s
          )
        )
      }
    } finally {
      setBlockingPhone(null)
    }
  }

  async function deleteConversation(phone: string) {
    setDeletingPhone(phone)
    try {
      const res = await authedFetch(`/api/whatsapp/sessions/${encodeURIComponent(phone)}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.phoneNumber !== phone))
        setConfirmDelete(null)
      }
    } finally {
      setDeletingPhone(null)
    }
  }

  useEffect(() => {
    loadAll()
    const id = setInterval(loadAll, 15000)
    return () => clearInterval(id)
  }, [loadAll])

  async function reconnect() {
    setReconnecting(true)
    try {
      await authedFetch("/api/whatsapp/connect", { method: "POST" })
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
      await authedFetch("/api/whatsapp/bot", {
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
      const res = await authedFetch("/api/whatsapp/send", {
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

  const pageCount = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageSessions = sessions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

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

      {/* Appointment reminders */}
      <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[#8A8F98] uppercase tracking-wide">Appointment Reminders</span>
          <Bell className="h-5 w-5 text-[#5E6AD2]" />
        </div>
        <p className="text-sm text-[#8A8F98] mt-2">
          Patients automatically get a WhatsApp reminder before their appointment (Pakistan time). Turn each on or off below.
        </p>
        <div className="mt-4 space-y-2">
          {([
            { k: "day" as const, label: "1 day before", on: reminders?.dayBefore },
            { k: "hour" as const, label: "1 hour before", on: reminders?.hourBefore },
          ]).map((row) => (
            <div
              key={row.k}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
            >
              <span className="text-sm text-[#EDEDEF]">{row.label}</span>
              <button
                onClick={() => toggleReminder(row.k)}
                disabled={!reminders || togglingReminder === row.k}
                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                  row.on
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-white/[0.05] border border-white/[0.08] text-[#8A8F98] hover:bg-white/[0.08]"
                }`}
              >
                {row.on ? "On" : "Off"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#8A8F98] mt-3">
          {!reminders
            ? "Loading…"
            : reminders.dayBefore && reminders.hourBefore
              ? "✅ Reminders are ON — patients get one a day before and an hour before."
              : !reminders.dayBefore && !reminders.hourBefore
                ? "🔕 Reminders are OFF — no automatic messages are sent."
                : reminders.dayBefore
                  ? "Only the 1-day-before reminder is on."
                  : "Only the 1-hour-before reminder is on."}
        </p>
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
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Customer</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium hidden md:table-cell">Phase</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Bot</th>
                  <th className="text-center px-4 py-3 text-[#8A8F98] font-medium hidden sm:table-cell">Msgs</th>
                  <th className="text-left px-4 py-3 text-[#8A8F98] font-medium hidden md:table-cell">Last Active</th>
                  <th className="px-4 py-3 w-px"></th>
                </tr>
              </thead>
              <tbody>
                {pageSessions.map((s) => (
                  <tr
                    key={s.phoneNumber}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          title={
                            s.blocked
                              ? "Blocked"
                              : s.flaggedReason
                                ? `Flagged: ${s.flaggedReason}`
                                : `Health: ${s.health ?? "green"}`
                          }
                          className={`h-2 w-2 rounded-full flex-shrink-0 ${
                            s.blocked || s.health === "red"
                              ? "bg-red-400"
                              : s.health === "yellow"
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                          }`}
                        />
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#5E6AD2]/15 border border-[#5E6AD2]/20 flex items-center justify-center text-xs font-medium text-[#5E6AD2]">
                          {(s.patientName ?? "G").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                            className="text-[#EDEDEF] hover:text-[#5E6AD2] transition-colors font-medium"
                          >
                            {s.patientName ?? "Guest"}
                          </Link>
                          <div className="text-[10px] text-[#8A8F98]">+{s.realPhone || s.phoneNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
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
                    <td className="px-4 py-3 text-center text-[#8A8F98] hidden sm:table-cell">{s.messages.length}</td>
                    <td className="px-4 py-3 text-[#8A8F98] whitespace-nowrap hidden md:table-cell">{formatTime(s.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleBlock(s.phoneNumber, !s.blocked)}
                          disabled={blockingPhone === s.phoneNumber}
                          title={s.blocked ? "Unblock" : "Block"}
                          className={`inline-flex items-center justify-center p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                            s.blocked
                              ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                              : "text-[#8A8F98] hover:text-amber-400 hover:bg-amber-500/10"
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ phone: s.phoneNumber, name: s.patientName ?? "Guest" })}
                          className="inline-flex items-center justify-center p-1.5 rounded-md text-[#8A8F98] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete conversation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                <span className="text-xs text-[#8A8F98]">
                  Page {safePage + 1} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-[#EDEDEF] hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 mr-0.5" /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-[#EDEDEF] hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
                  >
                    Next <ChevronRight className="h-4 w-4 ml-0.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete conversation confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-[#EDEDEF]">Delete conversation</h3>
            <p className="mt-2 text-sm text-[#8A8F98]">
              Delete the conversation with <span className="text-[#EDEDEF]">{confirmDelete.name}</span> (+
              {confirmDelete.phone})? This removes the stored chat history. If they message again, a new
              conversation starts.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deletingPhone === confirmDelete.phone}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConversation(confirmDelete.phone)}
                disabled={deletingPhone === confirmDelete.phone}
                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deletingPhone === confirmDelete.phone ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
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
