"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  getLabCases,
  createLabCase,
  updateLabCase,
  deleteLabCase,
} from "@/lib/labService"
import { logActivity, subscribeToCollection } from "@/lib/activityService"
import { searchPatients } from "@/lib/patientService"
import { showToast } from "@/components/ui/toast-notification"
import type { LabCase, LabName, LabCaseStatus, Patient } from "@/lib/types"
import {
  Plus,
  Search,
  Package,
  X,
  ChevronDown,
  Trash,
  RefreshCw,
  User,
} from "lucide-react"
import { PageHeader, Button, EmptyState, SkeletonList, Modal, Field, Select } from "@/components/ui-kit"

const LAB_NAMES: LabName[] = ["Tanveer Dental Lab", "Zubair Dental Lab", "None"]
const STATUSES: LabCaseStatus[] = [
  "Preparation/Cutting Done",
  "Impression Taken",
  "Sent to Lab",
  "Received from Lab",
  "Fitted/Completed",
]
const MATERIALS = [
  "Zirconia",
  "PFM",
  "E-Max",
  "Metal",
  "Acrylic",
  "Composite",
  "Other",
]

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function LabTrackingPage() {
  const { user, userData } = useAuth()
  const canEdit = userData?.role === "admin" || userData?.role === "receptionist"

  const [labCases, setLabCases] = useState<LabCase[]>([])
  const [filtered, setFiltered] = useState<LabCase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("active")

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newMaterial, setNewMaterial] = useState("Zirconia")
  const [newTooth, setNewTooth] = useState("")
  const [newLabName, setNewLabName] = useState<LabName>("None")
  const [newStatus, setNewStatus] = useState<LabCaseStatus>("Preparation/Cutting Done")
  const [newNotes, setNewNotes] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  // Patient search for create
  const [patientSearch, setPatientSearch] = useState("")
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  // Update status modal
  const [updatingCase, setUpdatingCase] = useState<LabCase | null>(null)
  const [updateStatus, setUpdateStatus] = useState<LabCaseStatus>("Preparation/Cutting Done")
  const [updateLabName, setUpdateLabName] = useState<LabName>("None")
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchCases = async () => {
    try {
      const data = await getLabCases()
      setLabCases(data)
    } catch (error) {
      console.error("Error fetching lab cases:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCases()
  }, [])

  // Real-time sync
  useEffect(() => {
    const unsubscribe = subscribeToCollection("lab_cases", () => {
      fetchCases()
    })
    return () => unsubscribe()
  }, [])

  // Patient search for create form
  useEffect(() => {
    const search = async () => {
      if (patientSearch.length < 2) { setPatientResults([]); return }
      try {
        const results = await searchPatients(patientSearch)
        setPatientResults(results)
        setShowPatientDropdown(true)
      } catch (err) { console.error(err) }
    }
    const timer = setTimeout(search, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])

  // Filter
  useEffect(() => {
    let result = labCases
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (c) =>
          c.patientName.toLowerCase().includes(term) ||
          c.material.toLowerCase().includes(term) ||
          c.toothDetails.toLowerCase().includes(term) ||
          c.labName.toLowerCase().includes(term)
      )
    }
    if (statusFilter === "active") {
      result = result.filter((c) => c.status !== "Fitted/Completed")
    } else if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter)
    }
    setFiltered(result)
  }, [labCases, searchTerm, statusFilter])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError("")
    if (!selectedPatient) { setCreateError("Select a patient from the directory"); return }
    if (!newTooth.trim()) { setCreateError("Tooth details are required"); return }

    setCreating(true)
    try {
      // If status is "Sent to Lab", require labName and set sentDate
      const sentDate = newStatus === "Sent to Lab" ? toLocalDateString(new Date()) : undefined
      const labNameToUse = newStatus === "Sent to Lab" && newLabName === "None" ? "None" : newLabName

      await createLabCase({
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        patientPhone: selectedPatient.phone || undefined,
        material: newMaterial,
        toothDetails: newTooth.trim(),
        labName: labNameToUse,
        status: newStatus,
        sentDate,
        notes: newNotes.trim() || undefined,
        createdBy: user?.uid || "",
        updatedBy: user?.uid || "",
      })

      await logActivity({
        type: "lab_case_created",
        message: `${userData?.name || "Someone"} created a lab case for ${selectedPatient.name} — ${newMaterial} (${newTooth.trim()})`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      showToast(`Lab case created for ${selectedPatient.name}`, "success")
      resetCreateForm()
      setShowCreateModal(false)
    } catch (err: any) {
      setCreateError(err.message || "Failed to create lab case")
    } finally {
      setCreating(false)
    }
  }

  const resetCreateForm = () => {
    setSelectedPatient(null)
    setPatientSearch("")
    setNewMaterial("Zirconia")
    setNewTooth("")
    setNewLabName("None")
    setNewStatus("Preparation/Cutting Done")
    setNewNotes("")
    setCreateError("")
  }

  const openUpdateModal = (labCase: LabCase) => {
    setUpdatingCase(labCase)
    setUpdateStatus(labCase.status)
    setUpdateLabName(labCase.labName)
  }

  const handleStatusUpdate = async () => {
    if (!updatingCase) return
    setSaving(true)
    try {
      const updates: Partial<LabCase> = {
        status: updateStatus,
        labName: updateLabName,
        updatedBy: user?.uid || "",
      }

      // Auto-fill sentDate when "Sent to Lab"
      if (updateStatus === "Sent to Lab" && updatingCase.status !== "Sent to Lab") {
        updates.sentDate = toLocalDateString(new Date())
      }

      // Auto-fill receivedDate when "Received from Lab"
      if (updateStatus === "Received from Lab" && updatingCase.status !== "Received from Lab") {
        updates.receivedDate = toLocalDateString(new Date())
      }

      // If sent to lab, require a lab name
      if (updateStatus === "Sent to Lab" && updateLabName === "None") {
        setSaving(false)
        return
      }

      await updateLabCase(updatingCase.id, updates)

      await logActivity({
        type: "lab_case_updated",
        message: `${userData?.name || "Someone"} updated lab case for ${updatingCase.patientName} to "${updateStatus}"`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      // Fitting Reminder toast
      if (updateStatus === "Received from Lab" && updatingCase.status !== "Received from Lab") {
        showToast(
          `Crown received! Please book a Fitting Appointment for ${updatingCase.patientName}`,
          "warning"
        )
      }

      setUpdatingCase(null)
    } catch (err: any) {
      console.error("Error updating status:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const c = labCases.find((lc) => lc.id === id)
      await deleteLabCase(id)
      if (c) {
        await logActivity({
          type: "lab_case_updated",
          message: `${userData?.name || "Someone"} deleted lab case for ${c.patientName}`,
          actorName: userData?.name || "Unknown",
          actorId: user?.uid || "",
        })
      }
      setDeleteId(null)
    } catch (err) {
      console.error("Error deleting:", err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Preparation/Cutting Done": return "bg-blue-500/15 text-blue-400"
      case "Impression Taken": return "bg-purple-500/15 text-purple-400"
      case "Sent to Lab": return "bg-amber-500/15 text-amber-400"
      case "Received from Lab": return "bg-cyan-500/15 text-cyan-400"
      case "Fitted/Completed": return "bg-emerald-500/15 text-emerald-400"
      default: return "bg-white/[0.05] text-[#A9BFC5]"
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—"
    try {
      const d = new Date(dateStr + "T00:00:00")
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    } catch { return dateStr }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lab Tracking" subtitle="Track crowns, bridges, and lab work" />
        <SkeletonList rows={6} withHeader={false} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Lab Tracking"
        subtitle="Track crowns, bridges, and lab work"
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => { resetCreateForm(); setShowCreateModal(true) }}>
              <Plus className="h-4 w-4 mr-2" />
              New Lab Case
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="rounded-lg border border-white/[0.1] bg-[#0A2228]/92 shadow-[0_1px_0_rgba(255,255,255,0.06),0_12px_28px_rgba(0,0,0,0.22)] overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row gap-3">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-white/30" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 min-h-[44px] bg-[#082127] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors"
              placeholder="Search patient, material, tooth..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {["active", "all", ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:text-xs ${
                  statusFilter === s
                    ? "bg-[#0891B2] text-white"
                    : "bg-white/[0.05] text-[#A9BFC5] hover:text-[#F0FCFF] hover:bg-white/[0.08]"
                }`}
              >
                {s === "active" ? "Active" : s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Tooth & Material</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Lab</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Sent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Received</th>
                {canEdit && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-[#A9BFC5] uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="p-0">
                    <EmptyState
                      icon={Package}
                      title={searchTerm || statusFilter !== "active" ? "No matches" : "No active lab cases"}
                      message={
                        searchTerm || statusFilter !== "active"
                          ? "No lab cases match your filters."
                          : 'Track your first crown or bridge with the "New Lab Case" button above.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#0891B2]/10 border border-[#0891B2]/20 flex items-center justify-center">
                          <User className="h-4 w-4 text-[#0891B2]" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-[#F0FCFF]">{c.patientName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[#F0FCFF]">{c.toothDetails}</div>
                      <div className="text-xs text-[#A9BFC5]">{c.material}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A9BFC5]">{c.labName === "None" ? "—" : c.labName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full ${getStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A9BFC5]">{formatDate(c.sentDate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A9BFC5]">{formatDate(c.receivedDate)}</td>
                    {canEdit && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openUpdateModal(c)}
                            className="inline-flex items-center text-[#0891B2] hover:text-[#0E7490] text-xs font-medium transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Update
                          </button>
                          <button
                            onClick={() => setDeleteId(c.id)}
                            className="text-[#A9BFC5] hover:text-red-400 p-1 transition-colors"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden divide-y divide-white/[0.06]">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title={searchTerm || statusFilter !== "active" ? "No matches" : "No active lab cases"}
              message={
                searchTerm || statusFilter !== "active"
                  ? "No lab cases match your filters."
                  : 'Tap "New Lab Case" above to track one.'
              }
            />
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="p-4 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#0891B2]/10 border border-[#0891B2]/20 flex items-center justify-center">
                      <Package className="h-5 w-5 text-[#0891B2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#F0FCFF] truncate">{c.patientName}</div>
                      <div className="text-xs text-[#A9BFC5]">{c.toothDetails} · {c.material}</div>
                    </div>
                  </div>
                  <span className={`max-w-[9rem] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${getStatusColor(c.status)}`}>
                    {c.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#A9BFC5]">
                  <span>Lab: {c.labName === "None" ? "—" : c.labName}</span>
                  {c.sentDate && <span>Sent: {formatDate(c.sentDate)}</span>}
                  {c.receivedDate && <span>Recv: {formatDate(c.receivedDate)}</span>}
                </div>
                {canEdit && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openUpdateModal(c)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#0891B2]/15 px-3 py-2 text-xs font-medium text-[#0891B2] transition-colors hover:bg-[#0891B2]/25"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Update Status
                    </button>
                    <button
                      onClick={() => setDeleteId(c.id)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                    >
                      <Trash className="h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Count */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.06]">
          <span className="text-xs text-[#A9BFC5]">
            {filtered.length} lab case{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ═══ Create Modal ═══ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-white/[0.06] bg-[#061417] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#F0FCFF]">New Lab Case</h3>
              <button onClick={() => setShowCreateModal(false)} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#A9BFC5] transition-colors hover:bg-white/[0.06] hover:text-[#F0FCFF]" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-2 text-sm">{createError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Patient search */}
              <div className="relative">
                <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Patient *</label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between bg-[#082127] border border-white/10 rounded-lg px-3 py-2.5 min-h-[44px]">
                    <span className="text-sm text-[#F0FCFF]">{selectedPatient.name} <span className="text-[#A9BFC5]">{selectedPatient.phone}</span></span>
                    <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch("") }} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#A9BFC5] hover:text-red-400" aria-label="Clear selected patient">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-white/30" />
                      </div>
                      <input
                        type="text"
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#082127] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors min-h-[44px]"
                        placeholder="Search registered patients..."
                      />
                    </div>
                    {showPatientDropdown && patientResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-[#061417] border border-white/[0.1] rounded-lg shadow-lg overflow-hidden">
                        {patientResults.map((p) => (
                          <button key={p.id} type="button"
                            onClick={() => { setSelectedPatient(p); setPatientSearch(""); setShowPatientDropdown(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#F0FCFF] hover:bg-white/[0.05] transition-colors">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-[#A9BFC5]">{p.phone}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Material *</label>
                  <select value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)}
                    className="bg-[#082127] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors">
                    {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Tooth Details *</label>
                  <input type="text" value={newTooth} onChange={(e) => setNewTooth(e.target.value)}
                    className="bg-[#082127] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors placeholder-gray-500"
                    placeholder="e.g. Upper Right Molar / 16" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Lab</label>
                  <select value={newLabName} onChange={(e) => setNewLabName(e.target.value as LabName)}
                    className="bg-[#082127] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors">
                    {LAB_NAMES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Status</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as LabCaseStatus)}
                    className="bg-[#082127] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#A9BFC5] mb-1">Notes</label>
                <textarea rows={2} value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                  className="bg-[#082127] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors placeholder-gray-500"
                  placeholder="Additional notes..." />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="min-h-[44px] w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-[#F0FCFF] transition-colors hover:bg-white/[0.08] sm:w-auto">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#0891B2] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(8,145,178,0.5),0_4px_12px_rgba(8,145,178,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-colors hover:bg-[#0E7490] disabled:opacity-50 sm:w-auto">
                  {creating ? "Creating..." : "Create Lab Case"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Update Status Modal ═══ */}
      <Modal
        open={!!updatingCase}
        onClose={() => setUpdatingCase(null)}
        title="Update Status"
        description={updatingCase ? `${updatingCase.patientName} · ${updatingCase.toothDetails}` : undefined}
        className="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUpdatingCase(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={saving || (updateStatus === "Sent to Lab" && updateLabName === "None")}
            >
              {saving ? "Saving..." : "Update"}
            </Button>
          </>
        }
      >
        {updatingCase && (
          <div className="space-y-4">
            <Field label="Status">
              <Select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value as LabCaseStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>

            {/* Show lab name picker when sending to lab */}
            {updateStatus === "Sent to Lab" && (
              <Field label="Lab Name *" hint="Sent date will be set to today automatically.">
                <Select value={updateLabName} onChange={(e) => setUpdateLabName(e.target.value as LabName)}>
                  {LAB_NAMES.filter((l) => l !== "None").map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
            )}

            {updateStatus === "Received from Lab" && (
              <p className="text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2">
                Received date will be set to today automatically.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ═══ Delete Confirm ═══ */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Lab Case"
        description="Are you sure? This action cannot be undone."
        className="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  )
}
