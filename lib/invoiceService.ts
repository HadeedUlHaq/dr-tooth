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
} from "firebase/firestore"
import { db } from "./firebase"
import type { Invoice, PaymentLog } from "./types"

const COLLECTION_NAME = "invoices"

const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  )
}

const parseInvoiceDoc = (docSnap: any): Invoice => {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    appointmentId: data.appointmentId || undefined,
    patientId: data.patientId || undefined,
    patientName: data.patientName || "",
    patientPhone: data.patientPhone || undefined,
    date: data.date || "",
    lineItems: data.lineItems || [],
    subtotal: data.subtotal || 0,
    discountType: data.discountType || "flat",
    discountValue: data.discountValue || 0,
    total: data.total || 0,
    amountPaid: data.amountPaid || 0,
    balanceDue: data.balanceDue || 0,
    status: data.status || "unpaid",
    payments: data.payments || [],
    createdAt:
      data.createdAt?.toDate().toISOString() || new Date().toISOString(),
    createdBy: data.createdBy || "",
    updatedAt: data.updatedAt?.toDate().toISOString(),
  }
}

export const createInvoice = async (
  invoiceData: Omit<Invoice, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...stripUndefined(invoiceData),
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error creating invoice:", error)
    throw error
  }
}

export const getInvoices = async (): Promise<Invoice[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("createdAt", "desc")
    )
    const snapshot = await getDocs(q)
    const invoices: Invoice[] = []
    snapshot.forEach((docSnap) => {
      invoices.push(parseInvoiceDoc(docSnap))
    })
    return invoices
  } catch (error) {
    console.error("Error fetching invoices:", error)
    throw error
  }
}

export const getInvoice = async (id: string): Promise<Invoice | null> => {
  try {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, id))
    if (docSnap.exists()) {
      return parseInvoiceDoc(docSnap)
    }
    return null
  } catch (error) {
    console.error("Error getting invoice:", error)
    throw error
  }
}

export const updateInvoice = async (
  id: string,
  data: Partial<Omit<Invoice, "id" | "createdAt">>
): Promise<void> => {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...stripUndefined(data),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating invoice:", error)
    throw error
  }
}

export const deleteInvoice = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id))
  } catch (error) {
    console.error("Error deleting invoice:", error)
    throw error
  }
}

export const getInvoicesByPatient = async (
  patientName: string
): Promise<Invoice[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("patientName", "==", patientName),
      orderBy("createdAt", "desc")
    )
    const snapshot = await getDocs(q)
    const invoices: Invoice[] = []
    snapshot.forEach((docSnap) => {
      invoices.push(parseInvoiceDoc(docSnap))
    })
    return invoices
  } catch (error) {
    console.error("Error fetching patient invoices:", error)
    throw error
  }
}

export const getInvoicesByPatientId = async (
  patientId: string
): Promise<Invoice[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("patientId", "==", patientId)
    )
    const snapshot = await getDocs(q)
    const invoices: Invoice[] = []
    snapshot.forEach((docSnap) => {
      invoices.push(parseInvoiceDoc(docSnap))
    })
    // Sort client-side (newest first) to avoid composite index requirement
    invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return invoices
  } catch (error) {
    console.error("Error fetching patient invoices by ID:", error)
    throw error
  }
}

export const getInvoiceByAppointment = async (
  appointmentId: string
): Promise<Invoice | null> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("appointmentId", "==", appointmentId)
    )
    const snapshot = await getDocs(q)
    if (snapshot.empty) return null
    return parseInvoiceDoc(snapshot.docs[0])
  } catch (error) {
    console.error("Error fetching invoice by appointment:", error)
    throw error
  }
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
