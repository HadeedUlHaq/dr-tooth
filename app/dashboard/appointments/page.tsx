"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getTodayAppointments,
  getWeeklyAppointments,
  getMonthlyAppointments,
  updateAppointment,
  removeLateStatus,
} from "@/lib/appointmentService"
import { subscribeToCollection, logActivity } from "@/lib/activityService"
import type { Appointment } from "@/lib/types"
import { Calendar, Clock, Search, User, MoreHorizontal, AlertTriangle, X, Undo2 } from "lucide-react"
import { CallButton } from "@/components/ui/call-button"
import Link from "next/link"

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [hours, mins] = timeStr.split(":").map(Number)
  const totalMinutes = hours * 60 + mins + minutes
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMins = totalMinutes % 60
  return `${String(newHours).padStart(2, "0")}:${String(newMins).padStart(2, "0")}`
}

function calculateDelayMinutes(appointment: Appointment): number {
  if (!appointment.originalTime || appointment.time === "on-call" || appointment.originalTime === "on-call") return 0
  const [origH, origM] = appointment.originalTime.split(":").map(Number)
  const [newH, newM] = (appointment.time as string).split(":").map(Number)
  const origTotal = origH * 60 + origM
  const newTotal = newH * 60 + newM
  let diff = newTotal - origTotal
  if (diff < 0) diff += 24 * 60
  return diff
}

