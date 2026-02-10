"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

interface Toast {
  id: string
  message: string
  type?: "info" | "success" | "warning"
}

let addToastFn: ((message: string, type?: Toast["type"]) => void) | null = null

export const showToast = (message: string, type: Toast["type"] = "info") => {
  addToastFn?.(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    addToastFn = (message: string, type: Toast["type"] = "info") => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, message, type }])

      // Auto-remove after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }
    return () => {
      addToastFn = null
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-[#0a0a0c] border border-white/[0.1] rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] px-4 py-3 flex items-start gap-3 animate-slide-in"
        >
          <div
            className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
              toast.type === "success"
                ? "bg-emerald-400"
                : toast.type === "warning"
                  ? "bg-amber-400"
                  : "bg-[#5E6AD2]"
            }`}
          />
          <p className="text-sm text-[#EDEDEF] flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-[#8A8F98] hover:text-[#EDEDEF] transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
