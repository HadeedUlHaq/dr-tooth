import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteField,
} from "firebase/firestore"
import { db } from "./firebase"
import type { Appointment } from "./types"
import { dashboardUsesSupabase, sbSelectAll, sbGetById, sbQuery, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

const COLLECTION_NAME = "appointments"

// Shared in-memory sort (matches the Firestore paths): by date, then time, "on-call" last.
const sortAppts = (appointments: Appointment[], dir: "asc" | "desc" = "asc"): Appointment[] =>
  appointments.sort((a, b) => {
    const dateCmp = dir === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    if (dateCmp !== 0) return dateCmp
    if (a.time === "on-call") return 1
    if (b.time === "on-call") return -1
    return a.time.localeCompare(b.time)
  })

// Format a Date as YYYY-MM-DD in the user's LOCAL timezone (not UTC).
// Using toISOString().split("T")[0] converts to UTC first, which shifts
// the date backwards for timezones ahead of UTC (e.g. PKT = UTC+5).
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const createAppointment = async (appointmentData: Omit<Appointment, "id" | "createdAt">): Promise<string> => {
  if (dashboardUsesSupabase) return sbInsert(COLLECTION_NAME, appointmentData as Record<string, any>)
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...appointmentData,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error creating appointment:", error)
    throw error
  }
}

export const updateAppointment = async (id: string, appointmentData: Partial<Appointment>): Promise<void> => {
  if (dashboardUsesSupabase) return sbUpdate(COLLECTION_NAME, id, appointmentData as Record<string, any>)
  try {
    const appointmentRef = doc(db, COLLECTION_NAME, id)
    await updateDoc(appointmentRef, {
      ...appointmentData,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating appointment:", error)
    throw error
  }
}

// Reverts isLate, originalTime and delayReason by hard-deleting them from Firestore
export const removeLateStatus = async (id: string, originalTime: string, updatedBy: string): Promise<void> => {
  if (dashboardUsesSupabase) {
    return sbUpdate(COLLECTION_NAME, id, { time: originalTime, updatedBy }, ["isLate", "originalTime", "delayReason"])
  }
  try {
    const appointmentRef = doc(db, COLLECTION_NAME, id)
    await updateDoc(appointmentRef, {
      time: originalTime,
      isLate: deleteField(),
      originalTime: deleteField(),
      delayReason: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy,
    })
  } catch (error) {
    console.error("Error removing late status:", error)
    throw error
  }
}

export const deleteAppointment = async (id: string): Promise<void> => {
  if (dashboardUsesSupabase) return sbDelete(COLLECTION_NAME, id)
  try {
    const appointmentRef = doc(db, COLLECTION_NAME, id)
    await deleteDoc(appointmentRef)
  } catch (error) {
    console.error("Error deleting appointment:", error)
    throw error
  }
}

export const getAppointment = async (id: string): Promise<Appointment | null> => {
  if (dashboardUsesSupabase) return sbGetById<Appointment>(COLLECTION_NAME, id)
  try {
    const appointmentRef = doc(db, COLLECTION_NAME, id)
    const appointmentSnap = await getDoc(appointmentRef)

    if (appointmentSnap.exists()) {
      const data = appointmentSnap.data()
      return {
        id: appointmentSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment
    }

    return null
  } catch (error) {
    console.error("Error getting appointment:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getTodayAppointments = async (): Promise<Appointment[]> => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toLocalDateString(today)

    if (dashboardUsesSupabase)
      return sortAppts(await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.eq("date", todayStr)))
    const appointmentsRef = collection(db, COLLECTION_NAME)
    // Simplified query - only filter by date without ordering
    const q = query(appointmentsRef, where("date", "==", todayStr))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      appointments.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment)
    })

    // Sort in memory instead of in the query
    return appointments.sort((a, b) => {
      // First sort by date
      const dateComparison = a.date.localeCompare(b.date)
      if (dateComparison !== 0) return dateComparison

      // Then sort by time
      // Handle "on-call" special case
      if (a.time === "on-call") return 1
      if (b.time === "on-call") return -1
      return a.time.localeCompare(b.time)
    })
  } catch (error) {
    console.error("Error getting today's appointments:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getWeeklyAppointments = async (): Promise<Appointment[]> => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toLocalDateString(today)

    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = toLocalDateString(nextWeek)

    if (dashboardUsesSupabase)
      return sortAppts(
        await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.gte("date", todayStr).lt("date", nextWeekStr))
      )
    const appointmentsRef = collection(db, COLLECTION_NAME)
    // Use a simpler query that doesn't require a composite index
    const q = query(appointmentsRef, where("date", ">=", todayStr), where("date", "<", nextWeekStr))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      appointments.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment)
    })

    // Sort in memory instead of in the query
    return appointments.sort((a, b) => {
      // First sort by date
      const dateComparison = a.date.localeCompare(b.date)
      if (dateComparison !== 0) return dateComparison

      // Then sort by time
      // Handle "on-call" special case
      if (a.time === "on-call") return 1
      if (b.time === "on-call") return -1
      return a.time.localeCompare(b.time)
    })
  } catch (error) {
    console.error("Error getting weekly appointments:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getMonthlyAppointments = async (): Promise<Appointment[]> => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toLocalDateString(today)

    const nextMonth = new Date(today)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const nextMonthStr = toLocalDateString(nextMonth)

    if (dashboardUsesSupabase)
      return sortAppts(
        await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.gte("date", todayStr).lt("date", nextMonthStr))
      )
    const appointmentsRef = collection(db, COLLECTION_NAME)
    // Use a simpler query that doesn't require a composite index
    const q = query(appointmentsRef, where("date", ">=", todayStr), where("date", "<", nextMonthStr))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      appointments.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment)
    })

    // Sort in memory instead of in the query
    return appointments.sort((a, b) => {
      // First sort by date
      const dateComparison = a.date.localeCompare(b.date)
      if (dateComparison !== 0) return dateComparison

      // Then sort by time
      // Handle "on-call" special case
      if (a.time === "on-call") return 1
      if (b.time === "on-call") return -1
      return a.time.localeCompare(b.time)
    })
  } catch (error) {
    console.error("Error getting monthly appointments:", error)
    throw error
  }
}

