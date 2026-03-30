'use client'

import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { oauthSignInRedirectOptions } from '@/src/lib/oauth-redirect'
import { supabase } from '@/src/lib/supabase'

export function FollowButton({
  followingId,
  profileUsername,
  oauthReturnTo,
  onFollowChange,
}: {
  followingId: string
  profileUsername: string
  /** Path after sign-in (e.g. `/whos-here`). Defaults to `/{profileUsername}`. */
  oauthReturnTo?: string
  /** Called after a successful follow or unfollow (not on initial load). */
  onFollowChange?: () => void
}) {
  const [user, setUser] = useState<User | null>(null)
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser()
    setUser(u)
    if (!u) {
      setFollowing(false)
      setLoading(false)
      return
    }
    if (u.id === followingId) {
      setFollowing(false)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', u.id)
      .eq('following_id', followingId)
      .maybeSingle()
    setFollowing(!!data)
    setLoading(false)
  }, [followingId])

  useEffect(() => {
    void refresh()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh()
    })
    return () => subscription.unsubscribe()
  }, [refresh])

  async function signInWithGoogle() {
    if (typeof window === 'undefined') return
    const path = oauthReturnTo
      ? oauthReturnTo.startsWith('/')
        ? oauthReturnTo
        : `/${oauthReturnTo}`
      : `/${profileUsername}`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: oauthSignInRedirectOptions(path),
    })
  }

  async function toggleFollow() {
    if (!user || user.id === followingId || busy) return
    setBusy(true)
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', followingId)
      setFollowing(false)
      onFollowChange?.()
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: followingId })
      if (error) alert(error.message)
      else {
        setFollowing(true)
        onFollowChange?.()
      }
    }
    setBusy(false)
  }

  if (loading) {
    return <span className="inline-block h-9 w-24 animate-pulse rounded-full bg-zinc-200" aria-hidden />
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        Follow
      </button>
    )
  }

  if (user.id === followingId) {
    return (
      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50"
      >
        <svg
          className="h-[1.125rem] w-[1.125rem]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggleFollow()}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        following ? 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50' : 'border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800'
      }`}
    >
      {busy ? '…' : following ? 'Following' : 'Follow'}
    </button>
  )
}
