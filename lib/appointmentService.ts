import type { Appointment } from "./types"
import { sbSelectAll, sbGetById, sbQuery, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

// Supabase-only (Firestore data path stripped 2026-06-24 — see AI_CONTEXT.md "Reverting").
const COLLECTION_NAME = "appointments"

// Shared in-memory sort: by date, then time, "on-call" last.
const sortAppts = (appointments: Appointment[], dir: "asc" | "desc" = "asc"): Appointment[] =>
  appointments.sort((a, b) => {
    const dateCmp = dir === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    if (dateCmp !== 0) return dateCmp
    if (a.time === "on-call") return 1
    if (b.time === "on-call") return -1
    return a.time.localeCompare(b.time)
  })

// Format a Date as YYYY-MM-DD in the user's LOCAL timezone (not UTC).
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const createAppointment = async (
  appointmentData: Omit<Appointment, "id" | "createdAt">
): Promise<string> => sbInsert(COLLECTION_NAME, appointmentData as Record<string, any>)

export const updateAppointment = async (
  id: string,
  appointmentData: Partial<Appointment>
): Promise<void> => sbUpdate(COLLECTION_NAME, id, appointmentData as Record<string, any>)

// Reverts isLate, originalTime and delayReason (hard-removes those keys).
export const removeLateStatus = async (id: string, originalTime: string, updatedBy: string): Promise<void> =>
  sbUpdate(COLLECTION_NAME, id, { time: originalTime, updatedBy }, ["isLate", "originalTime", "delayReason"])

export const deleteAppointment = async (id: string): Promise<void> => sbDelete(COLLECTION_NAME, id)

export const getAppointment = async (id: string): Promise<Appointment | null> =>
  sbGetById<Appointment>(COLLECTION_NAME, id)

export const getTodayAppointments = async (): Promise<Appointment[]> => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateString(today)
  return sortAppts(await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.eq("date", todayStr)))
}

export const getWeeklyAppointments = async (): Promise<Appointment[]> => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateString(today)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = toLocalDateString(nextWeek)
  return sortAppts(
    await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.gte("date", todayStr).lt("date", nextWeekStr))
  )
}

export const getMonthlyAppointments = async (): Promise<Appointment[]> => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateString(today)
  const nextMonth = new Date(today)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const nextMonthStr = toLocalDateString(nextMonth)
  return sortAppts(
    await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.gte("date", todayStr).lt("date", nextMonthStr))
  )
}

export const getAllAppointments = async (): Promise<Appointment[]> =>
  sortAppts(await sbSelectAll<Appointment>(COLLECTION_NAME), "desc")

export const checkOverlappingAppointments = async (
  date: string,
  time: string,
  excludeId?: string
): Promise<Appointment | null> => {
  if (time === "on-call") return null
  const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
    q.eq("date", date).eq("time", time).in("status", ["scheduled", "confirmed"])
  )
  return rows.find((a) => !(excludeId && a.id === excludeId)) || null
}

export const getUpcomingAppointments = async (minutesThreshold: number): Promise<Appointment[]> => {
  const now = new Date()
  const today = toLocalDateString(now)
  const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
    q.eq("date", today).in("status", ["scheduled", "confirmed"])
  )
  return rows.filter((a) => {
    if (a.time === "on-call") return false
    const diff = (new Date(`${today}T${a.time}`).getTime() - now.getTime()) / (1000 * 60)
    return diff > 0 && diff <= minutesThreshold
  })
}

export const getAppointmentsNeedingConfirmation = async (): Promise<Appointment[]> => {
  const now = new Date()
  const today = toLocalDateString(now)
  const rows = await sbQuery<Appointment>(COLLECTION_NAME, (q) =>
    q.eq("date", today).eq("status", "scheduled")
  )
  return rows.filter((a) => {
    if (a.time === "on-call") return false
    const diff = (new Date(`${today}T${a.time}`).getTime() - now.getTime()) / (1000 * 60)
    return diff > 0 && diff <= 60
  })
}

export const getDoctorAppointments = async (doctorId: string): Promise<Appointment[]> =>
  sortAppts(await sbQuery<Appointment>(COLLECTION_NAME, (q) => q.eq("doctor_id", doctorId)))
