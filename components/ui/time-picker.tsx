"use client"

import * as React from "react"
import { Clock } from "lucide-react"

interface TimePickerProps {
  value: string // 24h format like "14:30" or ""
  onChange: (time: string) => void
  disabled?: boolean
}

export function TimePicker({ value, onChange, disabled = false }: TimePickerProps) {
  // Parse 24h value into 12h components
  const parseTime = (val: string) => {
    if (!val || val === "on-call") return { hour: "", minute: "", period: "AM" }
    try {
      const [h, m] = val.split(":")
      const hour24 = parseInt(h)
      const period = hour24 >= 12 ? "PM" : "AM"
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24
      return { hour: String(hour12), minute: m, period }
    } catch {
      return { hour: "", minute: "", period: "AM" }
    }
  }

  const parsed = parseTime(value)
  // Snap minute to nearest 5-minute increment for display
  const snapMinute = (m: string) => {
    if (!m) return ""
    const num = parseInt(m)
    if (isNaN(num)) return ""
    const snapped = Math.round(num / 5) * 5
    return String(snapped >= 60 ? 55 : snapped).padStart(2, "0")
  }
  const hour = parsed.hour
  const minute = snapMinute(parsed.minute)
  const period = parsed.period

  const buildTime = (h: string, m: string, p: string) => {
    if (!h || !m) return ""
    let hour24 = parseInt(h)
    if (p === "PM" && hour24 !== 12) hour24 += 12
    if (p === "AM" && hour24 === 12) hour24 = 0
    return `${String(hour24).padStart(2, "0")}:${m}`
  }

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTime = buildTime(e.target.value, minute || "00", period)
    if (newTime) onChange(newTime)
  }

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTime = buildTime(hour || "12", e.target.value, period)
    if (newTime) onChange(newTime)
  }

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTime = buildTime(hour || "12", minute || "00", e.target.value)
    if (newTime) onChange(newTime)
  }

  const selectClass =
    "bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 px-3 py-2.5 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed appearance-none text-center"

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-white/40 flex-shrink-0" />
      <select
        value={hour}
        onChange={handleHourChange}
        disabled={disabled}
        className={`${selectClass} flex-1 min-w-0`}
      >
        <option value="" disabled>HH</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={String(h)}>
            {String(h).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span className="text-[#8A8F98] text-sm font-medium">:</span>
      <select
        value={minute}
        onChange={handleMinuteChange}
        disabled={disabled}
        className={`${selectClass} flex-1 min-w-0`}
      >
        <option value="" disabled>MM</option>
        {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
          <option key={m} value={String(m).padStart(2, "0")}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        value={period}
        onChange={handlePeriodChange}
        disabled={disabled}
        className={`${selectClass} flex-1 min-w-0`}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
