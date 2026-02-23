"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from "@/lib/patientService"
import { logActivity, subscribeToCollection } from "@/lib/activityService"
import { getInvoicesByPatient } from "@/lib/invoiceService"
import { getLabCasesByPatient } from "@/lib/labService"
import type { Patient, Invoice, LabCase } from "@/lib/types"
import {
  Search,
  Plus,
  Edit,
  Trash,
  X,
  User,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Check,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Lock,
  Receipt,
  Eye,
  Package,
} from "lucide-react"
import Link from "next/link"

const IMPORT_PASSCODE = "Systems@@123456789"
const PATIENTS_PER_PAGE = 20
import { PhoneInput } from "@/components/ui/phone-input"
import { CallButton } from "@/components/ui/call-button"

export default function PatientsPage() {
  const { user, userData } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

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

  // Import
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<{ name: string; phone: string }[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null)
  const [importError, setImportError] = useState("")
  const [importPasscode, setImportPasscode] = useState("")
  const [importUnlocked, setImportUnlocked] = useState(false)
  const [importPasscodeError, setImportPasscodeError] = useState("")

  // Billing history
  const [billingPatient, setBillingPatient] = useState<Patient | null>(null)
  const [billingInvoices, setBillingInvoices] = useState<Invoice[]>([])
  const [billingLoading, setBillingLoading] = useState(false)

  // Lab cases
  const [labPatient, setLabPatient] = useState<Patient | null>(null)
  const [labCases, setLabCases] = useState<LabCase[]>([])
  const [labLoading, setLabLoading] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError("")
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) {
        setImportError("Could not read file")
        return
      }

      const lines = text.split(/\r?\n/).filter((line) => line.trim())
      if (lines.length < 2) {
        setImportError("File appears empty or has no data rows")
        return
      }

      // Detect delimiter: tab, comma, or semicolon
      const headerLine = lines[0]
      let delimiter = "\t"
      if (!headerLine.includes("\t")) {
        delimiter = headerLine.includes(",") ? "," : ";"
      }

      // Parse header to find name and phone columns
      const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""))
      const nameIdx = headers.findIndex((h) =>
        h === "name" || h === "patient name" || h === "full name" || h === "patient"
      )
      const phoneIdx = headers.findIndex((h) =>
        h === "phone" || h === "phone number" || h === "phonenumber" || h === "mobile" || h === "contact"
      )

      if (nameIdx === -1 || phoneIdx === -1) {
        setImportError(
          `Could not find required columns. Found: "${headers.join('", "')}". Need a "Name" column and a "Phone Number" column.`
        )
        return
      }

      // Parse data rows
      const rows: { name: string; phone: string }[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""))
        const name = cols[nameIdx]?.trim()
        const phone = cols[phoneIdx]?.trim()
        if (name && phone) {
          rows.push({ name, phone })
        }
      }

      if (rows.length === 0) {
        setImportError("No valid rows found. Each row needs a name and phone number.")
        return
      }

      setImportRows(rows)
    }

    reader.onerror = () => {
      setImportError("Failed to read file")
    }

    reader.readAsText(file)
    // Reset file input so the same file can be re-selected
    e.target.value = ""
  }

  const handleImportConfirm = async () => {
    if (importRows.length === 0) return

    setImportLoading(true)
    setImportError("")
    setImportResult(null)

    let success = 0
    let skipped = 0

    // Get existing patient phones to avoid duplicates
    const existingPhones = new Set(patients.map((p) => p.phone.replace(/\s+/g, "")))

    for (const row of importRows) {
      const normalizedPhone = row.phone.replace(/\s+/g, "")
      if (existingPhones.has(normalizedPhone)) {
        skipped++
        continue
      }

      try {
        await createPatient({
          name: row.name,
          phone: row.phone,
          treatmentRequired: "Consultation",
          createdBy: user?.uid || "",
        })
        existingPhones.add(normalizedPhone)
        success++
      } catch (error) {
        console.error(`Failed to import ${row.name}:`, error)
        skipped++
      }
    }

    if (success > 0) {
      await logActivity({
        type: "patient_added",
        message: `${userData?.name || "Someone"} imported ${success} patient${success !== 1 ? "s" : ""} from spreadsheet`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
    }

    setImportResult({ success, skipped })
    setImportRows([])
    await fetchPatients()
    setImportLoading(false)
  }

  const handleCloseImportModal = () => {
    setShowImportModal(false)
    setImportRows([])
    setImportResult(null)
    setImportError("")
    setImportPasscode("")
    setImportUnlocked(false)
    setImportPasscodeError("")
  }

  const handleImportPasscode = (e: React.FormEvent) => {
    e.preventDefault()
    if (importPasscode === IMPORT_PASSCODE) {
      setImportUnlocked(true)
      setImportPasscodeError("")
    } else {
      setImportPasscodeError("Invalid passcode. Contact your administrator.")
    }
  }

  const openBillingHistory = async (patient: Patient) => {
    setBillingPatient(patient)
    setBillingLoading(true)
    try {
      const invoices = await getInvoicesByPatient(patient.name)
      setBillingInvoices(invoices)
    } catch (error) {
      console.error("Error fetching billing:", error)
      setBillingInvoices([])
    } finally {
      setBillingLoading(false)
    }
  }

  const openLabCases = async (patient: Patient) => {
    setLabPatient(patient)
    setLabLoading(true)
    try {
      const cases = await getLabCasesByPatient(patient.name)
      setLabCases(cases)
    } catch (error) {
      console.error("Error fetching lab cases:", error)
      setLabCases([])
    } finally {
      setLabLoading(false)
    }
  }

  useEffect(() => {
    fetchPatients()
  }, [])

  // Real-time sync: re-fetch when patients collection changes
  useEffect(() => {
    const unsubscribe = subscribeToCollection("patients", () => {
      fetchPatients()
    })
    return () => unsubscribe()
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
    setCurrentPage(1)
  }, [patients, searchTerm])

  // Pagination
  const totalPages = Math.ceil(filteredPatients.length / PATIENTS_PER_PAGE)
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * PATIENTS_PER_PAGE,
    currentPage * PATIENTS_PER_PAGE
  )

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
      await logActivity({
        type: "patient_added",
        message: `${userData?.name || "Someone"} registered a new patient: ${formName.trim()}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
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
      await logActivity({
        type: "patient_updated",
        message: `${userData?.name || "Someone"} updated patient: ${editName.trim()}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      setEditingPatient(null)
      await fetchPatients()
    } catch (error) {
      console.error("Error updating patient:", error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const deletedPatient = patients.find((p) => p.id === id)
      await deletePatient(id)
      await logActivity({
        type: "patient_deleted",
        message: `${userData?.name || "Someone"} removed patient: ${deletedPatient?.name || "Unknown"}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
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
        <div className="mt-4 sm:mt-0 flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-[#EDEDEF] bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506] transition-colors shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)]"
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
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                    placeholder="Full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                    Phone Number *
                  </label>
                  <PhoneInput
                    value={formPhone}
                    onChange={setFormPhone}
                    placeholder="302 2726035"
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
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
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
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                    placeholder="Address"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="inline-flex justify-center py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/20 disabled:opacity-50 min-h-[44px]"
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
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06]">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-white/30" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 min-h-[44px] bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop Table (hidden on mobile) */}
        <div className="hidden sm:block overflow-x-auto">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Address
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {paginatedPatients.length === 0 ? (
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
                paginatedPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <PhoneInput
                          value={editPhone}
                          onChange={setEditPhone}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#8A8F98]">
                            {patient.phone}
                          </span>
                          <CallButton phone={patient.phone} size="sm" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editTreatment}
                          onChange={(e) => setEditTreatment(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <span className="px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2]">
                          {patient.treatmentRequired}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingPatient?.id === patient.id ? (
                        <input
                          type="text"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        />
                      ) : (
                        <div className="text-sm text-[#8A8F98]">
                          {patient.address || "-"}
                        </div>
                      )}
                    </td>
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
                          {(userData?.role === "admin" || userData?.role === "receptionist") && (
                            <button
                              onClick={() => openBillingHistory(patient)}
                              className="text-[#8A8F98] hover:text-[#5E6AD2] p-1 transition-colors"
                              title="Billing History"
                            >
                              <Receipt className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openLabCases(patient)}
                            className="text-[#8A8F98] hover:text-[#5E6AD2] p-1 transition-colors"
                            title="Lab Cases"
                          >
                            <Package className="h-4 w-4" />
                          </button>
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

        {/* Mobile Cards (hidden on desktop) */}
        <div className="sm:hidden divide-y divide-white/[0.06]">
          {paginatedPatients.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[#8A8F98]">
              {searchTerm
                ? "No patients match your search."
                : "No patients registered yet. Tap \"Add Patient\" to get started."}
            </div>
          ) : (
            paginatedPatients.map((patient) => (
              <div
                key={patient.id}
                className="p-4 hover:bg-white/[0.03] transition-colors"
              >
                {editingPatient?.id === patient.id ? (
                  /* Mobile Edit Form */
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Phone</label>
                      <PhoneInput
                        value={editPhone}
                        onChange={setEditPhone}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Treatment</label>
                      <input
                        type="text"
                        value={editTreatment}
                        onChange={(e) => setEditTreatment(e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Address</label>
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
                      >
                        <Check className="h-4 w-4" />
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPatient(null)}
                        className="flex-1 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Mobile Card View */
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 flex items-center justify-center">
                          <User className="h-5 w-5 text-[#5E6AD2]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#EDEDEF] truncate">
                            {patient.name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#8A8F98]">
                              {patient.phone}
                            </span>
                            <CallButton phone={patient.phone} size="sm" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        {(userData?.role === "admin" || userData?.role === "receptionist") && (
                          <button
                            onClick={() => openBillingHistory(patient)}
                            className="text-[#8A8F98] hover:text-[#5E6AD2] p-2 transition-colors"
                            title="Billing"
                          >
                            <Receipt className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openLabCases(patient)}
                          className="text-[#8A8F98] hover:text-[#5E6AD2] p-2 transition-colors"
                          title="Lab Cases"
                        >
                          <Package className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => startEdit(patient)}
                          className="text-[#8A8F98] hover:text-[#EDEDEF] p-2 transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(patient.id)}
                          className="text-[#8A8F98] hover:text-red-400 p-2 transition-colors"
                          title="Delete"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 inline-flex text-xs font-medium rounded-full bg-[#5E6AD2]/15 text-[#5E6AD2]">
                        {patient.treatmentRequired}
                      </span>
                      {patient.address && (
                        <span className="text-xs text-[#8A8F98] truncate">
                          {patient.address}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Patient count + Pagination */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-[#8A8F98]">
            {filteredPatients.length === 0
              ? "0 patients"
              : `${(currentPage - 1) * PATIENTS_PER_PAGE + 1}\u2013${Math.min(currentPage * PATIENTS_PER_PAGE, filteredPatients.length)} of ${filteredPatients.length} patient${filteredPatients.length !== 1 ? "s" : ""}`}
            {searchTerm && ` matching \u201c${searchTerm}\u201d`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8A8F98] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                    page === currentPage
                      ? "bg-[#5E6AD2] text-white"
                      : "text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05]"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8A8F98] transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
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
            <div className="mt-4 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">

            {/* Passcode Gate */}
            {!importUnlocked ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-xl p-2.5">
                      <Lock className="h-5 w-5 text-[#5E6AD2]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#EDEDEF]">Protected Import</h3>
                      <p className="text-xs text-[#8A8F98]">Enter system passcode to import contacts</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseImportModal}
                    className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {importPasscodeError && (
                  <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-2 text-sm">
                    {importPasscodeError}
                  </div>
                )}

                <form onSubmit={handleImportPasscode}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[#8A8F98] mb-1">
                      System Passcode
                    </label>
                    <input
                      type="password"
                      value={importPasscode}
                      onChange={(e) => setImportPasscode(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors min-h-[44px]"
                      placeholder="Enter passcode..."
                      autoFocus
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCloseImportModal}
                      className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] min-h-[44px] transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                </form>
              </>
            ) : (
            <>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-xl p-2.5">
                  <FileSpreadsheet className="h-5 w-5 text-[#5E6AD2]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#EDEDEF]">Import Patients</h3>
                  <p className="text-xs text-[#8A8F98]">From CSV or Google Sheets export</p>
                </div>
              </div>
              <button
                onClick={handleCloseImportModal}
                className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Success Result */}
            {importResult && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Imported <strong>{importResult.success}</strong> patient{importResult.success !== 1 ? "s" : ""} successfully.
                    {importResult.skipped > 0 && (
                      <> Skipped <strong>{importResult.skipped}</strong> (duplicates or errors).</>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {importError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              </div>
            )}

            {/* File picker — show when no rows parsed and no result */}
            {importRows.length === 0 && !importResult && (
              <div className="flex-1">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/[0.1] hover:border-[#5E6AD2]/40 rounded-xl p-8 cursor-pointer transition-colors group">
                  <Upload className="h-10 w-10 text-[#8A8F98] group-hover:text-[#5E6AD2] transition-colors mb-3" />
                  <span className="text-sm font-medium text-[#EDEDEF]">
                    Choose a file or drag it here
                  </span>
                  <span className="text-xs text-[#8A8F98] mt-1">
                    CSV, TSV, or TXT with Name &amp; Phone Number columns
                  </span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,.xls,.xlsx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                  <p className="text-xs text-[#8A8F98] font-medium mb-1.5">Expected format:</p>
                  <div className="font-mono text-xs text-[#EDEDEF]/60 space-y-0.5">
                    <p>Name, Phone Number</p>
                    <p>Misses Arshad, +92 315 5658886</p>
                    <p>Asim, +92 300 0453332</p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview table — show when rows are parsed */}
            {importRows.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <p className="text-sm text-[#8A8F98] mb-3">
                  Found <strong className="text-[#EDEDEF]">{importRows.length}</strong> contact{importRows.length !== 1 ? "s" : ""}. Review and confirm:
                </p>
                <div className="overflow-y-auto flex-1 border border-white/[0.06] rounded-lg">
                  <table className="min-w-full divide-y divide-white/[0.06]">
                    <thead className="bg-white/[0.03] sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                          #
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">
                          Phone
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {importRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.03]">
                          <td className="px-4 py-2 text-xs text-[#8A8F98]">{idx + 1}</td>
                          <td className="px-4 py-2 text-sm text-[#EDEDEF]">{row.name}</td>
                          <td className="px-4 py-2 text-sm text-[#8A8F98]">{row.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => { setImportRows([]); setImportError("") }}
                    className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]"
                  >
                    Choose Different File
                  </button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={importLoading}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] disabled:opacity-50 min-h-[44px] transition-colors"
                  >
                    {importLoading ? (
                      <>
                        <span className="inline-block h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Import {importRows.length} Patient{importRows.length !== 1 ? "s" : ""}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Close button after result */}
            {importResult && importRows.length === 0 && (
              <div className="flex justify-end mt-4 pt-4 border-t border-white/[0.06]">
                <button
                  onClick={handleCloseImportModal}
                  className="inline-flex items-center py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] min-h-[44px] transition-colors"
                >
                  Done
                </button>
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {/* Billing History Modal — admin/receptionist only */}
      {billingPatient && (userData?.role === "admin" || userData?.role === "receptionist") && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-xl p-2.5">
                  <Receipt className="h-5 w-5 text-[#5E6AD2]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#EDEDEF]">Billing History</h3>
                  <p className="text-xs text-[#8A8F98]">{billingPatient.name}</p>
                </div>
              </div>
              <button
                onClick={() => { setBillingPatient(null); setBillingInvoices([]) }}
                className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {billingLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : billingInvoices.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-[#8A8F98]">No invoices found for this patient.</p>
                <Link
                  href={`/dashboard/invoices/new?patientName=${encodeURIComponent(billingPatient.name)}&patientPhone=${encodeURIComponent(billingPatient.phone)}&patientId=${billingPatient.id}`}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg text-sm font-medium transition-colors"
                  onClick={() => setBillingPatient(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Link>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {billingInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/dashboard/invoices/${inv.id}`}
                    className="block p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.05] transition-colors"
                    onClick={() => setBillingPatient(null)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#EDEDEF]">
                          Rs. {inv.total.toLocaleString()}
                        </div>
                        <div className="text-xs text-[#8A8F98] mt-0.5">
                          {new Date(inv.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          {inv.lineItems.map((li) => li.serviceName).join(", ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                          inv.status === "paid" ? "bg-emerald-500/15 text-emerald-400" :
                          inv.status === "partial" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}>
                          {inv.status}
                        </span>
                        <Eye className="h-4 w-4 text-[#8A8F98]" />
                      </div>
                    </div>
                    {inv.balanceDue > 0 && (
                      <div className="mt-1 text-xs text-red-400">
                        Balance due: Rs. {inv.balanceDue.toLocaleString()}
                      </div>
                    )}
                  </Link>
                ))}

                <div className="pt-3 border-t border-white/[0.06]">
                  <Link
                    href={`/dashboard/invoices/new?patientName=${encodeURIComponent(billingPatient.name)}&patientPhone=${encodeURIComponent(billingPatient.phone)}&patientId=${billingPatient.id}`}
                    className="inline-flex items-center text-sm text-[#5E6AD2] hover:text-[#6872D9] font-medium transition-colors"
                    onClick={() => setBillingPatient(null)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create New Invoice
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lab Cases Modal — all roles can view */}
      {labPatient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 rounded-xl p-2.5">
                  <Package className="h-5 w-5 text-[#5E6AD2]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#EDEDEF]">Lab Cases</h3>
                  <p className="text-xs text-[#8A8F98]">{labPatient.name}</p>
                </div>
              </div>
              <button
                onClick={() => { setLabPatient(null); setLabCases([]) }}
                className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {labLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : labCases.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-[#8A8F98]">No lab cases found for this patient.</p>
                {(userData?.role === "admin" || userData?.role === "receptionist") && (
                  <Link
                    href="/dashboard/lab-tracking"
                    className="mt-4 inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg text-sm font-medium transition-colors"
                    onClick={() => setLabPatient(null)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Go to Lab Tracking
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {labCases.map((lc) => {
                  const statusColor =
                    lc.status === "Fitted/Completed" ? "bg-emerald-500/15 text-emerald-400" :
                    lc.status === "Received from Lab" ? "bg-cyan-500/15 text-cyan-400" :
                    lc.status === "Sent to Lab" ? "bg-amber-500/15 text-amber-400" :
                    lc.status === "Impression Taken" ? "bg-purple-500/15 text-purple-400" :
                    "bg-blue-500/15 text-blue-400"
                  return (
                    <div key={lc.id} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-[#EDEDEF]">{lc.toothDetails}</div>
                          <div className="text-xs text-[#8A8F98] mt-0.5">{lc.material} · {lc.labName === "None" ? "No lab" : lc.labName}</div>
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusColor}`}>
                          {lc.status}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-[#8A8F98]">
                        {lc.sentDate && (
                          <span>Sent: {new Date(lc.sentDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                        )}
                        {lc.receivedDate && (
                          <span>Received: {new Date(lc.receivedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
