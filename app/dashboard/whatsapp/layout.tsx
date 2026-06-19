// Server component (no "use client") for the WhatsApp route segment.
// Forces dynamic rendering so these pages are NEVER statically prerendered or
// edge-cached — every request is generated fresh. Without this, OpenNext
// prerenders the page once and serves a stale copy (with `s-maxage=31536000`),
// so code changes don't reach the browser until the cache expires.
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export default function WhatsAppSegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
