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
  ShieldCheck,
  UserPlus,
  KeyRound,
} from "lucide-react"
import type { WhatsAppSession, StaffMember } from "@/lib/types"
import { authedFetch } from "@/lib/authedFetch"
import { useAuth } from "@/contexts/AuthContext"

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
  const { userData } = useAuth()
  // Admins and receptionists can manage staff WhatsApp access (doctors cannot).
  const canManageStaff = userData?.role === "admin" || userData?.role === "receptionist"

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

  // Staff WhatsApp access (admin + receptionist): registered numbers + per-doctor codes.
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: "", role: "doctor", phone: "", code: "" })
  const [savingStaff, setSavingStaff] = useState(false)
  const [staffError, setStaffError] = useState<string | null>(null)
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null)
  const [resetCodeFor, setResetCodeFor] = useState<StaffMember | null>(null)
  const [newCode, setNewCode] = useState("")
  const [removeStaffMember, setRemoveStaffMember] = useState<StaffMember | null>(null)

  const loadStaff = useCallback(async () => {
    if (!canManageStaff) return
    try {
      const res = await authedFetch("/api/whatsapp/staff")
      if (res.ok) {
        const d = await res.json()
        setStaff(d.staff ?? [])
      }
    } catch {
      /* non-fatal */
    }
  }, [canManageStaff])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  async function addStaff(e: React.FormEvent) {
    e.preventDefault()
    setSavingStaff(true)
    setStaffError(null)
    try {
      const res = await authedFetch("/api/whatsapp/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(staffForm),
      })
      const d = await res.json()
      if (res.ok) {
        setShowAddStaff(false)
        setStaffForm({ name: "", role: "doctor", phone: "", code: "" })
        await loadStaff()
      } else {
        setStaffError(d.error || "Failed to add staff")
      }
    } catch (err) {
      setStaffError(String(err))
    } finally {
      setSavingStaff(false)
    }
  }

  async function patchStaff(id: string, body: Record<string, unknown>) {
    setBusyStaffId(id)
    try {
      const res = await authedFetch(`/api/whatsapp/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) await loadStaff()
      return res.ok
    } finally {
      setBusyStaffId(null)
    }
  }

  async function deleteStaff(id: string) {
    setBusyStaffId(id)
    try {
      const res = await authedFetch(`/api/whatsapp/staff/${id}`, { method: "DELETE" })
      if (res.ok) {
        setRemoveStaffMember(null)
        await loadStaff()
      }
    } finally {
      setBusyStaffId(null)
    }
  }

  async function submitResetCode() {
    if (!resetCodeFor || newCode.trim().length < 4) return
    const ok = await patchStaff(resetCodeFor.id, { code: newCode.trim() })
    if (ok) {
      setResetCodeFor(null)
      setNewCode("")
    }
  }

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
        <div className="w-8 h-8 border-2 border-[#0891B2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F0FCFF]">WhatsApp Portal</h1>
          <p className="text-sm text-[#A9BFC5] mt-1">Gateway, bot, and conversations</p>
        </div>
        <Link
          href="/dashboard/whatsapp/connect"
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto"
        >
          <Smartphone className="h-4 w-4 mr-1.5" />
          QR / Pairing
        </Link>
      </div>

      {/* Connection + bot controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A9BFC5] uppercase tracking-wide">Connection</span>
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <AlertCircle className={`h-5 w-5 ${isError ? "text-red-400" : "text-amber-400"}`} />
            )}
          </div>
          <p className={`text-lg font-medium mt-2 ${isConnected ? "text-emerald-400" : isError ? "text-red-400" : "text-amber-400"}`}>
            {isConnected ? "Connected" : isError ? "Gateway unreachable" : "Not connected"}
          </p>
          <p className="text-sm text-[#A9BFC5] mt-1">
            {isConnected && conn?.phoneNumber
              ? `${conn.pushName ? conn.pushName + " · " : ""}+${conn.phoneNumber}`
              : isError
              ? conn?.message?.slice(0, 80)
              : "Scan the QR to link a number"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            <button
              onClick={reconnect}
              disabled={reconnecting}
              className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm bg-white/[0.04] border border-white/[0.08] text-[#F0FCFF] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${reconnecting ? "animate-spin" : ""}`} />
              Reconnect
            </button>
            {!isConnected && (
              <Link
                href="/dashboard/whatsapp/connect"
                className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm bg-[#0891B2]/10 border border-[#0891B2]/20 text-[#0891B2] hover:bg-[#0891B2]/20 transition-colors"
              >
                <Smartphone className="h-4 w-4 mr-1.5" />
                Show QR
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A9BFC5] uppercase tracking-wide">AI Bot</span>
            <Power className={`h-5 w-5 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`} />
          </div>
          <p className={`text-lg font-medium mt-2 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`}>
            {stats?.globalPaused ? "Paused" : "Active"}
          </p>
          <p className="text-sm text-[#A9BFC5] mt-1">
            {stats?.globalPaused
              ? "Auto-replies are off — staff handle chats manually."
              : "Auto-replying to incoming messages."}
          </p>
          <button
            onClick={toggleBot}
            disabled={togglingBot}
            className={`inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm mt-4 transition-colors disabled:opacity-50 ${
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
          <span className="text-xs font-medium text-[#A9BFC5] uppercase tracking-wide">Appointment Reminders</span>
          <Bell className="h-5 w-5 text-[#0891B2]" />
        </div>
        <p className="text-sm text-[#A9BFC5] mt-2">
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
              <span className="text-sm text-[#F0FCFF]">{row.label}</span>
              <button
                onClick={() => toggleReminder(row.k)}
                disabled={!reminders || togglingReminder === row.k}
                className={`inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                  row.on
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-white/[0.05] border border-white/[0.08] text-[#A9BFC5] hover:bg-white/[0.08]"
                }`}
              >
                {row.on ? "On" : "Off"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#A9BFC5] mt-3">
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

      {/* Staff WhatsApp access (admin only) — double-verified login */}
      {canManageStaff && (
        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A9BFC5] uppercase tracking-wide">Staff WhatsApp Access</span>
            <ShieldCheck className="h-5 w-5 text-[#0891B2]" />
          </div>
          <p className="text-sm text-[#A9BFC5] mt-2">
            Doctors/staff can run the clinic over WhatsApp only when their number is registered here{" "}
            <span className="text-[#F0FCFF]">and</span> they send their own code from that number (double-verified).
          </p>

          <div className="mt-4 space-y-2">
            {staff.length === 0 ? (
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-4 text-center text-sm text-[#A9BFC5]">
                No staff registered yet. Add a doctor or receptionist to let them log in over WhatsApp.
              </div>
            ) : (
              staff.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#F0FCFF] truncate">{m.name}</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0891B2]/10 text-[#0891B2] border border-[#0891B2]/20 capitalize">
                        {m.role}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          m.active
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-white/[0.05] text-[#A9BFC5] border-white/[0.08]"
                        }`}
                      >
                        {m.active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#A9BFC5] mt-0.5">+{String(m.phone).replace(/^\+/, "")} · code set 🔒</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setResetCodeFor(m); setNewCode("") }}
                      disabled={busyStaffId === m.id}
                      title="Reset code"
                      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md text-[#A9BFC5] hover:text-[#0891B2] hover:bg-[#0891B2]/10 transition-colors disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => patchStaff(m.id, { active: !m.active })}
                      disabled={busyStaffId === m.id}
                      title={m.active ? "Deactivate" : "Activate"}
                      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md transition-colors disabled:opacity-50 ${
                        m.active
                          ? "text-[#A9BFC5] hover:text-amber-400 hover:bg-amber-500/10"
                          : "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                      }`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setRemoveStaffMember(m)}
                      disabled={busyStaffId === m.id}
                      title="Remove"
                      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md text-[#A9BFC5] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => { setShowAddStaff(true); setStaffError(null); setStaffForm({ name: "", role: "doctor", phone: "", code: "" }) }}
            className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-lg text-sm mt-4 bg-[#0891B2]/10 border border-[#0891B2]/20 text-[#0891B2] hover:bg-[#0891B2]/20 transition-colors"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add staff
          </button>
        </div>
      )}

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
        <h2 className="text-sm font-medium text-[#F0FCFF]">Send a message</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={toPhone}
            onChange={(e) => setToPhone(e.target.value)}
            placeholder="Phone e.g. 923001234567"
            className="sm:w-56 px-3 py-2 rounded-lg bg-[#061417] border border-white/[0.08] text-sm text-[#F0FCFF] placeholder-[#A9BFC5] focus:outline-none focus:border-[#0891B2]/50"
          />
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Message"
            className="flex-1 px-3 py-2 rounded-lg bg-[#061417] border border-white/[0.08] text-sm text-[#F0FCFF] placeholder-[#A9BFC5] focus:outline-none focus:border-[#0891B2]/50"
          />
          <button
            type="submit"
            disabled={sending || !toPhone.trim() || !msg.trim() || !isConnected}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-medium bg-[#0891B2] text-white hover:bg-[#5058C8] transition-colors disabled:opacity-50"
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
        <h2 className="text-sm font-medium text-[#F0FCFF] mb-3">
          Conversations <span className="text-[#A9BFC5]">({sessions.length})</span>
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-12 text-center">
            <p className="text-[#A9BFC5] text-sm">No conversations yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-[#111113] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-[#A9BFC5] font-medium">Customer</th>
                  <th className="text-left px-4 py-3 text-[#A9BFC5] font-medium hidden md:table-cell">Phase</th>
                  <th className="text-left px-4 py-3 text-[#A9BFC5] font-medium">Bot</th>
                  <th className="text-center px-4 py-3 text-[#A9BFC5] font-medium hidden sm:table-cell">Msgs</th>
                  <th className="text-left px-4 py-3 text-[#A9BFC5] font-medium hidden md:table-cell">Last Active</th>
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
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#0891B2]/15 border border-[#0891B2]/20 flex items-center justify-center text-xs font-medium text-[#0891B2]">
                          {(s.patientName ?? "G").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                              className="text-[#F0FCFF] hover:text-[#0891B2] transition-colors font-medium"
                            >
                              {s.patientName ?? "Guest"}
                            </Link>
                            {s.optedOut && (
                              <span
                                title="Unsubscribed from reminders (replied STOP)"
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              >
                                🔕 opted out
                              </span>
                            )}
                          </span>
                          <div className="text-[10px] text-[#A9BFC5]">+{s.realPhone || s.phoneNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-white/[0.06] text-[#A9BFC5]">
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
                    <td className="px-4 py-3 text-center text-[#A9BFC5] hidden sm:table-cell">{s.messages.length}</td>
                    <td className="px-4 py-3 text-[#A9BFC5] whitespace-nowrap hidden md:table-cell">{formatTime(s.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleBlock(s.phoneNumber, !s.blocked)}
                          disabled={blockingPhone === s.phoneNumber}
                          title={s.blocked ? "Unblock" : "Block"}
                          className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md transition-colors disabled:opacity-50 ${
                            s.blocked
                              ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                              : "text-[#A9BFC5] hover:text-amber-400 hover:bg-amber-500/10"
                          }`}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ phone: s.phoneNumber, name: s.patientName ?? "Guest" })}
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-md text-[#A9BFC5] hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                <span className="text-xs text-[#A9BFC5]">
                  Page {safePage + 1} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[#F0FCFF] transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4 mr-0.5" /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[#F0FCFF] transition-colors hover:bg-white/[0.08] disabled:opacity-40"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="bg-[#061417] border border-white/[0.06] rounded-lg p-4 sm:p-6 max-w-md w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <h3 className="text-lg font-medium text-[#F0FCFF]">Delete conversation</h3>
            <p className="mt-2 text-sm text-[#A9BFC5]">
              Delete the conversation with <span className="text-[#F0FCFF]">{confirmDelete.name}</span> (+
              {confirmDelete.phone})? This removes the stored chat history. If they message again, a new
              conversation starts.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deletingPhone === confirmDelete.phone}
                className="min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConversation(confirmDelete.phone)}
                disabled={deletingPhone === confirmDelete.phone}
                className="min-h-[44px] w-full rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 sm:w-auto disabled:opacity-50"
              >
                {deletingPhone === confirmDelete.phone ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add staff modal */}
      {showAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <form onSubmit={addStaff} className="bg-[#061417] border border-white/[0.06] rounded-lg p-4 sm:p-6 max-w-md w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <h3 className="text-lg font-medium text-[#F0FCFF] flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#0891B2]" />
              Add staff WhatsApp access
            </h3>
            <p className="mt-1 text-sm text-[#A9BFC5]">
              They log in by sending <span className="text-[#F0FCFF]">staff &lt;code&gt;</span> from this exact number.
            </p>
            {staffError && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
                {staffError}
              </div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#A9BFC5] mb-1">Name</label>
                <input
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Dr Ali"
                  required
                  className="min-h-[44px] w-full rounded-lg bg-[#082127] px-3 py-2.5 border border-white/10 text-sm text-[#F0FCFF] placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#A9BFC5] mb-1">Role</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}
                  className="min-h-[44px] w-full rounded-lg bg-[#082127] px-3 py-2.5 border border-white/10 text-sm text-[#F0FCFF] focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
                >
                  <option value="doctor">Doctor</option>
                  <option value="receptionist">Receptionist</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#A9BFC5] mb-1">WhatsApp number</label>
                <input
                  value={staffForm.phone}
                  onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+92 300 1234567"
                  required
                  className="min-h-[44px] w-full rounded-lg bg-[#082127] px-3 py-2.5 border border-white/10 text-sm text-[#F0FCFF] placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
                />
                <p className="mt-1 text-[11px] text-[#A9BFC5]">Include the country code. This must be the number they message from.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#A9BFC5] mb-1">Login code</label>
                <input
                  value={staffForm.code}
                  onChange={(e) => setStaffForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="4–8 characters"
                  required
                  minLength={4}
                  className="min-h-[44px] w-full rounded-lg bg-[#082127] px-3 py-2.5 border border-white/10 text-sm text-[#F0FCFF] placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
                />
                <p className="mt-1 text-[11px] text-[#A9BFC5]">Stored encrypted. Share it with them privately.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAddStaff(false)}
                className="min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStaff}
                className="min-h-[44px] w-full rounded-lg bg-[#0891B2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0E7490] sm:w-auto disabled:opacity-50"
              >
                {savingStaff ? "Adding…" : "Add staff"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset code modal */}
      {resetCodeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="bg-[#061417] border border-white/[0.06] rounded-lg p-4 sm:p-6 max-w-sm w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <h3 className="text-lg font-medium text-[#F0FCFF] flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#0891B2]" />
              Reset code
            </h3>
            <p className="mt-2 text-sm text-[#A9BFC5]">
              Set a new login code for <span className="text-[#F0FCFF]">{resetCodeFor.name}</span>. Their old code stops working.
            </p>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="New code (4–8 chars)"
              autoFocus
              className="mt-4 min-h-[44px] w-full rounded-lg bg-[#082127] px-3 py-2.5 border border-white/10 text-sm text-[#F0FCFF] placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
            />
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => { setResetCodeFor(null); setNewCode("") }}
                className="min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto"
              >
                Cancel
              </button>
              <button
                onClick={submitResetCode}
                disabled={newCode.trim().length < 4 || busyStaffId === resetCodeFor.id}
                className="min-h-[44px] w-full rounded-lg bg-[#0891B2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0E7490] sm:w-auto disabled:opacity-50"
              >
                {busyStaffId === resetCodeFor.id ? "Saving…" : "Save code"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove staff confirm */}
      {removeStaffMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="bg-[#061417] border border-white/[0.06] rounded-lg p-4 sm:p-6 max-w-sm w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
            <h3 className="text-lg font-medium text-[#F0FCFF]">Remove staff access</h3>
            <p className="mt-2 text-sm text-[#A9BFC5]">
              Remove <span className="text-[#F0FCFF]">{removeStaffMember.name}</span>? They will no longer be able to log in
              over WhatsApp.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setRemoveStaffMember(null)}
                className="min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteStaff(removeStaffMember.id)}
                disabled={busyStaffId === removeStaffMember.id}
                className="min-h-[44px] w-full rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 sm:w-auto disabled:opacity-50"
              >
                {busyStaffId === removeStaffMember.id ? "Removing…" : "Remove"}
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
      <div className="flex items-center gap-1.5 text-[#A9BFC5]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#F0FCFF] mt-1.5">{value}</p>
    </div>
  )
}
