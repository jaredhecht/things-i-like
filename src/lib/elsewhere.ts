export type ElsewherePlatform =
  | 'twitter'
  | 'linkedin'
  | 'substack'
  | 'instagram'
  | 'tiktok'
  | 'website'
  | 'other'

export type ElsewhereLinkRow = {
  id: string
  user_id: string
  platform: ElsewherePlatform
  slug: string
  label: string | null
  favicon_url: string | null
  sort_order: number
}

export const ELSEWHERE_PLATFORMS: readonly ElsewherePlatform[] = [
  'twitter',
  'linkedin',
  'substack',
  'instagram',
  'tiktok',
  'website',
  'other',
] as const

export function platformDisplayName(p: ElsewherePlatform): string {
  switch (p) {
    case 'twitter':
      return 'Twitter / X'
    case 'linkedin':
      return 'LinkedIn'
    case 'substack':
      return 'Substack'
    case 'instagram':
      return 'Instagram'
    case 'tiktok':
      return 'TikTok'
    case 'website':
      return 'Website'
    case 'other':
      return 'Other'
    default:
      return p
  }
}

/** URL prefix shown before the handle input (no trailing slash on host for substack). */
export function platformUrlPrefix(p: ElsewherePlatform): string | null {
  switch (p) {
    case 'twitter':
      return 'x.com/'
    case 'linkedin':
      return 'linkedin.com/in/'
    case 'substack':
      return ''
    case 'instagram':
      return 'instagram.com/'
    case 'tiktok':
      return 'tiktok.com/@'
    case 'website':
    case 'other':
      return null
    default:
      return null
  }
}

/** Hint under Substack input */
export function platformInputHint(p: ElsewherePlatform): string | null {
  if (p === 'substack') return 'Your Substack subdomain (e.g. myname → myname.substack.com)'
  return null
}

export function stripAtHandle(s: string): string {
  return s.trim().replace(/^@+/, '')
}

export function normalizeWebsiteUrl(input: string): string {
  const t = input.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

export function resolvedElsewhereUrl(platform: ElsewherePlatform, slug: string): string {
  const raw = slug.trim()
  if (platform === 'website' || platform === 'other') {
    return normalizeWebsiteUrl(raw)
  }
  const h = stripAtHandle(raw).replace(/^\/+/, '')
  switch (platform) {
    case 'twitter':
      return `https://x.com/${encodeURIComponent(h)}`
    case 'linkedin':
      return `https://www.linkedin.com/in/${encodeURIComponent(h)}`
    case 'substack': {
      const sub = h.replace(/\.substack\.com\/?$/i, '').split('/')[0] ?? h
      return `https://${encodeURIComponent(sub)}.substack.com`
    }
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(h)}/`
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(h.replace(/^@/, ''))}`
    default:
      return normalizeWebsiteUrl(raw)
  }
}

export function faviconUrlForHostname(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
}

export function faviconUrlForUserUrl(urlString: string): string | null {
  try {
    const u = new URL(normalizeWebsiteUrl(urlString))
    if (!u.hostname) return null
    return faviconUrlForHostname(u.hostname)
  } catch {
    return null
  }
}

/** Line shown in lists: @handle, domain, or label */
export function elsewhereDisplaySubtitle(platform: ElsewherePlatform, slug: string, label: string | null): string {
  if (platform === 'other' && label?.trim()) return label.trim()
  if (platform === 'website' || platform === 'other') {
    try {
      const u = new URL(normalizeWebsiteUrl(slug))
      return u.hostname + (u.pathname && u.pathname !== '/' ? u.pathname : '')
    } catch {
      return slug.trim()
    }
  }
  return `@${stripAtHandle(slug)}`
}
