"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { getInvoices } from "@/lib/invoiceService"
import type { Invoice } from "@/lib/types"
import { Search, Plus, Receipt, Eye } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function InvoicesPage() {
  const { user, userData } = useAuth()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filtered, setFiltered] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Role guard: doctors cannot see invoices
  useEffect(() => {
    if (userData && userData.role === "doctor") {
      router.push("/dashboard")
    }
  }, [userData, router])

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getInvoices()
        setInvoices(data)
      } catch (error) {
        console.error("Error fetching invoices:", error)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  useEffect(() => {
    let result = invoices
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.patientName.toLowerCase().includes(term) ||
          inv.id.toLowerCase().includes(term)
      )
    }
    if (statusFilter !== "all") {
      result = result.filter((inv) => inv.status === statusFilter)
    }
    setFiltered(result)
  }, [invoices, searchTerm, statusFilter])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "unpaid":
        return "bg-red-500/15 text-red-400"
      case "partial":
        return "bg-amber-500/15 text-amber-400"
      case "paid":
        return "bg-emerald-500/15 text-emerald-400"
      default:
        return "bg-white/[0.05] text-[#8A8F98]"
    }
  }

  const formatRupees = (amount: number) => {
    return `Rs. ${amount.toLocaleString()}`
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }

  if (userData?.role === "doctor") return null

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
          <h1 className="text-2xl font-semibold text-[#EDEDEF] tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-[#8A8F98]">Manage billing and payments</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-[#5E6AD2] hover:bg-[#6872D9] shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row gap-3">
          <div className="relative w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-white/30" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2.5 min-h-[44px] bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"
              placeholder="Search by patient name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {["all", "unpaid", "partial", "paid"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? "bg-[#5E6AD2] text-white"
                    : "bg-white/[0.05] text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.08]"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Paid</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-[#8A8F98] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-[#8A8F98]">
                    {searchTerm || statusFilter !== "all"
                      ? "No invoices match your filters."
                      : "No invoices yet. Click \"New Invoice\" to create one."}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 flex items-center justify-center">
                          <Receipt className="h-4 w-4 text-[#5E6AD2]" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-[#EDEDEF]">{inv.patientName}</div>
                          <div className="text-xs text-[#8A8F98]">#{inv.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#8A8F98]">{formatDate(inv.date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#EDEDEF] font-medium">{formatRupees(inv.total)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-400">{formatRupees(inv.amountPaid)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#EDEDEF]">{formatRupees(inv.balanceDue)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full capitalize ${getStatusBadge(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        href={`/dashboard/invoices/${inv.id}`}
                        className="inline-flex items-center text-[#5E6AD2] hover:text-[#6872D9] text-sm font-medium transition-colors"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden divide-y divide-white/[0.06]">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[#8A8F98]">
              {searchTerm || statusFilter !== "all"
                ? "No invoices match your filters."
                : "No invoices yet. Tap \"New Invoice\" to create one."}
            </div>
          ) : (
            filtered.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/invoices/${inv.id}`}
                className="block p-4 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#5E6AD2]/10 border border-[#5E6AD2]/20 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-[#5E6AD2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#EDEDEF] truncate">{inv.patientName}</div>
                      <div className="text-xs text-[#8A8F98]">{formatDate(inv.date)}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize flex-shrink-0 ${getStatusBadge(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="text-[#EDEDEF] font-medium">Total: {formatRupees(inv.total)}</span>
                  <span className="text-emerald-400">Paid: {formatRupees(inv.amountPaid)}</span>
                  {inv.balanceDue > 0 && (
                    <span className="text-red-400">Due: {formatRupees(inv.balanceDue)}</span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Count */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/[0.06]">
          <span className="text-xs text-[#8A8F98]">
            {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  )
}
