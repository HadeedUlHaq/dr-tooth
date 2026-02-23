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
