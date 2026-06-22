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
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading dashboard">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-[#0891B2] border-t-transparent"></div>
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
          className={`group flex min-h-[44px] items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55 ${
            active
              ? "border-[#22D3EE]/35 bg-[#0891B2]/16 text-[#F0FCFF]"
              : "border-transparent text-[#A9BFC5] hover:bg-white/[0.06] hover:text-[#F0FCFF]"
          }`}
        >
          <Icon className={`mr-3 h-5 w-5 ${active ? "text-[#22D3EE]" : "text-[#A9BFC5]"}`} />
          {n.label}
        </Link>
      )
    })

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#061417]/88 backdrop-blur-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                aria-label="Open navigation"
                aria-expanded={isSidebarOpen}
                className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-[#A9BFC5] transition-colors hover:bg-white/[0.06] hover:text-[#F0FCFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex-shrink-0 flex items-center gap-2 ml-1">
                <ToothLogo className="h-6 w-6 text-[#0891B2]" />
                <span className="text-lg font-semibold text-[#F0FCFF] tracking-tight">Dr Tooth Dental Clinic</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell currentUserId={user?.uid} userRole={userData?.role} />
              <div className="hidden md:block">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#A9BFC5]">
                    {userData?.name}{" "}
                    <span className="text-white/40">·</span>{" "}
                    <span className="text-[#22D3EE] capitalize">{userData?.role}</span>
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex min-h-[44px] items-center rounded-lg px-2 text-sm text-[#A9BFC5] transition-colors hover:bg-white/[0.06] hover:text-[#F0FCFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55"
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
          <div className="relative flex w-full max-w-xs flex-1 flex-col border-r border-white/[0.08] bg-[#061417]/96 backdrop-blur-xl">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close navigation"
                className="ml-1 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55"
              >
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center gap-2 px-4">
                <ToothLogo className="h-6 w-6 text-[#0891B2]" />
                <span className="text-lg font-semibold text-[#F0FCFF] tracking-tight">Dr Tooth</span>
              </div>
              <nav className="mt-6 px-3 space-y-1">
                {renderNav(() => setIsSidebarOpen(false))}
                <button
                  onClick={handleLogout}
                  className="group flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-[#A9BFC5] transition-colors hover:bg-white/[0.06] hover:text-[#F0FCFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55"
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
            <div className="flex h-0 flex-1 flex-col border-r border-white/[0.08] bg-[#061417]">
              <div className="flex h-14 items-center gap-2 border-b border-white/[0.08] px-5">
                <ToothLogo className="h-6 w-6 text-[#0891B2]" />
                <span className="text-base font-semibold text-[#F0FCFF] tracking-tight">Dr Tooth</span>
              </div>
              <div className="flex-1 flex flex-col pt-4 pb-4 overflow-y-auto">
                <nav className="flex-1 px-3 space-y-1">{renderNav()}</nav>
              </div>
              <div className="flex flex-shrink-0 border-t border-white/[0.08] p-4">
                <div className="flex items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#22D3EE]/20 bg-[#0891B2]/12">
                    <User className="h-4 w-4 text-[#22D3EE]" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-[#F0FCFF]">{userData?.name}</p>
                    <p className="text-xs text-[#A9BFC5] capitalize">{userData?.role}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-col w-0 flex-1 overflow-hidden print:!w-full print:!overflow-visible">
          <main id="main-content" tabIndex={-1} className="relative flex-1 overflow-y-auto focus:outline-none">
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
