'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/src/components/AuthProvider'
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
  const { authResolved, user } = useAuth()
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadFollowState = useCallback(async (userId: string | null) => {
    if (!userId) {
      setFollowing(false)
      setLoading(false)
      return
    }
    if (userId === followingId) {
      setFollowing(false)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', userId)
      .eq('following_id', followingId)
      .maybeSingle()
    setFollowing(!!data)
    setLoading(false)
  }, [followingId])

  useEffect(() => {
    if (!authResolved) return
    setLoading(true)
    void loadFollowState(user?.id ?? null)
  }, [authResolved, loadFollowState, user?.id])

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

  if (!authResolved || loading) {
    return <span className="inline-block h-7 w-[4.25rem] animate-pulse rounded-full bg-zinc-200" aria-hidden />
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/90"
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
      className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
        following
          ? 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
          : 'border border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200/90'
      }`}
    >
      {busy ? '…' : following ? 'Following' : 'Follow'}
    </button>
  )
}
