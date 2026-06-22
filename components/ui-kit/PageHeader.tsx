import type React from "react"

// Consistent page title block: title + optional subtitle, with an actions slot
// (e.g. a "New …" button) that drops to its own row on mobile.
export function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold text-[#F0FCFF] tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-6 text-[#A9BFC5]">{subtitle}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  )
}
