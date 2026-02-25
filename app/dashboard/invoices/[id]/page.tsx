"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useRouter, useParams } from "next/navigation"
import {
  getInvoice,
  updateInvoice,
  deleteInvoice,
  recordPayment,
} from "@/lib/invoiceService"
import { logActivity } from "@/lib/activityService"
import type { Invoice, LineItem, DiscountType, PaymentMethod } from "@/lib/types"
import {
  ChevronLeft,
  Printer,
  Trash,
  Edit,
  Plus,
  Receipt,
  CreditCard,
  Clock,
  CheckCircle,
  X,
} from "lucide-react"
import Link from "next/link"
import InvoicePrintTemplate from "@/components/ui/invoice-print-template"

const DENTAL_SERVICES: { name: string; price: number }[] = [
  { name: "Consultation", price: 1000 },
  { name: "Root Canal", price: 15000 },
  { name: "Extraction", price: 3000 },
  { name: "Scaling", price: 5000 },
  { name: "Filling", price: 3000 },
  { name: "Crown", price: 15000 },
  { name: "Bridge", price: 20000 },
  { name: "Denture", price: 25000 },
  { name: "Whitening", price: 8000 },
  { name: "X-Ray", price: 1500 },
  { name: "Braces Adjustment", price: 5000 },
  { name: "Implant", price: 50000 },
  { name: "Veneer", price: 15000 },
  { name: "Gum Treatment", price: 5000 },
]

