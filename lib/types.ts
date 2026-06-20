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

// ── WhatsApp AI Agent ──

export type ConversationPhase =
  | "idle"
  | "identifying_patient"
  | "booking_appointment"
  | "rescheduling_appointment"
  | "cancelling_appointment"
  | "checking_appointments"
  | "checking_invoice"
  | "awaiting_confirmation"

export interface WhatsAppMessage {
  role: "user" | "assistant"
  content: string
  timestamp: string
  // For assistant messages: was it the AI bot or a human staff member (manual
  // take-over from the portal)? Absent on older messages.
  via?: "bot" | "staff"
}

export interface WhatsAppSession {
  phoneNumber: string
  patientId: string | null
  patientName: string | null
  // Phone the caller has identified with this session. For WhatsApp this is the
  // verified JID; for the anonymous web chat it is locked to the first phone the
  // caller supplies, so their identity can't silently drift mid-conversation.
  patientPhone: string | null
  phase: ConversationPhase
  messages: WhatsAppMessage[]
  pendingAction: Record<string, unknown> | null
  // Count of failed invoice-lookup attempts, used to throttle brute-forcing of
  // short invoice ids within a session.
  invoiceAttempts?: number
  // When true, the AI bot won't auto-reply to this conversation — a staff member
  // has taken it over manually from the portal. Absent/false = bot active.
  botPaused?: boolean
  // The exact JID the patient messages arrive on (e.g. "<lid>@lid" or a phone
  // JID). Stored so staff broadcasts can message this contact back on the exact
  // address the gateway delivers to. Absent on older sessions.
  chatId?: string
  // ── Staff/doctor elevation (set after a successful PIN; see lib/whatsapp/staffAuth.ts) ──
  // The authenticated staff member's display name, their role (audit/greeting only —
  // doctor and receptionist share the same powers), when they last authenticated
  // (drives the 8h TTL), and a failed-PIN counter for lockout. All absent = patient.
  staffName?: string | null
  staffRole?: "doctor" | "receptionist" | null
  staffAuthAt?: string | null
  staffPinAttempts?: number
  lastActiveAt: string
  createdAt: string
}

