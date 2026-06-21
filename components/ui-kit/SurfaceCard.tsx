import type React from "react"

// The signature gradient card used across the app. Captures the
// `bg-gradient-to-b … rounded-2xl shadow-…` string in one place so every
// surface stays identical.
export function SurfaceCard({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
