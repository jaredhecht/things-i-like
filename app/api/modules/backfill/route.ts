import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { classifyPostForOwner } from '@/src/lib/modules-classify-server'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { data: posts, error: postsErr } = await supabase.from('posts').select('id').eq('user_id', user.id)
  if (postsErr) {
    return NextResponse.json({ error: postsErr.message }, { status: 500 })
  }

  const ids = (posts || []).map((p) => p.id as string)
  let ok = 0
  let fail = 0

  for (const postId of ids) {
    const r = await classifyPostForOwner(supabase, postId, user.id)
    if (r.ok) ok++
    else fail++
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return NextResponse.json({ ok: true, processed: ids.length, succeeded: ok, failed: fail })
}
