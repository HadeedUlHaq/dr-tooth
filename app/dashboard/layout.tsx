"use client"

import type React from "react"

import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, LogOut, Menu, User, X, Home, PlusCircle, Users, Contact, Receipt } from "lucide-react"
import { getUpcomingAppointments, getAppointmentsNeedingConfirmation } from "@/lib/appointmentService"
import {
  sendAppointmentNotification,
  sendConfirmationNotification,
  requestNotificationPermission,
} from "@/lib/notificationService"
import { NotificationBell } from "@/components/ui/notification-bell"
import { ToastContainer } from "@/components/ui/toast-notification"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, userData, logout, loading } = useAuth()
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    const checkNotificationPermission = async () => {
      const permissionGranted = await requestNotificationPermission()
      setNotificationsEnabled(permissionGranted)
    }

    checkNotificationPermission()
  }, [])

  useEffect(() => {
    if (!notificationsEnabled) return

    // Check for upcoming appointments every minute
    const checkUpcomingAppointments = async () => {
      try {
        // Check for appointments in 15 minutes
        const appointments15Min = await getUpcomingAppointments(15)
        appointments15Min.forEach((appointment) => {
          sendAppointmentNotification(appointment, 15)
        })

        // Check for appointments in 5 minutes
        const appointments5Min = await getUpcomingAppointments(5)
        appointments5Min.forEach((appointment) => {
          sendAppointmentNotification(appointment, 5)
        })

        // Check for appointments needing confirmation (1 hour before)
        const appointmentsNeedingConfirmation = await getAppointmentsNeedingConfirmation()
        appointmentsNeedingConfirmation.forEach((appointment) => {
          sendConfirmationNotification(appointment)
        })
      } catch (error) {
        console.error("Error checking upcoming appointments:", error)
      }
    }

    // Run immediately and then every minute
    checkUpcomingAppointments()
    const intervalId = setInterval(checkUpcomingAppointments, 60000)

    return () => clearInterval(intervalId)
  }, [notificationsEnabled])

  const handleLogout = async () => {
    try {
      await logout()
      router.push("/login")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const navLinkClass =
    "group flex items-center px-3 py-2 text-sm font-medium rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors"

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#0a0a0c]/80 backdrop-blur-sm border-b border-white/[0.06] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] focus:outline-none transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-lg font-semibold text-[#EDEDEF] tracking-tight">Dr Tooth Dental Clinic</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell currentUserId={user?.uid} />
              <div className="hidden md:block">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#8A8F98]">
                    {userData?.name}{" "}
                    <span className="text-white/40">·</span>{" "}
                    <span className="text-[#5E6AD2] capitalize">{userData?.role}</span>
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center text-sm text-[#8A8F98] hover:text-[#EDEDEF] transition-colors"
                  >
                    <LogOut className="h-4 w-4 mr-1.5" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar for mobile */}
        <div
          className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 ${
            isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#0a0a0c]/95 backdrop-blur-xl border-r border-white/[0.06]">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none"
              >
                <X className="h-5 w-5 text-white/60" />
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-lg font-semibold text-[#EDEDEF] tracking-tight">Dr Tooth</h1>
              </div>
              <nav className="mt-6 px-3 space-y-1">
                <Link
                  href="/dashboard"
                  className={navLinkClass}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Home className="mr-3 h-5 w-5" />
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/appointments"
                  className={navLinkClass}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Calendar className="mr-3 h-5 w-5" />
                  Appointments
                </Link>
                {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                  <Link
                    href="/dashboard/appointments/new"
                    className={navLinkClass}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <PlusCircle className="mr-3 h-5 w-5" />
                    New Appointment
                  </Link>
                )}
                {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                  <Link
                    href="/dashboard/patients"
                    className={navLinkClass}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Contact className="mr-3 h-5 w-5" />
                    Patients
                  </Link>
                )}
                {(userData?.role === "admin" || userData?.role === "receptionist") && (
                  <Link
                    href="/dashboard/invoices"
                    className={navLinkClass}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Receipt className="mr-3 h-5 w-5" />
                    Invoices
                  </Link>
                )}
                {userData?.role === "admin" && (
                  <Link
                    href="/dashboard/users"
                    className={navLinkClass}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Users className="mr-3 h-5 w-5" />
                    Manage Users
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full group flex items-center px-3 py-2 text-sm font-medium rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Logout
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Sidebar for desktop */}
        <div className="hidden md:flex md:flex-shrink-0">
          <div className="flex flex-col w-60">
            <div className="flex flex-col h-0 flex-1 border-r border-white/[0.06] bg-[#0a0a0c]">
              <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
                <nav className="mt-2 flex-1 px-3 space-y-1">
                  <Link href="/dashboard" className={navLinkClass}>
                    <Home className="mr-3 h-5 w-5" />
                    Dashboard
                  </Link>
                  <Link href="/dashboard/appointments" className={navLinkClass}>
                    <Calendar className="mr-3 h-5 w-5" />
                    Appointments
                  </Link>
                  {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                    <Link href="/dashboard/appointments/new" className={navLinkClass}>
                      <PlusCircle className="mr-3 h-5 w-5" />
                      New Appointment
                    </Link>
                  )}
                  {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                    <Link href="/dashboard/patients" className={navLinkClass}>
                      <Contact className="mr-3 h-5 w-5" />
                      Patients
                    </Link>
                  )}
                  {(userData?.role === "admin" || userData?.role === "receptionist") && (
                    <Link href="/dashboard/invoices" className={navLinkClass}>
                      <Receipt className="mr-3 h-5 w-5" />
                      Invoices
                    </Link>
                  )}
                  {userData?.role === "admin" && (
                    <Link href="/dashboard/users" className={navLinkClass}>
                      <Users className="mr-3 h-5 w-5" />
                      Manage Users
                    </Link>
                  )}
                </nav>
              </div>
              <div className="flex-shrink-0 flex border-t border-white/[0.06] p-4">
                <div className="flex items-center">
                  <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-[#5E6AD2]/10 border border-[#5E6AD2]/20">
                    <User className="h-4 w-4 text-[#5E6AD2]" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-[#EDEDEF]">{userData?.name}</p>
                    <p className="text-xs text-[#8A8F98] capitalize">{userData?.role}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col w-0 flex-1 overflow-hidden">
          <main className="flex-1 relative overflow-y-auto focus:outline-none">
            <div className="py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">{children}</div>
            </div>
          </main>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
