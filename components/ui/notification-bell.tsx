"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { Bell, Trash2 } from "lucide-react"
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
      return "👤"
    case "patient_updated":
    case "patient_deleted":
      return "📋"
    case "appointment_created":
      return "📅"
    case "appointment_updated":
    case "appointment_status_changed":
      return "🔄"
    case "appointment_deleted":
      return "🗑️"
    case "appointment_delayed":
      return "⏰"
    case "invoice_created":
    case "invoice_updated":
    case "invoice_deleted":
      return "🧾"
    case "payment_recorded":
      return "💰"
    case "lab_case_created":
    case "lab_case_updated":
      return "🦷"
    default:
      return "📌"
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
        <div className="px-4 py-8 text-center text-sm text-[#8A8F98]">
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
            isUnread ? "bg-[#5E6AD2]/[0.04]" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-base mt-0.5 flex-shrink-0">
              {getTypeIcon(activity.type)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#EDEDEF] leading-snug">
                {activity.message}
              </p>
              <p className="text-xs text-[#8A8F98] mt-1">
                {timeAgo(activity.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isUnread && (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-[#5E6AD2]" />
              )}
              <button
                onClick={(e) => handleDeleteOne(e, activity.id)}
                className="mt-0.5 p-1 rounded text-white/0 group-hover:text-[#8A8F98] hover:!text-red-400 hover:bg-white/[0.05] transition-all"
                title="Remove notification"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
        className="relative p-2 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors"
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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0a0a0c] border border-white/[0.08] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#EDEDEF]">Notifications</h3>
            {activities.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 text-xs text-[#8A8F98] hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="px-3 pt-2 pb-1 border-b border-white/[0.06]">
              <TabsList className="w-full bg-white/[0.03] rounded-lg p-0.5 h-auto">
                <TabsTrigger
                  value="appointments"
                  className="flex-1 text-xs py-1.5 data-[state=active]:bg-[#5E6AD2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-[#8A8F98] data-[state=inactive]:bg-transparent rounded-md transition-colors"
                >
                  📅 Appointments
                </TabsTrigger>
                <TabsTrigger
                  value="lab"
                  className="flex-1 text-xs py-1.5 data-[state=active]:bg-[#5E6AD2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-[#8A8F98] data-[state=inactive]:bg-transparent rounded-md transition-colors"
                >
                  🦷 Lab Cases
                </TabsTrigger>
                {userRole !== "doctor" && (
                  <TabsTrigger
                    value="invoices"
                    className="flex-1 text-xs py-1.5 data-[state=active]:bg-[#5E6AD2] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-[#8A8F98] data-[state=inactive]:bg-transparent rounded-md transition-colors"
                  >
                    🧾 Invoices
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="appointments" className="mt-0">
              <div className="max-h-72 overflow-y-auto">
                {renderActivityList(appointmentActivities)}
              </div>
            </TabsContent>
            <TabsContent value="lab" className="mt-0">
              <div className="max-h-72 overflow-y-auto">
                {renderActivityList(labActivities)}
              </div>
            </TabsContent>
            {userRole !== "doctor" && (
              <TabsContent value="invoices" className="mt-0">
                <div className="max-h-72 overflow-y-auto">
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
