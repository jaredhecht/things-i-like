'use client'

import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PostCard } from '@/src/components/PostCard'
import { UserNavMenu } from '@/src/components/UserNavMenu'
import type { Post } from '@/src/lib/post-helpers'
import { fetchEngagementForPostIds } from '@/src/lib/engagement-client'
import { fetchRethingCountsForPostIds } from '@/src/lib/rething-counts'
import { supabase } from '@/src/lib/supabase'

type AuthorMeta = {
  username: string
  display_name: string | null
  avatar_url?: string | null
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url?: string | null
}

export function TagFeed({
  tag,
  initialPosts,
  initialAuthors,
}: {
  tag: string
  initialPosts: Post[]
  initialAuthors: Record<string, AuthorMeta>
}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts] = useState<Post[]>(initialPosts)
  const [authorByUserId] = useState(initialAuthors)
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<Set<string>>(() => new Set())
  const [rethingCounts, setRethingCounts] = useState<Record<string, number>>({})

  const hydrateEngagement = useCallback(async (userId: string, list: Post[]) => {
    if (list.length === 0) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
      return
    }
    const ids = list.map((p) => p.id)
    const { likeCounts: countByPost, likedPostIds: my, bookmarkedPostIds: bookmarks } = await fetchEngagementForPostIds(
      supabase,
      userId,
      ids,
    )
    const rethingByPost = await fetchRethingCountsForPostIds(supabase, ids)
    setLikeCounts(countByPost)
    setLikedPostIds(my)
    setBookmarkedPostIds(bookmarks)
    setRethingCounts(rethingByPost)
  }, [])

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) setProfile(data as Profile)
    else setProfile(null)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u)
      if (u) void loadProfile(u.id)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) void loadProfile(u.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setLikeCounts({})
      setLikedPostIds(new Set())
      setBookmarkedPostIds(new Set())
      setRethingCounts({})
      return
    }
    void hydrateEngagement(user.id, posts)
  }, [user?.id, posts, hydrateEngagement])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function toggleBookmark(postId: string) {
    if (!user?.id) return
    const marked = bookmarkedPostIds.has(postId)
    if (marked) {
      const { error } = await supabase.from('post_bookmarks').delete().eq('user_id', user.id).eq('post_id', postId)
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
      const { error } = await supabase.from('post_bookmarks').insert({ user_id: user.id, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setBookmarkedPostIds((prev) => new Set(prev).add(postId))
    }
  }

  async function toggleLike(postId: string) {
    if (!user?.id) return
    const liked = likedPostIds.has(postId)
    if (liked) {
      const { error } = await supabase.from('post_likes').delete().eq('user_id', user.id).eq('post_id', postId)
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
      const { error } = await supabase.from('post_likes').insert({ user_id: user.id, post_id: postId })
      if (error) {
        alert(error.message)
        return
      }
      setLikedPostIds((prev) => new Set(prev).add(postId))
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }))
    }
  }

  const avatarUrl =
    (profile?.avatar_url as string | undefined) || (user?.user_metadata?.avatar_url as string | undefined)

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1">
              <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
                ← Things I Like
              </Link>
            </p>
            <h1 className="text-2xl font-light tracking-tight text-zinc-900">
              <span className="text-zinc-400">#</span>
              {tag}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Posts tagged with #{tag}</p>
          </div>
          {user ? (
            <UserNavMenu
              username={profile?.username ?? null}
              avatarUrl={avatarUrl}
              onSignOut={signOut}
              hasUnreadNotifications={false}
            />
          ) : null}
        </header>

        <section className="space-y-6">
          {posts.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">No posts with this tag yet.</p>
          ) : null}
          {posts.map((post) => {
            const author = post.user_id ? authorByUserId[post.user_id] : undefined
            return (
              <PostCard
                key={post.id}
                post={post}
                isOwner={user?.id === post.user_id}
                authorUsername={author?.username ?? null}
                authorAvatarUrl={author?.avatar_url ?? null}
                showAuthor={!!author?.username}
                dashboardActions={!!user}
                likeCount={likeCounts[post.id] ?? 0}
                rethingCount={rethingCounts[post.id] ?? 0}
                liked={likedPostIds.has(post.id)}
                onLike={user?.id && post.user_id !== user.id ? () => void toggleLike(post.id) : undefined}
                bookmarked={bookmarkedPostIds.has(post.id)}
                onBookmark={user?.id && post.user_id !== user.id ? () => void toggleBookmark(post.id) : undefined}
                shareAuthorUsername={author?.username ?? null}
              />
            )
          })}
        </section>
      </div>
    </main>
  )
}
