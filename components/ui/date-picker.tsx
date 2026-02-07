"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string // ISO date string like "2025-01-15"
  onChange: (date: string) => void
  minDate?: Date
  disabled?: boolean
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  minDate,
  disabled = false,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Convert ISO string to Date object for the calendar
  const selectedDate = value ? new Date(value + "T00:00:00") : undefined

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return ""
    const date = new Date(dateStr + "T00:00:00")
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Convert to ISO date string YYYY-MM-DD
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      onChange(`${year}-${month}-${day}`)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-left transition-colors",
            "focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            value ? "text-gray-100" : "text-gray-500"
          )}
        >
          <CalendarIcon className="h-4 w-4 mr-2 text-white/40 flex-shrink-0" />
          {value ? formatDisplayDate(value) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-[#0a0a0c] border border-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)]"
        align="start"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={minDate ? { before: minDate } : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
