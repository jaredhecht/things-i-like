import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FollowButton } from '@/src/components/FollowButton'
import { PostCard } from '@/src/components/PostCard'
import type { Post } from '@/src/lib/post-helpers'
import { buildPublicPostUrl, isPublicPostIdParam } from '@/src/lib/public-post-url'
import { getSiteOrigin } from '@/src/lib/site-origin'
import { createSupabaseServer } from '@/src/lib/supabase-server'

export const dynamic = 'force-dynamic'

const RESERVED = new Set(['auth', 'api', 'settings', 'whos-here', 'notifications', 'bookmarks'])

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; postId: string }>
}): Promise<Metadata> {
  const { username: raw, postId } = await params
  if (!isPublicPostIdParam(postId)) {
    return { title: 'Post · Things I Like', openGraph: { siteName: 'Things I Like' }, twitter: { card: 'summary_large_image' } }
  }
  const slug = decodeURIComponent(raw).toLowerCase()
  if (RESERVED.has(slug)) {
    return { title: 'Post · Things I Like', openGraph: { siteName: 'Things I Like' }, twitter: { card: 'summary_large_image' } }
  }

  const supabase = createSupabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', slug)
    .maybeSingle()

  if (!profile) {
    return { title: 'Post · Things I Like', openGraph: { siteName: 'Things I Like' }, twitter: { card: 'summary_large_image' } }
  }

  const { data: post } = await supabase
    .from('posts')
    .select('type, caption, content')
    .eq('id', postId)
    .eq('user_id', profile.id)
    .maybeSingle()

  const handle = profile.username as string
  if (!post) {
    return {
      title: `Post · @${handle}`,
      openGraph: {
        title: `Post · @${handle}`,
        siteName: 'Things I Like',
        type: 'article',
        url: `/${slug}/${postId}`,
      },
      twitter: { card: 'summary_large_image', title: `Post · @${handle}` },
    }
  }

  const titleHint =
    (typeof post.caption === 'string' && post.caption.replace(/<[^>]+>/g, '').trim().slice(0, 56)) ||
    (post.type === 'quote' && typeof post.content === 'string' && post.content.trim().slice(0, 56)) ||
    `${post.type} · @${handle}`

  const name = (typeof profile.display_name === 'string' && profile.display_name.trim()) || `@${handle}`
  const pageTitle = `${titleHint} — ${name}`
  const desc = `A post by ${name} on Things I Like.`
  return {
    title: pageTitle,
    description: desc,
    openGraph: {
      title: pageTitle,
      description: desc,
      url: `/${slug}/${postId}`,
      siteName: 'Things I Like',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: desc,
    },
  }
}

export default async function PublicPostPage({ params }: { params: Promise<{ username: string; postId: string }> }) {
  const { username: raw, postId } = await params
  const slug = decodeURIComponent(raw).toLowerCase()
  if (RESERVED.has(slug)) notFound()
  if (!isPublicPostIdParam(postId)) notFound()

  const supabase = createSupabaseServer()
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', slug)
    .maybeSingle()

  if (profileError) {
    console.error('[username/postId] profile:', profileError.message)
    notFound()
  }
  if (!profile) notFound()

  const { data: row } = await supabase.from('posts').select('*').eq('id', postId).eq('user_id', profile.id).maybeSingle()

  const origin = await getSiteOrigin()
  const shareUrl = buildPublicPostUrl(origin, profile.username as string, postId)
  const returnPath = `/${profile.username}/${postId}`
  const displayName =
    (typeof profile.display_name === 'string' && profile.display_name.trim()) || `@${profile.username}`

  if (!row) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-sm text-zinc-600">This post is no longer available.</p>
          <p className="mt-4">
            <Link href={`/${profile.username}`} className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">
              See @{profile.username}&apos;s profile
            </Link>
          </p>
          <p className="mt-3">
            <Link href="/" className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
        </div>
      </main>
    )
  }

  const post = row as Post
  const avatarUrl = typeof profile.avatar_url === 'string' ? profile.avatar_url.trim() : ''

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-zinc-200 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-full border border-zinc-200 object-cover"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-base font-medium text-zinc-500"
                aria-hidden
              >
                {(profile.username as string).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-zinc-900">{displayName}</p>
              <p className="text-sm text-zinc-500">@{profile.username}</p>
            </div>
          </div>
          <div className="shrink-0">
            <FollowButton
              followingId={profile.id as string}
              profileUsername={profile.username as string}
              oauthReturnTo={returnPath}
            />
          </div>
        </header>

        <PostCard
          post={post}
          isOwner={false}
          authorUsername={profile.username as string}
          authorAvatarUrl={avatarUrl || null}
          showAuthor={false}
          shareUrl={shareUrl}
        />

        <div className="mt-5 space-y-2 text-center text-sm text-zinc-500">
          <p>
            <Link
              href={`/${profile.username}`}
              className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800"
            >
              See everything @{profile.username} likes →
            </Link>
          </p>
          <p>
            <Link href="/" className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800">
              ← Things I Like
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
