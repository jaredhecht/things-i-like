'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Post } from '@/src/lib/post-helpers'
import { clearAiSuppressionForModule, removePostFromModule } from '@/src/lib/modules-client'
import { classifyPostAfterSave } from '@/src/lib/modules-ui'
import type { ProfileModuleRow } from '@/src/lib/modules-ui'
import { supabase } from '@/src/lib/supabase'

export function PostModulesSheet({
  post,
  modules,
  open,
  onClose,
  onUpdated,
}: {
  post: Post | null
  modules: ProfileModuleRow[]
  open: boolean
  onClose: () => void
  onUpdated?: () => void
}) {
  const [inModule, setInModule] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modulesAiEnabled, setModulesAiEnabled] = useState(true)

  const loadMembership = useCallback(async () => {
    if (!post?.id) {
      setInModule(new Set())
      return
    }
    setLoading(true)
    const [{ data: u }, { data: a }] = await Promise.all([
      supabase.from('post_modules_user').select('module_id').eq('post_id', post.id),
      supabase.from('post_modules_ai').select('module_id').eq('post_id', post.id),
    ])
    const s = new Set<string>()
    for (const r of u || []) s.add(r.module_id as string)
    for (const r of a || []) s.add(r.module_id as string)
    setInModule(s)
    setLoading(false)
  }, [post?.id])

  useEffect(() => {
    if (open && post) void loadMembership()
  }, [open, post, loadMembership])

  useEffect(() => {
    if (!open || !post?.user_id) return
    let cancelled = false
    void supabase
      .from('profiles')
      .select('modules_ai_enabled')
      .eq('id', post.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setModulesAiEnabled(data?.modules_ai_enabled !== false)
      })
    return () => {
      cancelled = true
    }
  }, [open, post?.user_id])

  async function toggle(moduleId: string, next: boolean) {
    if (!post?.id) return
    setBusyId(moduleId)
    if (next) {
      await clearAiSuppressionForModule(supabase, post.id, moduleId)
      await supabase.from('post_modules_user').insert({ post_id: post.id, module_id: moduleId })
      await supabase.from('post_modules_ai').delete().eq('post_id', post.id).eq('module_id', moduleId)
    } else {
      const { error: rmErr } = await removePostFromModule(supabase, post.id, moduleId)
      if (rmErr) {
        alert(rmErr)
        setBusyId(null)
        return
      }
    }
    await loadMembership()
    await classifyPostAfterSave(post.id)
    onUpdated?.()
    setBusyId(null)
  }

  if (!open || !post) return null

  const active = modules.filter((m) => m.is_active)

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-h-[min(80vh,520px)] overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-modules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 id="post-modules-title" className="text-base font-semibold text-zinc-900">
            Modules
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Done
          </button>
        </div>
        <p className="border-b border-zinc-50 px-4 py-2 text-xs text-zinc-500">
          Check to pin a module; uncheck to remove. Removed modules stay off until you check them again (we won’t auto-place the post back there).
          {modulesAiEnabled
            ? ' We may suggest other modules in the background.'
            : ' Automatic AI sorting is off in Settings → Modules — only manual choices apply.'}
        </p>
        <div className="max-h-[min(60vh,400px)] overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
          ) : active.length === 0 ? (
            <p className="text-sm text-zinc-500">Add modules in Settings → Modules first.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((m) => {
                const checked = inModule.has(m.id)
                const busy = busyId === m.id
                return (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2.5 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(e) => void toggle(m.id, e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span className="text-sm font-medium text-zinc-900">{m.name}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
