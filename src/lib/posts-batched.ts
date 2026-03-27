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
