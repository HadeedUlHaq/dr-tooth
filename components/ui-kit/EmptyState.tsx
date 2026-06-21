import type React from "react"
import type { LucideIcon } from "lucide-react"

// Friendlier empty state than bare text: a muted icon medallion, a message and
// an optional CTA. Use inside a SurfaceCard's body.
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className = "",
}: {
  icon?: LucideIcon
  title?: string
  message: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-14 ${className}`}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          <Icon className="h-6 w-6 text-[#8A8F98]" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-[#EDEDEF]">{title}</p>}
      <p className="text-sm text-[#8A8F98] max-w-sm">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
