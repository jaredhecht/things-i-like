'use client'

import { useState } from 'react'
import type { ElsewhereLinkRow } from '@/src/lib/elsewhere'
import {
  elsewhereDisplaySubtitle,
  platformDisplayName,
  resolvedElsewhereUrl,
} from '@/src/lib/elsewhere'
import { ElsewhereBottomSheet } from '@/src/components/ElsewhereBottomSheet'
import { ElsewherePlatformIcon } from '@/src/components/ElsewherePlatformIcon'

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ElsewhereProfileGlobe({
  profileUsername,
  links,
}: {
  profileUsername: string
  links: ElsewhereLinkRow[]
}) {
  const [open, setOpen] = useState(false)

  if (links.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Elsewhere — other places to find this person"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      </button>

      <ElsewhereBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Find @${profileUsername} elsewhere.`}
      >
        <ul className="space-y-1">
          {links.map((row) => {
            const href = resolvedElsewhereUrl(row.platform, row.slug)
            const subtitle = elsewhereDisplaySubtitle(row.platform, row.slug, row.label)
            return (
              <li key={row.id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-zinc-50"
                >
                  <ElsewherePlatformIcon platform={row.platform} faviconUrl={row.favicon_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">{platformDisplayName(row.platform)}</p>
                    <p className="truncate text-xs text-zinc-500">{subtitle}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
                </a>
              </li>
            )
          })}
        </ul>
      </ElsewhereBottomSheet>
    </>
  )
}
