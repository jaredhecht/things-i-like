type HomePageSkeletonProps = {
  signedIn?: boolean
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200/80 ${className}`} />
}

function FeedCardSkeleton() {
  return (
    <article className="rounded-[4px] border border-[#dbdbdb] bg-white p-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-[88%]" />
        <SkeletonBlock className="h-4 w-[62%]" />
      </div>
      <div className="mt-5 flex gap-3">
        <SkeletonBlock className="h-8 w-16 rounded-full" />
        <SkeletonBlock className="h-8 w-16 rounded-full" />
        <SkeletonBlock className="h-8 w-16 rounded-full" />
      </div>
    </article>
  )
}

export function HomeFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <FeedCardSkeleton key={index} />
      ))}
    </>
  )
}

export function HomePageSkeleton({ signedIn = false }: HomePageSkeletonProps) {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <header className="mb-5 flex items-center justify-between gap-3 sm:mb-8">
          <SkeletonBlock className="h-8 w-40 sm:h-10 sm:w-56" />
          <SkeletonBlock className="h-10 w-28 rounded-md" />
        </header>

        {signedIn ? (
          <>
            <section className="mb-10 overflow-hidden rounded-[4px] border border-[#dbdbdb] bg-white">
              <div className="flex items-center gap-3 px-3.5 py-3">
                <SkeletonBlock className="h-[34px] w-[34px] rounded-full" />
                <SkeletonBlock className="h-4 w-40" />
              </div>
              <div className="border-t border-[#dbdbdb] px-3.5 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                </div>
              </div>
            </section>

            <div className="mb-8 flex justify-center">
              <div className="flex w-full max-w-sm rounded-[4px] border border-[#dbdbdb] bg-white p-0.5 sm:max-w-md">
                <SkeletonBlock className="h-10 flex-1 rounded-[3px]" />
                <SkeletonBlock className="h-10 flex-1 rounded-[3px]" />
              </div>
            </div>
          </>
        ) : (
          <section className="mb-10 rounded-md border border-zinc-200 bg-white p-6">
            <SkeletonBlock className="mx-auto h-4 w-56" />
            <SkeletonBlock className="mx-auto mt-4 h-10 w-40 rounded-md" />
          </section>
        )}

        <section className="space-y-6">
          <HomeFeedSkeleton />
        </section>
      </div>
    </main>
  )
}
