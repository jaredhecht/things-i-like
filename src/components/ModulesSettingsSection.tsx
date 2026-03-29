'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearAllPostModulesAiForUser } from '@/src/lib/modules-client'
import { supabase } from '@/src/lib/supabase'
import { backfillAllPostsModules, SUGGESTED_MODULE_NAMES, type ProfileModuleRow } from '@/src/lib/modules-ui'
import { ElsewhereBottomSheet } from '@/src/components/ElsewhereBottomSheet'

/** PostgREST error when `profiles.modules_ai_enabled` was never migrated. */
function isMissingModulesAiColumnMessage(message: string | undefined): boolean {
  return Boolean(message && (/modules_ai_enabled/i.test(message) || /schema cache/i.test(message)))
}

const MODULES_AI_MIGRATION_ALERT = `Your database is missing the profiles.modules_ai_enabled column.

In Supabase: Dashboard → SQL → New query → run:

alter table public.profiles add column if not exists modules_ai_enabled boolean not null default true;

(Same script as file supabase/profiles-modules-ai-enabled.sql in this repo.)`

async function persistModuleSort(rows: ProfileModuleRow[]) {
  await Promise.all(rows.map((row, i) => supabase.from('profile_modules').update({ sort_order: i }).eq('id', row.id)))
}

function buildCounts(
  moduleIds: string[],
  userRows: { module_id: string; post_id: string }[],
  aiRows: { module_id: string; post_id: string }[],
): Map<string, number> {
  const map = new Map<string, Set<string>>()
  for (const id of moduleIds) map.set(id, new Set())
  for (const r of userRows) map.get(r.module_id)?.add(r.post_id)
  for (const r of aiRows) map.get(r.module_id)?.add(r.post_id)
  const out = new Map<string, number>()
  for (const id of moduleIds) out.set(id, map.get(id)?.size ?? 0)
  return out
}

