import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { FollowButton } from '@/src/components/FollowButton'
import { PostCard } from '@/src/components/PostCard'
import type { Post } from '@/src/lib/post-helpers'
import { buildPublicPostUrl, isPublicPostIdParam } from '@/src/lib/public-post-url'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import { authorMetaForRethingFromUsername, mergeProfilesForRethingUsernames } from '@/src/lib/merge-rething-author-profiles'

export const revalidate = 300

const RESERVED = new Set(['auth', 'api', 'settings', 'whos-here', 'notifications', 'bookmarks'])
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || 'https://thingsilike.app'

type PublicPostPageData = {
  profile: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
  post: Post | null
  rethingFromAvatarUrl: string | null
}

const getPublicPostPageData = unstable_cache(
  async (slug: string, postId: string): Promise<PublicPostPageData | null> => {
    const supabase = createSupabaseServer()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('username', slug)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message)
    }
    if (!profile) return null

    const normalizedProfile = {
      id: profile.id as string,
      username: profile.username as string,
      display_name: typeof profile.display_name === 'string' ? profile.display_name : null,
      avatar_url: typeof profile.avatar_url === 'string' ? profile.avatar_url.trim() || null : null,
    }

    const { data: row, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', normalizedProfile.id)
      .maybeSingle()

    if (postError) {
      throw new Error(postError.message)
    }
    if (!row) {
      return {
        profile: normalizedProfile,
        post: null,
        rethingFromAvatarUrl: null,
      }
    }

    const post = row as Post
    const authorLookup = {
      [normalizedProfile.id]: {
        username: normalizedProfile.username,
        display_name: normalizedProfile.display_name,
        avatar_url: normalizedProfile.avatar_url,
      },
    }
    await mergeProfilesForRethingUsernames(supabase, [post], authorLookup)
    const rethingOrig = authorMetaForRethingFromUsername(authorLookup, post.rething_from_username)

    return {
      profile: normalizedProfile,
      post,
      rethingFromAvatarUrl: rethingOrig?.avatar_url ?? null,
    }
  },
  ['public-post-page-v1'],
  { revalidate: 300 },
)

const getPublicPostMetadataData = unstable_cache(
  async (slug: string, postId: string) => {
    const supabase = createSupabaseServer()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('username', slug)
      .maybeSingle()

    if (!profile) return null

    const { data: post } = await supabase
      .from('posts')
      .select('type, caption, content')
      .eq('id', postId)
      .eq('user_id', profile.id)
      .maybeSingle()

    return {
      profile: {
        id: profile.id as string,
        username: profile.username as string,
        display_name: typeof profile.display_name === 'string' ? profile.display_name : null,
      },
      post: post
        ? {
            type: typeof post.type === 'string' ? post.type : '',
            caption: typeof post.caption === 'string' ? post.caption : null,
            content: typeof post.content === 'string' ? post.content : null,
          }
        : null,
    }
  },
  ['public-post-metadata-v1'],
  { revalidate: 300 },
)

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

  const metadataData = await getPublicPostMetadataData(slug, postId)
  if (!metadataData?.profile) {
    return { title: 'Post · Things I Like', openGraph: { siteName: 'Things I Like' }, twitter: { card: 'summary_large_image' } }
  }

  const { profile, post } = metadataData

  const handle = profile.username
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

  let data: PublicPostPageData | null = null
  try {
    data = await getPublicPostPageData(slug, postId)
  } catch (error) {
    console.error('[username/postId] public post loader failed:', slug, postId, error)
    notFound()
  }
  if (!data) notFound()

  const { profile, post, rethingFromAvatarUrl } = data
  const shareUrl = buildPublicPostUrl(SITE_ORIGIN, profile.username, postId)
  const returnPath = `/${profile.username}/${postId}`
  const displayName =
    (typeof profile.display_name === 'string' && profile.display_name.trim()) || `@${profile.username}`

  if (!post) {
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

  const avatarUrl = profile.avatar_url?.trim() || ''

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
          rethingFromAvatarUrl={rethingFromAvatarUrl}
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
