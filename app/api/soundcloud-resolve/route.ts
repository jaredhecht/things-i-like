import { NextResponse } from 'next/server'
import {
  isSoundCloudUrl,
  normalizeLinkUrl,
  normalizeSoundCloudStoredContent,
} from '@/src/lib/post-helpers'

/**
 * Follow redirects (e.g. on.soundcloud.com → canonical track URL) so the widget gets a URL it accepts.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url')
  if (!raw) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const cleaned = normalizeSoundCloudStoredContent(raw)
  if (!cleaned || !isSoundCloudUrl(cleaned)) {
    return NextResponse.json({ error: 'Not a SoundCloud URL' }, { status: 400 })
  }

  let fetchUrl: string
  try {
    const u = new URL(normalizeLinkUrl(cleaned))
    u.protocol = 'https:'
    fetchUrl = u.href
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  try {
    const response = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    })

    let resolvedUrl = response.url
    try {
      const out = new URL(resolvedUrl)
      if (!isSoundCloudUrl(out.href)) {
        return NextResponse.json({ resolvedUrl: fetchUrl })
      }
      out.protocol = 'https:'
      out.hash = ''
      resolvedUrl = out.href
    } catch {
      resolvedUrl = fetchUrl
    }

    return NextResponse.json({ resolvedUrl })
  } catch {
    return NextResponse.json({ resolvedUrl: fetchUrl })
  }
}
