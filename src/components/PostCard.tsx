'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getHostnameLabel,
  getLinkPreviewFromMetadata,
  getSpotifyEmbedUrl,
  getYouTubeVideoId,
  isValidHttpUrl,
  type LinkPreview,
  type Post,
} from '@/src/lib/post-helpers'

export function PostCard({
  post,
  isOwner,
  authorUsername,
  showAuthor,
  dashboardActions,
  likeCount = 0,
  liked,
  onLike,
  onRething,
  menuOpen,
  onMenuToggle,
  onEditClick,
  onDeleteClick,
}: {
  post: Post
  isOwner?: boolean
  authorUsername?: string | null
  showAuthor?: boolean
  dashboardActions?: boolean
  likeCount?: number
  liked?: boolean
  onLike?: () => void
  onRething?: () => void
  menuOpen?: boolean
  onMenuToggle?: () => void
  onEditClick?: () => void
  onDeleteClick?: () => void
}) {
  const postDate = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

  const showEngagement = dashboardActions && !isOwner && (onLike || onRething)
  const originalHandle = post.rething_from_username?.trim()

  return (
    <article className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="relative mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {originalHandle ? (
            <p className="mb-1 text-xs text-zinc-500">
              Rething from{' '}
              <Link href={`/${originalHandle}`} className="font-medium text-zinc-700 hover:underline">
                @{originalHandle}
              </Link>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{post.type}</p>
            {showAuthor && authorUsername ? (
              <>
                <span className="text-zinc-300">·</span>
                <Link href={`/${authorUsername}`} className="text-[11px] font-medium tracking-tight text-zinc-600 hover:underline">
                  @{authorUsername}
                </Link>
              </>
            ) : null}
          </div>
        </div>
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
        <iframe
          title="SoundCloud"
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(post.content)}`}
          width="100%"
          height="120"
          className="mb-4 rounded-md"
        />
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
          <blockquote className="mb-2 text-xl font-light italic leading-relaxed text-zinc-900">&ldquo;{post.content}&rdquo;</blockquote>
          {quoteAuthor ? <p className="mb-3 text-sm italic text-zinc-500">- {quoteAuthor}</p> : null}
        </>
      )}

      {post.type === 'text' && post.content ? <div className="mb-2 leading-relaxed text-zinc-800 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: post.content }} /> : null}
      {!['youtube', 'spotify', 'soundcloud', 'image', 'article', 'quote', 'text'].includes(post.type) && post.content ? (
        <a href={post.content} target="_blank" rel="noopener noreferrer" className="mb-2 block break-all text-blue-600 hover:underline">
          {post.content}
        </a>
      ) : null}

      {post.caption ? <div className="mb-2 text-sm text-zinc-500 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: post.caption }} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-300">{postDate}</p>
        {showEngagement ? (
          <div className="flex items-center gap-3">
            {onLike ? (
              <button
                type="button"
                onClick={onLike}
                className={`text-xs font-medium ${liked ? 'text-red-600' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                {liked ? '♥ Liked' : '♡ Like'} {likeCount > 0 ? `(${likeCount})` : ''}
              </button>
            ) : null}
            {onRething ? (
              <button type="button" onClick={onRething} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
                Rething
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
