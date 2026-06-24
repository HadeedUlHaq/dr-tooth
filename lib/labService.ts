import type { LabCase } from "./types"
import { sbGetById, sbQuery, sbInsert, sbUpdate, sbDelete } from "./dashboardRepo"

// Supabase-only (Firestore data path stripped 2026-06-24 — see AI_CONTEXT.md "Reverting").
const COLLECTION_NAME = "lab_cases"

export const createLabCase = async (
  data: Omit<LabCase, "id" | "createdAt" | "updatedAt">
): Promise<string> => sbInsert(COLLECTION_NAME, data as Record<string, any>)

export const getLabCases = async (): Promise<LabCase[]> =>
  sbQuery<LabCase>(COLLECTION_NAME, (q) => q.order("created_at_iso", { ascending: false }))

export const getLabCase = async (id: string): Promise<LabCase | null> =>
  sbGetById<LabCase>(COLLECTION_NAME, id)

export const updateLabCase = async (
  id: string,
  data: Partial<Omit<LabCase, "id" | "createdAt">>
): Promise<void> => sbUpdate(COLLECTION_NAME, id, data as Record<string, any>)

export const deleteLabCase = async (id: string): Promise<void> => sbDelete(COLLECTION_NAME, id)

export const getLabCasesByPatient = async (patientName: string): Promise<LabCase[]> =>
  sbQuery<LabCase>(COLLECTION_NAME, (q) =>
    q.eq("patient_name", patientName).order("created_at_iso", { ascending: false })
  )

export const getLabCasesByPatientId = async (patientId: string): Promise<LabCase[]> => {
  const cases = await sbQuery<LabCase>(COLLECTION_NAME, (q) => q.eq("patient_id", patientId))
  return cases.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
