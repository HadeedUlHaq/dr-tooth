import type React from "react"
import Link from "next/link"

// House button. Variants capture the clinical cyan primary / subtle secondary /
// destructive / ghost styles used throughout the app, including the cyan
// glow shadow on the primary. Renders an <a> (via next/link) when `href` is set.

type Variant = "primary" | "secondary" | "danger" | "ghost"
type Size = "sm" | "md"

const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061417] disabled:opacity-50 disabled:pointer-events-none"

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-[#0891B2] hover:bg-[#0E7490] focus-visible:ring-[#22D3EE]/60 shadow-[0_0_0_1px_rgba(34,211,238,0.22),0_6px_18px_rgba(8,145,178,0.22),inset_0_1px_0_0_rgba(255,255,255,0.14)]",
  secondary:
    "text-[#F0FCFF] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] focus-visible:ring-[#22D3EE]/45",
  danger:
    "text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 focus-visible:ring-red-500/40",
  ghost:
    "text-[#A9BFC5] hover:text-[#F0FCFF] hover:bg-white/[0.06] focus-visible:ring-[#22D3EE]/45",
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
