"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getTodayAppointments,
  getWeeklyAppointments,
  getMonthlyAppointments,
} from "@/lib/appointmentService"
import { subscribeToCollection } from "@/lib/activityService"
import type { Appointment } from "@/lib/types"
import { Calendar, Clock, Search, User } from "lucide-react"
import Link from "next/link"

export default function AppointmentsList() {
  const { userData } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month" | "all">("today")
  const [statusFilter, setStatusFilter] = useState<string>("all")

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
                <li key={appointment.id}>
                  <Link href={`/dashboard/appointments/${appointment.id}`} className="block hover:bg-white/[0.03] transition-colors">
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-white/40 mr-2" />
                          <p className="text-sm font-medium text-[#5E6AD2] truncate">{appointment.patientName}</p>
                          {appointment.isFollowUp && (
                            <span className="ml-2 px-2 py-0.5 inline-flex text-xs font-medium rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2] border border-[#5E6AD2]/30">
                              Follow-up
                            </span>
                          )}
                        </div>
                        <div className="ml-2 flex-shrink-0">
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
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
