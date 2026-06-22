"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { Bell, Package, Trash2 } from "lucide-react"
import { subscribeToActivities, deleteActivity, clearAllActivities } from "@/lib/activityService"
import { showToast } from "@/components/ui/toast-notification"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { ActivityLog, UserRole } from "@/lib/types"

function timeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getTypeIcon(type: ActivityLog["type"]): string {
  switch (type) {
    case "patient_added":
      return "Patient added"
    case "patient_updated":
      return "Patient updated"
    case "patient_deleted":
      return "Patient deleted"
    case "appointment_created":
      return "Appointment created"
    case "appointment_updated":
    case "appointment_status_changed":
      return "Appointment updated"
    case "appointment_deleted":
      return "Appointment deleted"
    case "appointment_delayed":
      return "Appointment delayed"
    case "invoice_created":
    case "invoice_updated":
    case "invoice_deleted":
      return "Invoice update"
    case "payment_recorded":
      return "Payment recorded"
    case "lab_case_created":
    case "lab_case_updated":
      return "Lab case update"
    default:
      return "Activity"
  }
}

const APPOINTMENT_TYPES: ActivityLog["type"][] = [
  "patient_added", "patient_updated", "patient_deleted",
  "appointment_created", "appointment_updated", "appointment_status_changed",
  "appointment_deleted", "appointment_delayed",
]

const LAB_TYPES: ActivityLog["type"][] = [
  "lab_case_created", "lab_case_updated",
]

const INVOICE_TYPES: ActivityLog["type"][] = [
  "invoice_created", "invoice_updated", "invoice_deleted", "payment_recorded",
]

interface NotificationBellProps {
  currentUserId?: string
  userRole?: UserRole
}

export function NotificationBell({ currentUserId, userRole }: NotificationBellProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string>("")
  const [activeTab, setActiveTab] = useState("appointments")
  const panelRef = useRef<HTMLDivElement>(null)
  const prevActivitiesRef = useRef<ActivityLog[]>([])
  const isInitialLoad = useRef(true)
  const userRoleRef = useRef(userRole)
  userRoleRef.current = userRole

  // Filtered lists by category
  const appointmentActivities = useMemo(
    () => activities.filter((a) => APPOINTMENT_TYPES.includes(a.type)),
    [activities]
  )
  const labActivities = useMemo(
    () => activities.filter((a) => LAB_TYPES.includes(a.type)),
    [activities]
  )
  const invoiceActivities = useMemo(
    () => activities.filter((a) => INVOICE_TYPES.includes(a.type)),
    [activities]
  )

  // Subscribe to activity log
  useEffect(() => {
    const unsubscribe = subscribeToActivities((newActivities) => {
      // Show toast for new activities from OTHER users (not on initial load)
      if (!isInitialLoad.current && prevActivitiesRef.current.length > 0) {
        const prevIds = new Set(prevActivitiesRef.current.map((a) => a.id))
        const brandNew = newActivities.filter(
          (a) => !prevIds.has(a.id) && a.actorId !== currentUserId
        )
        brandNew.forEach((activity) => {
          showToast(activity.message, "info")
        })
      }

      isInitialLoad.current = false
      prevActivitiesRef.current = newActivities
      setActivities(newActivities)

      // Calculate unread count (exclude invoice types for doctor role)
      const stored = localStorage.getItem("lastReadNotification")
      const lastRead = stored || ""
      const unread = newActivities.filter((a) => {
        if (a.actorId === currentUserId) return false
        if (a.createdAt <= lastRead) return false
        if (userRoleRef.current === "doctor" && INVOICE_TYPES.includes(a.type)) return false
        return true
      }).length
      setUnreadCount(unread)
      setLastReadTimestamp(lastRead)
    })

    return () => unsubscribe()
  }, [currentUserId])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const handleToggle = () => {
    const opening = !isOpen
    setIsOpen(opening)

    if (opening) {
      // Mark all as read
      const now = new Date().toISOString()
      localStorage.setItem("lastReadNotification", now)
      setUnreadCount(0)
      setLastReadTimestamp(now)
    }
  }

  const handleDeleteOne = async (e: React.MouseEvent, activityId: string) => {
    e.stopPropagation()
    await deleteActivity(activityId)
  }

  const handleClearAll = async () => {
    await clearAllActivities()
  }

  const renderActivityList = (items: ActivityLog[]) => {
    if (items.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-sm text-[#A9BFC5]">
          No notifications.
        </div>
      )
    }
    return items.map((activity) => {
      const isUnread =
        activity.createdAt > lastReadTimestamp &&
        activity.actorId !== currentUserId
      return (
        <div
          key={activity.id}
          className={`group px-4 py-3 border-b border-white/[0.04] last:border-b-0 ${
            isUnread ? "bg-[#0891B2]/[0.04]" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[#22D3EE]"
              title={getTypeIcon(activity.type)}
            >
              <Package className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#F0FCFF] leading-snug">
                {activity.message}
              </p>
              <p className="text-xs text-[#A9BFC5] mt-1">
                {timeAgo(activity.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isUnread && (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-[#0891B2]" />
              )}
              <button
                onClick={(e) => handleDeleteOne(e, activity.id)}
                className="mt-0.5 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A9BFC5] hover:!text-red-400 hover:bg-white/[0.05] transition-all"
                title="Remove notification"
                aria-label="Remove notification"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A9BFC5] transition-colors hover:bg-white/[0.05] hover:text-[#F0FCFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]/55"
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="fixed left-2 right-2 top-16 z-50 overflow-hidden rounded-lg border border-white/[0.08] bg-[#061417] shadow-[0_8px_40px_rgba(0,0,0,0.6)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F0FCFF]">Notifications</h3>
            {activities.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs text-[#A9BFC5] transition-colors hover:bg-white/[0.05] hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b border-white/[0.06] px-3 pb-1 pt-2">
              <TabsList className="h-auto w-full rounded-lg bg-white/[0.03] p-0.5">
                <TabsTrigger
                  value="appointments"
                  className="min-h-[44px] flex-1 rounded-md px-2 py-2 text-xs transition-colors data-[state=active]:bg-[#0891B2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#A9BFC5]"
                >
                  Appointments
                </TabsTrigger>
                <TabsTrigger
                  value="lab"
                  className="min-h-[44px] flex-1 rounded-md px-2 py-2 text-xs transition-colors data-[state=active]:bg-[#0891B2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#A9BFC5]"
                >
                  Lab Cases
                </TabsTrigger>
                {userRole !== "doctor" && (
                  <TabsTrigger
                    value="invoices"
                    className="min-h-[44px] flex-1 rounded-md px-2 py-2 text-xs transition-colors data-[state=active]:bg-[#0891B2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#A9BFC5]"
                  >
                    Invoices
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="appointments" className="mt-0">
              <div className="max-h-[60dvh] overflow-y-auto sm:max-h-72">
                {renderActivityList(appointmentActivities)}
              </div>
            </TabsContent>
            <TabsContent value="lab" className="mt-0">
              <div className="max-h-[60dvh] overflow-y-auto sm:max-h-72">
                {renderActivityList(labActivities)}
              </div>
            </TabsContent>
            {userRole !== "doctor" && (
              <TabsContent value="invoices" className="mt-0">
                <div className="max-h-[60dvh] overflow-y-auto sm:max-h-72">
                  {renderActivityList(invoiceActivities)}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  )
}
