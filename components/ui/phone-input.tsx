"use client"

import type React from "react"
import { Phone } from "lucide-react"

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

const COUNTRY_CODE = "+92"

/**
 * Phone input with a fixed +92 prefix badge.
 * Stores the full number WITH the prefix (e.g. "+92 302 2726035").
 * If the incoming value already starts with +92, strips it for the inner input.
 */
export function PhoneInput({
  value,
  onChange,
  id,
  placeholder = "302 2726035",
  required,
  disabled,
  className = "",
}: PhoneInputProps) {
  // Strip prefix for display in the text field
  const stripped = value.startsWith(COUNTRY_CODE)
    ? value.slice(COUNTRY_CODE.length).trimStart()
    : value.startsWith("92")
      ? value.slice(2).trimStart()
      : value

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Always store with prefix
    if (raw.trim()) {
      onChange(`${COUNTRY_CODE} ${raw.trimStart()}`)
    } else {
      onChange("")
    }
  }

  return (
    <div className={`flex ${className}`}>
      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-white/10 bg-white/[0.05] text-sm text-[#8A8F98] select-none">
        {COUNTRY_CODE}
      </span>
      <input
        type="tel"
        id={id}
        value={stripped}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="bg-[#0F0F12] border border-white/10 rounded-r-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
      />
    </div>
  )
}
