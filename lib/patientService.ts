import type { Patient } from "./types"
import { sbSelectAll, sbGetById, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

// Supabase-only (Firestore data path stripped 2026-06-24 — see AI_CONTEXT.md "Reverting").
const COLLECTION_NAME = "patients"

export const createPatient = async (
  patientData: Omit<Patient, "id" | "createdAt">
): Promise<string> => sbInsert(COLLECTION_NAME, patientData as Record<string, any>)

export const getPatients = async (): Promise<Patient[]> => {
  const patients = await sbSelectAll<Patient>(COLLECTION_NAME)
  return patients.sort((a, b) => a.name.localeCompare(b.name))
}

export const getPatient = async (id: string): Promise<Patient | null> =>
  sbGetById<Patient>(COLLECTION_NAME, id)

export const updatePatient = async (
  id: string,
  patientData: Partial<Patient>
): Promise<void> => sbUpdate(COLLECTION_NAME, id, patientData as Record<string, any>)

export const deletePatient = async (id: string): Promise<void> => sbDelete(COLLECTION_NAME, id)

export const searchPatients = async (searchTerm: string): Promise<Patient[]> => {
  const allPatients = await getPatients()
  const term = searchTerm.toLowerCase().trim()
  if (!term) return []
  const filtered = allPatients.filter(
    (patient) =>
      patient.name.toLowerCase().includes(term) || patient.phone.includes(term)
  )
  // Return top 10 results for autocomplete
  return filtered.slice(0, 10)
}
