import { ImageResponse } from 'next/og'
import { createSupabaseServer } from '@/src/lib/supabase-server'
import { isPublicPostIdParam } from '@/src/lib/public-post-url'

export const alt = 'Things I Like'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const RESERVED = new Set(['auth', 'api', 'settings', 'whos-here', 'notifications', 'bookmarks'])

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').trim()
}

export default async function Image({ params }: { params: Promise<{ username: string; postId: string }> }) {
  const { username: raw, postId } = await params
  const slug = decodeURIComponent(raw).toLowerCase()

  let headline = 'Things I Like'
  let subline = 'Share things you like'

  if (!RESERVED.has(slug) && isPublicPostIdParam(postId)) {
    try {
      const supabase = createSupabaseServer()
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('username', slug)
        .maybeSingle()

      if (profile) {
        const { data: post } = await supabase
          .from('posts')
          .select('type, caption, content')
          .eq('id', postId)
          .eq('user_id', profile.id)
          .maybeSingle()

        if (post) {
          const cap = typeof post.caption === 'string' ? stripHtml(post.caption) : ''
          const content = typeof post.content === 'string' ? post.content.trim() : ''
          const hint =
            (cap && cap.slice(0, 96)) ||
            (post.type === 'quote' && content.slice(0, 96)) ||
            (post.type === 'article' && content.slice(0, 96)) ||
            `${String(post.type)} · @${profile.username}`

          headline = hint || headline
          if (headline.length > 100) headline = `${headline.slice(0, 97)}…`

          const name =
            (typeof profile.display_name === 'string' && profile.display_name.trim()) ||
            `@${profile.username}`
          subline = `${name} · Things I Like`
        }
      }
    } catch {
      /* keep defaults */
    }
  }

  const titleSize = headline.length > 72 ? 44 : headline.length > 48 ? 52 : 58

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 72,
          backgroundColor: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 600,
            color: '#18181b',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: '#71717a',
            fontWeight: 500,
          }}
        >
          {subline}
        </div>
      </div>
    ),
    { ...size },
  )
}
