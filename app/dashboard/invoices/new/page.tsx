"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter, useSearchParams } from "next/navigation"
import { createInvoice } from "@/lib/invoiceService"
import { logActivity } from "@/lib/activityService"
import { searchPatients } from "@/lib/patientService"
import type { LineItem, DiscountType, Patient } from "@/lib/types"
import { Plus, Trash, Receipt, ChevronLeft, Search } from "lucide-react"
import Link from "next/link"

const DENTAL_SERVICES = [
  "Consultation",
  "Root Canal",
  "Extraction",
  "Scaling",
  "Filling",
  "Crown",
  "Bridge",
  "Denture",
  "Whitening",
  "X-Ray",
  "Braces Adjustment",
  "Implant",
  "Veneer",
  "Gum Treatment",
  "Other",
]

export default function NewInvoicePage() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const prefillPatient = searchParams.get("patientName") || ""
  const prefillPhone = searchParams.get("patientPhone") || ""
  const prefillAppointmentId = searchParams.get("appointmentId") || ""
  const prefillPatientId = searchParams.get("patientId") || ""

  const [patientName, setPatientName] = useState(prefillPatient)
  const [patientPhone, setPatientPhone] = useState(prefillPhone)
  const [appointmentId] = useState(prefillAppointmentId)
  const [patientId, setPatientId] = useState(prefillPatientId)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { serviceName: "Consultation", price: 0 },
  ])
  const [discountType, setDiscountType] = useState<DiscountType>("flat")
  const [discountValue, setDiscountValue] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Patient search
  const [patientSearch, setPatientSearch] = useState("")
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)

  useEffect(() => {
    if (userData && userData.role === "doctor") {
      router.push("/dashboard")
    }
  }, [userData, router])

  useEffect(() => {
    const search = async () => {
      if (patientSearch.length < 2) {
        setPatientResults([])
        return
      }
      try {
        const results = await searchPatients(patientSearch)
        setPatientResults(results)
        setShowPatientDropdown(true)
      } catch (err) {
        console.error(err)
      }
    }
    const timer = setTimeout(search, 300)
    return () => clearTimeout(timer)
  }, [patientSearch])

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + (item.price || 0), 0),
    [lineItems]
  )

  const discountAmount = useMemo(() => {
    if (discountType === "percent") {
      return Math.round((subtotal * discountValue) / 100)
    }
    return discountValue || 0
  }, [subtotal, discountType, discountValue])

  const total = useMemo(
    () => Math.max(0, subtotal - discountAmount),
    [subtotal, discountAmount]
  )

  const addLineItem = () => {
    setLineItems([...lineItems, { serviceName: "Consultation", price: 0 }])
  }

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems]
    if (field === "price") {
      updated[index] = { ...updated[index], price: Number(value) || 0 }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setLineItems(updated)
  }

  const selectPatient = (patient: Patient) => {
    setPatientName(patient.name)
    setPatientPhone(patient.phone)
    setPatientId(patient.id)
    setPatientSearch("")
    setShowPatientDropdown(false)
  }

  const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!patientName.trim()) {
      setError("Patient name is required")
      return
    }
    if (lineItems.every((item) => item.price === 0)) {
      setError("At least one line item must have a price")
      return
    }

    setSaving(true)
    try {
      await createInvoice({
        appointmentId: appointmentId || undefined,
        patientId: patientId || undefined,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim() || undefined,
        date: toLocalDateString(new Date()),
        lineItems,
        subtotal,
        discountType,
        discountValue,
        total,
        amountPaid: 0,
        balanceDue: total,
        status: "unpaid",
        payments: [],
        createdBy: user?.uid || "",
      })

      await logActivity({
        type: "invoice_created",
        message: `${userData?.name || "Someone"} created an invoice for ${patientName.trim()} — Rs. ${total.toLocaleString()}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })

      router.push("/dashboard/invoices")
    } catch (err: any) {
      setError(err.message || "Failed to create invoice")
    } finally {
      setSaving(false)
    }
  }

  if (userData?.role === "doctor") return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/invoices"
          className="p-2 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">New Invoice</h1>
          <p className="mt-1 text-sm text-[#8A8F98]">Create a new patient invoice</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-4 py-5 sm:p-6 space-y-6">

            {/* Patient Info */}
            <div>
              <h3 className="text-sm font-medium text-[#EDEDEF] uppercase tracking-wider mb-4 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#5E6AD2]" />
                Patient Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">Patient Name *</label>
                  {prefillPatient ? (
                    <input
                      type="text"
                      value={patientName}
                      disabled
                      className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-400 block w-full text-sm px-3 py-2.5 min-h-[44px] opacity-60"
                    />
                  ) : (
                    <>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-4 w-4 text-white/30" />
                        </div>
                        <input
                          type="text"
                          value={patientName || patientSearch}
                          onChange={(e) => {
                            if (patientName) setPatientName("")
                            setPatientSearch(e.target.value)
                          }}
                          className="pl-10 pr-3 py-2.5 block w-full text-sm bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors min-h-[44px]"
                          placeholder="Search or type patient name..."
                          required
                        />
                      </div>
                      {showPatientDropdown && patientResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-[#0a0a0c] border border-white/[0.1] rounded-lg shadow-lg overflow-hidden">
                          {patientResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectPatient(p)}
                              className="w-full text-left px-4 py-2.5 text-sm text-[#EDEDEF] hover:bg-white/[0.05] transition-colors"
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-[#8A8F98]">{p.phone}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#8A8F98] mb-1">Phone</label>
                  <input
                    type="text"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
                    placeholder="+92 302 2726035"
                    disabled={!!prefillPhone}
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h3 className="text-sm font-medium text-[#EDEDEF] uppercase tracking-wider mb-4">Services</h3>
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    <div className="flex-1 w-full sm:w-auto">
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Service</label>
                      <select
                        value={DENTAL_SERVICES.includes(item.serviceName) ? item.serviceName : "Other"}
                        onChange={(e) => updateLineItem(index, "serviceName", e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      >
                        {DENTAL_SERVICES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    {!DENTAL_SERVICES.includes(item.serviceName) && (
                      <div className="flex-1 w-full sm:w-auto">
                        <label className="block text-xs font-medium text-[#8A8F98] mb-1">Custom Name</label>
                        <input
                          type="text"
                          value={item.serviceName}
                          onChange={(e) => updateLineItem(index, "serviceName", e.target.value)}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                          placeholder="Service name"
                        />
                      </div>
                    )}
                    <div className="w-full sm:w-40">
                      <label className="block text-xs font-medium text-[#8A8F98] mb-1">Price (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        value={item.price || ""}
                        onChange={(e) => updateLineItem(index, "price", e.target.value)}
                        className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      disabled={lineItems.length === 1}
                      className="p-2.5 rounded-lg text-[#8A8F98] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:hover:text-[#8A8F98] disabled:hover:bg-transparent min-h-[44px]"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="mt-3 inline-flex items-center text-sm text-[#5E6AD2] hover:text-[#6872D9] font-medium transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Service
              </button>
            </div>

            {/* Discount */}
            <div>
              <h3 className="text-sm font-medium text-[#EDEDEF] uppercase tracking-wider mb-4">Discount</h3>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div>
                  <label className="block text-xs font-medium text-[#8A8F98] mb-1">Type</label>
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDiscountType("percent")}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                        discountType === "percent"
                          ? "bg-[#5E6AD2] text-white"
                          : "bg-[#0F0F12] text-[#8A8F98] hover:text-[#EDEDEF]"
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("flat")}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                        discountType === "flat"
                          ? "bg-[#5E6AD2] text-white"
                          : "bg-[#0F0F12] text-[#8A8F98] hover:text-[#EDEDEF]"
                      }`}
                    >
                      Rs.
                    </button>
                  </div>
                </div>
                <div className="w-full sm:w-40">
                  <label className="block text-xs font-medium text-[#8A8F98] mb-1">
                    {discountType === "percent" ? "Percentage" : "Amount (Rs.)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={discountType === "percent" ? 100 : subtotal}
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-white/[0.06] pt-6">
              <div className="max-w-xs ml-auto space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A8F98]">Subtotal</span>
                  <span className="text-[#EDEDEF]">Rs. {subtotal.toLocaleString()}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8A8F98]">
                      Discount {discountType === "percent" ? `(${discountValue}%)` : ""}
                    </span>
                    <span className="text-red-400">- Rs. {discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold border-t border-white/[0.06] pt-2">
                  <span className="text-[#EDEDEF]">Total</span>
                  <span className="text-[#EDEDEF]">Rs. {total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-4 sm:px-6 bg-white/[0.02] border-t border-white/[0.06] flex flex-col sm:flex-row justify-end gap-3">
            <Link
              href="/dashboard/invoices"
              className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors text-center min-h-[44px] inline-flex items-center justify-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] disabled:opacity-50 min-h-[44px] transition-colors"
            >
              {saving ? "Creating..." : "Create Invoice"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
