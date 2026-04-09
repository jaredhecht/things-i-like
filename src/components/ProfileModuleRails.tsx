'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/src/components/AuthProvider'
import { InlinePostEditor } from '@/src/components/InlinePostEditor'
import { PostCard } from '@/src/components/PostCard'
import { PostModulesSheet } from '@/src/components/PostModulesSheet'
import { removePostFromModule } from '@/src/lib/modules-client'
import type { ProfileModuleRow } from '@/src/lib/modules-ui'
import { classifyPostAfterSave } from '@/src/lib/modules-ui'
import type { Post } from '@/src/lib/post-helpers'
import { fetchRethingCountsForPostIds } from '@/src/lib/rething-counts'
import { supabase } from '@/src/lib/supabase'
import { authorMetaForRethingFromUsername, type RethingAuthorMeta } from '@/src/lib/merge-rething-author-profiles'

/** Matches profile page main background for scroll-edge fades. */
const RAIL_PAGE_BG = '#fafafa'

function ModuleHorizontalStrip({
  title,
  postCount,
  children,
}: {
  title: ReactNode
  postCount: number
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const can = scrollWidth > clientWidth + 2
    setShowLeft(can && scrollLeft > 2)
    setShowRight(can && scrollLeft < scrollWidth - clientWidth - 2)
  }, [])

  useEffect(() => {
    measure()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [measure, postCount])

  return (
    <>
      <div className="mb-3 min-w-0">{title}</div>
      <div className="relative -mx-4">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-10 transition-opacity duration-200"
          style={{
            opacity: showLeft ? 1 : 0,
            background: `linear-gradient(to right, ${RAIL_PAGE_BG}, transparent)`,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 transition-opacity duration-200"
          style={{
            opacity: showRight ? 1 : 0,
            background: `linear-gradient(to left, ${RAIL_PAGE_BG}, transparent)`,
          }}
          aria-hidden
        />
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto px-4 pb-2 pt-0.5 scroll-smooth [scrollbar-width:thin]"
        >
          {children}
        </div>
      </div>
    </>
  )
}

export type ProfileModuleRail = { id: string; name: string; posts: Post[] }

export function ProfileModuleRails({
  profileUserId,
  profileUsername,
  profileAvatarUrl,
  authorByUserId,
  rails,
  initialLikeCounts,
}: {
  profileUserId: string
  profileUsername: string
  profileAvatarUrl: string | null
  authorByUserId: Record<string, RethingAuthorMeta>
  rails: ProfileModuleRail[]
  initialLikeCounts: Record<string, number>
}) {
  const router = useRouter()
  const { authResolved, user } = useAuth()
  const userId = user?.id ?? null
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() => ({ ...initialLikeCounts }))
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(() => new Set())
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [modulesPost, setModulesPost] = useState<Post | null>(null)
  const [myModules, setMyModules] = useState<ProfileModuleRow[]>([])
  const [removeBusyKey, setRemoveBusyKey] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [rethingCounts, setRethingCounts] = useState<Record<string, number>>({})

  const isOwnProfile = Boolean(userId && userId === profileUserId)

  const allRailPostIds = rails.flatMap((r) => r.posts.map((p) => p.id))

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

  useEffect(() => {
    setLikeCounts({ ...initialLikeCounts })
  }, [initialLikeCounts])

  useEffect(() => {
    if (allRailPostIds.length === 0) return
    let cancelled = false
    const baseline: Record<string, number> = {}
    for (const id of allRailPostIds) baseline[id] = 0
    const chunk = 120
    void (async () => {
      const next = { ...baseline, ...initialLikeCounts }
      for (let i = 0; i < allRailPostIds.length; i += chunk) {
        const slice = allRailPostIds.slice(i, i + chunk)
        const { data, error } = await supabase.rpc('post_like_counts', { post_ids: slice })
        if (cancelled) return
        if (error) continue
        for (const row of data || []) {
          const r = row as Record<string, unknown>
          const pid = typeof r.post_id === 'string' ? r.post_id : String(r.post_id ?? '')
          const lc = r.like_count
          const n = typeof lc === 'number' ? lc : typeof lc === 'string' ? parseInt(lc, 10) : Number(lc)
          if (pid) next[pid] = Number.isFinite(n) ? n : 0
        }
      }
      if (!cancelled) setLikeCounts((prev) => ({ ...prev, ...next }))
    })()
    return () => {
      cancelled = true
    }
  }, [allRailPostIds.join(','), initialLikeCounts])

  useEffect(() => {
    if (allRailPostIds.length === 0) {
      setRethingCounts({})
      return
    }
    let cancelled = false
    void (async () => {
      const next = await fetchRethingCountsForPostIds(supabase, allRailPostIds)
      if (!cancelled) setRethingCounts(next)
    })()
    return () => {
      cancelled = true
    }
  }, [allRailPostIds.join(',')])

  useEffect(() => {
    if (!authResolved) return
    if (userId) void hydrateMyEngagement(userId, allRailPostIds)
    else {
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
    }
  }, [allRailPostIds.join(','), authResolved, hydrateMyEngagement, userId])

  useEffect(() => {
    if (!isOwnProfile) {
      setMyModules([])
      return
    }
    void supabase
      .from('profile_modules')
      .select('id, name, sort_order, is_active')
      .eq('user_id', profileUserId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => setMyModules((data || []) as ProfileModuleRow[]))
  }, [isOwnProfile, profileUserId])

  useEffect(() => {
    if (!menuOpenId) return
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el && !el.closest('[data-post-menu-root]')) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpenId])

  useEffect(() => {
    if (!menuOpenId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpenId])

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

  async function removeFromRail(postId: string, moduleId: string) {
    const key = `${moduleId}:${postId}`
    setRemoveBusyKey(key)
    const { error } = await removePostFromModule(supabase, postId, moduleId)
    setRemoveBusyKey(null)
    if (error) {
      alert(error)
      return
    }
    void classifyPostAfterSave(postId)
    router.refresh()
  }

  if (rails.length === 0) return null

  return (
    <div className="mb-10">
      {rails.map((rail, idx) => (
        <section key={rail.id} className={idx > 0 ? 'mt-10 border-t border-zinc-200/90 pt-10' : undefined}>
          <ModuleHorizontalStrip
            postCount={rail.posts.length}
            title={<h2 className="text-sm font-semibold text-zinc-800">{rail.name}</h2>}
          >
            {rail.posts.map((post) => {
              const n = likeCounts[post.id] ?? 0
              const canInteract = Boolean(userId && post.user_id && post.user_id !== userId)
              const busyRemove = removeBusyKey === `${rail.id}:${post.id}`
              const rethingOrig = authorMetaForRethingFromUsername(authorByUserId, post.rething_from_username)
              return (
                <div key={post.id} className="w-[min(100vw-2rem,320px)] shrink-0">
                  <PostCard
                    post={post}
                    isOwner={isOwnProfile}
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
                    menuOpen={menuOpenId === post.id}
                    onMenuToggle={() => setMenuOpenId((cur) => (cur === post.id ? null : post.id))}
                    onEditClick={
                      isOwnProfile
                        ? () => {
                            setEditingPost(post)
                            setMenuOpenId(null)
                          }
                        : undefined
                    }
                    onModulesClick={
                      isOwnProfile
                        ? () => {
                            setModulesPost(post)
                            setMenuOpenId(null)
                          }
                        : undefined
                    }
                  />
                  {isOwnProfile && userId && editingPost?.id === post.id ? (
                    <InlinePostEditor
                      post={post}
                      userId={userId}
                      onCancel={() => setEditingPost(null)}
                      onSaved={() => {
                        setEditingPost(null)
                        router.refresh()
                      }}
                    />
                  ) : null}
                  {isOwnProfile ? (
                    <button
                      type="button"
                      disabled={busyRemove}
                      onClick={() => void removeFromRail(post.id, rail.id)}
                      className="mt-2 w-full text-left text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-[3px] hover:text-zinc-600 disabled:opacity-50"
                    >
                      {busyRemove ? 'Removing…' : `Remove from “${rail.name}”`}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </ModuleHorizontalStrip>
        </section>
      ))}

      <div className="mt-10 border-t border-zinc-200/80 pt-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">All the things</p>
      </div>

      <PostModulesSheet
        post={modulesPost}
        modules={myModules}
        open={modulesPost !== null}
        onClose={() => setModulesPost(null)}
        onUpdated={() => {
          setModulesPost(null)
          router.refresh()
        }}
      />
    </div>
  )
}
