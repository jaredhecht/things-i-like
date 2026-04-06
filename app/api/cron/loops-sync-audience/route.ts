import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { loopsListMailingLists, loopsUpdateContact, parseMailingListIds } from '@/src/lib/loops'

export const runtime = 'nodejs'
export const maxDuration = 120

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  const token = auth?.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

type AuthUserRow = { id: string; email?: string }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function firstNameFromProfile(displayName: string | null, username: string | null): string | undefined {
  const raw = (displayName?.trim() || username?.trim() || '') as string
  if (!raw) return undefined
  return raw.slice(0, 100)
}

/**
 * Sync Supabase Auth users into Loops (upsert via contacts/update).
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (same as other cron routes).
 *
 * Env:
 * - LOOPS_API_KEY (required)
 * - LOOPS_MAILING_LIST_IDS optional comma-separated list ids → subscribe each contact
 * - LOOPS_SYNC_MAX_PER_RUN optional — if set, max Loops API calls per run (then re-run; upserts are idempotent)
 *
 * GET ?listsOnly=1 — returns mailing list ids/names (no sync) for configuring LOOPS_MAILING_LIST_IDS.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loopsKey = process.env.LOOPS_API_KEY?.trim()
  if (!loopsKey) {
    return NextResponse.json({ error: 'Missing LOOPS_API_KEY' }, { status: 500 })
  }

  const listsOnly = request.nextUrl.searchParams.get('listsOnly') === '1'
  if (listsOnly) {
    const lists = await loopsListMailingLists(loopsKey)
    if (!lists.ok) {
      return NextResponse.json({ error: lists.message }, { status: lists.status })
    }
    return NextResponse.json({ lists: lists.data })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const maxRaw = process.env.LOOPS_SYNC_MAX_PER_RUN?.trim()
  let maxPerRun: number | null = null
  if (maxRaw !== undefined && maxRaw !== '') {
    const n = Number.parseInt(maxRaw, 10)
    if (Number.isFinite(n) && n >= 1) {
      maxPerRun = Math.min(10_000, n)
    }
  }
  const mailingLists = parseMailingListIds(process.env.LOOPS_MAILING_LIST_IDS)

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let synced = 0
  let failed = 0
  let skippedNoEmail = 0
  const errors: { email: string; message: string }[] = []
  let page = 1
  const perPage = 1000
  let hitCap = false
  let attempts = 0

  outer: for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = (data.users || []) as AuthUserRow[]
    if (batch.length === 0) break

    const ids = batch.map((u) => u.id)
    const chunk = 200
    const profileById = new Map<string, { display_name: string | null; username: string | null }>()
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const { data: profs } = await admin.from('profiles').select('id, display_name, username').in('id', slice)
      for (const p of profs || []) {
        profileById.set(p.id as string, {
          display_name: (p.display_name as string | null) ?? null,
          username: (p.username as string | null) ?? null,
        })
      }
    }

    for (const u of batch) {
      if (maxPerRun !== null && attempts >= maxPerRun) {
        hitCap = true
        break outer
      }
      const email = u.email?.trim()
      if (!email) {
        skippedNoEmail += 1
        continue
      }

      const prof = profileById.get(u.id)
      const firstName = prof ? firstNameFromProfile(prof.display_name, prof.username) : undefined

      const payload = {
        email,
        userId: u.id,
        ...(firstName ? { firstName } : {}),
        ...(mailingLists ? { mailingLists } : {}),
      }

      const result = await loopsUpdateContact(loopsKey, payload)
      attempts += 1
      if (!result.ok) {
        failed += 1
        errors.push({ email, message: result.message })
      } else {
        synced += 1
      }

      await sleep(120)
    }

    if (batch.length < perPage) break
    page += 1
  }

  return NextResponse.json({
    ok: true,
    attempts,
    synced,
    failed,
    skippedNoEmail,
    errors: errors.slice(0, 50),
    errorCount: errors.length,
    capped: hitCap,
    mailingListIdsAttached: mailingLists ? Object.keys(mailingLists) : [],
    hint: hitCap
      ? 'Increase LOOPS_SYNC_MAX_PER_RUN or unset it; re-run to continue (upserts repeat safely).'
      : undefined,
  })
}
