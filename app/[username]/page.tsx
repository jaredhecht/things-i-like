import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ElsewhereProfileGlobe } from '@/src/components/ElsewhereProfileGlobe'
import { FollowButton } from '@/src/components/FollowButton'
import { ProfilePostList } from '@/src/components/ProfilePostList'
import type { ElsewhereLinkRow } from '@/src/lib/elsewhere'
import { fetchAllPostsForUserId } from '@/src/lib/posts-batched'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import type { Post } from '@/src/lib/post-helpers'

export const dynamic = 'force-dynamic'

const RESERVED = new Set(['auth', 'api', 'settings', 'whos-here', 'notifications', 'bookmarks'])

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params
  const slug = decodeURIComponent(raw).toLowerCase()
  if (RESERVED.has(slug)) notFound()

  const supabase = createSupabaseServer()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, elsewhere_visible')
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

  const bioTrimmed = typeof profile.bio === 'string' ? profile.bio.trim() : ''

  const elsewhereVisible = profile.elsewhere_visible === true
  let elsewhereLinks: ElsewhereLinkRow[] = []
  if (elsewhereVisible) {
    const { data: ewRows } = await supabase
      .from('elsewhere_links')
      .select('id, user_id, platform, slug, label, favicon_url, sort_order')
      .eq('user_id', profile.id)
      .order('sort_order', { ascending: true })
    elsewhereLinks = (ewRows || []) as ElsewhereLinkRow[]
  }

  let list: Post[] = []
  try {
    list = await fetchAllPostsForUserId(supabase, profile.id)
  } catch (e) {
    console.error('[username] posts query failed:', slug, e)
    throw e
  }

  const initialLikeCounts: Record<string, number> = {}
  for (const p of list) initialLikeCounts[p.id] = 0
  if (list.length > 0) {
    const ids = list.map((p) => p.id)
    const chunkSize = 120
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize)
      const { data: countRows, error: countErr } = await supabase.rpc('post_like_counts', { post_ids: slice })
      if (countErr) {
        console.warn('[username] post_like_counts RPC failed — run supabase/post-like-counts-rpc.sql:', countErr.message)
        break
      }
      for (const row of countRows || []) {
        const r = row as Record<string, unknown>
        const pid = typeof r.post_id === 'string' ? r.post_id : String(r.post_id ?? '')
        const lc = r.like_count
        const n = typeof lc === 'number' ? lc : typeof lc === 'string' ? parseInt(lc, 10) : Number(lc)
        if (pid) initialLikeCounts[pid] = Number.isFinite(n) ? n : 0
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 shrink-0 rounded-full border border-zinc-200 object-cover"
                />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-500"
                  aria-hidden
                >
                  {profile.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <h1 className="min-w-0 text-2xl font-light leading-none tracking-tight text-zinc-900 sm:text-3xl">
                @{profile.username}
              </h1>
            </div>
            {bioTrimmed ? (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 sm:mt-3 whitespace-pre-wrap break-words">
                {bioTrimmed}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
            {elsewhereVisible && elsewhereLinks.length > 0 ? (
              <ElsewhereProfileGlobe profileUsername={profile.username} links={elsewhereLinks} />
            ) : null}
            <FollowButton followingId={profile.id} profileUsername={profile.username} />
          </div>
        </header>

        <ProfilePostList key={profile.id} posts={list} initialLikeCounts={initialLikeCounts} />
      </div>
    </main>
  )
}
