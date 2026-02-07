import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "./firebase"
import type { Patient } from "./types"

const COLLECTION_NAME = "patients"

// Remove undefined values that Firestore rejects
const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  )
}

export const createPatient = async (
  patientData: Omit<Patient, "id" | "createdAt">
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...stripUndefined(patientData),
      createdAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error) {
    console.error("Error creating patient:", error)
    throw error
  }
}

export const getPatients = async (): Promise<Patient[]> => {
  try {
    const patientsRef = collection(db, COLLECTION_NAME)
    const querySnapshot = await getDocs(patientsRef)
    const patients: Patient[] = []

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data()
      patients.push({
        id: docSnap.id,
        ...data,
        createdAt:
          data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Patient)
    })

    // Sort alphabetically by name
    patients.sort((a, b) => a.name.localeCompare(b.name))
    return patients
  } catch (error) {
    console.error("Error fetching patients:", error)
    throw error
  }
}

export const getPatient = async (id: string): Promise<Patient | null> => {
  try {
    const patientRef = doc(db, COLLECTION_NAME, id)
    const patientSnap = await getDoc(patientRef)

    if (patientSnap.exists()) {
      const data = patientSnap.data()
      return {
        id: patientSnap.id,
        ...data,
        createdAt:
          data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString(),
      } as Patient
    }

    return null
  } catch (error) {
    console.error("Error getting patient:", error)
    throw error
  }
}

export const updatePatient = async (
  id: string,
  patientData: Partial<Patient>
): Promise<void> => {
  try {
    const patientRef = doc(db, COLLECTION_NAME, id)
    await updateDoc(patientRef, {
      ...stripUndefined(patientData),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating patient:", error)
    throw error
  }
}

export const deletePatient = async (id: string): Promise<void> => {
  try {
    const patientRef = doc(db, COLLECTION_NAME, id)
    await deleteDoc(patientRef)
  } catch (error) {
    console.error("Error deleting patient:", error)
    throw error
  }
}

export const searchPatients = async (
  searchTerm: string
): Promise<Patient[]> => {
  try {
    const allPatients = await getPatients()
    const term = searchTerm.toLowerCase().trim()

    if (!term) return []

    const filtered = allPatients.filter(
      (patient) =>
        patient.name.toLowerCase().includes(term) ||
        patient.phone.includes(term)
    )

    // Return top 10 results for autocomplete
    return filtered.slice(0, 10)
  } catch (error) {
    console.error("Error searching patients:", error)
    throw error
  }
}
