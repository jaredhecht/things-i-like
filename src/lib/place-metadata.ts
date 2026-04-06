import type { Post } from '@/src/lib/post-helpers'

/** Stored under `posts.metadata.place` for `type === 'place'`. */
export type PlaceStoredMetadata = {
  name: string
  place_id?: string | null
  formatted_address?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  source: 'google' | 'freeform'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function parsePlaceFromMetadata(metadata: unknown): PlaceStoredMetadata | null {
  if (!metadata || !isRecord(metadata)) return null
  const raw = metadata.place
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const source = raw.source === 'freeform' ? 'freeform' : 'google'
  return {
    name,
    place_id: typeof raw.place_id === 'string' ? raw.place_id : raw.place_id === null ? null : undefined,
    formatted_address:
      typeof raw.formatted_address === 'string' ? raw.formatted_address : raw.formatted_address === null ? null : undefined,
    city: typeof raw.city === 'string' ? raw.city : raw.city === null ? null : undefined,
    lat: typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : raw.lat === null ? null : undefined,
    lng: typeof raw.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : raw.lng === null ? null : undefined,
    source,
  }
}

export function getPlaceFromPost(post: Post): PlaceStoredMetadata | null {
  return parsePlaceFromMetadata(post.metadata)
}

/** Open in Google Maps (app on mobile when available). */
export function placeMapsUrl(place: PlaceStoredMetadata): string {
  if (place.place_id) {
    const q = new URLSearchParams({
      api: '1',
      query: place.name,
      query_place_id: place.place_id,
    })
    return `https://www.google.com/maps/search/?${q.toString()}`
  }
  const parts = [place.name, place.formatted_address || place.city || ''].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`
}

export type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] }

export function cityFromAddressComponents(components: GoogleAddressComponent[] | undefined): string | null {
  if (!components?.length) return null
  const pick = (type: string) => components.find((c) => c.types.includes(type))?.long_name
  return (
    pick('locality') ||
    pick('sublocality') ||
    pick('neighborhood') ||
    pick('administrative_area_level_2') ||
    pick('administrative_area_level_1') ||
    null
  )
}
