import type { SupabaseClient } from '@supabase/supabase-js'
import type { Post } from '@/src/lib/post-helpers'

/** PostgREST / Supabase returns at most `max_rows` per request (often 1000). Paginate to load everything. */
const PAGE_SIZE = 1000

export async function fetchAllPostsForUserId(supabase: SupabaseClient, userId: string): Promise<Post[]> {
  const all: Post[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as Post[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

export async function fetchAllPostsForAuthorIds(supabase: SupabaseClient, authorIds: string[]): Promise<Post[]> {
  if (authorIds.length === 0) return []
  const all: Post[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .in('user_id', authorIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as Post[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

/** Most recent posts across the given authors (feed). Use `offset` for pagination (inclusive range). */
export async function fetchRecentPostsForAuthorIds(
  supabase: SupabaseClient,
  authorIds: string[],
  limit: number,
  offset = 0,
): Promise<Post[]> {
  if (authorIds.length === 0 || limit <= 0) return []
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .in('user_id', authorIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data || []) as Post[]
}

/** Newest posts across the whole app (network-wide feed). Use `offset` for pagination. */
export async function fetchRecentPostsGlobal(supabase: SupabaseClient, limit: number, offset = 0): Promise<Post[]> {
  if (limit <= 0) return []
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data || []) as Post[]
}

/** Recent posts with a given tag (public / tag pages). */
export async function fetchRecentPostsWithTag(supabase: SupabaseClient, tag: string, limit: number): Promise<Post[]> {
  const slug = tag.trim().toLowerCase()
  if (!slug || limit <= 0) return []
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .contains('tags', [slug])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data || []) as Post[]
}

/** Posts that include `tag` in `tags` (normalized slug). Requires `posts.tags` column + GIN index (see supabase/post-tags.sql). */
export async function fetchAllPostsWithTag(supabase: SupabaseClient, tag: string): Promise<Post[]> {
  const slug = tag.trim().toLowerCase()
  if (!slug) return []
  const all: Post[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .contains('tags', [slug])
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as Post[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}
