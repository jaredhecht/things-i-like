import { isValidHttpUrl, type LinkPreview } from '@/src/lib/post-helpers'

/** Client-side fetch for `/api/link-preview` (used by home composer and inline post editor). */
export async function fetchLinkPreviewClient(url: string): Promise<LinkPreview | null> {
  if (!isValidHttpUrl(url)) return null
  try {
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    if (!response.ok) return null
    const data = await response.json()
    return {
      url: typeof data.url === 'string' ? data.url : url,
      siteName: typeof data.siteName === 'string' ? data.siteName : '',
      title: typeof data.title === 'string' ? data.title : '',
      description: typeof data.description === 'string' ? data.description : '',
      image: typeof data.image === 'string' ? data.image : '',
    }
  } catch {
    return null
  }
}
