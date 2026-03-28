import Link from 'next/link'
import { FollowButton } from '@/src/components/FollowButton'
import { createSupabaseServer } from '@/src/lib/supabase-server'

export const dynamic = 'force-dynamic'

type ProfileRow = {
  id: string
  username: string
  avatar_url: string | null
}

export default async function WhosHerePage() {
  const supabase = createSupabaseServer()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .order('username', { ascending: true })

  const list = (profiles || []) as ProfileRow[]

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Things I Like
          </Link>
        </p>
        <h1 className="mb-2 text-2xl font-light tracking-tight text-zinc-900">Who&apos;s Here?</h1>
        <p className="mb-8 text-sm text-zinc-500">Everyone who has claimed a username.</p>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load directory.</p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-zinc-400">No one yet. Be the first.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/${p.username}`} className="shrink-0">
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="h-11 w-11 rounded-full border border-zinc-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-500">
                      {p.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
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
