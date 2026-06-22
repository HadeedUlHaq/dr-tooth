// Single source of truth for the appointment / invoice status → colour map.
// Previously this switch was copy-pasted into the dashboard, appointments list,
// invoices, etc. Keep the same pill look with accessible clinical tones.

type StatusTone = {
  bg: string
  text: string
  border?: string
}

const APPOINTMENT_STATUS: Record<string, StatusTone> = {
  scheduled: { bg: "bg-cyan-500/15", text: "text-cyan-300" },
  confirmed: { bg: "bg-emerald-500/15", text: "text-emerald-300" },
  completed: { bg: "bg-teal-500/15", text: "text-teal-300" },
  missed: { bg: "bg-red-500/15", text: "text-red-400" },
  cancelled: { bg: "bg-white/[0.06]", text: "text-[#A9BFC5]" },
}

const INVOICE_STATUS: Record<string, StatusTone> = {
  paid: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  partial: { bg: "bg-amber-500/15", text: "text-amber-400" },
  unpaid: { bg: "bg-red-500/15", text: "text-red-400" },
  pending: { bg: "bg-amber-500/15", text: "text-amber-400" },
  overdue: { bg: "bg-red-500/15", text: "text-red-400" },
  cancelled: { bg: "bg-white/[0.06]", text: "text-[#A9BFC5]" },
}

const FALLBACK: StatusTone = { bg: "bg-white/[0.06]", text: "text-[#A9BFC5]" }

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
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.bg} ${tone.text} ${className}`}
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
