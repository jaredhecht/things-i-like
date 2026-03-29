'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { ElsewhereLinkRow, ElsewherePlatform } from '@/src/lib/elsewhere'
import {
  ELSEWHERE_PLATFORMS,
  faviconUrlForUserUrl,
  normalizeWebsiteUrl,
  platformDisplayName,
  platformInputHint,
  platformUrlPrefix,
  resolvedElsewhereUrl,
  stripAtHandle,
  elsewhereDisplaySubtitle,
} from '@/src/lib/elsewhere'
import { ElsewhereBottomSheet } from '@/src/components/ElsewhereBottomSheet'
import { ElsewherePlatformIcon } from '@/src/components/ElsewherePlatformIcon'

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="8" r="1.25" />
      <circle cx="15" cy="8" r="1.25" />
      <circle cx="9" cy="12" r="1.25" />
      <circle cx="15" cy="12" r="1.25" />
      <circle cx="9" cy="16" r="1.25" />
      <circle cx="15" cy="16" r="1.25" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  )
}

async function persistSortOrder(rows: ElsewhereLinkRow[]) {
  await Promise.all(
    rows.map((row, i) => supabase.from('elsewhere_links').update({ sort_order: i }).eq('id', row.id)),
  )
}

export function ElsewhereSettingsSection({
  userId,
  elsewhereVisible,
  onElsewhereVisibleChange,
  onRefreshProfile,
}: {
  userId: string
  elsewhereVisible: boolean
  onElsewhereVisibleChange: (v: boolean) => void
  onRefreshProfile: () => Promise<void>
}) {
  const [links, setLinks] = useState<ElsewhereLinkRow[]>([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addStep, setAddStep] = useState<'pick' | 'form'>('pick')
  const [pickPlatform, setPickPlatform] = useState<ElsewherePlatform | null>(null)
  const [formSlug, setFormSlug] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const loadLinks = useCallback(async () => {
    setLinksLoading(true)
    const { data, error } = await supabase
      .from('elsewhere_links')
      .select('id, user_id, platform, slug, label, favicon_url, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('[elsewhere] load links', error.message)
      setLinks([])
    } else {
      setLinks((data || []) as ElsewhereLinkRow[])
    }
    setLinksLoading(false)
  }, [userId])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  async function setVisible(next: boolean) {
    setToggleBusy(true)
    const { error } = await supabase.from('profiles').update({ elsewhere_visible: next }).eq('id', userId)
    if (error) {
      alert(`Could not update setting: ${error.message}`)
      setToggleBusy(false)
      return
    }
    onElsewhereVisibleChange(next)
    await onRefreshProfile()
    setToggleBusy(false)
  }

  function openAdd() {
    setAddStep('pick')
    setPickPlatform(null)
    setFormSlug('')
    setFormLabel('')
    setAddOpen(true)
  }

  function closeAdd() {
    setAddOpen(false)
    setAddStep('pick')
    setPickPlatform(null)
    setFormSlug('')
    setFormLabel('')
  }

  function choosePlatform(p: ElsewherePlatform) {
    setPickPlatform(p)
    setFormSlug('')
    setFormLabel('')
    setAddStep('form')
  }

  async function saveNewLink() {
    if (!pickPlatform || !userId) return
    const slugRaw = formSlug.trim()
    if (!slugRaw) {
      alert('Add a handle or URL.')
      return
    }
    let slugOut = slugRaw
    let favicon: string | null = null
    let labelOut: string | null = null

    if (pickPlatform === 'website' || pickPlatform === 'other') {
      slugOut = normalizeWebsiteUrl(slugRaw)
      try {
        void new URL(slugOut)
      } catch {
        alert('Enter a valid URL (e.g. https://example.com).')
        return
      }
      if (pickPlatform === 'other') {
        labelOut = formLabel.trim() || null
        favicon = faviconUrlForUserUrl(slugOut)
      }
    } else if (pickPlatform === 'substack') {
      slugOut = stripAtHandle(slugRaw).replace(/\.substack\.com\/?$/i, '')
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(slugOut)) {
        alert('Use a valid Substack subdomain (letters, numbers, hyphens).')
        return
      }
    } else {
      slugOut = stripAtHandle(slugRaw)
      if (!slugOut) {
        alert('Enter a handle.')
        return
      }
    }

    const maxSort = links.reduce((m, l) => Math.max(m, l.sort_order), -1)
    setFormSaving(true)
    const { error } = await supabase.from('elsewhere_links').insert({
      user_id: userId,
      platform: pickPlatform,
      slug: slugOut,
      label: labelOut,
      favicon_url: favicon,
      sort_order: maxSort + 1,
    })
    setFormSaving(false)
    if (error) {
      alert(`Could not save link: ${error.message}`)
      return
    }
    await loadLinks()
    closeAdd()
  }

  async function deleteLink(id: string) {
    const { error } = await supabase.from('elsewhere_links').delete().eq('id', id).eq('user_id', userId)
    if (error) {
      alert(error.message)
      return
    }
    const next = links.filter((l) => l.id !== id).map((l, i) => ({ ...l, sort_order: i }))
    setLinks(next)
    await persistSortOrder(next)
  }

  function onDragStartRow(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  function onDragOverRow(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  async function onDropRow(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    if (!fromId || fromId === targetId) return
    setLinks((prev) => {
      const fromIdx = prev.findIndex((l) => l.id === fromId)
      if (fromIdx < 0) return prev
      const next = [...prev]
      const [removed] = next.splice(fromIdx, 1)
      const insertAt = next.findIndex((l) => l.id === targetId)
      if (insertAt < 0) return prev
      next.splice(insertAt, 0, removed)
      const reindexed = next.map((l, i) => ({ ...l, sort_order: i }))
      void persistSortOrder(reindexed)
      return reindexed
    })
  }

  const prefix = pickPlatform ? platformUrlPrefix(pickPlatform) : null
  const hint = pickPlatform ? platformInputHint(pickPlatform) : null

  return (
    <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Elsewhere</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Link to your other profiles on the web. When enabled, a globe on your public profile opens this list.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Show on my profile</p>
          <p className="text-xs text-zinc-500">Globe appears only if this is on and you have at least one link.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={elsewhereVisible}
          disabled={toggleBusy}
          onClick={() => void setVisible(!elsewhereVisible)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${elsewhereVisible ? 'bg-zinc-900' : 'bg-zinc-300'} disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${elsewhereVisible ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      <div className="mt-5">
        {linksLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : links.length === 0 ? (
          <p className="text-sm text-zinc-500">No links yet. Add one to show them when Elsewhere is enabled.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((row) => (
              <li
                key={row.id}
                onDragOver={onDragOverRow}
                onDrop={(e) => void onDropRow(e, row.id)}
                className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white px-2 py-2"
              >
                <div
                  draggable
                  onDragStart={(e) => onDragStartRow(e, row.id)}
                  className="cursor-grab touch-none text-zinc-400 active:cursor-grabbing"
                  aria-label="Drag to reorder"
                  title="Drag to reorder"
                >
                  <GripIcon className="h-5 w-5" aria-hidden />
                </div>
                <ElsewherePlatformIcon platform={row.platform} faviconUrl={row.favicon_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{platformDisplayName(row.platform)}</p>
                  <p className="truncate text-xs text-zinc-500">{elsewhereDisplaySubtitle(row.platform, row.slug, row.label)}</p>
                </div>
                <a
                  href={resolvedElsewhereUrl(row.platform, row.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-zinc-500 hover:text-zinc-800"
                >
                  Open
                </a>
                <button
                  type="button"
                  aria-label="Delete link"
                  onClick={() => void deleteLink(row.id)}
                  className="shrink-0 rounded-md p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={openAdd}
        className="mt-4 w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Add a link
      </button>

      <ElsewhereBottomSheet
        open={addOpen}
        onClose={closeAdd}
        title={addStep === 'pick' ? 'Add a link' : `Add ${pickPlatform ? platformDisplayName(pickPlatform) : ''}`}
      >
        {addStep === 'pick' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ELSEWHERE_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePlatform(p)}
                className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-center hover:border-zinc-400 hover:bg-zinc-50"
              >
                <ElsewherePlatformIcon platform={p} size="md" />
                <span className="text-xs font-medium text-zinc-800">{platformDisplayName(p)}</span>
              </button>
            ))}
          </div>
        ) : pickPlatform ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setAddStep('pick')}
              className="text-sm text-zinc-500 hover:text-zinc-800"
            >
              ← Back
            </button>

            {pickPlatform === 'substack' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Substack subdomain</label>
                <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-200">
                  <span className="flex items-center bg-zinc-50 px-2 text-xs text-zinc-500">https://</span>
                  <input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="yourname"
                    className="min-w-0 flex-1 border-0 px-2 py-2 text-sm focus:outline-none focus:ring-0"
                  />
                  <span className="flex items-center bg-zinc-50 px-2 text-xs text-zinc-500">.substack.com</span>
                </div>
                {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
              </div>
            ) : pickPlatform === 'website' || pickPlatform === 'other' ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">URL</label>
                  <input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    onBlur={() => {
                      if (pickPlatform === 'other' && formSlug.trim()) {
                        /* favicon computed on save */
                      }
                    }}
                    placeholder="https://…"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                {pickPlatform === 'other' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Label (optional)</label>
                    <input
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="My newsletter"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    />
                    <p className="mt-1 text-xs text-zinc-500">We&apos;ll use the site favicon as the icon.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Handle</label>
                {prefix ? (
                  <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-200">
                    <span className="flex items-center whitespace-nowrap bg-zinc-50 px-2 text-xs text-zinc-500">{prefix}</span>
                    <input
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      placeholder="username"
                      className="min-w-0 flex-1 border-0 px-2 py-2 text-sm focus:outline-none focus:ring-0"
                    />
                  </div>
                ) : (
                  <input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  />
                )}
                {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
              </div>
            )}

            <button
              type="button"
              disabled={formSaving}
              onClick={() => void saveNewLink()}
              className="w-full rounded-md bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {formSaving ? 'Saving…' : 'Save link'}
            </button>
          </div>
        ) : null}
      </ElsewhereBottomSheet>
    </section>
  )
}