export default function AppointmentsList() {
  const { user, userData } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month" | "all">("today")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Three-dots dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Mark Late modal
  const [markLateAppointment, setMarkLateAppointment] = useState<Appointment | null>(null)
  const [delayAmount, setDelayAmount] = useState<string>("15")
  const [customDelay, setCustomDelay] = useState<string>("")
  const [delayReason, setDelayReason] = useState<string>("")
  const [markingLate, setMarkingLate] = useState(false)
  const [revokingLateId, setRevokingLateId] = useState<string | null>(null)

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    if (openDropdownId) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openDropdownId])

  const fetchAppointments = useCallback(async () => {
    try {
      let fetchedAppointments: Appointment[] = []

      switch (timeFilter) {
        case "today":
          fetchedAppointments = await getTodayAppointments()
          break
        case "week":
          fetchedAppointments = await getWeeklyAppointments()
          break
        case "month":
          fetchedAppointments = await getMonthlyAppointments()
          break
        default:
          fetchedAppointments = await getMonthlyAppointments()
          break
      }

      setAppointments(fetchedAppointments)
    } catch (error) {
      console.error("Error fetching appointments:", error)
    } finally {
      setLoading(false)
    }
  }, [timeFilter])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  // Real-time sync: re-fetch when appointments collection changes
  useEffect(() => {
    const unsubscribe = subscribeToCollection("appointments", () => {
      fetchAppointments()
    })
    return () => unsubscribe()
  }, [fetchAppointments])

  useEffect(() => {
    let filtered = [...appointments]

    if (searchTerm) {
      filtered = filtered.filter(
        (appointment) =>
          appointment.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (appointment.patientPhone && appointment.patientPhone.includes(searchTerm)),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((appointment) => appointment.status === statusFilter)
    }

    setFilteredAppointments(filtered)
  }, [appointments, searchTerm, statusFilter])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00")
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  }

  const formatTime = (time: string | "on-call") => {
    if (time === "on-call") return "On Call"
    try {
      const [hours, minutes] = time.split(":")
      const hour = Number.parseInt(hours)
      const ampm = hour >= 12 ? "PM" : "AM"
      const formattedHour = hour % 12 || 12
      return `${formattedHour}:${minutes} ${ampm}`
    } catch (error) {
      return time
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-blue-500/15 text-blue-400"
      case "confirmed": return "bg-green-500/15 text-green-400"
      case "completed": return "bg-purple-500/15 text-purple-400"
      case "missed": return "bg-red-500/15 text-red-400"
      case "cancelled": return "bg-white/[0.05] text-[#8A8F98]"
      default: return "bg-white/[0.05] text-[#8A8F98]"
    }
  }

  const handleMarkLate = async () => {
    if (!markLateAppointment) return

    const minutes = delayAmount === "custom"
      ? parseInt(customDelay) || 0
      : parseInt(delayAmount)

    if (minutes <= 0) return

    setMarkingLate(true)
    try {
      const originalTime = markLateAppointment.time
      if (originalTime === "on-call") return

      const newTime = addMinutesToTime(originalTime, minutes)

      await updateAppointment(markLateAppointment.id, {
        time: newTime,
        isLate: true,
        originalTime: markLateAppointment.originalTime || originalTime,
        delayReason: delayReason.trim() || "No reason provided",
        updatedBy: user?.uid || "",
      })

      await logActivity({
        type: "appointment_delayed",
        message: `Patient ${markLateAppointment.patientName} is running ${minutes} mins late. Reason: ${delayReason.trim() || "No reason provided"}. Time moved to ${formatTime(newTime)}.`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      setMarkLateAppointment(null)
      setDelayAmount("15")
      setCustomDelay("")
      setDelayReason("")
      fetchAppointments()
    } catch (error) {
      console.error("Error marking appointment late:", error)
    } finally {
      setMarkingLate(false)
    }
  }

  const handleRemoveLate = async (appointment: Appointment) => {
    if (!appointment.originalTime || appointment.originalTime === "on-call") return
    setRevokingLateId(appointment.id)
    try {
      await removeLateStatus(appointment.id, appointment.originalTime, user?.uid || "")
      await logActivity({
        type: "appointment_updated",
        message: `Patient ${appointment.patientName} is no longer late — time reverted to ${formatTime(appointment.originalTime)}.`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      fetchAppointments()
    } catch (error) {
      console.error("Error removing late status:", error)
    } finally {
      setRevokingLateId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">Appointments</h1>
          <p className="mt-1 text-sm text-[#8A8F98]">Manage all patient appointments</p>
        </div>
        {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
          <div className="mt-4 sm:mt-0">
            <Link
              href="/dashboard/appointments/new"
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506] transition-colors shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)]"
            >
              New Appointment
            </Link>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative max-w-xs w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-white/30" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="block w-full sm:w-auto px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as any)}
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
              <select
                className="block w-full sm:w-auto px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          {filteredAppointments.length === 0 ? (
            <div className="text-center py-10 text-[#8A8F98] text-sm">No appointments found.</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {filteredAppointments.map((appointment) => (
                <li key={appointment.id} className="hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-stretch">
                    <Link href={`/dashboard/appointments/${appointment.id}`} className="block flex-1 min-w-0">
                      <div className="px-5 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <User className="h-4 w-4 text-white/40" />
                            <p className="text-sm font-medium text-[#5E6AD2] truncate">{appointment.patientName}</p>
                            {appointment.patientPhone && (
                              <CallButton phone={appointment.patientPhone} size="sm" />
                            )}
                            {appointment.isFollowUp && (
                              <span className="px-2 py-0.5 inline-flex text-xs font-medium rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2] border border-[#5E6AD2]/30">
                                Follow-up
                              </span>
                            )}
                          </div>
                          <div className="ml-2 flex-shrink-0 flex items-center gap-2">
                            {appointment.isLate && (appointment.status === "scheduled" || appointment.status === "confirmed") && (
                              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full animate-pulse bg-orange-500/15 text-orange-400 border border-orange-500/30">
                                {calculateDelayMinutes(appointment)}m Late
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full ${getStatusColor(appointment.status)}`}
                            >
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 sm:flex sm:justify-between">
                          <div className="sm:flex">
                            <p className="flex items-center text-sm text-[#8A8F98]">
                              <Clock className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-white/30" />
                              {formatTime(appointment.time)}
                            </p>
                            {appointment.doctorName && (
                              <p className="mt-2 flex items-center text-sm text-[#8A8F98] sm:mt-0 sm:ml-6">
                                <User className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-white/30" />
                                Dr. {appointment.doctorName}
                              </p>
                            )}
                          </div>
                          <div className="mt-2 flex items-center text-sm text-[#8A8F98] sm:mt-0">
                            <Calendar className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-white/30" />
                            <p>{formatDate(appointment.date)}</p>
                          </div>
                        </div>
                        {/* Late badge - mobile (full detail) */}
                        {appointment.isLate && (appointment.status === "scheduled" || appointment.status === "confirmed") && (
                          <div className="mt-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full animate-pulse bg-orange-500/15 text-orange-400 border border-orange-500/30">
                              Running {calculateDelayMinutes(appointment)}m Late (Originally {formatTime(appointment.originalTime || "")})
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Three-dots dropdown — admin/receptionist only */}
                    {(userData?.role === "admin" || userData?.role === "receptionist") &&
                      (appointment.status === "scheduled" || appointment.status === "confirmed") &&
                      appointment.time !== "on-call" && (
                      <div
                        className="relative flex items-center px-3 flex-shrink-0"
                        ref={openDropdownId === appointment.id ? dropdownRef : undefined}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setOpenDropdownId(openDropdownId === appointment.id ? null : appointment.id)
                          }}
                          className="text-[#8A8F98] hover:text-[#EDEDEF] p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openDropdownId === appointment.id && (
                          <div className="absolute right-3 top-full mt-1 w-52 bg-[#0F0F12] border border-white/[0.1] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] py-1 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setMarkLateAppointment(appointment)
                                setOpenDropdownId(null)
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/10 transition-colors"
                            >
                              <AlertTriangle className="h-4 w-4" />
                              Mark Late
                            </button>
                            {appointment.isLate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  handleRemoveLate(appointment)
                                  setOpenDropdownId(null)
                                }}
                                disabled={revokingLateId === appointment.id}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                              >
                                <Undo2 className="h-4 w-4" />
                                {revokingLateId === appointment.id ? "Reverting..." : "Remove Late Status"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Mark Late Modal */}
      {markLateAppointment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#EDEDEF] flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  Mark Patient Late
                </h3>
                <p className="mt-1 text-sm text-[#8A8F98]">
                  {markLateAppointment.patientName} — currently at {formatTime(markLateAppointment.time)}
                </p>
              </div>
              <button
                onClick={() => {
                  setMarkLateAppointment(null)
                  setDelayAmount("15")
                  setCustomDelay("")
                  setDelayReason("")
                }}
                className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#8A8F98] mb-1">Delay Amount</label>
                <select
                  value={delayAmount}
                  onChange={(e) => setDelayAmount(e.target.value)}
                  className="block w-full px-3 py-2.5 min-h-[44px] bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {delayAmount === "custom" && (
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">Custom Delay (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={customDelay}
                    onChange={(e) => setCustomDelay(e.target.value)}
                    className="block w-full px-3 py-2.5 min-h-[44px] bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                    placeholder="Enter minutes..."
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#8A8F98] mb-1">Reason</label>
                <textarea
                  rows={2}
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className="block w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors resize-none"
                  placeholder="e.g., Stuck in traffic"
                />
              </div>

              {/* Preview */}
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                <p className="text-xs text-orange-400">
                  New time will be:{" "}
                  <span className="font-semibold">
                    {formatTime(
                      addMinutesToTime(
                        markLateAppointment.time as string,
                        delayAmount === "custom" ? parseInt(customDelay) || 0 : parseInt(delayAmount)
                      )
                    )}
                  </span>
                  {" "}(moved from {formatTime(markLateAppointment.time)})
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setMarkLateAppointment(null)
                  setDelayAmount("15")
                  setCustomDelay("")
                  setDelayReason("")
                }}
                className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkLate}
                disabled={markingLate || (delayAmount === "custom" && (!customDelay || parseInt(customDelay) <= 0))}
                className="inline-flex items-center justify-center py-2.5 px-4 text-sm font-medium text-orange-400 bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/30 rounded-lg disabled:opacity-50 min-h-[44px] transition-colors"
              >
                {markingLate ? "Updating..." : "Confirm Late"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
