import { supabase } from '@/src/lib/supabase'

export const SUGGESTED_MODULE_NAMES = [
  'Music',
  'Books',
  'Films',
  'Videos',
  'Photos',
  'Quotes',
  'Places',
  'Art',
  'Brands',
  'Podcasts',
] as const

/** Fire-and-forget AI classification for a post (user-tagged modules stay in post_modules_user). */
export async function classifyPostAfterSave(postId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  void fetch(`${origin}/api/modules/classify-post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ postId }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        console.warn('[modules] classify-post failed', res.status, t.slice(0, 400))
      }
    })
    .catch((e) => console.warn('[modules] classify-post network error', e))
}

export async function backfillAllPostsModules(): Promise<{ processed: number; succeeded: number; failed: number } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const res = await fetch(`${origin}/api/modules/backfill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) return null
  const j = (await res.json()) as { processed?: number; succeeded?: number; failed?: number }
  return {
    processed: j.processed ?? 0,
    succeeded: j.succeeded ?? 0,
    failed: j.failed ?? 0,
  }
}

export type ProfileModuleRow = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}
