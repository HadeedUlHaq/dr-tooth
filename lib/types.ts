export type UserRole = "receptionist" | "doctor" | "admin"

export interface User {
  uid: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "missed" | "cancelled"

export interface Appointment {
  id: string
  patientName: string
  patientPhone?: string
  date: string // ISO date string
  time: string | "on-call"
  doctorId?: string
  doctorName?: string
  notes?: string
  status: AppointmentStatus
  isFollowUp: boolean
  previousAppointmentId?: string
  createdAt: string
  createdBy: string
  updatedAt?: string
  updatedBy?: string
}

export interface Patient {
  id: string
  name: string
  phone: string
  address?: string
  treatmentRequired: string // default: "Consultation"
  notes?: string
  createdAt: string
  createdBy: string
  updatedAt?: string
}

