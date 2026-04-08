import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ElsewhereProfileGlobe } from '@/src/components/ElsewhereProfileGlobe'
import { FollowButton } from '@/src/components/FollowButton'
import { ProfileModuleRails, type ProfileModuleRail } from '@/src/components/ProfileModuleRails'
import { ProfilePostList } from '@/src/components/ProfilePostList'
import type { ElsewhereLinkRow } from '@/src/lib/elsewhere'
import { fetchAllPostsForUserId } from '@/src/lib/posts-batched'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import type { Post } from '@/src/lib/post-helpers'
import { mergeProfilesForRethingUsernames, type RethingAuthorMeta } from '@/src/lib/merge-rething-author-profiles'

export const dynamic = 'force-dynamic'

const RESERVED = new Set(['auth', 'api', 'settings', 'whos-here', 'notifications', 'bookmarks'])

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params
  const slug = decodeURIComponent(raw).toLowerCase()
  if (RESERVED.has(slug)) notFound()

  const supabase = createSupabaseServer()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, elsewhere_visible')
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

  const postById = new Map(list.map((p) => [p.id, p]))
  let moduleRails: ProfileModuleRail[] = []
  const { data: modRows, error: modErr } = await supabase
    .from('profile_modules')
    .select('id, name, sort_order, is_active')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!modErr && modRows && modRows.length > 0 && list.length > 0) {
    const moduleIds = modRows.map((m) => m.id as string)
    const { data: puAll } = await supabase.from('post_modules_user').select('post_id, module_id').in('module_id', moduleIds)
    const { data: paAll } = await supabase.from('post_modules_ai').select('post_id, module_id').in('module_id', moduleIds)
    const byMod = new Map<string, Set<string>>()
    for (const id of moduleIds) byMod.set(id, new Set())
    for (const r of puAll || []) byMod.get(r.module_id as string)?.add(r.post_id as string)
    for (const r of paAll || []) byMod.get(r.module_id as string)?.add(r.post_id as string)
    for (const m of modRows) {
      const mid = m.id as string
      const pids = [...(byMod.get(mid) || [])]
      const posts = pids.map((id) => postById.get(id)).filter(Boolean) as Post[]
      posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (posts.length > 0) moduleRails.push({ id: mid, name: m.name as string, posts })
    }
  }

  const authorByUserId: Record<string, RethingAuthorMeta> = {
    [profile.id]: {
      username: profile.username as string,
      display_name: typeof profile.display_name === 'string' ? profile.display_name : null,
      avatar_url: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
    },
  }
  await mergeProfilesForRethingUsernames(supabase, list, authorByUserId)
  const profileAvatarUrl = typeof profile.avatar_url === 'string' ? profile.avatar_url : null

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

        {moduleRails.length > 0 ? (
          <ProfileModuleRails
            profileUserId={profile.id}
            profileUsername={profile.username}
            profileAvatarUrl={profileAvatarUrl}
            authorByUserId={authorByUserId}
            rails={moduleRails}
            initialLikeCounts={initialLikeCounts}
          />
        ) : null}

        <ProfilePostList
          key={profile.id}
          profileUsername={profile.username}
          profileAvatarUrl={profileAvatarUrl}
          authorByUserId={authorByUserId}
          posts={list}
          initialLikeCounts={initialLikeCounts}
        />
      </div>
    </main>
  )
}
