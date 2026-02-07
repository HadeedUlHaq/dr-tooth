"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from "@/lib/patientService"
import type { Patient } from "@/lib/types"
import {
  Search,
  Plus,
  Edit,
  Trash,
  X,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

export default function PatientsPage() {
  const { user } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  // Quick add form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formTreatment, setFormTreatment] = useState("Consultation")
  const [formAddress, setFormAddress] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState("")

  // Inline editing
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editTreatment, setEditTreatment] = useState("")
  const [editAddress, setEditAddress] = useState("")

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchPatients()
  }, [])

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      setFilteredPatients(
        patients.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.phone.includes(term) ||
            (p.treatmentRequired &&
              p.treatmentRequired.toLowerCase().includes(term))
        )
      )
    } else {
      setFilteredPatients(patients)
    }
  }, [patients, searchTerm])

  const fetchPatients = async () => {
    try {
      const data = await getPatients()
      setPatients(data)
    } catch (error) {
      console.error("Error fetching patients:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")

    if (!formName.trim() || !formPhone.trim()) {
      setFormError("Name and phone are required")
      return
    }

    setFormLoading(true)
    try {
      await createPatient({
        name: formName.trim(),
        phone: formPhone.trim(),
        treatmentRequired: formTreatment.trim() || "Consultation",
        address: formAddress.trim() || undefined,
        notes: formNotes.trim() || undefined,
        createdBy: user?.uid || "",
      })
      // Reset form
      setFormName("")
      setFormPhone("")
      setFormTreatment("Consultation")
      setFormAddress("")
      setFormNotes("")
      setShowForm(false)
      await fetchPatients()
    } catch (error: any) {
      setFormError(error.message || "Failed to add patient")
    } finally {
      setFormLoading(false)
    }
  }

  const startEdit = (patient: Patient) => {
    setEditingPatient(patient)
    setEditName(patient.name)
    setEditPhone(patient.phone)
    setEditTreatment(patient.treatmentRequired)
    setEditAddress(patient.address || "")
  }

  const handleSaveEdit = async () => {
    if (!editingPatient) return
    try {
      await updatePatient(editingPatient.id, {
        name: editName.trim(),
        phone: editPhone.trim(),
        treatmentRequired: editTreatment.trim() || "Consultation",
        address: editAddress.trim() || undefined,
      })
      setEditingPatient(null)
      await fetchPatients()
    } catch (error) {
      console.error("Error updating patient:", error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePatient(id)
      setShowDeleteConfirm(null)
      await fetchPatients()
    } catch (error) {
      console.error("Error deleting patient:", error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">
            Patient Directory
          </h1>
          <p className="mt-1 text-sm text-[#8A8F98]">
            Register and manage patients
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506] transition-colors shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)]"
          >
            {showForm ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Hide Form
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Patient
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Add Form */}
      {showForm && (
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-[#EDEDEF] mb-4">
              Quick Add Patient
            </h3>

            {formError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddPatient} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                    Patient Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                    placeholder="Full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                    placeholder="Phone number"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                    Treatment Required
                  </label>
                  <input
                    type="text"
                    value={formTreatment}
                    onChange={(e) => setFormTreatment(e.target.value)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                    placeholder="Consultation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5"
                    placeholder="Address"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2 px-4 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="inline-flex justify-center py-2 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/20 disabled:opacity-50"
                >
                  {formLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    "Add Patient"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient List */}
      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Search */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="relative max-w-xs w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-white/30" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Treatment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider hidden sm:table-cell">
                  Address
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-[#8A8F98]"
                  >
                    {searchTerm
                      ? "No patients match your search."
                      : "No patients registered yet. Click \"Add Patient\" to get started."}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    {/* Name */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 flex items-center justify-center">
                            <User className="h-4 w-4 text-[#5E6AD2]" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-[#EDEDEF]">
                              {patient.name}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <div className="text-sm text-[#8A8F98]">
                          {patient.phone}
                        </div>
                      )}
                    </td>

                    {/* Treatment */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editTreatment}
                          onChange={(e) => setEditTreatment(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <span className="px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2]">
                          {patient.treatmentRequired}
                        </span>
                      )}
                    </td>

                    {/* Address */}
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <div className="text-sm text-[#8A8F98]">
                          {patient.address || "-"}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {editingPatient?.id === patient.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPatient(null)}
                            className="text-[#8A8F98] hover:text-[#EDEDEF] text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(patient)}
                            className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(patient.id)}
                            className="text-[#8A8F98] hover:text-red-400 p-1 transition-colors"
                            title="Delete"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Patient count */}
        <div className="px-5 py-3 border-t border-white/[0.06] text-xs text-[#8A8F98]">
          {filteredPatients.length} patient{filteredPatients.length !== 1 ? "s" : ""}
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-[#EDEDEF]">
              Delete Patient
            </h3>
            <p className="mt-2 text-sm text-[#8A8F98]">
              Are you sure you want to remove this patient from the directory?
              This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2 px-4 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg py-2 px-4 text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
