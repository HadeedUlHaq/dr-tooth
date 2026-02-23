"use client"

import { Phone } from "lucide-react"

interface CallButtonProps {
  phone: string
  size?: "sm" | "md"
}

/**
 * A green call button that opens the device dialer via tel: link.
 * Works on both mobile (opens dialer) and desktop (opens default tel handler).
 */
export function CallButton({ phone, size = "sm" }: CallButtonProps) {
  if (!phone) return null

  // Normalize to a dialable string: strip spaces, ensure starts with +
  const dialable = phone.replace(/\s+/g, "")

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors ${
        size === "sm"
          ? "p-1.5"
          : "gap-2 px-3 py-2 text-sm font-medium"
      }`}
      title={`Call ${phone}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        window.location.href = `tel:${dialable}`
      }}
    >
      <Phone className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {size === "md" && <span>Call</span>}
    </button>
  )
}
