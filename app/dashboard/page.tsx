"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getTodayAppointments,
  getWeeklyAppointments,
  getMonthlyAppointments,
  getAllAppointments,
} from "@/lib/appointmentService"
import { subscribeToCollection } from "@/lib/activityService"
import type { Appointment } from "@/lib/types"
import { Calendar, Clock, User, Layers } from "lucide-react"
import Link from "next/link"

type FilterType = "today" | "week" | "month" | "all"

export default function Dashboard() {
  const { userData } = useAuth()
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [weeklyAppointments, setWeeklyAppointments] = useState<Appointment[]>([])
  const [monthlyAppointments, setMonthlyAppointments] = useState<Appointment[]>([])
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterType>("today")

  const fetchAppointments = useCallback(async () => {
    try {
      const [today, weekly, monthly, all] = await Promise.all([
        getTodayAppointments(),
        getWeeklyAppointments(),
        getMonthlyAppointments(),
        getAllAppointments(),
      ])

      setTodayAppointments(today)
      setWeeklyAppointments(weekly)
      setMonthlyAppointments(monthly)
      setAllAppointments(all)
    } catch (error) {
      console.error("Error fetching appointments:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  // Real-time sync
  useEffect(() => {
    const unsubscribe = subscribeToCollection("appointments", () => {
      fetchAppointments()
    })
    return () => unsubscribe()
  }, [fetchAppointments])

  // Get the appointments list for the currently selected filter
  const getDisplayedAppointments = (): Appointment[] => {
    switch (activeFilter) {
      case "today":
        // Part 3: Show only Scheduled + Confirmed for today
        return todayAppointments.filter(
          (a) => a.status === "scheduled" || a.status === "confirmed"
        )
      case "week":
        return weeklyAppointments
      case "month":
        return monthlyAppointments
      case "all":
        return allAppointments
      default:
        return todayAppointments
    }
  }

  const getListTitle = (): string => {
    switch (activeFilter) {
      case "today":
        return "Today\u2019s Appointments"
      case "week":
        return "This Week\u2019s Appointments"
      case "month":
        return "This Month\u2019s Appointments"
      case "all":
        return "All Time Appointments"
      default:
        return "Appointments"
    }
  }

  const getEmptyMessage = (): string => {
    switch (activeFilter) {
      case "today":
        return "No scheduled or confirmed appointments for today."
      case "week":
        return "No appointments this week."
      case "month":
        return "No appointments this month."
      case "all":
        return "No appointments found."
      default:
        return "No appointments found."
    }
  }

  const displayedAppointments = getDisplayedAppointments()

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

  // Card configurations
  const cards: {
    key: FilterType
    label: string
    count: number
    iconBg: string
    iconColor: string
    icon: React.ReactNode
  }[] = [
    {
      key: "today",
      label: "Today\u2019s Appointments",
      count: todayAppointments.length,
      iconBg: "bg-[#5E6AD2]/10 border-[#5E6AD2]/20",
      iconColor: "text-[#5E6AD2]",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      key: "week",
      label: "This Week",
      count: weeklyAppointments.length,
      iconBg: "bg-emerald-500/10 border-emerald-500/20",
      iconColor: "text-emerald-400",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      key: "month",
      label: "This Month",
      count: monthlyAppointments.length,
      iconBg: "bg-amber-500/10 border-amber-500/20",
      iconColor: "text-amber-400",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      key: "all",
      label: "All Time",
      count: allAppointments.length,
      iconBg: "bg-pink-500/10 border-pink-500/20",
      iconColor: "text-pink-400",
      icon: <Layers className="h-5 w-5" />,
    },
  ]

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

      {/* Summary Cards — clickable filters */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => {
          const isActive = activeFilter === card.key
          return (
            <button
              key={card.key}
              onClick={() => setActiveFilter(card.key)}
              className={`text-left bg-gradient-to-b from-white/[0.08] to-white/[0.02] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden transition-all duration-200 ${
                isActive
                  ? "border-2 border-[#5E6AD2] shadow-[0_0_0_1px_rgba(94,106,210,0.4),0_0_20px_rgba(94,106,210,0.15)]"
                  : "border border-white/[0.06] hover:border-white/[0.12]"
              }`}
            >
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-center">
                  <div className={`flex-shrink-0 rounded-xl p-2.5 sm:p-3 border ${card.iconBg}`}>
                    <span className={card.iconColor}>{card.icon}</span>
                  </div>
                  <div className="ml-3 sm:ml-4 w-0 flex-1">
                    <p className="text-xs sm:text-sm text-[#8A8F98] truncate">{card.label}</p>
                    <p className="text-xl sm:text-2xl font-semibold text-[#EDEDEF]">{card.count}</p>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtered appointments list */}
      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#EDEDEF]">{getListTitle()}</h3>
          {activeFilter === "today" && displayedAppointments.length > 0 && (
            <span className="text-xs text-[#8A8F98] bg-white/[0.05] px-2.5 py-1 rounded-full">
              Scheduled &amp; Confirmed
            </span>
          )}
        </div>
        <div className="overflow-hidden">
          {displayedAppointments.length === 0 ? (
            <div className="text-center py-10 text-[#8A8F98] text-sm">{getEmptyMessage()}</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {displayedAppointments.map((appointment) => (
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
