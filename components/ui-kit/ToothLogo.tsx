// Simple inline tooth brand mark (no external asset). Uses currentColor so callers
// control the colour via text-* classes.
export function ToothLogo({
  className = "h-6 w-6",
  title = "Dr Tooth",
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2C9.4 2 8.5 3.4 6.9 3.4 5.6 3.4 4.6 2.6 4 3.8 3.3 5.2 3.2 7.6 4 11.4c.5 2.5.8 6.1 2.3 7.1 1.1.8 1.6-1 1.95-2.8.32-1.65.5-3.1 1.45-3.1.95 0 1.13 1.45 1.45 3.1.35 1.8.85 3.6 1.95 2.8 1.5-1 1.8-4.6 2.3-7.1.8-3.8.7-6.2 0-7.6-.6-1.2-1.6-.4-2.9-.4C15.5 3.4 14.6 2 12 2z" />
    </svg>
  )
}

// Wordmark: logo mark + name, for the sidebar/header/login.
export function BrandWordmark({
  className = "",
  markClass = "h-6 w-6 text-[#0891B2]",
  textClass = "text-lg font-semibold text-[#F0FCFF] tracking-tight",
  short = false,
}: {
  className?: string
  markClass?: string
  textClass?: string
  short?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ToothLogo className={markClass} />
      <span className={textClass}>{short ? "Dr Tooth" : "Dr Tooth Dental Clinic"}</span>
    </span>
  )
}
