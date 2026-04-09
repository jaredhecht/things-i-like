import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { DirectoryAvatar } from '@/src/components/DirectoryAvatar'
import { FollowButton } from '@/src/components/FollowButton'
import { createSupabaseServer } from '@/src/lib/supabase-server'

export const revalidate = 300

type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
  post_count: number
  received_like_count: number
}

const getWhosHereProfiles = unstable_cache(
  async (): Promise<ProfileRow[]> => {
    const supabase = createSupabaseServer()
    const { data, error } = await supabase.rpc('profiles_directory_by_total_likes')

    if (error) {
      throw new Error(error.message)
    }

    return ((data || []) as Record<string, unknown>[])
      .map((row) => {
        const postCountRaw = row.post_count
        const likeCountRaw = row.received_like_count
        const postCount =
          typeof postCountRaw === 'number'
            ? postCountRaw
            : typeof postCountRaw === 'string'
              ? parseInt(postCountRaw, 10)
              : Number(postCountRaw)
        const receivedLikeCount =
          typeof likeCountRaw === 'number'
            ? likeCountRaw
            : typeof likeCountRaw === 'string'
              ? parseInt(likeCountRaw, 10)
              : Number(likeCountRaw)

        return {
          id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
          username: typeof row.username === 'string' ? row.username : '',
          avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
          post_count: Number.isFinite(postCount) ? postCount : 0,
          received_like_count: Number.isFinite(receivedLikeCount) ? receivedLikeCount : 0,
        }
      })
      .filter((row) => row.id && row.username && row.post_count > 0)
  },
  ['whos-here-directory-by-total-likes-v2'],
  { revalidate: 300 },
)

export default async function WhosHerePage() {
  let list: ProfileRow[] = []
  let error: string | null = null

  try {
    list = await getWhosHereProfiles()
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not load directory.'
  }

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <h1 className="mb-2 text-2xl font-light tracking-tight text-zinc-900">Who&apos;s Here?</h1>
        <p className="mb-8 text-sm text-zinc-500">People who have posted at least once, ranked by total likes received.</p>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Could not load directory. Run <code className="rounded bg-white px-1">supabase/profiles-directory-by-total-likes-rpc.sql</code>.
          </p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-zinc-400">No one yet. Be the first.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/${p.username}`} className="shrink-0">
                  <DirectoryAvatar src={p.avatar_url} username={p.username} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/${p.username}`} className="block truncate font-medium text-zinc-900 hover:underline">
                    @{p.username}
                  </Link>
                </div>
                <div className="shrink-0">
                  <FollowButton followingId={p.id} profileUsername={p.username} oauthReturnTo="/whos-here" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