export const getAllAppointments = async (): Promise<Appointment[]> => {
  try {
    if (dashboardUsesSupabase) return sortAppts(await sbSelectAll<Appointment>(COLLECTION_NAME), "desc")
    const appointmentsRef = collection(db, COLLECTION_NAME)
    const q = query(appointmentsRef, orderBy("date", "desc"))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      appointments.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment)
    })

    // Sort by date desc, then time
    return appointments.sort((a, b) => {
      const dateComparison = b.date.localeCompare(a.date)
      if (dateComparison !== 0) return dateComparison
      if (a.time === "on-call") return 1
      if (b.time === "on-call") return -1
      return a.time.localeCompare(b.time)
    })
  } catch (error) {
    console.error("Error getting all appointments:", error)
    throw error
  }
}

export const checkOverlappingAppointments = async (
  date: string,
  time: string,
  excludeId?: string,
): Promise<Appointment | null> => {
  if (time === "on-call") return null

  try {
    if (dashboardUsesSupabase) {
      const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
        q.eq("date", date).eq("time", time).in("status", ["scheduled", "confirmed"])
      )
      return rows.find((a) => !(excludeId && a.id === excludeId)) || null
    }
    const appointmentsRef = collection(db, COLLECTION_NAME)
    const q = query(
      appointmentsRef,
      where("date", "==", date),
      where("time", "==", time),
      where("status", "in", ["scheduled", "confirmed"]),
    )

    const querySnapshot = await getDocs(q)
    let overlappingAppointment: Appointment | null = null

    querySnapshot.forEach((doc) => {
      if (excludeId && doc.id === excludeId) return

      const data = doc.data()
      overlappingAppointment = {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment
    })

    return overlappingAppointment
  } catch (error) {
    console.error("Error checking overlapping appointments:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getUpcomingAppointments = async (minutesThreshold: number): Promise<Appointment[]> => {
  try {
    const now = new Date()
    const today = toLocalDateString(now)

    if (dashboardUsesSupabase) {
      const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
        q.eq("date", today).in("status", ["scheduled", "confirmed"])
      )
      return rows.filter((a) => {
        if (a.time === "on-call") return false
        const diff = (new Date(`${today}T${a.time}`).getTime() - now.getTime()) / (1000 * 60)
        return diff > 0 && diff <= minutesThreshold
      })
    }
    const appointmentsRef = collection(db, COLLECTION_NAME)
    const q = query(appointmentsRef, where("date", "==", today), where("status", "in", ["scheduled", "confirmed"]))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.time === "on-call") return

      const appointmentTime = new Date(`${today}T${data.time}`)
      const timeDiff = (appointmentTime.getTime() - now.getTime()) / (1000 * 60)

      if (timeDiff > 0 && timeDiff <= minutesThreshold) {
        appointments.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate().toISOString(),
        } as Appointment)
      }
    })

    return appointments
  } catch (error) {
    console.error("Error getting upcoming appointments:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getAppointmentsNeedingConfirmation = async (): Promise<Appointment[]> => {
  try {
    const now = new Date()
    const today = toLocalDateString(now)

    if (dashboardUsesSupabase) {
      const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
        q.eq("date", today).eq("status", "scheduled")
      )
      return rows.filter((a) => {
        if (a.time === "on-call") return false
        const diff = (new Date(`${today}T${a.time}`).getTime() - now.getTime()) / (1000 * 60)
        return diff > 0 && diff <= 60
      })
    }
    const appointmentsRef = collection(db, COLLECTION_NAME)
    const q = query(appointmentsRef, where("date", "==", today), where("status", "==", "scheduled"))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.time === "on-call") return

      const appointmentTime = new Date(`${today}T${data.time}`)
      const timeDiff = (appointmentTime.getTime() - now.getTime()) / (1000 * 60)

      if (timeDiff > 0 && timeDiff <= 60) {
        appointments.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate().toISOString(),
        } as Appointment)
      }
    })

    return appointments
  } catch (error) {
    console.error("Error getting appointments needing confirmation:", error)
    throw error
  }
}

// Modified to avoid requiring composite index
export const getDoctorAppointments = async (doctorId: string): Promise<Appointment[]> => {
  try {
    if (dashboardUsesSupabase)
      return sortAppts(await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.eq("doctor_id", doctorId)))
    const appointmentsRef = collection(db, COLLECTION_NAME)
    const q = query(appointmentsRef, where("doctorId", "==", doctorId))

    const querySnapshot = await getDocs(q)
    const appointments: Appointment[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      appointments.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Appointment)
    })

    // Sort in memory instead of in the query
    return appointments.sort((a, b) => {
      // First sort by date
      const dateComparison = a.date.localeCompare(b.date)
      if (dateComparison !== 0) return dateComparison

      // Then sort by time
      // Handle "on-call" special case
      if (a.time === "on-call") return 1
      if (b.time === "on-call") return -1
      return a.time.localeCompare(b.time)
    })
  } catch (error) {
    console.error("Error getting doctor appointments:", error)
    throw error
  }
}

