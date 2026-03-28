export type Post = {
  id: string
  type: string
  content: string | null
  caption: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user_id: string | null
  rething_of_post_id?: string | null
  rething_from_username?: string | null
  /** Normalized slugs, max 2 (see `post-tags.ts`). */
  tags?: string[] | null
}

export type LinkPreview = {
  url: string
  siteName: string
  title: string
  description: string
  image: string
}

export function getSpotifyEmbedUrl(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
  return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0` : null
}

export function isSoundCloudUrl(url: string): boolean {
  try {
    const cleaned = normalizeSoundCloudStoredContent(url)
    if (!cleaned) return false
    const u = new URL(normalizeLinkUrl(cleaned))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    return host === 'soundcloud.com' || host.endsWith('.soundcloud.com')
  } catch {
    return false
  }
}

/** Clean legacy DB values: whitespace, HTML wrappers, encoding, short links still need /api/soundcloud-resolve. */
export function normalizeSoundCloudStoredContent(raw: string | null | undefined): string {
  if (raw == null) return ''
  let s = String(raw).trim()
  if (!s) return ''
  s = s.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
  if (/^https%3A/i.test(s) || /^http%3A/i.test(s)) {
    try {
      s = decodeURIComponent(s)
    } catch {
      /* ignore */
    }
  }
  if (/%[0-9A-Fa-f]{2}/.test(s) && !/^https?:\/\//i.test(s)) {
    try {
      const once = decodeURIComponent(s)
      if (once.includes('soundcloud.com')) s = once.trim()
    } catch {
      /* ignore */
    }
  }
  const hrefMatch = s.match(/href=["'](https?:\/\/[^"'>\s]+)['"]/i)
  if (hrefMatch?.[1]?.includes('soundcloud.com')) s = hrefMatch[1].trim()
  s = s.replace(/^['"<]+|['">]+$/g, '').trim()
  s = s.replace(/[.,;)\]]+$/u, '')
  if (s.includes('soundcloud.com') && !/^https?:\/\//i.test(s)) s = normalizeLinkUrl(s)
  return s.trim()
}

/** iframe `src` for SoundCloud’s embed widget */
export function getSoundCloudWidgetSrc(permalink: string): string | null {
  const cleaned = normalizeSoundCloudStoredContent(permalink)
  if (!cleaned || !isSoundCloudUrl(cleaned)) return null
  let href: string
  try {
    const u = new URL(normalizeLinkUrl(cleaned))
    u.protocol = 'https:'
    u.hash = ''
    href = u.href
  } catch {
    return null
  }
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(href)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true`
}

/** First SoundCloud track/profile URL in HTML or plain text (for text posts). */
export function extractFirstSoundCloudUrl(html: string): string | null {
  if (!html.trim()) return null
  const fromHref = html.match(/href=["'](https?:\/\/[^"'#\s]+)["']/gi)
  if (fromHref) {
    for (const m of fromHref) {
      const inner = /href=["'](https?:\/\/[^"'#\s]+)["']/i.exec(m)
      const u = inner?.[1]
      if (u && isSoundCloudUrl(u)) return new URL(normalizeLinkUrl(u)).href
    }
  }
  const plain = stripHtml(html)
  const bare = plain.match(/https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s]+/i)
  if (bare) {
    const cleaned = bare[0].replace(/[.,;:!?)'\]]+$/u, '')
    if (isSoundCloudUrl(cleaned)) {
      try {
        return new URL(normalizeLinkUrl(cleaned)).href
      } catch {
        return null
      }
    }
  }
  return null
}

/** Text post that is only a SoundCloud link (plain URL or a single anchor). → store as `soundcloud` type */
export function soleSoundCloudUrlFromTextPost(html: string): string | null {
  const t = html.trim()
  const singleEmptyAnchor = /^<a\s+[^>]*href="([^"]+)"[^>]*>\s*<\/a>$/i.exec(t.replace(/\s+/g, ' '))
  if (singleEmptyAnchor?.[1] && isSoundCloudUrl(singleEmptyAnchor[1])) {
    return new URL(normalizeLinkUrl(singleEmptyAnchor[1])).href
  }
  const plain = stripHtml(html).trim()
  if (!plain) return null
  if (isSoundCloudUrl(plain)) {
    try {
      return new URL(normalizeLinkUrl(plain)).href
    } catch {
      return null
    }
  }
  return null
}

export function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

export function getHostnameLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    return hostname.split('.')[0] || hostname
  } catch {
    return 'link'
  }
}

export function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeLinkUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function getLinkPreviewFromMetadata(metadata: Record<string, unknown> | null): LinkPreview | null {
  if (!metadata || typeof metadata !== 'object') return null
  const link = metadata.link_preview
  if (!link || typeof link !== 'object') return null
  const candidate = link as Record<string, unknown>
  return {
    url: typeof candidate.url === 'string' ? candidate.url : '',
    siteName: typeof candidate.siteName === 'string' ? candidate.siteName : '',
    title: typeof candidate.title === 'string' ? candidate.title : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    image: typeof candidate.image === 'string' ? candidate.image : '',
  }
}
