import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

type GooglePrediction = {
  place_id?: string
  structured_formatting?: { main_text?: string; secondary_text?: string }
}

export async function GET(request: NextRequest) {
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

  const input = request.nextUrl.searchParams.get('input')?.trim() ?? ''
  if (input.length < 2) {
    return NextResponse.json({ predictions: [] })
  }

  const gUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  gUrl.searchParams.set('input', input)
  gUrl.searchParams.set('key', googleKey)

  const gRes = await fetch(gUrl.href, { next: { revalidate: 0 } })
  if (!gRes.ok) {
    return NextResponse.json({ error: 'Places request failed' }, { status: 502 })
  }

  const body = (await gRes.json()) as { predictions?: GooglePrediction[]; status?: string }
  if (body.status && body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ error: body.status }, { status: 502 })
  }

  const raw = body.predictions ?? []
  const predictions = raw
    .filter((p): p is GooglePrediction & { place_id: string } => typeof p.place_id === 'string' && p.place_id.length > 0)
    .map((p) => ({
      placeId: p.place_id,
      mainText: p.structured_formatting?.main_text ?? '',
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }))
    .filter((p) => p.mainText.length > 0)

  return NextResponse.json({ predictions })
}
