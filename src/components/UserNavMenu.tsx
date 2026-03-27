'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08-.07-.19C11.23 8.84 13.5 4 13.5 4L18 3l-1 7h3.5c.49 0 .56.23.5.66l-.08.09C18.93 11.71 17.5 15 17.5 15L12 16l-1 5z" />
    </svg>
  )
}

export function UserNavMenu({
  username,
  avatarUrl,
  onSignOut,
  hasUnreadNotifications,
}: {
  username: string | null
  avatarUrl?: string | null
  onSignOut: () => void
  hasUnreadNotifications?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="flex items-center gap-0.5">
      <Link
        href="/notifications"
        className={`rounded-full p-2 transition-colors hover:bg-zinc-100 ${
          hasUnreadNotifications ? 'text-amber-500' : 'text-zinc-400'
        }`}
        aria-label={hasUnreadNotifications ? 'Notifications (unread)' : 'Notifications'}
      >
        <LightningIcon className="h-5 w-5" />
      </Link>
      <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-2.5 text-sm shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600">
            {(username || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="max-w-[8rem] truncate text-zinc-700">{username ? `@${username}` : 'Account'}</span>
        <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          {username ? (
            <Link
              href={`/${username}`}
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Your blog <span className="text-zinc-500">@{username}</span>
            </Link>
          ) : null}
          <Link
            href="/whos-here"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Who&apos;s Here?
          </Link>
          <Link
            href="/notifications"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Notifications
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <div className="my-1 border-t border-zinc-100" />
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-sm text-zinc-600 hover:bg-zinc-50"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
      </div>
    </div>
  )
}
