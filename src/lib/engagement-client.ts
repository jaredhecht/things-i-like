import type { SupabaseClient } from '@supabase/supabase-js'

const CHUNK = 120

function parseLikeCountRow(row: Record<string, unknown>): { postId: string; n: number } | null {
  const pid = typeof row.post_id === 'string' ? row.post_id : String(row.post_id ?? '')
  const lc = row.like_count
  const n = typeof lc === 'number' ? lc : typeof lc === 'string' ? parseInt(lc, 10) : Number(lc)
  if (!pid || !Number.isFinite(n)) return null
  return { postId: pid, n }
}

/**
 * Like counts + current user's likes/bookmarks for a list of posts.
 * Uses `post_like_counts` RPC (aggregated in SQL) instead of downloading every like row — critical when posts are popular.
 */
export async function fetchEngagementForPostIds(
  supabase: SupabaseClient,
  userId: string,
  postIds: string[],
): Promise<{
  likeCounts: Record<string, number>
  likedPostIds: Set<string>
  bookmarkedPostIds: Set<string>
}> {
  const likeCounts: Record<string, number> = {}
  const likedPostIds = new Set<string>()
  const bookmarkedPostIds = new Set<string>()
  if (postIds.length === 0) {
    return { likeCounts, likedPostIds, bookmarkedPostIds }
  }

  for (let i = 0; i < postIds.length; i += CHUNK) {
    const slice = postIds.slice(i, i + CHUNK)

    const [{ data: countRows, error: countErr }, { data: myLikes }, { data: bmRows }] = await Promise.all([
      supabase.rpc('post_like_counts', { post_ids: slice }),
      supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', slice),
      supabase.from('post_bookmarks').select('post_id').eq('user_id', userId).in('post_id', slice),
    ])

    if (!countErr) {
      for (const row of countRows || []) {
        const parsed = parseLikeCountRow(row as Record<string, unknown>)
        if (parsed) likeCounts[parsed.postId] = parsed.n
      }
    }
    for (const row of myLikes || []) likedPostIds.add(row.post_id as string)
    for (const row of bmRows || []) bookmarkedPostIds.add(row.post_id as string)
  }

  return { likeCounts, likedPostIds, bookmarkedPostIds }
}
