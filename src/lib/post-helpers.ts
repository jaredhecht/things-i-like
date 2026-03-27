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