export function ModulesSettingsSection({ userId }: { userId: string }) {
  const [modules, setModules] = useState<ProfileModuleRow[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [toggleBusy, setToggleBusy] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [modulesAiEnabled, setModulesAiEnabled] = useState(true)
  const [aiToggleBusy, setAiToggleBusy] = useState(false)
  /** False until we successfully read modules_ai_enabled (column exists). */
  const [modulesAiColumnReady, setModulesAiColumnReady] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('modules_ai_enabled')
      .eq('id', userId)
      .maybeSingle()
    if (!profErr) {
      setModulesAiColumnReady(true)
      setModulesAiEnabled(prof?.modules_ai_enabled !== false)
    } else if (isMissingModulesAiColumnMessage(profErr.message)) {
      setModulesAiColumnReady(false)
      setModulesAiEnabled(true)
    } else {
      console.warn('[modules] profiles.modules_ai_enabled', profErr.message)
      setModulesAiColumnReady(true)
      setModulesAiEnabled(true)
    }
    const { data: mods, error } = await supabase
      .from('profile_modules')
      .select('id, name, sort_order, is_active')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('[modules] load', error.message)
      setModules([])
      setCounts(new Map())
      setLoading(false)
      return
    }
    const list = (mods || []) as ProfileModuleRow[]
    setModules(list)
    const ids = list.map((m) => m.id)
    if (ids.length === 0) {
      setCounts(new Map())
      setLoading(false)
      return
    }
    const [{ data: pu }, { data: pa }] = await Promise.all([
      supabase.from('post_modules_user').select('module_id, post_id').in('module_id', ids),
      supabase.from('post_modules_ai').select('module_id, post_id').in('module_id', ids),
    ])
    setCounts(buildCounts(ids, (pu || []) as { module_id: string; post_id: string }[], (pa || []) as { module_id: string; post_id: string }[]))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function addModule(rawName: string) {
    const name = rawName.trim()
    if (!name || name.length > 80) return
    const maxSort = modules.reduce((m, x) => Math.max(m, x.sort_order), -1)
    const { error } = await supabase
      .from('profile_modules')
      .insert({ user_id: userId, name, sort_order: maxSort + 1, is_active: true })
    if (error) {
      alert(error.message)
      return
    }
    setAddOpen(false)
    setCustomName('')
    await load()
    const { data: profRow, error: profRowErr } = await supabase
      .from('profiles')
      .select('modules_ai_enabled')
      .eq('id', userId)
      .maybeSingle()
    if (!profRowErr && profRow?.modules_ai_enabled === false) return
    setBackfilling(true)
    const stats = await backfillAllPostsModules()
    setBackfilling(false)
    if (stats) {
      alert(
        stats.failed > 0
          ? `Sorted posts into modules (${stats.succeeded} ok, ${stats.failed} need retry). Add ANTHROPIC_API_KEY on the server if classification failed.`
          : `Sorted your existing posts into modules (${stats.succeeded} posts).`,
      )
    }
    await load()
  }

  async function setModulesAiSetting(next: boolean) {
    if (!modulesAiColumnReady) {
      alert(MODULES_AI_MIGRATION_ALERT)
      return
    }
    setAiToggleBusy(true)
    const { error } = await supabase.from('profiles').update({ modules_ai_enabled: next }).eq('id', userId)
    if (error) {
      if (isMissingModulesAiColumnMessage(error.message)) {
        setModulesAiColumnReady(false)
        alert(MODULES_AI_MIGRATION_ALERT)
      } else {
        alert(error.message)
      }
      setAiToggleBusy(false)
      return
    }
    if (!next) {
      const { error: clr } = await clearAllPostModulesAiForUser(supabase, userId)
      if (clr) alert(`Saved preference, but removing existing AI module tags failed: ${clr}`)
    }
    setModulesAiEnabled(next)
    await load()
    setAiToggleBusy(false)
  }

  async function setActive(id: string, is_active: boolean) {
    setToggleBusy(id)
    const { error } = await supabase.from('profile_modules').update({ is_active }).eq('id', id).eq('user_id', userId)
    if (error) alert(error.message)
    await load()
    setToggleBusy(null)
  }

  async function saveRename() {
    if (!renameId) return
    const name = renameValue.trim()
    if (!name || name.length > 80) {
      setRenameId(null)
      return
    }
    const { error } = await supabase.from('profile_modules').update({ name }).eq('id', renameId).eq('user_id', userId)
    if (error) alert(error.message)
    setRenameId(null)
    await load()
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
    setModules((prev) => {
      const fromIdx = prev.findIndex((x) => x.id === fromId)
      if (fromIdx < 0) return prev
      const next = [...prev]
      const [removed] = next.splice(fromIdx, 1)
      const insertAt = next.findIndex((x) => x.id === targetId)
      if (insertAt < 0) return prev
      next.splice(insertAt, 0, removed)
      const reindexed = next.map((row, i) => ({ ...row, sort_order: i }))
      void persistModuleSort(reindexed)
      return reindexed
    })
  }

  const renameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (renameId) renameRef.current?.focus()
  }, [renameId])

  return (
    <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Modules</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Themed sections on your profile (horizontal rows of your posts). Turn on automatic sorting to let AI place posts into modules, or turn it off and assign modules only from the composer, the edit screen, or ⋮ → Modules on a post.
      </p>

      {!modulesAiColumnReady ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-medium">One-time setup:</span> run{' '}
          <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">supabase/profiles-modules-ai-enabled.sql</code> in the
          Supabase SQL Editor so the AI sorting switch can save. Module list below works either way.
        </p>
      ) : null}

      <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">Automatic AI sorting</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            When off, existing AI-assigned module tags are removed and nothing new is added automatically.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={modulesAiEnabled}
          aria-label="Automatic AI module sorting"
          disabled={aiToggleBusy || loading}
          onClick={() => void setModulesAiSetting(!modulesAiEnabled)}
          className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${modulesAiEnabled ? 'bg-zinc-900' : 'bg-zinc-300'} disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${modulesAiEnabled ? 'translate-x-4' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {backfilling ? (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">Sorting your existing posts into the new module…</p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : modules.length === 0 ? (
          <p className="text-sm text-zinc-500">No modules yet.</p>
        ) : (
          <ul className="space-y-2">
            {modules.map((m) => (
              <li
                key={m.id}
                onDragOver={onDragOverRow}
                onDrop={(e) => void onDropRow(e, m.id)}
                className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white px-2 py-2"
              >
                <div
                  draggable
                  onDragStart={(e) => onDragStartRow(e, m.id)}
                  className="cursor-grab touch-none text-zinc-400"
                  aria-label="Drag to reorder"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="9" cy="8" r="1.25" />
                    <circle cx="15" cy="8" r="1.25" />
                    <circle cx="9" cy="12" r="1.25" />
                    <circle cx="15" cy="12" r="1.25" />
                    <circle cx="9" cy="16" r="1.25" />
                    <circle cx="15" cy="16" r="1.25" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  {renameId === m.id ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void saveRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename()
                        if (e.key === 'Escape') setRenameId(null)
                      }}
                      className="w-full rounded border border-zinc-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameId(m.id)
                        setRenameValue(m.name)
                      }}
                      className="text-left text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {m.name}
                    </button>
                  )}
                  <p className="text-xs text-zinc-500">{counts.get(m.id) ?? 0} posts</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.is_active}
                  disabled={toggleBusy === m.id}
                  onClick={() => void setActive(m.id, !m.is_active)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${m.is_active ? 'bg-zinc-900' : 'bg-zinc-300'} disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${m.is_active ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="mt-4 w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Add module
      </button>

      <ElsewhereBottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add module">
        <p className="mb-3 text-xs text-zinc-500">Pick a suggestion or type a custom name.</p>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUGGESTED_MODULE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => void addModule(name)}
              disabled={backfilling}
              className="rounded-lg border border-zinc-200 px-2 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {name}
            </button>
          ))}
        </div>
        <label className="block text-xs font-medium text-zinc-600">Custom name</label>
        <div className="mt-1 flex gap-2">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value.slice(0, 80))}
            placeholder="e.g. Running"
            className="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={backfilling || !customName.trim()}
            onClick={() => void addModule(customName)}
            className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </ElsewhereBottomSheet>
    </section>
  )
}
