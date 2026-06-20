"use client"

import type React from "react"

import { useAuth } from "@/contexts/AuthContext"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, CalendarDays, LogOut, Menu, User, X, Home, PlusCircle, Users, Contact, Receipt, Package, MessageCircle, type LucideIcon } from "lucide-react"
import { ToothLogo } from "@/components/ui-kit/ToothLogo"
import { getUpcomingAppointments, getAppointmentsNeedingConfirmation } from "@/lib/appointmentService"
import {
  sendAppointmentNotification,
  sendConfirmationNotification,
  requestNotificationPermission,
} from "@/lib/notificationService"
import { NotificationBell } from "@/components/ui/notification-bell"
import { ToastContainer } from "@/components/ui/toast-notification"

type Role = "receptionist" | "doctor" | "admin"
type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[] | null }

// Single source of truth for navigation (used by both desktop + mobile).
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home, roles: null },
  { href: "/dashboard/appointments", label: "Appointments", icon: Calendar, roles: null },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, roles: null },
  { href: "/dashboard/appointments/new", label: "New Appointment", icon: PlusCircle, roles: ["receptionist", "doctor", "admin"] },
  { href: "/dashboard/patients", label: "Patients", icon: Contact, roles: ["receptionist", "doctor", "admin"] },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt, roles: ["admin", "receptionist"] },
  { href: "/dashboard/lab-tracking", label: "Lab Tracking", icon: Package, roles: null },
  { href: "/dashboard/users", label: "Manage Users", icon: Users, roles: ["admin"] },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "receptionist"] },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, userData, logout, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
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

  const role = userData?.role as Role | undefined
  const navItems = NAV.filter((n) => !n.roles || (role !== undefined && n.roles.includes(role)))
  // Longest matching href wins, so /appointments/new highlights "New Appointment"
  // rather than also lighting up "Appointments".
  const activeHref = navItems
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const renderNav = (onNavigate?: () => void) =>
    navItems.map((n) => {
      const active = n.href === activeHref
      const Icon = n.icon
      return (
        <Link
          key={n.href}
          href={n.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/50 ${
            active
              ? "bg-[#5E6AD2]/12 text-[#EDEDEF] border-[#5E6AD2]/25"
              : "text-[#9aa0aa] border-transparent hover:text-[#EDEDEF] hover:bg-white/[0.05]"
          }`}
        >
          <Icon className={`mr-3 h-5 w-5 ${active ? "text-[#818cf8]" : ""}`} />
          {n.label}
        </Link>
      )
    })

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#0a0a0c]/80 backdrop-blur-sm border-b border-white/[0.06] sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] focus:outline-none transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex-shrink-0 flex items-center gap-2 ml-1">
                <ToothLogo className="h-6 w-6 text-[#5E6AD2]" />
                <h1 className="text-lg font-semibold text-[#EDEDEF] tracking-tight">Dr Tooth Dental Clinic</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell currentUserId={user?.uid} userRole={userData?.role} />
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
          className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 print:hidden ${
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
              <div className="flex-shrink-0 flex items-center gap-2 px-4">
                <ToothLogo className="h-6 w-6 text-[#5E6AD2]" />
                <h1 className="text-lg font-semibold text-[#EDEDEF] tracking-tight">Dr Tooth</h1>
              </div>
              <nav className="mt-6 px-3 space-y-1">
                {renderNav(() => setIsSidebarOpen(false))}
                <button
                  onClick={handleLogout}
                  className="w-full group flex items-center px-3 py-2 text-sm font-medium rounded-lg text-[#9aa0aa] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/50"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Logout
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Sidebar for desktop */}
        <div className="hidden md:flex md:flex-shrink-0 print:!hidden">
          <div className="flex flex-col w-60">
            <div className="flex flex-col h-0 flex-1 border-r border-white/[0.06] bg-[#0a0a0c]">
              <div className="flex items-center gap-2 px-5 h-14 border-b border-white/[0.06]">
                <ToothLogo className="h-6 w-6 text-[#5E6AD2]" />
                <span className="text-base font-semibold text-[#EDEDEF] tracking-tight">Dr Tooth</span>
              </div>
              <div className="flex-1 flex flex-col pt-4 pb-4 overflow-y-auto">
                <nav className="flex-1 px-3 space-y-1">{renderNav()}</nav>
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
        <div className="flex flex-col w-0 flex-1 overflow-hidden print:!w-full print:!overflow-visible">
          <main className="flex-1 relative overflow-y-auto focus:outline-none">
            <div className="py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">{children}</div>
            </div>
          </main>
        </div>
      </div>

      <div className="print:hidden">
        <ToastContainer />
      </div>
    </div>
  )
}
