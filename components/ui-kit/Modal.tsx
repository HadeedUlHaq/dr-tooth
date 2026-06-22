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
// and proper dialog semantics for free, styled to match the app's clinical surface
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
        className={`max-w-md w-full gap-0 rounded-lg border border-white/[0.1] bg-[#0A2228] p-6 text-[#F0FCFF] shadow-[0_1px_0_rgba(255,255,255,0.06),0_20px_48px_rgba(0,0,0,0.42)] ${className}`}
      >
        {(title || description) && (
          <DialogHeader className="text-left mb-4 space-y-1">
            {title && (
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#F0FCFF]">
                {icon}
                {title}
              </DialogTitle>
            )}
            {description && (
              <DialogDescription className="text-sm leading-6 text-[#A9BFC5]">{description}</DialogDescription>
            )}
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter className="mt-6 gap-3">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
