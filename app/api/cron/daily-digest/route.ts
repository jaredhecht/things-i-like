import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getDigestWindow } from '@/src/lib/daily-digest-window'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  const token = auth?.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

type AuthUserRow = { id: string; email?: string; created_at?: string }

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_DIGEST_EMAIL?.trim()
  const from = process.env.ADMIN_DIGEST_FROM?.trim()

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  if (!resendKey || !to || !from) {
    return NextResponse.json(
      { error: 'Missing RESEND_API_KEY, ADMIN_DIGEST_EMAIL, or ADMIN_DIGEST_FROM' },
      { status: 500 },
    )
  }

  const { label, startIso, endExclusiveIso, timezone } = getDigestWindow()

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const newUsers: { id: string; email: string; createdAt: string; username: string | null }[] = []
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = data.users as AuthUserRow[]
    if (!batch.length) break
    for (const u of batch) {
      const created = u.created_at
      if (!created) continue
      if (created >= startIso && created < endExclusiveIso) {
        newUsers.push({
          id: u.id,
          email: u.email ?? '',
          createdAt: created,
          username: null,
        })
      }
    }
    if (batch.length < perPage) break
    page += 1
  }

  if (newUsers.length > 0) {
    const ids = newUsers.map((u) => u.id)
    const chunk = 200
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const { data: profs } = await admin.from('profiles').select('id, username').in('id', slice)
      const byId = new Map((profs || []).map((p) => [p.id as string, p.username as string | null]))
      for (const u of newUsers) {
        if (byId.has(u.id)) u.username = byId.get(u.id) ?? null
      }
    }
  }

  const { count: postCount, error: postErr } = await admin
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', endExclusiveIso)

  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 })
  }

  const postsTotal = postCount ?? 0

  const rows =
    newUsers.length === 0
      ? '<p><em>No new accounts.</em></p>'
      : `<table style="border-collapse:collapse;width:100%;max-width:640px">
<thead><tr style="text-align:left;border-bottom:1px solid #e4e4e7">
<th style="padding:8px 6px">Email</th><th style="padding:8px 6px">Username</th><th style="padding:8px 6px">Signed up (UTC)</th>
</tr></thead>
<tbody>
${newUsers
  .map(
    (u) =>
      `<tr style="border-bottom:1px solid #f4f4f5"><td style="padding:8px 6px">${escapeHtml(u.email || '—')}</td>` +
      `<td style="padding:8px 6px">${escapeHtml(u.username ?? '—')}</td>` +
      `<td style="padding:8px 6px;font-size:13px;color:#52525b">${escapeHtml(u.createdAt)}</td></tr>`,
  )
  .join('\n')}
</tbody></table>`

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">
<h1 style="font-size:18px">Things I Like — daily digest</h1>
<p style="color:#52525b;font-size:14px">Day <strong>${escapeHtml(label)}</strong> (${escapeHtml(timezone)})</p>
<h2 style="font-size:15px;margin-top:20px">New accounts (${newUsers.length})</h2>
${rows}
<h2 style="font-size:15px;margin-top:24px">New posts</h2>
<p style="font-size:16px"><strong>${postsTotal}</strong> post${postsTotal === 1 ? '' : 's'} created that day.</p>
</body></html>`

  const text = [
    `Things I Like — daily digest`,
    `Day ${label} (${timezone})`,
    '',
    `New accounts (${newUsers.length}):`,
    ...newUsers.map((u) => `- ${u.email || 'no email'}  @${u.username ?? '—'}  ${u.createdAt}`),
    '',
    `New posts: ${postsTotal}`,
  ].join('\n')

  const resend = new Resend(resendKey)
  const { error: sendErr } = await resend.emails.send({
    from,
    to: [to],
    subject: `Things I Like digest — ${label} · ${newUsers.length} signups, ${postsTotal} posts`,
    html,
    text,
  })

  if (sendErr) {
    return NextResponse.json({ error: sendErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    day: label,
    timezone,
    newAccounts: newUsers.length,
    newPosts: postsTotal,
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
