"use client"

import type React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

// Themed wrapper over the bundled Radix dialog. Gives us focus-trap, Esc-to-close
// and proper dialog semantics for free, styled to match the app's dark surface
// (replaces the hand-rolled fixed-overlay modals). Controlled via open/onClose.
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  className = "",
}: {
  open: boolean
  onClose: () => void
  title?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={`max-w-md w-full border-white/[0.06] bg-[#0a0a0c] text-[#EDEDEF] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] gap-0 p-6 ${className}`}
      >
        {(title || description) && (
          <DialogHeader className="text-left mb-4 space-y-1">
            {title && (
              <DialogTitle className="text-lg font-semibold text-[#EDEDEF] flex items-center gap-2">
                {icon}
                {title}
              </DialogTitle>
            )}
            {description && (
              <DialogDescription className="text-sm text-[#8A8F98]">{description}</DialogDescription>
            )}
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter className="mt-6 gap-3">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
