'use client'

import { useEffect, useRef, useState } from 'react'
import { buildPublicPostUrl } from '@/src/lib/public-post-url'

function ShareIcon({ className }: { className?: string }) {
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
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  )
}

function LinkChainIcon({ className }: { className?: string }) {
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
      <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
      <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
    </svg>
  )
}

export function SharePostButton({
  url,
  title = 'Post on Things I Like',
  disabled,
}: {
  url: string
  title?: string
  disabled?: boolean
}) {
  const ready = Boolean(url.trim()) && !disabled
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const el = e.target as Node | null
      if (el && rootRef.current?.contains(el)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function copyLink() {
    if (!ready) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  async function shareVia() {
    if (!ready || !canWebShare) return
    try {
      await navigator.share({ url, title })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative inline-flex" data-share-menu-root>
      <button
        type="button"
        disabled={!ready}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share post"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 data-[active]:bg-zinc-100"
        data-active={open || undefined}
      >
        <ShareIcon className="h-5 w-5" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-[80] mb-1 min-w-[220px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              void copyLink()
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
          >
            <LinkChainIcon className="h-4 w-4 shrink-0 text-zinc-800" />
            Copy link
          </button>
          {canWebShare ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                void shareVia()
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
            >
              <ShareIcon className="h-4 w-4 shrink-0 text-zinc-800" />
              Share post via…
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Builds `/username/postId` on the client after mount so SSR markup stays stable. */
export function PostShareControl({ username, postId }: { username: string; postId: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    setUrl(buildPublicPostUrl(window.location.origin, username, postId))
  }, [username, postId])

  return (
    <SharePostButton
      url={url}
      disabled={!url}
    />
  )
}
