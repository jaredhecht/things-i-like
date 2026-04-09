function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-200" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="h-8 w-20 animate-pulse rounded-full bg-zinc-200" />
    </div>
  )
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-6">
          <span className="text-sm text-zinc-400">← Things I Like</span>
        </p>
        <div className="mb-2 h-8 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="mb-8 h-4 w-72 animate-pulse rounded bg-zinc-100" />
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <RowSkeleton />
          <div className="border-t border-zinc-200">
            <RowSkeleton />
          </div>
          <div className="border-t border-zinc-200">
            <RowSkeleton />
          </div>
          <div className="border-t border-zinc-200">
            <RowSkeleton />
          </div>
          <div className="border-t border-zinc-200">
            <RowSkeleton />
          </div>
        </div>
      </div>
    </main>
  )
}
