// Skeleton loaders matching the dashboard's card + list shapes. The
// reduced-motion guard in globals.css already neutralises animate-pulse for
// users who opt out.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-white/[0.06] animate-pulse ${className}`} />
}

// A list of rows inside a SurfaceCard (e.g. appointments / patients lists).
export function SkeletonList({
  rows = 5,
  withHeader = true,
}: {
  rows?: number
  withHeader?: boolean
}) {
  return (
    <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.06] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_20px_rgba(0,0,0,0.4)]">
      {withHeader && (
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <SkeletonLine className="h-4 w-40" />
        </div>
      )}
      <div className="divide-y divide-white/[0.06]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-5 py-4 space-y-2">
            <SkeletonLine className="h-4 w-48" />
            <SkeletonLine className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}

// A row of stat cards.
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/[0.06] animate-pulse" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="h-3 w-16" />
              <SkeletonLine className="h-5 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
