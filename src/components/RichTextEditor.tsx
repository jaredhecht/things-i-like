'use client'

import { type RefObject, useEffect } from 'react'
import { normalizeLinkUrl, stripHtml } from '@/src/lib/post-helpers'

export function RichTextEditor({
  value,
  onChange,
  onFocus,
  placeholder,
  className,
  editorRef,
  maxPlainTextLength,
  onProfilePathNavigate,
}: {
  value: string
  onChange: (html: string) => void
  onFocus: () => void
  placeholder: string
  className: string
  editorRef: RefObject<HTMLDivElement | null>
  maxPlainTextLength?: number
  onProfilePathNavigate?: (path: string) => void
}) {
  useEffect(() => {
    if (!editorRef.current) return
    const isFocused = document.activeElement === editorRef.current
    if (!isFocused && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [editorRef, value])

  return (
    <div className="relative">
      {stripHtml(value).length === 0 ? (
        <div className="pointer-events-none absolute left-0 top-0 text-sm text-[#b8b8b8]">{placeholder}</div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={className}
        onFocus={onFocus}
        onClick={(e) => {
          const t = e.target as HTMLElement | null
          if (t?.closest('a')) {
            const a = t.closest('a') as HTMLAnchorElement
            const href = a.getAttribute('href')
            if (href) {
              if (/^\/[a-zA-Z0-9_]+$/.test(href)) {
                e.preventDefault()
                onProfilePathNavigate?.(href)
                return
              }
              e.preventDefault()
              try {
                const url = new URL(href, window.location.href)
                window.open(url.href, '_blank', 'noopener,noreferrer')
              } catch {
                window.open(normalizeLinkUrl(href), '_blank', 'noopener,noreferrer')
              }
            }
          }
        }}
        onInput={(e) => {
          const nextHtml = e.currentTarget.innerHTML
          if (maxPlainTextLength && stripHtml(nextHtml).length > maxPlainTextLength) {
            e.currentTarget.innerHTML = value
            return
          }
          onChange(nextHtml)
        }}
      />
    </div>
  )
}
