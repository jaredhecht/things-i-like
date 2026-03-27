'use client'

import { useCallback, useEffect, useState } from 'react'
import { PostCard } from '@/src/components/PostCard'
import { supabase } from '@/src/lib/supabase'
import type { Post } from '@/src/lib/post-helpers'

export function ProfilePostList({
  posts,
  initialLikeCounts,
}: {
  posts: Post[]
  initialLikeCounts: Record<string, number>
}) {
  const [userId, setUserId] = useState<string | null>(null)
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() => ({ ...initialLikeCounts }))
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(() => new Set())

  const hydrateMyEngagement = useCallback(async (uid: string, ids: string[]) => {
    if (ids.length === 0) {
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      return
    }
    const my = new Set<string>()
    const marks = new Set<string>()
    const chunk = 500
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const { data: likeRows } = await supabase.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', slice)
      for (const row of likeRows || []) my.add(row.post_id as string)
      const { data: bmRows } = await supabase.from('post_bookmarks').select('post_id').eq('user_id', uid).in('post_id', slice)
      for (const row of bmRows || []) marks.add(row.post_id as string)
    }
    setLikedPostIds(my)
    setBookmarkedPostIds(marks)
  }, [])

  /** Browser RPC (anon) — reliable if RSC/PostgREST batching missed counts on the server. */
  useEffect(() => {
    const ids = posts.map((p) => p.id)
    if (ids.length === 0) return

    const baseline: Record<string, number> = {}
    for (const id of ids) baseline[id] = 0

    let cancelled = false
    const chunk = 120
    void (async () => {
      const next = { ...baseline }
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk)
        const { data, error } = await supabase.rpc('post_like_counts', { post_ids: slice })
        if (cancelled) return
        if (error) {
          console.error('[ProfilePostList] post_like_counts:', error.message)
          continue
        }
        for (const row of data || []) {
          const r = row as Record<string, unknown>
          const pid = typeof r.post_id === 'string' ? r.post_id : String(r.post_id ?? '')
          const lc = r.like_count
          const n = typeof lc === 'number' ? lc : typeof lc === 'string' ? parseInt(lc, 10) : Number(lc)
          if (pid) next[pid] = Number.isFinite(n) ? n : 0
        }
      }
      if (!cancelled) setLikeCounts(next)
    })()

    return () => {
      cancelled = true
    }
  }, [posts])

  useEffect(() => {
    const ids = posts.map((p) => p.id)
    void supabase.auth.getUser().then(({ data: { user } }) => {
      const uid = user?.id ?? null
      setUserId(uid)
      if (uid) void hydrateMyEngagement(uid, ids)
      else {
        setLikedPostIds(new Set())
        setBookmarkedPostIds(new Set())
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (uid) void hydrateMyEngagement(uid, ids)
      else {
        setLikedPostIds(new Set())
        setBookmarkedPostIds(new Set())
      }
    })
    return () => subscription.unsubscribe()
  }, [posts, hydrateMyEngagement])

  async function toggleLike(postId: string) {
    if (!userId) return
    const liked = likedPostIds.has(postId)
    if (liked) {
      const { error } = await supabase.from('post_likes').delete().eq('user_id', userId).eq('post_id', postId)
      if (error) {
        alert(error.message)
        return
      }
      setLikedPostIds((prev) => {
        const n = new Set(prev)
        n.delete(postId)
        return n
      })
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }))
    } else {
      const { error } = await supabase.from('post_likes').insert({ user_id: userId, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setLikedPostIds((prev) => new Set(prev).add(postId))
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }))
    }
  }

  async function toggleBookmark(postId: string) {
    if (!userId) return
    const marked = bookmarkedPostIds.has(postId)
    if (marked) {
      const { error } = await supabase.from('post_bookmarks').delete().eq('user_id', userId).eq('post_id', postId)
      if (error) {
        alert(error.message)
        return
      }
      setBookmarkedPostIds((prev) => {
        const n = new Set(prev)
        n.delete(postId)
        return n
      })
    } else {
      const { error } = await supabase.from('post_bookmarks').insert({ user_id: userId, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setBookmarkedPostIds((prev) => new Set(prev).add(postId))
    }
  }

  return (
    <section className="space-y-6">
      {posts.length === 0 ? <p className="py-12 text-center text-zinc-400">No posts yet.</p> : null}
      {posts.map((post) => {
        const n = likeCounts[post.id] ?? 0
        const canInteract = Boolean(userId && post.user_id && post.user_id !== userId)
        return (
          <PostCard
            key={post.id}
            post={post}
            showAuthor={false}
            profileLikeBar
            likeCount={n}
            liked={likedPostIds.has(post.id)}
            onLike={canInteract && n > 0 ? () => void toggleLike(post.id) : undefined}
            bookmarked={bookmarkedPostIds.has(post.id)}
            onBookmark={canInteract ? () => void toggleBookmark(post.id) : undefined}
          />
        )
      })}
    </section>
  )
}
