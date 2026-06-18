"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { WhatsAppSession } from "@/lib/types"

export default function WhatsAppSessionPage() {
  const { userData, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const phoneEncoded = params.phone as string
  const phone = decodeURIComponent(phoneEncoded)

  const [session, setSession] = useState<WhatsAppSession | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && userData?.role !== "admin" && userData?.role !== "receptionist") {
      router.push("/dashboard")
    }
  }, [loading, userData, router])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/whatsapp/sessions/${encodeURIComponent(phone)}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data.session ?? null)
        }
      } finally {
        setFetching(false)
      }
    }
    load()
  }, [phone])

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
        <Link
          href="/dashboard/whatsapp"
          className="inline-flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to WhatsApp Bot
        </Link>
        <p className="text-[#8A8F98] text-sm">Session not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/whatsapp"
          className="inline-flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-[#EDEDEF]">
          {session.patientName ?? "Guest"}
        </h1>
        <p className="text-xs text-[#8A8F98] mt-1">
          Last active: {formatTime(session.lastActiveAt)}
        </p>
      </div>

      <div className="space-y-3">
        {session.messages.length === 0 ? (
          <p className="text-[#8A8F98] text-sm">No messages yet.</p>
        ) : (
          session.messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-[#5E6AD2] text-white rounded-tr-sm"
                    : "bg-white/[0.06] text-[#EDEDEF] rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    msg.role === "user" ? "text-white/60" : "text-[#8A8F98]"
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
