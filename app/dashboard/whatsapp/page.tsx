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
import { ButtonLink, PageHeader } from "@/components/ui-kit"

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
const SURFACE =
  "rounded-lg border border-white/[0.1] bg-[#0A2228]/92 shadow-[0_1px_0_rgba(255,255,255,0.06),0_12px_28px_rgba(0,0,0,0.22)]"
const SUBTLE_SURFACE = "rounded-lg border border-white/[0.06] bg-white/[0.03]"
const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-[#A9BFC5]"

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
        setSendResult("Sent")
        setMsg("")
        loadAll()
      } else {
        setSendResult(data.reason || data.message || "Failed to send")
      }
    } catch (err) {
      setSendResult(String(err))
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
      <PageHeader
        title="WhatsApp Portal"
        subtitle="Monitor the gateway, staff access, reminders, and patient conversations"
        actions={
          <ButtonLink href="/dashboard/whatsapp/connect" variant="secondary" size="sm">
          <Smartphone className="h-4 w-4 mr-1.5" />
          QR / Pairing
          </ButtonLink>
        }
      />

      {/* Connection + bot controls */}
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>Connection</span>
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
              ? `${conn.pushName ? conn.pushName + " - " : ""}+${conn.phoneNumber}`
              : isError
              ? conn?.message?.slice(0, 80)
              : "Scan the QR to link a number"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            <button
              onClick={reconnect}
              disabled={reconnecting}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-[#F0FCFF] transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${reconnecting ? "animate-spin" : ""}`} />
              Reconnect
            </button>
            {!isConnected && (
              <Link
                href="/dashboard/whatsapp/connect"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#0891B2]/20 bg-[#0891B2]/10 px-3 py-2 text-sm text-[#0891B2] transition-colors hover:bg-[#0891B2]/20"
              >
                <Smartphone className="h-4 w-4 mr-1.5" />
                Show QR
              </Link>
            )}
          </div>
        </div>

        <div className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>AI Bot</span>
            <Power className={`h-5 w-5 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`} />
          </div>
          <p className={`text-lg font-medium mt-2 ${stats?.globalPaused ? "text-amber-400" : "text-emerald-400"}`}>
            {stats?.globalPaused ? "Paused" : "Active"}
          </p>
          <p className="text-sm text-[#A9BFC5] mt-1">
            {stats?.globalPaused
              ? "Auto-replies are off - staff handle chats manually."
              : "Auto-replying to incoming messages."}
          </p>
          <button
            onClick={toggleBot}
            disabled={togglingBot}
            className={`mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 sm:w-auto ${
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Conversations" value={stats?.activeConversations ?? 0} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Messages today" value={stats?.messagesToday ?? 0} />
        <StatCard
          icon={<Send className="h-4 w-4" />}
          label="Sent today"
          value={`${stats?.sentToday ?? 0} / ${stats?.dailyCap ?? 0}`}
        />
        <StatCard icon={<Pause className="h-4 w-4" />} label="Paused chats" value={stats?.pausedConversations ?? 0} />
      </div>

      {/* Appointment reminders */}
      <div className={`${SURFACE} p-4 sm:p-5`}>
        <div className="flex items-center justify-between">
          <span className={SECTION_LABEL}>Appointment Reminders</span>
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
              className={`${SUBTLE_SURFACE} flex items-center justify-between px-3 py-2.5`}
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
            ? "Loading..."
            : reminders.dayBefore && reminders.hourBefore
              ? "Reminders are on: patients get one a day before and one an hour before."
              : !reminders.dayBefore && !reminders.hourBefore
                ? "Reminders are off: no automatic messages are sent."
                : reminders.dayBefore
                  ? "Only the 1-day-before reminder is on."
                  : "Only the 1-hour-before reminder is on."}
        </p>
      </div>

      {/* Staff WhatsApp access (admin only) - double-verified login */}
      {canManageStaff && (
        <div className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>Staff WhatsApp Access</span>
            <ShieldCheck className="h-5 w-5 text-[#0891B2]" />
          </div>
          <p className="text-sm text-[#A9BFC5] mt-2">
            Doctors/staff can run the clinic over WhatsApp only when their number is registered here{" "}
            <span className="text-[#F0FCFF]">and</span> they send their own code from that number (double-verified).
          </p>

          <div className="mt-4 space-y-2">
            {staff.length === 0 ? (
              <div className={`${SUBTLE_SURFACE} px-3 py-4 text-center text-sm text-[#A9BFC5]`}>
                No staff registered yet. Add a doctor or receptionist to let them log in over WhatsApp.
              </div>
            ) : (
              staff.map((m) => (
                <div
                  key={m.id}
                  className={`${SUBTLE_SURFACE} flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between`}
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
                    <div className="mt-0.5 text-[11px] text-[#A9BFC5]">+{String(m.phone).replace(/^\+/, "")} - Code set</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-shrink-0 sm:items-center">
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
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-[#0891B2]/20 bg-[#0891B2]/10 px-3 py-2 text-sm text-[#0891B2] transition-colors hover:bg-[#0891B2]/20 sm:w-auto"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add staff
          </button>
        </div>
      )}

      {/* Manual send */}
      <form onSubmit={sendManual} className={`${SURFACE} space-y-4 p-4 sm:p-5`}>
        <div>
          <h2 className="text-sm font-medium text-[#F0FCFF]">Send a message</h2>
          <p className="mt-1 text-xs text-[#A9BFC5]">Use this for staff-initiated confirmations or follow-ups.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[14rem_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#A9BFC5]">Phone</span>
            <input
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="923001234567"
              className="min-h-[44px] w-full rounded-lg border border-white/10 bg-[#082127] px-3 py-2.5 text-sm text-[#F0FCFF] placeholder-gray-500 transition-colors focus:border-[#0891B2] focus:outline-none focus:ring-2 focus:ring-[#0891B2]/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#A9BFC5]">Message</span>
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Message"
              className="min-h-[44px] w-full rounded-lg border border-white/10 bg-[#082127] px-3 py-2.5 text-sm text-[#F0FCFF] placeholder-gray-500 transition-colors focus:border-[#0891B2] focus:outline-none focus:ring-2 focus:ring-[#0891B2]/20"
            />
          </label>
          <button
            type="submit"
            disabled={sending || !toPhone.trim() || !msg.trim() || !isConnected}
            className="inline-flex min-h-[44px] w-full items-center justify-center self-end rounded-lg bg-[#0891B2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0E7490] disabled:opacity-50 lg:w-auto"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {!isConnected && <p className="text-xs text-amber-400">Connect WhatsApp first to send.</p>}
        {sendResult && (
          <p className={`text-xs ${sendResult === "Sent" ? "text-emerald-400" : "text-red-400"}`}>{sendResult}</p>
        )}
      </form>

      {/* Conversations */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#F0FCFF]">
            Conversations <span className="text-[#A9BFC5]">({sessions.length})</span>
          </h2>
          {pageCount > 1 && (
            <span className="text-xs text-[#A9BFC5]">
              Page {safePage + 1} of {pageCount}
            </span>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className={`${SURFACE} p-12 text-center`}>
            <p className="text-[#A9BFC5] text-sm">No conversations yet.</p>
          </div>
        ) : (
          <div className={`${SURFACE} overflow-hidden`}>
            <div className="divide-y divide-white/[0.06] md:hidden">
              {pageSessions.map((s) => (
                <div key={s.phoneNumber} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span
                        title={
                          s.blocked
                            ? "Blocked"
                            : s.flaggedReason
                              ? `Flagged: ${s.flaggedReason}`
                              : `Health: ${s.health ?? "green"}`
                        }
                        className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                          s.blocked || s.health === "red"
                            ? "bg-red-400"
                            : s.health === "yellow"
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                        }`}
                      />
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#0891B2]/20 bg-[#0891B2]/15 text-sm font-medium text-[#0891B2]">
                        {(s.patientName ?? "G").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-[#F0FCFF]">{s.patientName ?? "Guest"}</span>
                          {s.optedOut && (
                            <span
                              title="Unsubscribed from reminders (replied STOP)"
                              className="inline-flex items-center rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                            >
                              Opted out
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#A9BFC5]">+{s.realPhone || s.phoneNumber}</div>
                      </div>
                    </Link>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${s.botPaused ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {s.botPaused ? "Manual" : "Auto"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#A9BFC5]">
                    <span className="rounded-md bg-white/[0.05] px-2 py-1">{phaseLabel[s.phase] ?? s.phase}</span>
                    <span className="rounded-md bg-white/[0.05] px-2 py-1">{s.messages.length} msgs</span>
                    <span className="rounded-md bg-white/[0.05] px-2 py-1">{formatTime(s.lastActiveAt)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => toggleBlock(s.phoneNumber, !s.blocked)}
                      disabled={blockingPhone === s.phoneNumber}
                      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                        s.blocked
                          ? "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          : "border border-white/[0.08] bg-white/[0.04] text-[#A9BFC5] hover:bg-amber-500/10 hover:text-amber-400"
                      }`}
                    >
                      <Ban className="mr-1.5 h-4 w-4" />
                      {s.blocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ phone: s.phoneNumber, name: s.patientName ?? "Guest" })}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-[#A9BFC5] transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                    <th className="px-4 py-3 text-left font-medium text-[#A9BFC5]">Customer</th>
                    <th className="px-4 py-3 text-left font-medium text-[#A9BFC5]">Phase</th>
                    <th className="px-4 py-3 text-left font-medium text-[#A9BFC5]">Bot</th>
                    <th className="px-4 py-3 text-center font-medium text-[#A9BFC5]">Msgs</th>
                    <th className="px-4 py-3 text-left font-medium text-[#A9BFC5]">Last Active</th>
                    <th className="w-px px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageSessions.map((s) => (
                    <tr
                      key={s.phoneNumber}
                      className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
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
                            className={`h-2 w-2 flex-shrink-0 rounded-full ${
                              s.blocked || s.health === "red"
                                ? "bg-red-400"
                                : s.health === "yellow"
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                            }`}
                          />
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#0891B2]/20 bg-[#0891B2]/15 text-xs font-medium text-[#0891B2]">
                            {(s.patientName ?? "G").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5">
                              <Link
                                href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                                className="font-medium text-[#F0FCFF] transition-colors hover:text-[#0891B2]"
                              >
                                {s.patientName ?? "Guest"}
                              </Link>
                              {s.optedOut && (
                                <span
                                  title="Unsubscribed from reminders (replied STOP)"
                                  className="inline-flex items-center rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                                >
                                  Opted out
                                </span>
                              )}
                            </span>
                            <div className="text-[10px] text-[#A9BFC5]">+{s.realPhone || s.phoneNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-[#A9BFC5]">
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
                      <td className="px-4 py-3 text-center text-[#A9BFC5]">{s.messages.length}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#A9BFC5]">{formatTime(s.lastActiveAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleBlock(s.phoneNumber, !s.blocked)}
                            disabled={blockingPhone === s.phoneNumber}
                            title={s.blocked ? "Unblock" : "Block"}
                            aria-label={s.blocked ? "Unblock conversation" : "Block conversation"}
                            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 transition-colors disabled:opacity-50 ${
                              s.blocked
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                : "text-[#A9BFC5] hover:bg-amber-500/10 hover:text-amber-400"
                            }`}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ phone: s.phoneNumber, name: s.patientName ?? "Guest" })}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-[#A9BFC5] transition-colors hover:bg-red-500/10 hover:text-red-400"
                            title="Delete conversation"
                            aria-label="Delete conversation"
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
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/[0.1] bg-[#0A2228] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.42)] sm:p-6">
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
                {deletingPhone === confirmDelete.phone ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add staff modal */}
      {showAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <form onSubmit={addStaff} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/[0.1] bg-[#0A2228] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.42)] sm:p-6">
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
                  placeholder="4-8 characters"
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
                {savingStaff ? "Adding..." : "Add staff"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset code modal */}
      {resetCodeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-white/[0.1] bg-[#0A2228] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.42)] sm:p-6">
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
              placeholder="New code (4-8 chars)"
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
                {busyStaffId === resetCodeFor.id ? "Saving..." : "Save code"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove staff confirm */}
      {removeStaffMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-white/[0.1] bg-[#0A2228] p-4 shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.42)] sm:p-6">
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
                {busyStaffId === removeStaffMember.id ? "Removing..." : "Remove"}
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
    <div className={`${SURFACE} p-4`}>
      <div className="flex items-center gap-1.5 text-[#A9BFC5]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#F0FCFF] mt-1.5">{value}</p>
    </div>
  )
}
