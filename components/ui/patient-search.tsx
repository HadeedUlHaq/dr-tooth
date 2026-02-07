"use client"

import * as React from "react"
import { Search, UserPlus, User } from "lucide-react"
import { searchPatients } from "@/lib/patientService"
import type { Patient } from "@/lib/types"

interface PatientSearchProps {
  onSelect: (patient: Patient) => void
  onChange?: (value: string) => void
  onRegisterNew?: (name: string) => void
  initialValue?: string
  placeholder?: string
}

export function PatientSearch({
  onSelect,
  onChange,
  onRegisterNew,
  initialValue = "",
  placeholder = "Search or type patient name",
}: PatientSearchProps) {
  const [inputValue, setInputValue] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<Patient[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(-1)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync with external initialValue changes
  React.useEffect(() => {
    setInputValue(initialValue)
  }, [initialValue])

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    setActiveIndex(-1)
    onChange?.(value)

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length >= 2) {
      setIsLoading(true)
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchPatients(value)
          setSuggestions(results)
          setIsOpen(true)
        } catch (error) {
          console.error("Search error:", error)
          setSuggestions([])
        } finally {
          setIsLoading(false)
        }
      }, 300)
    } else {
      setSuggestions([])
      setIsOpen(false)
      setIsLoading(false)
    }
  }

  const handleSelect = (patient: Patient) => {
    setInputValue(patient.name)
    setIsOpen(false)
    setSuggestions([])
    onSelect(patient)
  }

  const handleRegisterNew = () => {
    setIsOpen(false)
    onRegisterNew?.(inputValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    const totalItems = suggestions.length + (onRegisterNew && suggestions.length === 0 ? 1 : 0)

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0))
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1))
        break
      case "Enter":
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex])
        } else if (
          activeIndex === suggestions.length &&
          onRegisterNew &&
          suggestions.length === 0
        ) {
          handleRegisterNew()
        }
        break
      case "Escape":
        setIsOpen(false)
        break
    }
  }

  const handleFocus = () => {
    if (inputValue.trim().length >= 2 && suggestions.length > 0) {
      setIsOpen(true)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-white/40" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          className="bg-[#0F0F12] border border-white/10 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/20 transition-colors block w-full text-sm pl-10 pr-3 py-2.5"
          placeholder={placeholder}
          autoComplete="off"
          required
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="h-4 w-4 border-2 border-[#5E6AD2]/40 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#0F0F12] border border-white/[0.06] rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden">
          {suggestions.length > 0 ? (
            <ul className="max-h-60 overflow-auto py-1">
              {suggestions.map((patient, index) => (
                <li
                  key={patient.id}
                  onClick={() => handleSelect(patient)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    index === activeIndex
                      ? "bg-white/[0.08]"
                      : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#5E6AD2]/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-[#5E6AD2]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#EDEDEF] truncate">
                      {patient.name}
                    </p>
                    <p className="text-xs text-[#8A8F98] truncate">
                      {patient.phone}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-[#8A8F98]">
                    {patient.treatmentRequired}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            inputValue.trim().length >= 2 && (
              <div className="py-3 px-3">
                <p className="text-xs text-[#8A8F98] mb-2">
                  No patients found matching &quot;{inputValue}&quot;
                </p>
                {onRegisterNew && (
                  <button
                    type="button"
                    onClick={handleRegisterNew}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-[#5E6AD2] rounded-lg transition-colors ${
                      activeIndex === 0
                        ? "bg-[#5E6AD2]/10"
                        : "hover:bg-[#5E6AD2]/10"
                    }`}
                  >
                    <UserPlus className="h-4 w-4" />
                    Register &quot;{inputValue}&quot; as new patient
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
