'use client'

import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

export function FollowButton({
  followingId,
  profileUsername,
}: {
  followingId: string
  profileUsername: string
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
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/${profileUsername}` : undefined
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  async function toggleFollow() {
    if (!user || user.id === followingId || busy) return
    setBusy(true)
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', followingId)
      setFollowing(false)
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: followingId })
      if (error) alert(error.message)
      else setFollowing(true)
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
      <span className="text-sm text-zinc-400" aria-live="polite">
        This is you
      </span>
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
