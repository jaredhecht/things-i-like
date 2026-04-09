'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/src/components/AuthProvider'
import { oauthSignInRedirectOptions } from '@/src/lib/oauth-redirect'
import { supabase } from '@/src/lib/supabase'

type NotifRow = {
  id: string
  type: 'follow' | 'like'
  actor_id: string | null
  post_id: string | null
  read_at: string | null
  created_at: string
}

const NOTIFICATIONS_PAGE_SIZE = 20

function NotificationsListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className={`px-4 py-4 ${index === 0 ? '' : 'border-t border-zinc-200'}`}
        >
          <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200" />
          <div className="mt-2 h-3 w-32 animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  )
}

export default function NotificationsPage() {
  const { authResolved, user } = useAuth()
  const userId = user?.id ?? null
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [rows, setRows] = useState<NotifRow[]>([])
  const [actorNames, setActorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadActorNames = useCallback(async (list: NotifRow[]) => {
    const actorIds = [...new Set(list.map((n) => n.actor_id).filter(Boolean))] as string[]
    if (actorIds.length === 0) return
    const { data: actors } = await supabase.from('profiles').select('id, username').in('id', actorIds)
    const map: Record<string, string> = {}
    for (const a of actors || []) map[a.id] = a.username
    setActorNames((prev) => ({ ...prev, ...map }))
  }, [])

  const loadPage = useCallback(async (uid: string, page: number, replace = false) => {
    const from = page * NOTIFICATIONS_PAGE_SIZE
    const to = from + NOTIFICATIONS_PAGE_SIZE - 1
    const { data: notifs, error } = await supabase
      .from('notifications')
      .select('id, type, actor_id, post_id, read_at, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw new Error(error.message)

    const list = (notifs || []) as NotifRow[]
    setRows((prev) => (replace ? list : [...prev, ...list]))
    setHasMore(list.length === NOTIFICATIONS_PAGE_SIZE)
    await loadActorNames(list)
  }, [loadActorNames])

  const load = useCallback(async (uid: string | null) => {
    setLoading(true)
    setLoadError(null)
    if (!uid) {
      setMyUsername(null)
      setRows([])
      setActorNames({})
      setHasMore(false)
      setLoading(false)
      return
    }
    const { data: prof } = await supabase.from('profiles').select('username').eq('id', uid).maybeSingle()
    setMyUsername(typeof prof?.username === 'string' ? prof.username : null)
    setActorNames({})
    try {
      await loadPage(uid, 0, true)
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load notifications.')
      setRows([])
      setActorNames({})
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [loadPage])

  useEffect(() => {
    if (!authResolved) return
    void load(userId)
  }, [authResolved, load, userId])

  async function loadMore() {
    if (!userId || loadingMore || !hasMore) return
    setLoadingMore(true)
    setLoadError(null)
    try {
      const nextPage = Math.floor(rows.length / NOTIFICATIONS_PAGE_SIZE)
      await loadPage(userId, nextPage)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load more notifications.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-lg px-4 py-10">
          <p className="mb-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
          <div className="mb-6 h-8 w-56 animate-pulse rounded bg-zinc-200" />
          <NotificationsListSkeleton />
        </div>
      </main>
    )
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-lg px-4 py-10">
          <p className="mb-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
          <h1 className="text-2xl font-light text-zinc-900">Notifications</h1>
          <p className="mt-4 text-sm text-zinc-500">Sign in to see notifications.</p>
          <button
            type="button"
            onClick={() =>
              void supabase.auth.signInWithOAuth({
                provider: 'google',
                options: oauthSignInRedirectOptions('/notifications'),
              })
            }
            className="mt-4 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <h1 className="mb-6 text-2xl font-light tracking-tight text-zinc-900">Notifications</h1>

        {loadError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Could not load notifications. Run <code className="rounded bg-white px-1">supabase/notifications.sql</code> in the
            Supabase SQL editor if you have not already.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-zinc-400">You&apos;re all caught up.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              {rows.map((n) => {
                const actor = n.actor_id ? actorNames[n.actor_id] : null
                const at = actor ? `@${actor}` : 'Someone'
                const postHref =
                  n.type === 'like' && n.post_id && myUsername ? `/${myUsername}#post-${n.post_id}` : null
                return (
                  <li key={n.id} className="px-4 py-3 text-sm">
                    {n.type === 'follow' ? (
                      <p className="text-zinc-800">
                        <Link href={actor ? `/${actor}` : '/'} className="font-medium text-zinc-900 hover:underline">
                          {at}
                        </Link>{' '}
                        followed you.
                      </p>
                    ) : (
                      <p className="text-zinc-800">
                        <Link href={actor ? `/${actor}` : '/'} className="font-medium text-zinc-900 hover:underline">
                          {at}
                        </Link>{' '}
                        liked your post
                        {postHref ? (
                          <>
                            {' '}
                            ·{' '}
                            <Link href={postHref} className="text-blue-600 hover:underline">
                              View
                            </Link>
                          </>
                        ) : null}
                        .
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      {new Date(n.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </li>
                )
              })}
            </ul>
            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load 20 more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
