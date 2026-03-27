import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FollowButton } from '@/src/components/FollowButton'
import { PostCard } from '@/src/components/PostCard'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import type { Post } from '@/src/lib/post-helpers'

const RESERVED = new Set(['auth', 'api'])

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params
  const slug = decodeURIComponent(raw).toLowerCase()
  if (RESERVED.has(slug)) notFound()

  const supabase = createSupabaseServer()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', slug)
    .maybeSingle()

  if (profileError) {
    console.error('[username] profiles query failed:', slug, profileError.message)
    notFound()
  }
  if (!profile) {
    // Either no user with this handle, or RLS is blocking anon reads (run supabase/policies-profiles-select-public.sql).
    notFound()
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  const list = (posts || []) as Post[]

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-zinc-900">
              {profile.display_name?.trim() || `@${profile.username}`}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">@{profile.username}</p>
          </div>
          <div className="shrink-0 sm:pt-1">
            <FollowButton followingId={profile.id} profileUsername={profile.username} />
          </div>
        </header>

        <section className="space-y-6">
          {list.length === 0 ? <p className="py-12 text-center text-zinc-400">No posts yet.</p> : null}
          {list.map((post) => (
            <PostCard key={post.id} post={post} showAuthor={false} />
          ))}
        </section>
      </div>
    </main>
  )
}
