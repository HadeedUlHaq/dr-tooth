"use client"

import type React from "react"

import { useAuth } from "@/contexts/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, LogOut, Menu, User, X, Home, PlusCircle, Users } from "lucide-react"
import { getUpcomingAppointments, getAppointmentsNeedingConfirmation } from "@/lib/appointmentService"
import {
  sendAppointmentNotification,
  sendConfirmationNotification,
  requestNotificationPermission,
} from "@/lib/notificationService"

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
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-primary">Dr Tooth Dental Clinic</h1>
              </div>
            </div>
            <div className="flex items-center">
              <div className="hidden md:block">
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-700 mr-4">
                    {userData?.name} ({userData?.role})
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center text-sm font-medium text-gray-700 hover:text-primary"
                  >
                    <LogOut className="h-5 w-5 mr-1" />
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
          className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${
            isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="absolute inset-0 bg-gray-600 opacity-75"></div>
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-xl font-bold text-primary">Dr Tooth</h1>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                <Link
                  href="/dashboard"
                  className="group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Home className="mr-3 h-6 w-6" />
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/appointments"
                  className="group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Calendar className="mr-3 h-6 w-6" />
                  Appointments
                </Link>
                {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                  <Link
                    href="/dashboard/appointments/new"
                    className="group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <PlusCircle className="mr-3 h-6 w-6" />
                    New Appointment
                  </Link>
                )}
                {userData?.role === "admin" && (
                  <Link
                    href="/dashboard/users"
                    className="group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Users className="mr-3 h-6 w-6" />
                    Manage Users
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full group flex items-center px-2 py-2 text-base font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                >
                  <LogOut className="mr-3 h-6 w-6" />
                  Logout
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Sidebar for desktop */}
        <div className="hidden md:flex md:flex-shrink-0">
          <div className="flex flex-col w-64">
            <div className="flex flex-col h-0 flex-1 border-r border-gray-200 bg-white">
              <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
                <nav className="mt-5 flex-1 px-2 bg-white space-y-1">
                  <Link
                    href="/dashboard"
                    className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                  >
                    <Home className="mr-3 h-6 w-6" />
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/appointments"
                    className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                  >
                    <Calendar className="mr-3 h-6 w-6" />
                    Appointments
                  </Link>
                  {(userData?.role === "receptionist" || userData?.role === "doctor" || userData?.role === "admin") && (
                    <Link
                      href="/dashboard/appointments/new"
                      className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                    >
                      <PlusCircle className="mr-3 h-6 w-6" />
                      New Appointment
                    </Link>
                  )}
                  {userData?.role === "admin" && (
                    <Link
                      href="/dashboard/users"
                      className="group flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-900 hover:bg-primary hover:text-white"
                    >
                      <Users className="mr-3 h-6 w-6" />
                      Manage Users
                    </Link>
                  )}
                </nav>
              </div>
              <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                <div className="flex items-center">
                  <div>
                    <User className="inline-block h-9 w-9 rounded-full text-gray-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{userData?.name}</p>
                    <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700">{userData?.role}</p>
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
    </div>
  )
}

