import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cityFromAddressComponents, type GoogleAddressComponent } from '@/src/lib/place-metadata'

export const runtime = 'nodejs'

type GoogleDetailsResult = {
  place_id?: string
  name?: string
  formatted_address?: string
  address_components?: GoogleAddressComponent[]
  geometry?: { location?: { lat?: number; lng?: number } }
  photos?: { photo_reference?: string; width?: number; height?: number }[]
}

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

  const { error: userErr, data: userData } = await createClient(url, anonKey).auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  let body: { placeId?: string }
  try {
    body = (await request.json()) as { placeId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : ''
  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 })
  }

  const gUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  gUrl.searchParams.set('place_id', placeId)
  gUrl.searchParams.set(
    'fields',
    'place_id,name,formatted_address,address_components,geometry,photos',
  )
  gUrl.searchParams.set('key', googleKey)

  const gRes = await fetch(gUrl.href, { next: { revalidate: 0 } })
  if (!gRes.ok) {
    return NextResponse.json({ error: 'Places request failed' }, { status: 502 })
  }

  const gJson = (await gRes.json()) as { result?: GoogleDetailsResult; status?: string }
  if (gJson.status !== 'OK' || !gJson.result) {
    return NextResponse.json({ error: gJson.status || 'NOT_FOUND' }, { status: 404 })
  }

  const r = gJson.result
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name || typeof r.place_id !== 'string') {
    return NextResponse.json({ error: 'Invalid place result' }, { status: 502 })
  }

  const lat = r.geometry?.location?.lat
  const lng = r.geometry?.location?.lng
  const city = cityFromAddressComponents(r.address_components)
  const photoRef = r.photos?.[0]?.photo_reference

  return NextResponse.json({
    place_id: r.place_id,
    name,
    formatted_address: typeof r.formatted_address === 'string' ? r.formatted_address : '',
    city,
    lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
    lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : null,
    photoReference: typeof photoRef === 'string' ? photoRef : null,
  })
}
