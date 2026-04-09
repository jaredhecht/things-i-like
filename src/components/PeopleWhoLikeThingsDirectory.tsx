'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { FollowButton } from '@/src/components/FollowButton'
import { supabase } from '@/src/lib/supabase'

export type DirectoryProfileRow = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  post_count: number
}

const ONBOARDING_RECOMMENDATION_LIMIT = 15

export function PeopleWhoLikeThingsDirectory({
  currentUserId,
  refreshKey,
  onFollowChanged,
  onboardingOnly = false,
}: {
  currentUserId: string
  refreshKey: number
  onFollowChanged: () => void
  /** When true (home pick-people onboarding), only list users who have posted at least once. */
  onboardingOnly?: boolean
}) {
  const [rows, setRows] = useState<DirectoryProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('profiles_directory_by_total_likes')
    if (rpcErr) {
      setError(rpcErr.message)
      setRows([])
      setLoading(false)
      return
    }
    const list = (data || []) as Record<string, unknown>[]
    const parsed: DirectoryProfileRow[] = list
      .map((r) => {
        const id = typeof r.id === 'string' ? r.id : String(r.id ?? '')
        const pc = r.post_count
        const n = typeof pc === 'number' ? pc : typeof pc === 'string' ? parseInt(pc, 10) : Number(pc)
        return {
          id,
          username: typeof r.username === 'string' ? r.username : '',
          display_name: typeof r.display_name === 'string' ? r.display_name : null,
          avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
          post_count: Number.isFinite(n) ? n : 0,
        }
      })
      .filter((r) => r.id && r.id !== currentUserId)
    setRows(
      onboardingOnly
        ? parsed.filter((r) => r.post_count >= 1).slice(0, ONBOARDING_RECOMMENDATION_LIMIT)
        : parsed,
    )
    setLoading(false)
  }, [currentUserId, onboardingOnly])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load, refreshKey])

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 border-b border-zinc-100 py-3">
            <div className="h-11 w-11 rounded-full bg-zinc-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-zinc-200" />
              <div className="h-3 w-24 rounded bg-zinc-100" />
            </div>
            <div className="h-9 w-24 rounded-full bg-zinc-200" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-6 text-sm text-red-600">
        Couldn&apos;t load people list. Run{' '}
        <code className="rounded bg-zinc-100 px-1 text-xs">supabase/profiles-directory-by-total-likes-rpc.sql</code> in Supabase,
        then refresh.
      </p>
    )
  }

  if (rows.length === 0) {
    return <p className="text-center text-sm text-zinc-400">No one else here yet. Invite a friend.</p>
  }

  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      {rows.map((row) => {
        const label = row.display_name?.trim() || `@${row.username}`
        const avatar = row.avatar_url?.trim()
        const profileHref = `/${row.username}`
        return (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={profileHref} className="shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full border border-zinc-200 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-500">
                  {row.username.slice(0, 1).toUpperCase()}
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={profileHref} className="block truncate font-medium text-zinc-900 hover:underline">
                {label}
              </Link>
              <Link href={profileHref} className="block truncate text-sm text-zinc-500 hover:underline">
                @{row.username}
              </Link>
            </div>
            <div className="shrink-0">
              <FollowButton
                followingId={row.id}
                profileUsername={row.username}
                oauthReturnTo="/"
                onFollowChange={onFollowChanged}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
