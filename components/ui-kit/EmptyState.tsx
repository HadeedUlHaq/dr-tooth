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
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.05]">
          <Icon className="h-6 w-6 text-[#A9BFC5]" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-[#F0FCFF]">{title}</p>}
      <p className="max-w-sm text-sm leading-6 text-[#A9BFC5]">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
