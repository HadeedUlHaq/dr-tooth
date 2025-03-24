import type { Appointment } from "./types"

// This would be replaced with a proper notification system in production
// For now, we'll use browser notifications

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
  if (!("Notification" in window) || Notification.permission !== "granted") {
    // Fall back to alert if notifications aren't supported or permitted
    alert(`Upcoming appointment: ${appointment.patientName} in ${minutesUntil} minutes`)
    return
  }

  const title = `Upcoming Appointment: ${minutesUntil} minutes`
  const options = {
    body: `Patient: ${appointment.patientName}\nTime: ${appointment.time === "on-call" ? "On Call" : appointment.time}`,
    icon: "/logo.png",
  }

  new Notification(title, options)
}

export const sendConfirmationNotification = (appointment: Appointment): void => {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    // Fall back to alert if notifications aren't supported or permitted
    alert(`Please confirm appointment with ${appointment.patientName} scheduled in 1 hour`)
    return
  }

  const title = "Appointment Confirmation Needed"
  const options = {
    body: `Please confirm appointment with ${appointment.patientName} scheduled in 1 hour`,
    icon: "/logo.png",
  }

  new Notification(title, options)
}

