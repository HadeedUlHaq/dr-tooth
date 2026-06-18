"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { WhatsAppSession } from "@/lib/types"

export default function WhatsAppBotPage() {
  const { userData, loading } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<WhatsAppSession[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && userData?.role !== "admin" && userData?.role !== "receptionist") {
      router.push("/dashboard")
    }
  }, [loading, userData, router])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/whatsapp/sessions")
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions ?? [])
        }
      } finally {
        setFetching(false)
      }
    }
    load()
  }, [])

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-PK", {
        dateStyle: "short",
        timeStyle: "short",
      })
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

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#EDEDEF]">Chat Bot</h1>
        <p className="text-sm text-[#8A8F98] mt-1">
          {sessions.length} active conversation{sessions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-12 text-center">
          <p className="text-[#8A8F98] text-sm">No conversations yet.</p>
          <p className="text-[#8A8F98] text-xs mt-1">
            Once customers chat with the clinic bot, their conversations will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-[#111113] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Phase</th>
                <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Messages</th>
                <th className="text-left px-4 py-3 text-[#8A8F98] font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.phoneNumber}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/whatsapp/${encodeURIComponent(s.phoneNumber)}`}
                      className="text-[#5E6AD2] hover:underline"
                    >
                      {s.patientName ?? "Guest"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-white/[0.06] text-[#8A8F98]">
                      {phaseLabel[s.phase] ?? s.phase}
                    </span>
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
  )
}
