'use client'

import type { ProfileModuleRow } from '@/src/lib/modules-ui'

export function ComposerModuleChips({
  modules,
  selectedIds,
  onToggle,
  className,
  /** When false (Settings → Modules: AI sorting off), helper text matches manual-only mode. */
  aiMaySuggestMore = true,
}: {
  modules: ProfileModuleRow[]
  selectedIds: ReadonlySet<string>
  onToggle: (moduleId: string) => void
  /** e.g. composer: `border-t border-[#dbdbdb] px-3.5 py-2.5`; editor: `mt-3 border-t border-zinc-100 pt-3` */
  className?: string
  aiMaySuggestMore?: boolean
}) {
  if (modules.length === 0) return null
  return (
    <div className={className ?? 'mt-3 border-t border-zinc-100 pt-3'}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8e8e8e]">Modules (optional)</p>
      <p className="mb-2 text-[11px] text-[#b8b8b8]">
        {aiMaySuggestMore
          ? 'Tagged posts always appear in those modules; AI may add more.'
          : 'Tagged posts appear in those modules only. AI auto-sorting is off in Settings → Modules.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {modules.map((m) => {
          const on = selectedIds.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                on ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {m.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
