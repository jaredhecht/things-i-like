import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

/** Deletes the authenticated user (Auth + cascaded data). Requires SUPABASE_SERVICE_ROLE_KEY. */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          'Account deletion is not configured: add SUPABASE_SERVICE_ROLE_KEY to the server environment (.env.local locally, Vercel env in production).',
        code: 'missing_service_role',
      },
      { status: 503 },
    )
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id)
  if (deleteErr) {
    return NextResponse.json(
      {
        error: deleteErr.message,
        code: /database error deleting user/i.test(deleteErr.message) ? 'fk_blocked' : undefined,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
