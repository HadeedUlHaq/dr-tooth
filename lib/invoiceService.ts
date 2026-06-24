import type { Invoice, PaymentLog } from "./types"
import { sbGetById, sbQuery, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

// Supabase-only (Firestore data path stripped 2026-06-24 — see AI_CONTEXT.md "Reverting").
const COLLECTION_NAME = "invoices"

export const createInvoice = async (
  invoiceData: Omit<Invoice, "id" | "createdAt" | "updatedAt">
): Promise<string> => sbInsert(COLLECTION_NAME, invoiceData as Record<string, any>)

export const getInvoices = async (): Promise<Invoice[]> =>
  sbQuery<Invoice>(COLLECTION_NAME, (q) => q.order("created_at_iso", { ascending: false }))

export const getInvoice = async (id: string): Promise<Invoice | null> =>
  sbGetById<Invoice>(COLLECTION_NAME, id)

export const updateInvoice = async (
  id: string,
  data: Partial<Omit<Invoice, "id" | "createdAt">>
): Promise<void> => sbUpdate(COLLECTION_NAME, id, data as Record<string, any>)

export const deleteInvoice = async (id: string): Promise<void> => sbDelete(COLLECTION_NAME, id)

export const getInvoicesByPatient = async (patientName: string): Promise<Invoice[]> =>
  sbQuery<Invoice>(COLLECTION_NAME, (q) =>
    q.eq("patient_name", patientName).order("created_at_iso", { ascending: false })
  )

export const getInvoicesByPatientId = async (patientId: string): Promise<Invoice[]> => {
  const invoices = await sbQuery<Invoice>(COLLECTION_NAME, (q) => q.eq("patient_id", patientId))
  return invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export const getInvoiceByAppointment = async (appointmentId: string): Promise<Invoice | null> => {
  const rows = await sbQuery<Invoice>(COLLECTION_NAME, (q) => q.eq("appointment_id", appointmentId))
  return rows[0] || null
}

export const recordPayment = async (
  invoiceId: string,
  payment: Omit<PaymentLog, "id">,
  currentPayments: PaymentLog[],
  currentAmountPaid: number,
  total: number
): Promise<void> => {
  const newPayment: PaymentLog = {
    ...payment,
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }
  const newAmountPaid = currentAmountPaid + payment.amount
  const newBalanceDue = Math.max(0, total - newAmountPaid)
  let newStatus: Invoice["status"] = "unpaid"
  if (newAmountPaid >= total) {
    newStatus = "paid"
  } else if (newAmountPaid > 0) {
    newStatus = "partial"
  }

  await updateInvoice(invoiceId, {
    payments: [...currentPayments, newPayment],
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    status: newStatus,
  })
}
