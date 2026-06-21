import type React from "react"
import Link from "next/link"

// House button. Variants capture the indigo primary / subtle secondary /
// destructive / ghost styles used throughout the app, including the indigo
// glow shadow on the primary. Renders an <a> (via next/link) when `href` is set.

type Variant = "primary" | "secondary" | "danger" | "ghost"
type Size = "sm" | "md"

const BASE =
  "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] disabled:opacity-50 disabled:pointer-events-none"

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-[#5E6AD2] hover:bg-[#6872D9] focus-visible:ring-[#5E6AD2]/50 shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.25),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
  secondary:
    "text-[#EDEDEF] bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] focus-visible:ring-white/20",
  danger:
    "text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 focus-visible:ring-red-500/40",
  ghost:
    "text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-white/[0.05] focus-visible:ring-white/20",
}

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm min-h-[44px]",
}

type CommonProps = {
  variant?: Variant
  size?: Size
  className?: string
  children: React.ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  href,
  children,
  ...props
}: CommonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </Link>
  )
}
