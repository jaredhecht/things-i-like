import type { SupabaseClient } from '@supabase/supabase-js'
import type { Post } from '@/src/lib/post-helpers'

export type RethingAuthorMeta = {
  username: string
  display_name: string | null
  /** Omitted in some callers until merged from profiles. */
  avatar_url?: string | null
}

/** Load profiles for `rething_from_username` handles and merge into the author map (keyed by user id). */
export async function mergeProfilesForRethingUsernames(
  supabase: Pick<SupabaseClient, 'from'>,
  posts: Post[],
  into: Record<string, RethingAuthorMeta>,
): Promise<void> {
  const handles = [
    ...new Set(
      posts.map((p) => p.rething_from_username?.trim()).filter((u): u is string => Boolean(u)),
    ),
  ]
  if (handles.length === 0) return
  const { data: profs, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('username', handles)
  if (error || !profs?.length) return
  for (const row of profs) {
    const p = row as {
      id: string
      username: string
      display_name: string | null
      avatar_url: string | null
    }
    if (!into[p.id]) {
      into[p.id] = {
        username: p.username,
        display_name: p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
      }
    }
  }
}

export function authorMetaForRethingFromUsername(
  lookup: Record<string, RethingAuthorMeta>,
  rethingFromUsername: string | null | undefined,
): RethingAuthorMeta | undefined {
  const h = rethingFromUsername?.trim()
  if (!h) return undefined
  return Object.values(lookup).find((a) => a.username === h)
}
