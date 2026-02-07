"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { getTodayAppointments, getWeeklyAppointments, getMonthlyAppointments } from "@/lib/appointmentService"
import type { Appointment } from "@/lib/types"
import { Calendar, Clock, User } from "lucide-react"
import Link from "next/link"

export default function Dashboard() {
  const { userData } = useAuth()
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [weeklyAppointments, setWeeklyAppointments] = useState<Appointment[]>([])
  const [monthlyAppointments, setMonthlyAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const today = await getTodayAppointments()
        const weekly = await getWeeklyAppointments()
        const monthly = await getMonthlyAppointments()

        setTodayAppointments(today)
        setWeeklyAppointments(weekly)
        setMonthlyAppointments(monthly)
      } catch (error) {
        console.error("Error fetching appointments:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchAppointments()
  }, [])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + "T00:00:00")
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
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
      case "scheduled":
        return "bg-blue-500/15 text-blue-400"
      case "confirmed":
        return "bg-green-500/15 text-green-400"
      case "completed":
        return "bg-purple-500/15 text-purple-400"
      case "missed":
        return "bg-red-500/15 text-red-400"
      case "cancelled":
        return "bg-white/[0.05] text-[#8A8F98]"
      default:
        return "bg-white/[0.05] text-[#8A8F98]"
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
      <div>
        <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-[#8A8F98]">Welcome back, {userData?.name}!</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Today's card */}
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-5 py-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-[#5E6AD2]/10 rounded-xl p-3 border border-[#5E6AD2]/20">
                <Calendar className="h-5 w-5 text-[#5E6AD2]" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <p className="text-sm text-[#8A8F98]">Today&apos;s Appointments</p>
                <p className="text-2xl font-semibold text-[#EDEDEF]">{todayAppointments.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/[0.02] px-5 py-3 border-t border-white/[0.04]">
            <Link href="/dashboard/appointments" className="text-sm font-medium text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
              View all →
            </Link>
          </div>
        </div>

        {/* Weekly card */}
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-5 py-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                <Calendar className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <p className="text-sm text-[#8A8F98]">This Week&apos;s Appointments</p>
                <p className="text-2xl font-semibold text-[#EDEDEF]">{weeklyAppointments.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/[0.02] px-5 py-3 border-t border-white/[0.04]">
            <Link href="/dashboard/appointments" className="text-sm font-medium text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
              View all →
            </Link>
          </div>
        </div>

        {/* Monthly card */}
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-5 py-5">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                <Calendar className="h-5 w-5 text-amber-400" />
              </div>
              <div className="ml-4 w-0 flex-1">
                <p className="text-sm text-[#8A8F98]">This Month&apos;s Appointments</p>
                <p className="text-2xl font-semibold text-[#EDEDEF]">{monthlyAppointments.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/[0.02] px-5 py-3 border-t border-white/[0.04]">
            <Link href="/dashboard/appointments" className="text-sm font-medium text-[#5E6AD2] hover:text-[#6872D9] transition-colors">
              View all →
            </Link>
          </div>
        </div>
      </div>

      {/* Today's appointments list */}
      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)]">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-base font-semibold text-[#EDEDEF]">Today&apos;s Appointments</h3>
        </div>
        <div className="overflow-hidden">
          {todayAppointments.length === 0 ? (
            <div className="text-center py-10 text-[#8A8F98] text-sm">No appointments scheduled for today.</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {todayAppointments.map((appointment) => (
                <li key={appointment.id}>
                  <Link href={`/dashboard/appointments/${appointment.id}`} className="block hover:bg-white/[0.03] transition-colors">
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-white/40 mr-2" />
                          <p className="text-sm font-medium text-[#5E6AD2] truncate">{appointment.patientName}</p>
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
