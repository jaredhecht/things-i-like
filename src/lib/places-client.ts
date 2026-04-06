import { supabase } from '@/src/lib/supabase'

export type PlacePrediction = {
  placeId: string
  mainText: string
  secondaryText: string
}

export type PlaceDetailsPayload = {
  place_id: string
  name: string
  formatted_address: string
  city: string | null
  lat: number | null
  lng: number | null
  photoReference: string | null
}

async function authHeader(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const t = session?.access_token
  if (!t) throw new Error('Sign in required')
  return `Bearer ${t}`
}

export async function fetchPlaceAutocomplete(input: string): Promise<PlacePrediction[]> {
  const q = input.trim()
  if (q.length < 2) return []
  const h = await authHeader()
  const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(q)}`, { headers: { Authorization: h } })
  if (!res.ok) return []
  const data = (await res.json()) as { predictions?: PlacePrediction[] }
  return Array.isArray(data.predictions) ? data.predictions : []
}

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsPayload | null> {
  const h = await authHeader()
  const res = await fetch('/api/places/details', {
    method: 'POST',
    headers: { Authorization: h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as PlaceDetailsPayload | null
  if (!data || typeof data.place_id !== 'string' || typeof data.name !== 'string') return null
  return data
}

export async function cacheGooglePlacePhoto(photoReference: string): Promise<string | null> {
  const h = await authHeader()
  const res = await fetch('/api/places/cache-photo', {
    method: 'POST',
    headers: { Authorization: h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoReference }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { url?: string }
  return typeof data.url === 'string' ? data.url : null
}
