import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

const BUCKET = 'post-images'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (!googleKey) {
    return NextResponse.json({ error: 'Places search is not configured' }, { status: 503 })
  }

  const supabase = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  let body: { photoReference?: string }
  try {
    body = (await request.json()) as { photoReference?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const photoReference = typeof body.photoReference === 'string' ? body.photoReference.trim() : ''
  if (!photoReference || photoReference.length > 512) {
    return NextResponse.json({ error: 'photoReference required' }, { status: 400 })
  }

  const photoUrl = new URL('https://maps.googleapis.com/maps/api/place/photo')
  photoUrl.searchParams.set('maxwidth', '1600')
  photoUrl.searchParams.set('photo_reference', photoReference)
  photoUrl.searchParams.set('key', googleKey)

  const imgRes = await fetch(photoUrl.href, { redirect: 'follow', next: { revalidate: 0 } })
  if (!imgRes.ok) {
    return NextResponse.json({ error: 'Could not fetch photo' }, { status: 502 })
  }

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Unexpected response' }, { status: 502 })
  }

  const buf = Buffer.from(await imgRes.arrayBuffer())
  if (buf.length === 0 || buf.length > 12 * 1024 * 1024) {
    return NextResponse.json({ error: 'Invalid image size' }, { status: 502 })
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const path = `${user.id}/place-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: pub.publicUrl })
}
