"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar"
import { format } from "date-fns/format"
import { parse } from "date-fns/parse"
import { startOfWeek } from "date-fns/startOfWeek"
import { getDay } from "date-fns/getDay"
import { enUS } from "date-fns/locale/en-US"
import { getAllAppointments } from "@/lib/appointmentService"
import type { Appointment } from "@/lib/types"

// ── date-fns localizer ──────────────────────────────────────────────────────
const locales = { "en-US": enUS }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
})

// ── Status colour map ───────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  scheduled:  { bg: "rgba(94,106,210,0.25)",  border: "rgba(94,106,210,0.6)",  color: "#818cf8" },
  confirmed:  { bg: "rgba(34,197,94,0.2)",    border: "rgba(34,197,94,0.5)",   color: "#4ade80" },
  completed:  { bg: "rgba(139,92,246,0.2)",   border: "rgba(139,92,246,0.5)",  color: "#a78bfa" },
  missed:     { bg: "rgba(239,68,68,0.2)",    border: "rgba(239,68,68,0.5)",   color: "#f87171" },
  cancelled:  { bg: "rgba(100,116,139,0.2)",  border: "rgba(100,116,139,0.5)", color: "#94a3b8" },
}
const LATE_COLORS = { bg: "rgba(249,115,22,0.2)", border: "rgba(249,115,22,0.5)", color: "#fb923c" }

// ── CalendarEvent type ──────────────────────────────────────────────────────
interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: Appointment
}

// ── Helper: "YYYY-MM-DD" + "HH:MM" → Date ──────────────────────────────────
function toDate(dateStr: string, timeStr: string): Date {
  if (timeStr === "on-call") {
    // Place on-call appointments at 08:00
    return new Date(`${dateStr}T08:00:00`)
  }
  return new Date(`${dateStr}T${timeStr}:00`)
}

// ── Helper: format time for display ────────────────────────────────────────
function formatTime(timeStr: string): string {
  if (timeStr === "on-call") return "On-Call"
  const [h, m] = timeStr.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

// ── Custom event component ──────────────────────────────────────────────────
function EventComponent({ event }: { event: CalendarEvent }) {
  const appt = event.resource
  const isLateVisible =
    appt.isLate &&
    (appt.status === "scheduled" || appt.status === "confirmed")

  return (
    <div className="flex items-center gap-1 min-w-0 leading-tight">
      {isLateVisible && (
        <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
      )}
      <span className="truncate text-[11px] font-medium">
        {appt.time !== "on-call" ? formatTime(appt.time) + " · " : ""}
        {appt.patientName}
      </span>
    </div>
  )
}

// ── Main calendar page ──────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(new Date())
  const [view, setView] = useState<(typeof Views)[keyof typeof Views]>(Views.MONTH)

  // Fetch appointments and convert to events
  const loadAppointments = useCallback(async () => {
    try {
      const appointments = await getAllAppointments()
      const mapped: CalendarEvent[] = appointments
        .filter((a) => a.date && a.time)
        .map((a) => {
          const start = toDate(a.date, a.time)
          const end = new Date(start.getTime() + 60 * 60 * 1000) // +1 hour
          const timeLabel = a.time !== "on-call" ? formatTime(a.time) + " · " : ""
          const doctorLabel = a.doctorName ? ` (${a.doctorName})` : ""
          return {
            id: a.id,
            title: `${timeLabel}${a.patientName}${doctorLabel}`,
            start,
            end,
            resource: a,
          }
        })
      setEvents(mapped)
    } catch (err) {
      console.error("Error loading appointments for calendar:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Colour-code by status (late overrides)
  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const appt = event.resource
    const isLateVisible =
      appt.isLate &&
      (appt.status === "scheduled" || appt.status === "confirmed")
    const colors = isLateVisible
      ? LATE_COLORS
      : (STATUS_COLORS[appt.status] ?? STATUS_COLORS.scheduled)

    return {
      style: {
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        color: colors.color,
        borderRadius: "5px",
        padding: "2px 5px",
        fontSize: "11px",
        fontWeight: 500,
        cursor: "pointer",
      },
    }
  }, [])

  // Navigate to appointment detail on click
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      router.push(`/dashboard/appointments/${event.id}`)
    },
    [router],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">
            Calendar
          </h1>
          <p className="text-sm text-[#8A8F98] mt-0.5">
            All appointments at a glance
          </p>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <span key={status} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: colors.border }}
              />
              <span className="text-[#8A8F98] capitalize">{status}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: LATE_COLORS.border }}
            />
            <span className="text-[#8A8F98]">Late</span>
          </span>
        </div>
      </div>

      {/* Calendar */}
      <div
        className="rounded-xl border border-white/[0.06] overflow-hidden"
        style={{ height: "calc(100vh - 220px)", minHeight: 520 }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          date={date}
          view={view}
          onNavigate={setDate}
          onView={(v) => setView(v)}
          eventPropGetter={eventPropGetter}
          onSelectEvent={handleSelectEvent}
          components={{ event: EventComponent }}
          popup
          showMultiDayTimes
          style={{ height: "100%" }}
        />
      </div>
    </div>
  )
}
