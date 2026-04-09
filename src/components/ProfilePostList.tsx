'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/src/components/AuthProvider'
import { InlinePostEditor } from '@/src/components/InlinePostEditor'
import { PostCard } from '@/src/components/PostCard'
import { supabase } from '@/src/lib/supabase'
import type { Post } from '@/src/lib/post-helpers'
import { fetchRethingCountsForPostIds } from '@/src/lib/rething-counts'
import { authorMetaForRethingFromUsername, type RethingAuthorMeta } from '@/src/lib/merge-rething-author-profiles'

export function ProfilePostList({
  profileUsername,
  profileAvatarUrl,
  authorByUserId,
  posts,
  initialLikeCounts,
}: {
  profileUsername: string
  profileAvatarUrl: string | null
  authorByUserId: Record<string, RethingAuthorMeta>
  posts: Post[]
  initialLikeCounts: Record<string, number>
}) {
  const router = useRouter()
  const { authResolved, user } = useAuth()
  const userId = user?.id ?? null
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() => ({ ...initialLikeCounts }))
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(() => new Set())
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [rethingCounts, setRethingCounts] = useState<Record<string, number>>({})

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
    if (ids.length === 0) {
      setRethingCounts({})
      return
    }
    let cancelled = false
    void (async () => {
      const next = await fetchRethingCountsForPostIds(supabase, ids)
      if (!cancelled) setRethingCounts(next)
    })()
    return () => {
      cancelled = true
    }
  }, [posts])

  useEffect(() => {
    const ids = posts.map((p) => p.id)
    if (!authResolved) return
    if (userId) void hydrateMyEngagement(userId, ids)
    else {
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
    }
  }, [authResolved, posts, hydrateMyEngagement, userId])

  useEffect(() => {
    if (!postMenuOpenId) return
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el && !el.closest('[data-post-menu-root]')) setPostMenuOpenId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [postMenuOpenId])

  useEffect(() => {
    if (!postMenuOpenId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPostMenuOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [postMenuOpenId])

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
        const isOwner = Boolean(userId && post.user_id === userId)
        const rethingOrig = authorMetaForRethingFromUsername(authorByUserId, post.rething_from_username)
        return (
          <div key={post.id}>
            <PostCard
              post={post}
              isOwner={isOwner}
              authorUsername={profileUsername}
              authorAvatarUrl={profileAvatarUrl}
              rethingFromAvatarUrl={rethingOrig?.avatar_url ?? null}
              showAuthor={false}
              profileLikeBar
              likeCount={n}
              rethingCount={rethingCounts[post.id] ?? 0}
              liked={likedPostIds.has(post.id)}
              onLike={canInteract && n > 0 ? () => void toggleLike(post.id) : undefined}
              bookmarked={bookmarkedPostIds.has(post.id)}
              onBookmark={canInteract ? () => void toggleBookmark(post.id) : undefined}
              shareAuthorUsername={profileUsername}
              menuOpen={postMenuOpenId === post.id}
              onMenuToggle={() => setPostMenuOpenId((cur) => (cur === post.id ? null : post.id))}
              onEditClick={
                isOwner
                  ? () => {
                      setEditingPostId(post.id)
                      setPostMenuOpenId(null)
                    }
                  : undefined
              }
            />
            {isOwner && userId && editingPostId === post.id ? (
              <InlinePostEditor
                post={post}
                userId={userId}
                onCancel={() => setEditingPostId(null)}
                onSaved={() => {
                  setEditingPostId(null)
                  router.refresh()
                }}
              />
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
