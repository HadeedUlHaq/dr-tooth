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
import type { LabCase } from "./types"
import { dashboardUsesSupabase, sbGetById, sbQuery, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

const COLLECTION_NAME = "lab_cases"

const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  )
}

const parseLabCaseDoc = (docSnap: any): LabCase => {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    patientId: data.patientId || "",
    patientName: data.patientName || "",
    patientPhone: data.patientPhone || undefined,
    material: data.material || "",
    toothDetails: data.toothDetails || "",
    labName: data.labName || "None",
    status: data.status || "Preparation/Cutting Done",
    sentDate: data.sentDate || undefined,
    receivedDate: data.receivedDate || undefined,
    notes: data.notes || undefined,
    createdAt:
      data.createdAt?.toDate().toISOString() || new Date().toISOString(),
    createdBy: data.createdBy || "",
    updatedBy: data.updatedBy || undefined,
    updatedAt: data.updatedAt?.toDate().toISOString(),
  }
}

export const createLabCase = async (
  data: Omit<LabCase, "id" | "createdAt" | "updatedAt">
): Promise<string> => {
  if (dashboardUsesSupabase) return sbInsert(COLLECTION_NAME, data as Record<string, any>)
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...stripUndefined(data),
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error creating lab case:", error)
    throw error
  }
}

export const getLabCases = async (): Promise<LabCase[]> => {
  if (dashboardUsesSupabase)
    return sbQuery<LabCase>(COLLECTION_NAME, (q) => q.order("created_at_iso", { ascending: false }))
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("createdAt", "desc")
    )
    const snapshot = await getDocs(q)
    const cases: LabCase[] = []
    snapshot.forEach((docSnap) => {
      cases.push(parseLabCaseDoc(docSnap))
    })
    return cases
  } catch (error) {
    console.error("Error fetching lab cases:", error)
    throw error
  }
}

export const getLabCase = async (id: string): Promise<LabCase | null> => {
  if (dashboardUsesSupabase) return sbGetById<LabCase>(COLLECTION_NAME, id)
  try {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, id))
    if (docSnap.exists()) {
      return parseLabCaseDoc(docSnap)
    }
    return null
  } catch (error) {
    console.error("Error getting lab case:", error)
    throw error
  }
}

export const updateLabCase = async (
  id: string,
  data: Partial<Omit<LabCase, "id" | "createdAt">>
): Promise<void> => {
  if (dashboardUsesSupabase) return sbUpdate(COLLECTION_NAME, id, data as Record<string, any>)
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...stripUndefined(data),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating lab case:", error)
    throw error
  }
}

export const deleteLabCase = async (id: string): Promise<void> => {
  if (dashboardUsesSupabase) return sbDelete(COLLECTION_NAME, id)
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id))
  } catch (error) {
    console.error("Error deleting lab case:", error)
    throw error
  }
}

export const getLabCasesByPatient = async (
  patientName: string
): Promise<LabCase[]> => {
  if (dashboardUsesSupabase)
    return sbQuery<LabCase>(COLLECTION_NAME, (q) =>
      q.eq("patient_name", patientName).order("created_at_iso", { ascending: false })
    )
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("patientName", "==", patientName),
      orderBy("createdAt", "desc")
    )
    const snapshot = await getDocs(q)
    const cases: LabCase[] = []
    snapshot.forEach((docSnap) => {
      cases.push(parseLabCaseDoc(docSnap))
    })
    return cases
  } catch (error) {
    console.error("Error fetching patient lab cases:", error)
    throw error
  }
}

export const getLabCasesByPatientId = async (
  patientId: string
): Promise<LabCase[]> => {
  if (dashboardUsesSupabase) {
    const cases = await sbQuery<LabCase>(COLLECTION_NAME, (q) => q.eq("patient_id", patientId))
    return cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("patientId", "==", patientId)
    )
    const snapshot = await getDocs(q)
    const cases: LabCase[] = []
    snapshot.forEach((docSnap) => {
      cases.push(parseLabCaseDoc(docSnap))
    })
    // Sort client-side (newest first) to avoid composite index requirement
    cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return cases
  } catch (error) {
    console.error("Error fetching patient lab cases by ID:", error)
    throw error
  }
}
