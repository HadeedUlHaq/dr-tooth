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

export interface ActivityLog {
  id: string
  type: "patient_added" | "patient_updated" | "patient_deleted" | "appointment_created" | "appointment_updated" | "appointment_status_changed" | "appointment_deleted" | "invoice_created" | "invoice_updated" | "invoice_deleted" | "payment_recorded"
  message: string
  actorName: string
  actorId: string
  createdAt: string
}

// ── Invoicing ──

export interface LineItem {
  serviceName: string
  price: number // in Rupees
}

export type DiscountType = "percent" | "flat"
export type InvoiceStatus = "unpaid" | "partial" | "paid"
export type PaymentMethod = "Cash" | "Card" | "Transfer"

export interface PaymentLog {
  id: string
  date: string
  amount: number
  method: PaymentMethod
  recordedBy: string
  recordedByName: string
}

export interface Invoice {
  id: string
  appointmentId?: string
  patientId?: string
  patientName: string
  patientPhone?: string
  date: string // ISO date
  lineItems: LineItem[]
  subtotal: number
  discountType: DiscountType
  discountValue: number
  total: number
  amountPaid: number
  balanceDue: number
  status: InvoiceStatus
  payments: PaymentLog[]
  createdAt: string
  createdBy: string
  updatedAt?: string
}

