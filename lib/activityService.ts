import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore"
import { db } from "./firebase"
import type { ActivityLog } from "./types"

const COLLECTION_NAME = "activity_logs"

export const logActivity = async (
  data: Omit<ActivityLog, "id" | "createdAt">
): Promise<void> => {
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      createdAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error logging activity:", error)
  }
}

export const subscribeToActivities = (
  callback: (activities: ActivityLog[]) => void,
  maxItems = 20
): Unsubscribe => {
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy("createdAt", "desc"),
    limit(maxItems)
  )

  return onSnapshot(q, (snapshot) => {
    const activities: ActivityLog[] = []
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      activities.push({
        id: docSnap.id,
        type: data.type,
        message: data.message,
        actorName: data.actorName,
        actorId: data.actorId,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
      })
    })
    callback(activities)
  })
}

export const deleteActivity = async (activityId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, activityId))
  } catch (error) {
    console.error("Error deleting activity:", error)
  }
}

export const clearAllActivities = async (): Promise<void> => {
  try {
    const q = query(collection(db, COLLECTION_NAME))
    const snapshot = await getDocs(q)
    const deletePromises = snapshot.docs.map((docSnap) =>
      deleteDoc(doc(db, COLLECTION_NAME, docSnap.id))
    )
    await Promise.all(deletePromises)
  } catch (error) {
    console.error("Error clearing activities:", error)
  }
}

// Subscribe to real-time changes on a Firestore collection
export const subscribeToCollection = (
  collectionName: string,
  callback: () => void
): Unsubscribe => {
  return onSnapshot(collection(db, collectionName), () => {
    callback()
  })
}
