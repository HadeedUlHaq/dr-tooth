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
  isLate?: boolean
  originalTime?: string
  delayReason?: string
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
  type: "patient_added" | "patient_updated" | "patient_deleted" | "appointment_created" | "appointment_updated" | "appointment_status_changed" | "appointment_deleted" | "appointment_delayed" | "invoice_created" | "invoice_updated" | "invoice_deleted" | "payment_recorded" | "lab_case_created" | "lab_case_updated"
  message: string
  actorName: string
  actorId: string
  createdAt: string
}

// ── Invoicing ──

export interface LineItem {
  serviceName: string
  price: number // in Rupees
  quantity?: number // default: 1
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

// ── Lab Tracking ──

export type LabName = "Tanveer Dental Lab" | "Zubair Dental Lab" | "None"
export type LabCaseStatus =
  | "Preparation/Cutting Done"
  | "Impression Taken"
  | "Sent to Lab"
  | "Received from Lab"
  | "Fitted/Completed"

export interface LabCase {
  id: string
  patientId: string
  patientName: string
  patientPhone?: string
  material: string
  toothDetails: string
  labName: LabName
  status: LabCaseStatus
  sentDate?: string
  receivedDate?: string
  notes?: string
  createdAt: string
  createdBy: string
  updatedBy?: string
  updatedAt?: string
}

