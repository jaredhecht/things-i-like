import { NextResponse } from 'next/server'

type LinkPreview = {
  url: string
  siteName: string
  title: string
  description: string
  image: string
}

function pickMeta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${key}["'][^>]*>`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function pickTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() || ''
}

function absolutize(baseUrl: string, maybeRelative: string): string {
  if (!maybeRelative) return ''
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return ''
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const target = searchParams.get('url')
  if (!target) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(target)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Could not fetch URL' }, { status: 400 })
    }

    const html = await response.text()
    const siteName = pickMeta(html, 'og:site_name') || parsedUrl.hostname.replace('www.', '')
    const title = pickMeta(html, 'og:title') || pickMeta(html, 'twitter:title') || pickTitle(html)
    const description = pickMeta(html, 'og:description') || pickMeta(html, 'twitter:description') || pickMeta(html, 'description')
    const imageRaw =
      pickMeta(html, 'og:image:secure_url') ||
      pickMeta(html, 'og:image') ||
      pickMeta(html, 'twitter:image') ||
      pickMeta(html, 'twitter:image:src')
    const image = absolutize(parsedUrl.toString(), imageRaw)

    const preview: LinkPreview = {
      url: parsedUrl.toString(),
      siteName,
      title,
      description,
      image,
    }

    return NextResponse.json(preview)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 500 })
  }
}
