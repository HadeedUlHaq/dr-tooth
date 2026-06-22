import type React from "react"

// Form primitives wrapping the clinical dark input style.
// Field provides the label + spacing; Input/Textarea/Select are the controls.

const CONTROL =
  "block w-full px-3 py-2.5 bg-[#082127] border border-white/10 rounded-lg text-sm text-[#F0FCFF] placeholder:text-[#7E989F] focus:outline-none focus:border-[#22D3EE] focus:ring-2 focus:ring-[#22D3EE]/25 transition-colors"

export function Field({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label?: string
  htmlFor?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-[#A9BFC5]">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-[#A9BFC5]">{hint}</p>}
    </div>
  )
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} min-h-[44px] ${className}`} {...props} />
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} resize-none ${className}`} {...props} />
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} min-h-[44px] ${className}`} {...props}>
      {children}
    </select>
  )
}