export default function InvoiceDetailPage() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [editItems, setEditItems] = useState<LineItem[]>([])
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>("flat")
  const [editDiscountValue, setEditDiscountValue] = useState(0)
  const [saving, setSaving] = useState(false)

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash")
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (userData && userData.role === "doctor") {
      router.push("/dashboard")
    }
  }, [userData, router])

  const fetchInvoice = async () => {
    try {
      const data = await getInvoice(id)
      setInvoice(data)
      if (data) {
        setEditItems(data.lineItems)
        setEditDiscountType(data.discountType)
        setEditDiscountValue(data.discountValue)
      }
    } catch (err) {
      console.error(err)
      setError("Failed to load invoice")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchInvoice()
  }, [id])

  const editSubtotal = useMemo(
    () => editItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0),
    [editItems]
  )
  const editDiscountAmount = useMemo(() => {
    if (editDiscountType === "percent") return Math.round((editSubtotal * editDiscountValue) / 100)
    return editDiscountValue || 0
  }, [editSubtotal, editDiscountType, editDiscountValue])
  const editTotal = useMemo(
    () => Math.max(0, editSubtotal - editDiscountAmount),
    [editSubtotal, editDiscountAmount]
  )

  const handleSaveEdit = async () => {
    if (!invoice) return
    setSaving(true)
    setError("")
    try {
      const newBalanceDue = Math.max(0, editTotal - invoice.amountPaid)
      let newStatus = invoice.status
      if (invoice.amountPaid >= editTotal && editTotal > 0) newStatus = "paid"
      else if (invoice.amountPaid > 0) newStatus = "partial"
      else newStatus = "unpaid"

      await updateInvoice(id, {
        lineItems: editItems,
        subtotal: editSubtotal,
        discountType: editDiscountType,
        discountValue: editDiscountValue,
        total: editTotal,
        balanceDue: newBalanceDue,
        status: newStatus,
      })
      await logActivity({
        type: "invoice_updated",
        message: `${userData?.name || "Someone"} updated invoice for ${invoice.patientName}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      await fetchInvoice()
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message || "Failed to update")
    } finally {
      setSaving(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!invoice) return
    const amount = Number(paymentAmount)
    if (!amount || amount <= 0) {
      setError("Enter a valid payment amount")
      return
    }
    setRecordingPayment(true)
    setError("")
    try {
      await recordPayment(
        id,
        {
          date: new Date().toISOString(),
          amount,
          method: paymentMethod,
          recordedBy: user?.uid || "",
          recordedByName: userData?.name || "Unknown",
        },
        invoice.payments,
        invoice.amountPaid,
        invoice.total
      )
      await logActivity({
        type: "payment_recorded",
        message: `${userData?.name || "Someone"} recorded Rs. ${amount.toLocaleString()} payment for ${invoice.patientName}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      setShowPaymentModal(false)
      setPaymentAmount("")
      setPaymentMethod("Cash")
      await fetchInvoice()
    } catch (err: any) {
      setError(err.message || "Failed to record payment")
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleDelete = async () => {
    if (!invoice) return
    try {
      await logActivity({
        type: "invoice_deleted",
        message: `${userData?.name || "Someone"} deleted invoice for ${invoice.patientName}`,
        actorName: userData?.name || "Unknown",
        actorId: user?.uid || "",
      })
      await deleteInvoice(id)
      router.push("/dashboard/invoices")
    } catch (err: any) {
      setError(err.message || "Failed to delete")
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "unpaid": return "bg-red-500/15 text-red-400"
      case "partial": return "bg-amber-500/15 text-amber-400"
      case "paid": return "bg-emerald-500/15 text-emerald-400"
      default: return "bg-white/[0.05] text-[#8A8F98]"
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00")
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
        " at " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    } catch {
      return dateStr
    }
  }

  if (userData?.role === "doctor") return null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-2 border-[#5E6AD2] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-semibold text-[#EDEDEF]">Invoice Not Found</h2>
        <Link href="/dashboard/invoices" className="mt-4 inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg text-sm font-medium transition-colors">
          Back to Invoices
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Print template (hidden on screen) */}
      <div className="hidden print:block">
        <InvoicePrintTemplate invoice={invoice} />
      </div>

      <div className="space-y-6 print:hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/invoices" className="p-2 rounded-lg text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">Invoice</h1>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize ${getStatusBadge(invoice.status)}`}>
                  {invoice.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#8A8F98]">#{invoice.id.slice(0, 8)} · {formatDate(invoice.date)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handlePrint} className="inline-flex items-center px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg text-sm font-medium transition-colors">
              <Printer className="h-4 w-4 mr-2" />
              Print / PDF
            </button>
            {!isEditing && (
              <>
                <button onClick={() => setIsEditing(true)} className="inline-flex items-center px-4 py-2 bg-[#5E6AD2] text-white hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] text-sm font-medium transition-colors">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="inline-flex items-center px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors">
                  <Trash className="h-4 w-4 mr-2" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Invoice Content */}
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="px-4 py-5 sm:p-6 space-y-6">
            {/* Patient info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Patient</span>
                <p className="text-sm text-[#EDEDEF] mt-1 font-medium">{invoice.patientName}</p>
                {invoice.patientPhone && <p className="text-xs text-[#8A8F98] mt-0.5">{invoice.patientPhone}</p>}
              </div>
              <div>
                <span className="text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Date</span>
                <p className="text-sm text-[#EDEDEF] mt-1">{formatDate(invoice.date)}</p>
                {invoice.appointmentId && (
                  <Link href={`/dashboard/appointments/${invoice.appointmentId}`} className="text-xs text-[#5E6AD2] hover:underline mt-0.5 inline-block">
                    View linked appointment
                  </Link>
                )}
              </div>
            </div>

            {/* Line items table */}
            {isEditing ? (
              <div>
                <h3 className="text-sm font-medium text-[#EDEDEF] uppercase tracking-wider mb-3">Services</h3>
                <div className="space-y-3">
                  {editItems.map((item, index) => (
                    <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                      <div className="flex-1 w-full sm:w-auto">
                        <input
                          type="text"
                          list={`service-list-${index}`}
                          value={item.serviceName}
                          onChange={(e) => {
                            const updated = [...editItems]
                            const val = e.target.value
                            updated[index] = { ...updated[index], serviceName: val }
                            const match = DENTAL_SERVICES.find((s) => s.name === val)
                            if (match) {
                              updated[index] = { ...updated[index], serviceName: val, price: match.price }
                            }
                            setEditItems(updated)
                          }}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                          placeholder="Type or select service..."
                        />
                        <datalist id={`service-list-${index}`}>
                          {DENTAL_SERVICES.map((s) => (
                            <option key={s.name} value={s.name} />
                          ))}
                        </datalist>
                      </div>
                      <div className="w-full sm:w-20">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity ?? 1}
                          onChange={(e) => {
                            const updated = [...editItems]
                            updated[index] = { ...updated[index], quantity: Math.max(1, Number(e.target.value) || 1) }
                            setEditItems(updated)
                          }}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors text-center"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="w-full sm:w-36">
                        <input
                          type="number"
                          min="0"
                          value={item.price || ""}
                          onChange={(e) => {
                            const updated = [...editItems]
                            updated[index] = { ...updated[index], price: Number(e.target.value) || 0 }
                            setEditItems(updated)
                          }}
                          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                          placeholder="Unit Price"
                        />
                      </div>
                      <div className="hidden sm:flex flex-col justify-end">
                        <div className="h-[44px] flex items-center px-1 text-sm text-[#8A8F98] whitespace-nowrap">
                          = Rs. {((item.price || 0) * (item.quantity || 1)).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (editItems.length === 1) return
                          setEditItems(editItems.filter((_, i) => i !== index))
                        }}
                        disabled={editItems.length === 1}
                        className="p-2.5 rounded-lg text-[#8A8F98] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 min-h-[44px]"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setEditItems([...editItems, { serviceName: "", price: 0, quantity: 1 }])}
                  className="mt-3 inline-flex items-center text-sm text-[#5E6AD2] hover:text-[#6872D9] font-medium transition-colors"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Service
                </button>

                {/* Edit discount */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-[#EDEDEF] uppercase tracking-wider mb-3">Discount</h3>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    <div className="flex rounded-lg border border-white/10 overflow-hidden">
                      <button type="button" onClick={() => setEditDiscountType("percent")}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${editDiscountType === "percent" ? "bg-[#5E6AD2] text-white" : "bg-[#0F0F12] text-[#8A8F98]"}`}>
                        %
                      </button>
                      <button type="button" onClick={() => setEditDiscountType("flat")}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${editDiscountType === "flat" ? "bg-[#5E6AD2] text-white" : "bg-[#0F0F12] text-[#8A8F98]"}`}>
                        Rs.
                      </button>
                    </div>
                    <input
                      type="number" min="0"
                      value={editDiscountValue || ""}
                      onChange={(e) => setEditDiscountValue(Number(e.target.value) || 0)}
                      className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full sm:w-40 min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Edit totals */}
                <div className="mt-6 border-t border-white/[0.06] pt-4 max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8A8F98]">Subtotal</span>
                    <span className="text-[#EDEDEF]">Rs. {editSubtotal.toLocaleString()}</span>
                  </div>
                  {editDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8A8F98]">Discount</span>
                      <span className="text-red-400">- Rs. {editDiscountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t border-white/[0.06] pt-2">
                    <span className="text-[#EDEDEF]">Total</span>
                    <span className="text-[#EDEDEF]">Rs. {editTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* Save/Cancel */}
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => { setIsEditing(false); setEditItems(invoice.lineItems); setEditDiscountType(invoice.discountType); setEditDiscountValue(invoice.discountValue) }}
                    className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={saving}
                    className="inline-flex items-center justify-center py-2.5 px-4 text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] rounded-lg shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] disabled:opacity-50 min-h-[44px] transition-colors">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Read-only line items */}
                <div>
                  <h3 className="text-sm font-medium text-[#8A8F98] uppercase tracking-wider mb-3">Services</h3>
                  <div className="border border-white/[0.06] rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-white/[0.06]">
                      <thead className="bg-white/[0.03]">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-[#8A8F98] uppercase">Service</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-[#8A8F98] uppercase w-16">Qty</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-[#8A8F98] uppercase">Unit Price</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-[#8A8F98] uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {invoice.lineItems.map((item, i) => {
                          const qty = item.quantity || 1
                          const rowTotal = item.price * qty
                          return (
                            <tr key={i}>
                              <td className="px-4 py-3 text-sm text-[#EDEDEF]">{item.serviceName}</td>
                              <td className="px-4 py-3 text-sm text-[#8A8F98] text-center">{qty}</td>
                              <td className="px-4 py-3 text-sm text-[#8A8F98] text-right">Rs. {item.price.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-[#EDEDEF] font-medium text-right">Rs. {rowTotal.toLocaleString()}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8A8F98]">Subtotal</span>
                    <span className="text-[#EDEDEF]">Rs. {invoice.subtotal.toLocaleString()}</span>
                  </div>
                  {invoice.discountValue > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8A8F98]">
                        Discount {invoice.discountType === "percent" ? `(${invoice.discountValue}%)` : ""}
                      </span>
                      <span className="text-red-400">
                        - Rs. {(invoice.discountType === "percent"
                          ? Math.round((invoice.subtotal * invoice.discountValue) / 100)
                          : invoice.discountValue
                        ).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t border-white/[0.06] pt-2">
                    <span className="text-[#EDEDEF]">Total</span>
                    <span className="text-[#EDEDEF]">Rs. {invoice.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8A8F98]">Amount Paid</span>
                    <span className="text-emerald-400">Rs. {invoice.amountPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold border-t border-white/[0.06] pt-2">
                    <span className="text-[#EDEDEF]">Balance Due</span>
                    <span className={invoice.balanceDue > 0 ? "text-red-400" : "text-emerald-400"}>
                      Rs. {invoice.balanceDue.toLocaleString()}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Record Payment */}
        {!isEditing && invoice.status !== "paid" && (
          <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="px-4 py-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium text-[#EDEDEF] flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-[#5E6AD2]" />
                  Record Payment
                </h3>
                <p className="text-sm text-[#8A8F98] mt-1">
                  Balance due: <span className="text-red-400 font-medium">Rs. {invoice.balanceDue.toLocaleString()}</span>
                </p>
              </div>
              <button
                onClick={() => { setShowPaymentModal(true); setPaymentAmount(String(invoice.balanceDue)) }}
                className="inline-flex items-center px-4 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
              >
                <Plus className="h-4 w-4 mr-2" />
                Record Payment
              </button>
            </div>
          </div>
        )}

        {/* Payment History */}
        {invoice.payments.length > 0 && (
          <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-[#EDEDEF] flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-[#5E6AD2]" />
                Payment History
              </h3>
              <div className="space-y-3">
                {invoice.payments.map((payment, i) => (
                  <div key={payment.id || i} className="flex items-center gap-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div>
                          <span className="text-sm font-medium text-[#EDEDEF]">Rs. {payment.amount.toLocaleString()}</span>
                          <span className="mx-2 text-white/20">·</span>
                          <span className="text-xs px-2 py-0.5 bg-white/[0.05] rounded-full text-[#8A8F98]">{payment.method}</span>
                        </div>
                        <div className="text-xs text-[#8A8F98]">
                          {formatDateTime(payment.date)} by {payment.recordedByName}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 print:hidden">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#EDEDEF]">Record Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-[#8A8F98] hover:text-[#EDEDEF] p-1 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#8A8F98] mb-1">Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  max={invoice?.balanceDue}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 text-sm px-3 py-2.5 w-full min-h-[44px] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#8A8F98] mb-1">Payment Method</label>
                <div className="flex gap-2">
                  {(["Cash", "Card", "Transfer"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                        paymentMethod === m
                          ? "bg-[#5E6AD2] text-white"
                          : "bg-white/[0.05] text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.08] border border-white/[0.06]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowPaymentModal(false)}
                className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]">
                Cancel
              </button>
              <button onClick={handleRecordPayment} disabled={recordingPayment}
                className="inline-flex items-center justify-center py-2.5 px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 min-h-[44px] transition-colors">
                {recordingPayment ? "Recording..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 print:hidden">
          <div className="bg-[#0a0a0c] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-[#EDEDEF]">Delete Invoice</h3>
            <p className="mt-2 text-sm text-[#8A8F98]">Are you sure? This action cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="bg-white/[0.05] hover:bg-white/[0.08] text-[#EDEDEF] border border-white/[0.06] rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]">Cancel</button>
              <button onClick={handleDelete} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors min-h-[44px]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
