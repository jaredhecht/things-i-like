'use client'

import { useState } from 'react'

export function DirectoryAvatar({
  src,
  username,
  className = 'h-11 w-11',
}: {
  src?: string | null
  username: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const trimmedSrc = typeof src === 'string' ? src.trim() : ''

  if (!trimmedSrc || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-500 ${className}`}
      >
        {username.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={trimmedSrc}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`rounded-full border border-zinc-200 object-cover ${className}`}
    />
  )
}
