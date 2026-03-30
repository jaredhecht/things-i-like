import type { SupabaseClient } from '@supabase/supabase-js'

/** Count rething rows per original post (`posts.rething_of_post_id`). */
export async function fetchRethingCountsForPostIds(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (postIds.length === 0) return out
  const chunk = 500
  for (let i = 0; i < postIds.length; i += chunk) {
    const slice = postIds.slice(i, i + chunk)
    const { data } = await supabase
      .from('posts')
      .select('rething_of_post_id')
      .in('rething_of_post_id', slice)
      .not('rething_of_post_id', 'is', null)
    for (const row of data || []) {
      const oid = row.rething_of_post_id as string
      if (oid) out[oid] = (out[oid] || 0) + 1
    }
  }
  return out
}
