import type React from "react"

// Form primitives wrapping the `bg-[#0F0F12] … focus:ring-[#5E6AD2]/20` style.
// Field provides the label + spacing; Input/Textarea/Select are the controls.

const CONTROL =
  "block w-full px-3 py-2.5 bg-[#0F0F12] border border-white/10 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors"

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
        <label htmlFor={htmlFor} className="block text-sm font-medium text-[#8A8F98] mb-1">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-[#8A8F98]">{hint}</p>}
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
