import { notFound } from 'next/navigation'
import { TagFeed } from '@/src/components/TagFeed'
import { normalizeTagSlug } from '@/src/lib/post-tags'
import { fetchRecentPostsWithTag } from '@/src/lib/posts-batched'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import type { Post } from '@/src/lib/post-helpers'

export const dynamic = 'force-dynamic'

const TAG_PAGE_POST_LIMIT = 300

type AuthorMeta = {
  username: string
  display_name: string | null
  avatar_url?: string | null
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: raw } = await params
  const slug = normalizeTagSlug(decodeURIComponent(raw))
  if (!slug) notFound()

  const supabase = createSupabaseServer()
  let list: Post[] = []
  try {
    list = await fetchRecentPostsWithTag(supabase, slug, TAG_PAGE_POST_LIMIT)
  } catch (e) {
    console.error('[tag] posts query failed:', slug, e)
  }

  const ids = [...new Set(list.map((p) => p.user_id).filter(Boolean))] as string[]
  const authorMap: Record<string, AuthorMeta> = {}
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids)
    for (const p of profs || []) {
      authorMap[p.id] = {
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url ?? null,
      }
    }
  }

  return <TagFeed tag={slug} initialPosts={list} initialAuthors={authorMap} />
}
