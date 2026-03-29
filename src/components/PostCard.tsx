'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { linkifyAtMentionsInHtml } from '@/src/lib/linkify-mentions'
import {
  extractFirstSoundCloudUrl,
  getHostnameLabel,
  getLinkPreviewFromMetadata,
  getSoundCloudWidgetSrc,
  getSpotifyEmbedUrl,
  getYouTubeVideoId,
  isSoundCloudUrl,
  isValidHttpUrl,
  normalizeSoundCloudStoredContent,
  type LinkPreview,
  type Post,
} from '@/src/lib/post-helpers'
import { parsePostTags } from '@/src/lib/post-tags'

function PlainWithMentions({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = /^@([a-zA-Z0-9_]+)$/.exec(part)
        if (m) {
          return (
            <Link key={i} href={`/${m[1]}`} className="text-blue-600 underline">
              {part}
            </Link>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17l-.022.012-.007.003-.002.001h-.002Z" />
      </svg>
    )
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  )
}

function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v15.75l-6-3.375-6 3.375V4.5Z" />
      </svg>
    )
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v15.75l-6-3.375-6 3.375V4.5Z" />
    </svg>
  )
}

/** Retweet / reblog style (two opposing arrows). */
function RethingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

export function PostCard({
  post,
  isOwner,
  authorUsername,
  authorAvatarUrl,
  showAuthor,
  dashboardActions,
  /** Saved-posts list: show bookmark (and likes/rethings when not your post). */
  bookmarksFeed,
  profileLikeBar,
  likeCount = 0,
  liked,
  onLike,
  bookmarked,
  onBookmark,
  onRething,
  menuOpen,
  onMenuToggle,
  onEditClick,
  onDeleteClick,
}: {
  post: Post
  isOwner?: boolean
  authorUsername?: string | null
  authorAvatarUrl?: string | null
  showAuthor?: boolean
  dashboardActions?: boolean
  bookmarksFeed?: boolean
  /** Public profile: positive counts show heart and a numeric count only; zero likes show nothing. */
  profileLikeBar?: boolean
  likeCount?: number
  liked?: boolean
  onLike?: () => void
  bookmarked?: boolean
  onBookmark?: () => void
  onRething?: () => void
  menuOpen?: boolean
  onMenuToggle?: () => void
  onEditClick?: () => void
  onDeleteClick?: () => void
}) {
  const router = useRouter()
  const postDate = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const htmlBody = useMemo(() => linkifyAtMentionsInHtml(post.content || ''), [post.content])
  const htmlCaption = useMemo(() => linkifyAtMentionsInHtml(post.caption || ''), [post.caption])
  const soundCloudInText = useMemo(
    () => (post.type === 'text' && post.content ? extractFirstSoundCloudUrl(post.content) : null),
    [post.type, post.content],
  )

  const scTarget = useMemo(() => {
    if (post.type === 'soundcloud' && post.content) return normalizeSoundCloudStoredContent(post.content)
    if (post.type === 'text' && soundCloudInText) return normalizeSoundCloudStoredContent(soundCloudInText)
    return ''
  }, [post.type, post.content, soundCloudInText])

  const [scResolvedPermalink, setScResolvedPermalink] = useState<string | null>(null)

  useEffect(() => {
    setScResolvedPermalink(null)
    if (!scTarget || !isSoundCloudUrl(scTarget)) return
    const controller = new AbortController()
    void (async () => {
      try {
        const r = await fetch(`/api/soundcloud-resolve?url=${encodeURIComponent(scTarget)}`, {
          signal: controller.signal,
        })
        if (!r.ok) return
        const data = (await r.json()) as { resolvedUrl?: string }
        if (controller.signal.aborted) return
        if (typeof data.resolvedUrl === 'string' && isSoundCloudUrl(data.resolvedUrl)) {
          setScResolvedPermalink(data.resolvedUrl)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => controller.abort()
  }, [scTarget])

  const scPermalink = (scResolvedPermalink && isSoundCloudUrl(scResolvedPermalink) ? scResolvedPermalink : null) || scTarget
  const soundCloudWidgetSrc =
    post.type === 'text' && soundCloudInText && scTarget ? getSoundCloudWidgetSrc(scPermalink) : null
  const soundCloudPostSrc =
    post.type === 'soundcloud' && scTarget ? getSoundCloudWidgetSrc(scPermalink) : null

  function handleRichTextLinkClick(e: React.MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href')
    if (href && /^\/[a-zA-Z0-9_]+$/.test(href)) {
      e.preventDefault()
      router.push(href)
    }
  }

  const quoteAuthor = typeof post.metadata?.author === 'string' ? post.metadata.author : ''
  const storedLinkPreview = getLinkPreviewFromMetadata(post.metadata)
  const [liveLinkPreview, setLiveLinkPreview] = useState<LinkPreview | null>(storedLinkPreview)
  const renderPrettyLinkCard = !!post.content && !!liveLinkPreview?.title

  useEffect(() => {
    if (post.type !== 'article' || !post.content || liveLinkPreview?.title || !isValidHttpUrl(post.content)) return
    const controller = new AbortController()
    const loadPreview = async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(post.content || '')}`, { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        if (controller.signal.aborted) return
        setLiveLinkPreview({
          url: typeof data.url === 'string' ? data.url : post.content || '',
          siteName: typeof data.siteName === 'string' ? data.siteName : '',
          title: typeof data.title === 'string' ? data.title : '',
          description: typeof data.description === 'string' ? data.description : '',
          image: typeof data.image === 'string' ? data.image : '',
        })
      } catch {
        // Keep fallback rendering if preview request fails.
      }
    }
    void loadPreview()
    return () => controller.abort()
  }, [liveLinkPreview?.title, post.content, post.type])

  const postTags = useMemo(() => parsePostTags(post.tags), [post.tags])
  const hasTags = postTags.length > 0

  const showEngagement =
    dashboardActions &&
    (bookmarksFeed
      ? Boolean(onBookmark || (!isOwner && (onLike || onRething)))
      : !isOwner && Boolean(onLike || onRething || onBookmark))
  const showProfileLikeRow = profileLikeBar && likeCount > 0
  const showProfileActions = profileLikeBar && (showProfileLikeRow || !!onBookmark)
  const showFooterDivider = showEngagement || showProfileActions || hasTags
  const originalHandle = post.rething_from_username?.trim()
  /** Own posts on the signed-in dashboard: avatar only (room for ⋮). Else show @handle. */
  const showAuthorHandle = Boolean(
    authorUsername && !(isOwner && dashboardActions),
  )

  const avatarImg = authorAvatarUrl ? (
    <img
      src={authorAvatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="h-8 w-8 shrink-0 rounded-full border border-zinc-200 object-cover"
    />
  ) : (
    <div className="h-8 w-8 shrink-0 rounded-full border border-zinc-200 bg-zinc-100" aria-hidden />
  )

  return (
    <article id={`post-${post.id}`} className="scroll-mt-24 rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="relative mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          {originalHandle ? (
            <p className="mb-1 text-xs text-zinc-500">
              Rething from{' '}
              <Link href={`/${originalHandle}`} className="font-medium text-zinc-700 hover:underline">
                @{originalHandle}
              </Link>
            </p>
          ) : null}
          <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{post.type}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showAuthor && authorUsername ? (
            <Link
              href={`/${authorUsername}`}
              className="flex max-w-[min(100%,12rem)] items-center gap-2 rounded-md py-0.5 pl-0.5 pr-1 hover:bg-zinc-50"
              aria-label={showAuthorHandle ? `@${authorUsername}` : `Your profile @${authorUsername}`}
            >
              {avatarImg}
              {showAuthorHandle ? (
                <span className="truncate text-sm font-medium text-zinc-800">@{authorUsername}</span>
              ) : null}
            </Link>
          ) : null}
          {isOwner ? (
            <div className="relative shrink-0" data-post-menu-root>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Post options"
                onClick={(e) => {
                  e.stopPropagation()
                  onMenuToggle?.()
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="6" r="1.75" />
                  <circle cx="12" cy="12" r="1.75" />
                  <circle cx="12" cy="18" r="1.75" />
                </svg>
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 top-full z-10 mt-0.5 min-w-[148px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => onEditClick?.()}
                  >
                    Edit post
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteClick?.()}
                  >
                    Delete post
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {post.type === 'youtube' && post.content ? (
        getYouTubeVideoId(post.content) ? (
          <div className="relative mb-4 w-full overflow-hidden rounded-md bg-black" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`https://www.youtube.com/embed/${getYouTubeVideoId(post.content)}`}
              className="absolute left-0 top-0 h-full w-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-3 block break-all text-blue-600 hover:underline">
            {post.content}
          </a>
        )
      ) : null}

      {post.type === 'spotify' && post.content ? (
        getSpotifyEmbedUrl(post.content) ? (
          <iframe
            src={getSpotifyEmbedUrl(post.content) || ''}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="mb-4 rounded-md"
          />
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-3 block break-all text-blue-600 hover:underline">
            {post.content}
          </a>
        )
      ) : null}

      {post.type === 'soundcloud' && post.content ? (
        soundCloudPostSrc ? (
          <div className="mb-4 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            <iframe
              key={scPermalink}
              title="SoundCloud"
              src={soundCloudPostSrc}
              width="100%"
              height={300}
              className="block w-full border-0"
              allow="autoplay"
              loading="lazy"
            />
          </div>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-3 block break-all text-blue-600 hover:underline">
            {post.content}
          </a>
        )
      ) : null}

      {post.type === 'image' && post.content ? (
        <a
          href={post.content}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex min-h-[100px] items-center justify-center overflow-hidden rounded-md bg-white p-1"
        >
          <img
            src={post.content}
            alt="Post image"
            className="mx-auto block h-auto w-auto max-h-[min(60vh,520px)] max-w-full object-contain"
          />
        </a>
      ) : null}

      {post.type === 'article' && post.content ? (
        renderPrettyLinkCard ? (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block overflow-hidden rounded-md border border-zinc-200 hover:bg-zinc-50">
            {liveLinkPreview?.image ? <img src={liveLinkPreview.image} alt={liveLinkPreview.title} className="h-48 w-full object-cover" /> : null}
            <div className="p-4">
              <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{liveLinkPreview?.siteName || getHostnameLabel(post.content)}</p>
              <p className="mb-1 text-sm font-semibold text-zinc-900">{liveLinkPreview?.title}</p>
              {liveLinkPreview?.description ? <p className="line-clamp-2 text-sm text-zinc-500">{liveLinkPreview.description}</p> : null}
            </div>
          </a>
        ) : (
          <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-4 block rounded-md border border-zinc-200 p-4 hover:bg-zinc-50">
            <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{getHostnameLabel(post.content)}</p>
            <p className="break-all text-sm font-medium text-zinc-800">{post.content}</p>
          </a>
        )
      ) : null}

      {post.type === 'quote' && (
        <>
          <blockquote className="mb-2 text-xl font-light italic leading-relaxed text-zinc-900">
            &ldquo;
            <PlainWithMentions text={post.content || ''} />
            &rdquo;
          </blockquote>
          {quoteAuthor ? <p className="mb-3 text-sm italic text-zinc-500">- {quoteAuthor}</p> : null}
        </>
      )}

      {post.type === 'text' && post.content ? (
        <>
          <div
            role="presentation"
            onClick={handleRichTextLinkClick}
            className="mb-2 leading-relaxed text-zinc-800 [&_a]:text-blue-600 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
          {soundCloudWidgetSrc ? (
            <div className="mb-4 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
              <iframe
                key={scPermalink}
                title="SoundCloud"
                src={soundCloudWidgetSrc}
                width="100%"
                height={300}
                className="block w-full border-0"
                allow="autoplay"
                loading="lazy"
              />
            </div>
          ) : null}
        </>
      ) : null}
      {!['youtube', 'spotify', 'soundcloud', 'image', 'article', 'quote', 'text'].includes(post.type) && post.content ? (
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-2 block break-all text-blue-600 hover:underline">
          {post.content}
        </a>
      ) : null}

      {post.caption ? (
        <div
          role="presentation"
          onClick={handleRichTextLinkClick}
          className="mb-2 text-sm text-zinc-500 [&_a]:text-blue-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: htmlCaption }}
        />
      ) : null}

      {hasTags ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {postTags.map((t) => (
            <Link
              key={t}
              href={`/tag/${encodeURIComponent(t)}`}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900"
            >
              #{t}
            </Link>
          ))}
        </div>
      ) : null}

      <div
        className={`flex items-center justify-between gap-3 ${showFooterDivider ? 'mt-3 border-t border-zinc-100 pt-3' : 'mt-1 pt-0.5'}`}
      >
        <p className="text-xs text-zinc-300">{postDate}</p>
        {showEngagement ? (
          <div className="flex shrink-0 items-center justify-end gap-1">
            {onLike ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onLike}
                  aria-label={liked ? 'Unlike' : 'Like'}
                  aria-pressed={liked}
                  className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                    liked
                      ? 'text-red-500 hover:bg-red-50'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                >
                  <HeartIcon filled={!!liked} className="h-5 w-5" />
                </button>
                {likeCount > 0 ? (
                  <span className="min-w-[1.25rem] pr-1 text-xs tabular-nums text-zinc-500">{likeCount}</span>
                ) : null}
              </div>
            ) : null}
            {onBookmark ? (
              <button
                type="button"
                onClick={onBookmark}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                aria-pressed={bookmarked}
                className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                  bookmarked
                    ? 'text-amber-600 hover:bg-amber-50'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <BookmarkIcon filled={!!bookmarked} className="h-5 w-5" />
              </button>
            ) : null}
            {onRething ? (
              <button
                type="button"
                onClick={onRething}
                aria-label="Rething"
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1"
              >
                <RethingIcon className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : showProfileActions ? (
          <div className="flex shrink-0 items-center justify-end gap-1">
            {showProfileLikeRow ? (
              onLike ? (
                <>
                  <button
                    type="button"
                    onClick={onLike}
                    aria-label={liked ? 'Unlike' : 'Like'}
                    aria-pressed={liked}
                    className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                      liked
                        ? 'text-red-500 hover:bg-red-50'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                    }`}
                  >
                    <HeartIcon filled={!!liked} className="h-5 w-5" />
                  </button>
                  <span className="min-w-[1.25rem] pr-1 text-xs tabular-nums text-zinc-500" aria-label={`${likeCount} likes`}>
                    {likeCount}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-0.5" aria-label={`${likeCount} likes`}>
                  <span className="inline-flex rounded-full p-2 text-zinc-500" aria-hidden>
                    <HeartIcon filled={false} className="h-5 w-5" />
                  </span>
                  <span className="min-w-[1.25rem] pr-1 text-xs tabular-nums text-zinc-500">{likeCount}</span>
                </span>
              )
            ) : null}
            {onBookmark ? (
              <button
                type="button"
                onClick={onBookmark}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                aria-pressed={bookmarked}
                className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                  bookmarked
                    ? 'text-amber-600 hover:bg-amber-50'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <BookmarkIcon filled={!!bookmarked} className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
