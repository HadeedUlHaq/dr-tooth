"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, RefreshCw, Smartphone } from "lucide-react"

interface Connection {
  status: string
  phoneNumber?: string
  pushName?: string
  qrImage?: string
  message?: string
}

const STATUS_LABEL: Record<string, string> = {
  created: "Starting up…",
  initializing: "Starting up…",
  qr_ready: "Scan the QR code",
  connecting: "Connecting…",
  connected: "Connected",
  ready: "Connected",
  disconnected: "Disconnected",
  failed: "Failed",
  ERROR: "Can't reach gateway",
  unknown: "Unknown",
}

export default function WhatsAppConnectPage() {
  const [conn, setConn] = useState<Connection | null>(null)
  const [fetching, setFetching] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      let current = "unknown"
      try {
        const res = await fetch("/api/whatsapp/connect", { cache: "no-store" })
        const data = (await res.json()) as Connection
        current = data.status
        if (!cancelled) setConn(data)
      } catch {
        if (!cancelled) setConn({ status: "ERROR", message: "Network error" })
      } finally {
        if (!cancelled) {
          setFetching(false)
          // Poll faster while pairing, slower once linked.
          const delay = current === "connected" || current === "ready" ? 15000 : 3000
          timer.current = setTimeout(poll, delay)
        }
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status = conn?.status ?? "unknown"
  const isConnected = status === "connected" || status === "ready"
  const statusColor = isConnected
    ? "text-emerald-400"
    : status === "ERROR" || status === "failed" || status === "disconnected"
    ? "text-red-400"
    : "text-amber-400"

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/whatsapp"
          className="inline-flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Chat Bot
        </Link>
        <h1 className="text-2xl font-semibold text-[#EDEDEF] mt-3">WhatsApp Connection</h1>
        <p className="text-sm text-[#8A8F98] mt-1">
          Link the clinic&apos;s WhatsApp number to the bot gateway.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#111113] p-8">
        {fetching ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isConnected ? (
          <div className="flex flex-col items-center text-center py-8">
            <CheckCircle2 className="h-14 w-14 text-emerald-400" />
            <p className="text-lg font-medium text-[#EDEDEF] mt-4">WhatsApp is connected</p>
            {conn?.phoneNumber && (
              <p className="text-sm text-[#8A8F98] mt-1">
                {conn.pushName ? `${conn.pushName} · ` : ""}+{conn.phoneNumber}
              </p>
            )}
            <p className="text-xs text-[#8A8F98] mt-4 max-w-sm">
              The bot will now reply to messages sent to this number. You can close this page.
            </p>
          </div>
        ) : conn?.qrImage ? (
          <div className="flex flex-col items-center text-center">
            <p className={`text-sm font-medium ${statusColor}`}>{STATUS_LABEL[status] ?? status}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={conn.qrImage}
              alt="WhatsApp QR code"
              className="mt-4 w-64 h-64 rounded-lg bg-white p-2"
            />
            <div className="mt-6 max-w-sm text-left text-sm text-[#8A8F98] space-y-2">
              <div className="flex items-center text-[#EDEDEF] font-medium">
                <Smartphone className="h-4 w-4 mr-2 text-[#5E6AD2]" />
                On the clinic phone
              </div>
              <p>
                Open <span className="text-[#EDEDEF]">WhatsApp → Settings → Linked Devices → Link a Device</span>,
                then scan this code. It refreshes automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-8">
            <RefreshCw className={`h-10 w-10 ${statusColor} ${status === "ERROR" ? "" : "animate-spin"}`} />
            <p className={`text-sm font-medium mt-4 ${statusColor}`}>{STATUS_LABEL[status] ?? status}</p>
            {status === "ERROR" && (
              <p className="text-xs text-[#8A8F98] mt-2 max-w-sm">
                The app can&apos;t reach the OpenWA gateway. Check that it&apos;s running and that
                OPENWA_API_URL / OPENWA_API_KEY / OPENWA_SESSION_ID are set.
                {conn?.message ? ` (${conn.message})` : ""}
              </p>
            )}
            {status !== "ERROR" && (
              <p className="text-xs text-[#8A8F98] mt-2">Waiting for the gateway to produce a QR code…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
