// Single source of truth for the appointment / invoice status → colour map.
// Previously this switch was copy-pasted into the dashboard, appointments list,
// invoices, etc. Keep the same pill look (rounded-full, /15 bg, 400 text).

type StatusTone = {
  bg: string
  text: string
  border?: string
}

const APPOINTMENT_STATUS: Record<string, StatusTone> = {
  scheduled: { bg: "bg-blue-500/15", text: "text-blue-400" },
  confirmed: { bg: "bg-green-500/15", text: "text-green-400" },
  completed: { bg: "bg-purple-500/15", text: "text-purple-400" },
  missed: { bg: "bg-red-500/15", text: "text-red-400" },
  cancelled: { bg: "bg-white/[0.05]", text: "text-[#8A8F98]" },
}

const INVOICE_STATUS: Record<string, StatusTone> = {
  paid: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  partial: { bg: "bg-amber-500/15", text: "text-amber-400" },
  unpaid: { bg: "bg-red-500/15", text: "text-red-400" },
  pending: { bg: "bg-amber-500/15", text: "text-amber-400" },
  overdue: { bg: "bg-red-500/15", text: "text-red-400" },
  cancelled: { bg: "bg-white/[0.05]", text: "text-[#8A8F98]" },
}

const FALLBACK: StatusTone = { bg: "bg-white/[0.05]", text: "text-[#8A8F98]" }

function toneFor(status: string, kind: "appointment" | "invoice"): StatusTone {
  const key = status?.toLowerCase?.() ?? ""
  const map = kind === "invoice" ? INVOICE_STATUS : APPOINTMENT_STATUS
  return map[key] ?? FALLBACK
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function StatusBadge({
  status,
  kind = "appointment",
  className = "",
}: {
  status: string
  kind?: "appointment" | "invoice"
  className?: string
}) {
  const tone = toneFor(status, kind)
  return (
    <span
      className={`px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full ${tone.bg} ${tone.text} ${className}`}
    >
      {titleCase(status)}
    </span>
  )
}

// Exposed so other components can reuse the exact colour for a status.
export function statusColorClasses(status: string, kind: "appointment" | "invoice" = "appointment") {
  const tone = toneFor(status, kind)
  return `${tone.bg} ${tone.text}`
}
