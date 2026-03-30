import Link from 'next/link'

/** Small footer links on the home / dashboard page only. */
export function HomeLegalFooter() {
  return (
    <footer className="mt-12 border-t border-zinc-200 pt-5 pb-1">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-zinc-400"
        aria-label="Legal"
      >
        <Link href="/privacy" className="hover:text-zinc-600 hover:underline">
          Privacy Policy
        </Link>
        <span className="text-zinc-300 select-none" aria-hidden>
          ·
        </span>
        <Link href="/terms" className="hover:text-zinc-600 hover:underline">
          Terms of Service
        </Link>
      </nav>
    </footer>
  )
}
