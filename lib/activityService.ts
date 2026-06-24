import type { ActivityLog } from "./types"
import { sbInsert, sbQuery, sbDelete, sbDeleteAll, sbSubscribe } from "./dashboardRepo"

// Supabase-only (Firestore data path stripped 2026-06-24 — see AI_CONTEXT.md "Reverting").
type Unsubscribe = () => void
const COLLECTION_NAME = "activity_logs"

export const logActivity = async (
  data: Omit<ActivityLog, "id" | "createdAt">
): Promise<void> => {
  try {
    await sbInsert(COLLECTION_NAME, data as Record<string, any>)
  } catch (error) {
    console.error("Error logging activity:", error)
  }
}

export const subscribeToActivities = (
  callback: (activities: ActivityLog[]) => void,
  maxItems = 20
): Unsubscribe => {
  const refetch = async () => {
    try {
      const rows = await sbQuery<ActivityLog>(COLLECTION_NAME, (q) =>
        q.order("created_at_iso", { ascending: false }).limit(maxItems)
      )
      callback(rows)
    } catch (err) {
      console.error("Error fetching activities:", err)
    }
  }
  void refetch()
  return sbSubscribe(COLLECTION_NAME, refetch)
}

export const deleteActivity = async (activityId: string): Promise<void> => {
  try {
    await sbDelete(COLLECTION_NAME, activityId)
  } catch (error) {
    console.error("Error deleting activity:", error)
  }
}

export const clearAllActivities = async (): Promise<void> => {
  try {
    await sbDeleteAll(COLLECTION_NAME)
  } catch (error) {
    console.error("Error clearing activities:", error)
  }
}

// Subscribe to real-time changes on a collection (Supabase Realtime).
export const subscribeToCollection = (
  collectionName: string,
  callback: () => void
): Unsubscribe => sbSubscribe(collectionName, callback)
