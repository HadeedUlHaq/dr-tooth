import type React from "react"

// The signature card used across the app. Captures the healthcare operations
// surface treatment in one place so every
// surface stays identical.
export function SurfaceCard({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-white/[0.1] bg-[#0A2228]/92 shadow-[0_1px_0_rgba(255,255,255,0.06),0_12px_28px_rgba(0,0,0,0.22)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
