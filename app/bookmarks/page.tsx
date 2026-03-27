'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { PostCard } from '@/src/components/PostCard'
import { supabase } from '@/src/lib/supabase'
import type { Post } from '@/src/lib/post-helpers'

type AuthorMeta = {
  username: string
  display_name: string | null
  avatar_url: string | null
}

export default function BookmarksPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState<Post[]>([])
  const [authorByUserId, setAuthorByUserId] = useState<Record<string, AuthorMeta>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    setUser(u)
    if (!u) {
      setPosts([])
      setAuthorByUserId({})
      setLikeCounts({})
      setLikedPostIds(new Set())
      setLoading(false)
      return
    }

    const { data: marks, error: markErr } = await supabase
      .from('post_bookmarks')
      .select('post_id, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })

    if (markErr) {
      console.error('[bookmarks]', markErr.message)
      setPosts([])
      setAuthorByUserId({})
      setLoading(false)
      return
    }

    const ids = (marks || []).map((m) => m.post_id as string)
    if (ids.length === 0) {
      setPosts([])
      setAuthorByUserId({})
      setLikeCounts({})
      setLikedPostIds(new Set())
      setLoading(false)
      return
    }

    const { data: rows, error: postErr } = await supabase.from('posts').select('*').in('id', ids)
    if (postErr) {
      console.error('[bookmarks]', postErr.message)
      setPosts([])
      setLoading(false)
      return
    }

    const order = new Map(ids.map((id, i) => [id, i]))
    const list = ((rows || []) as Post[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const authorIds = [...new Set(list.map((p) => p.user_id).filter(Boolean))] as string[]
    const map: Record<string, AuthorMeta> = {}
    if (authorIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', authorIds)
      for (const p of profs || []) {
        map[p.id] = {
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url ?? null,
        }
      }
    }
    setPosts(list)
    setAuthorByUserId(map)

    const countByPost: Record<string, number> = {}
    const myLiked = new Set<string>()
    const chunk = 500
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const { data: likesRows } = await supabase.from('post_likes').select('post_id, user_id').in('post_id', slice)
      for (const row of likesRows || []) {
        countByPost[row.post_id] = (countByPost[row.post_id] || 0) + 1
        if (row.user_id === u.id) myLiked.add(row.post_id)
      }
    }
    setLikeCounts(countByPost)
    setLikedPostIds(myLiked)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => void load())
    return () => subscription.unsubscribe()
  }, [load])

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

  async function removeBookmark(postId: string) {
    if (!user?.id) return
    const { error } = await supabase.from('post_bookmarks').delete().eq('user_id', user.id).eq('post_id', postId)
    if (error) {
      alert(error.message)
      return
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <p className="mb-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
          <h1 className="text-2xl font-light text-zinc-900">Bookmarks</h1>
          <p className="mt-4 text-sm text-zinc-500">Sign in to see posts you&apos;ve saved.</p>
          <button
            type="button"
            onClick={() =>
              void supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/bookmarks` : undefined },
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="mb-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <h1 className="mb-6 text-2xl font-light tracking-tight text-zinc-900">Bookmarks</h1>
        <p className="mb-8 text-sm text-zinc-500">Posts you saved from other people.</p>

        {posts.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-400">No bookmarks yet. Save posts from your feed or someone&apos;s profile.</p>
        ) : (
          <section className="space-y-6">
            {posts.map((post) => {
              const author = post.user_id ? authorByUserId[post.user_id] : undefined
              return (
                <PostCard
                  key={post.id}
                  post={post}
                  isOwner={user.id === post.user_id}
                  authorUsername={author?.username ?? null}
                  authorAvatarUrl={author?.avatar_url ?? null}
                  showAuthor={!!author?.username}
                  dashboardActions
                  bookmarksFeed
                  likeCount={likeCounts[post.id] ?? 0}
                  liked={likedPostIds.has(post.id)}
                  onLike={post.user_id && post.user_id !== user.id ? () => void toggleLike(post.id) : undefined}
                  bookmarked
                  onBookmark={() => void removeBookmark(post.id)}
                />
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
