"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { getInvoices } from "@/lib/invoiceService"
import type { Invoice } from "@/lib/types"
import { Search, Plus, Receipt, Eye } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PageHeader, ButtonLink, StatusBadge, EmptyState, SkeletonList } from "@/components/ui-kit"

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
      <div className="space-y-6">
        <PageHeader title="Invoices" subtitle="Manage billing and payments" />
        <SkeletonList rows={6} withHeader={false} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Invoices"
        subtitle="Manage billing and payments"
        actions={
          <ButtonLink href="/dashboard/invoices/new" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </ButtonLink>
        }
      />

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
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title={searchTerm || statusFilter !== "all" ? "No matches" : "No invoices yet"}
                      message={
                        searchTerm || statusFilter !== "all"
                          ? "No invoices match your filters."
                          : 'Create your first invoice with the "New Invoice" button above.'
                      }
                    />
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
                      <StatusBadge status={inv.status} kind="invoice" />
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
            <EmptyState
              icon={Receipt}
              title={searchTerm || statusFilter !== "all" ? "No matches" : "No invoices yet"}
              message={
                searchTerm || statusFilter !== "all"
                  ? "No invoices match your filters."
                  : 'Tap "New Invoice" above to create one.'
              }
            />
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
                  <StatusBadge status={inv.status} kind="invoice" className="flex-shrink-0" />
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
