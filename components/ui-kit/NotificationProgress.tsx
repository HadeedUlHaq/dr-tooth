"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Animated progress bar for the WhatsApp notification popup.
 *
 * Curve: slow start (0–8%) → fast ramp (8–72%) → slow plateau (72–80%) → snap to 100% on done.
 * Uses transform: scaleX for GPU-composited animation (no layout thrash).
 * Respects prefers-reduced-motion — skips animation, shows static spinner.
 *
 * Design: UI/UX Pro Max §7 (animation-transform, easing, spring-physics, reduced-motion, duration-timing)
 */
export function NotificationProgress({
  sending,
  done,
  error,
}: {
  sending: boolean
  done: boolean
  error: string | null
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const startedAtRef = useRef(0)
  const rafRef = useRef(0)
  const animatingRef = useRef(false)
  const [progress, setProgress] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Detect prefers-reduced-motion once on mount
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    const bar = barRef.current
    const label = labelRef.current

    if (!sending && !done) {
      // Reset to initial state
      animatingRef.current = false
      startedAtRef.current = 0
      setProgress(0)
      if (bar) {
        bar.style.transition = "none"
        bar.style.transform = "scaleX(0)"
      }
      if (label) label.textContent = ""
      return
    }

    if (done) {
      // Snap to 100% — spring curve for natural feel
      animatingRef.current = false
      setProgress(100)
      if (bar) {
        bar.style.transition = "transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)"
        bar.style.transform = "scaleX(1)"
      }
      if (label) {
        label.textContent = error ? "Sending failed" : "Notification sent"
      }
      return
    }

    // ── Sending — start the animation loop ──
    startedAtRef.current = performance.now()
    animatingRef.current = true

    if (reducedMotion) {
      // Reduced motion: show a static 50% bar — no animation
      setProgress(50)
      if (bar) {
        bar.style.transition = "none"
        bar.style.transform = "scaleX(0.5)"
      }
      if (label) label.textContent = "Sending WhatsApp notification..."
      return
    }

    const animate = (now: number) => {
      if (!animatingRef.current) return
      const elapsed = now - startedAtRef.current
      const t = Math.min(elapsed / 2000, 1) // 2 s full cycle

      let pct: number

      if (t < 0.12) {
        // Phase 1: Slow start (0 → 8%) — ease-in quadratic
        const p = t / 0.12
        pct = 8 * (p * p)
      } else if (t < 0.45) {
        // Phase 2: Fast ramp (8% → 72%) — near-linear but snappy
        const p = (t - 0.12) / 0.33
        pct = 8 + 64 * Math.min(p, 1)
      } else {
        // Phase 3: Plateau creep (72% → 80%) — ease-out cubic, gentle settling
        const p = (t - 0.45) / 0.55
        pct = 72 + 8 * (1 - Math.pow(1 - p, 3))
      }

      const capped = Math.min(pct, 80)
      setProgress(capped)

      if (bar) {
        // Use transform: scaleX(…) — GPU-composited, no layout shift (§7 transform-performance)
        bar.style.transition = "transform 50ms ease-out"
        bar.style.transform = `scaleX(${capped / 100})`
      }
      if (label) {
        label.textContent = "Sending WhatsApp notification..."
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      animatingRef.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [sending, done, error, reducedMotion])

  if (!sending && !done) return null

  return (
    <div className="mt-4 space-y-1.5">
      {/* Track — §1 accessibility: role="progressbar" + aria-valuenow for screen readers */}
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={sending ? "Sending WhatsApp notification" : done ? (error ? "Sending failed" : "Notification sent") : ""}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
      >
        {/* Bar — uses transform-origin: left so scaleX(0) → scaleX(1) expands left-to-right */}
        <div
          ref={barRef}
          style={{ transformOrigin: "left" }}
          className={
            "h-full w-full rounded-full will-change-transform " +
            (done
              ? error
                ? "bg-red-400"
                : "bg-emerald-400"
              : "bg-[#0891B2]")
          }
        />
      </div>
      {/* Status label — §8 aria-live=polite so screen readers announce state changes */}
      <span
        ref={labelRef}
        role="status"
        aria-live="polite"
        className={
          "block text-xs leading-tight " +
          (done ? (error ? "text-red-400" : "text-emerald-400") : "text-[#A9BFC5]")
        }
      />
    </div>
  )
}
