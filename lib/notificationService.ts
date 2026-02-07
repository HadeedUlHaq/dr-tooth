import type { Appointment } from "./types"

// This would be replaced with a proper notification system in production
// For now, we'll use browser notifications

// Track which notifications have already been sent to avoid duplicates
const sentNotifications = new Set<string>()

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications")
    return false
  }

  if (Notification.permission === "granted") {
    return true
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission()
    return permission === "granted"
  }

  return false
}

export const sendAppointmentNotification = (appointment: Appointment, minutesUntil: number): void => {
  const notificationKey = `appointment-${appointment.id}-${minutesUntil}min`

  // Skip if already sent
  if (sentNotifications.has(notificationKey)) return
  sentNotifications.add(notificationKey)

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  const title = `Upcoming Appointment: ${minutesUntil} minutes`
  const options = {
    body: `Patient: ${appointment.patientName}\nTime: ${appointment.time === "on-call" ? "On Call" : appointment.time}`,
    icon: "/logo.png",
    tag: notificationKey,
  }

  new Notification(title, options)
}

export const sendConfirmationNotification = (appointment: Appointment): void => {
  const notificationKey = `confirmation-${appointment.id}`

  // Skip if already sent
  if (sentNotifications.has(notificationKey)) return
  sentNotifications.add(notificationKey)

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  const title = "Appointment Confirmation Needed"
  const options = {
    body: `Please confirm appointment with ${appointment.patientName} scheduled in 1 hour`,
    icon: "/logo.png",
    tag: notificationKey,
  }

  new Notification(title, options)
}
