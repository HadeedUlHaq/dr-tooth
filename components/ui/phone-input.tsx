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
 * Phone input with a default +92 prefix badge.
 * Stores the full number WITH a prefix (e.g. "+92 302 2726035").
 * Default country is Pakistan, BUT if the user types a full international number
 * starting with "+" (e.g. "+44 7774 067432") it is stored verbatim — so non-PK
 * numbers are supported too. The inner field shows the local part for +92, or the
 * full "+.." number for any other country.
 */
export function PhoneInput({
  value,
  onChange,
  id,
  placeholder = "302 2726035 (or +44… for intl)",
  required,
  disabled,
  className = "",
}: PhoneInputProps) {
  // Display: strip the +92 default; show any other "+.." number in full.
  const stripped = value.startsWith(COUNTRY_CODE)
    ? value.slice(COUNTRY_CODE.length).trimStart()
    : value.startsWith("+")
      ? value
      : value.startsWith("92")
        ? value.slice(2).trimStart()
        : value

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (!raw.trim()) {
      onChange("")
      return
    }
    // A leading "+" means the user is entering a full international number — keep it as-is.
    if (raw.trimStart().startsWith("+")) {
      onChange(raw.trimStart())
      return
    }
    // Otherwise default to the Pakistan prefix.
    onChange(`${COUNTRY_CODE} ${raw.trimStart()}`)
  }

  return (
    <div className={`flex ${className}`}>
      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-white/10 bg-white/[0.05] text-sm text-[#A9BFC5] select-none">
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
        className="bg-[#082127] border border-white/10 rounded-r-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors block w-full text-sm px-3 py-2.5 min-h-[44px]"
      />
    </div>
  )
}
