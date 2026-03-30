import { headers } from 'next/headers'

/** Canonical site origin for share links and metadata (server). */
export async function getSiteOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https'
  if (host) return `${proto}://${host}`

  return 'http://localhost:3000'
}
