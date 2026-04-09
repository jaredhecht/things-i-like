import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import {
  buildHappeningThingsDataVariables,
  buildWeeklyDigestUnsubscribeUrl,
  fetchNetworkPostsCount,
  fetchRecentSignupPosters,
  getHappeningThingsWindow,
  happeningThingsSubjectLine,
  normalizeSiteUrl,
  renderHappeningThingsEmailHtml,
  renderHappeningThingsEmailText,
  shouldSkipHappeningThingsSend,
} from '@/src/lib/happening-things-weekly'

export const runtime = 'nodejs'
export const maxDuration = 300

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  const token = auth?.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

type AuthUserRow = { id: string; email?: string }
type ProfilePrefRow = { id: string; weekly_digest_enabled?: boolean | null }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
  const forcedUserId = request.nextUrl.searchParams.get('userId')?.trim() || null
  const forcedEmail = request.nextUrl.searchParams.get('email')?.trim() || null
  const forceSend = request.nextUrl.searchParams.get('force') === '1'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.WEEKLY_DIGEST_FROM?.trim() || process.env.ADMIN_DIGEST_FROM?.trim()
  const unsubscribeSecret = process.env.WEEKLY_DIGEST_UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  const disabled = process.env.HAPPENING_THINGS_DISABLED === '1' || process.env.HAPPENING_THINGS_DISABLED === 'true'
  const maxRaw = process.env.HAPPENING_THINGS_MAX_RECIPIENTS?.trim()

  if (!dryRun && !disabled) {
    if (!resendKey || !from) {
      return NextResponse.json({ error: 'Missing RESEND_API_KEY or WEEKLY_DIGEST_FROM (or ADMIN_DIGEST_FROM)' }, { status: 500 })
    }
    if (!unsubscribeSecret) {
      return NextResponse.json({ error: 'Missing WEEKLY_DIGEST_UNSUBSCRIBE_SECRET or CRON_SECRET' }, { status: 500 })
    }
  }

  let maxRecipients: number | null = null
  if (maxRaw) {
    const n = Number.parseInt(maxRaw, 10)
    if (Number.isFinite(n) && n >= 1) maxRecipients = Math.min(50_000, n)
  }

  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  const end = new Date()
  const { start, end: windowEnd } = getHappeningThingsWindow(end)
  const startIso = start.toISOString()
  const endIso = windowEnd.toISOString()

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let networkPostsCount = 0
  let newMembers = []
  try {
    ;[networkPostsCount, newMembers] = await Promise.all([
      fetchNetworkPostsCount(admin, startIso, endIso),
      fetchRecentSignupPosters(admin, siteUrl, startIso, endIso),
    ])
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const resend = resendKey ? new Resend(resendKey) : null

  let sent = 0
  let skippedEmpty = 0
  let skippedNoEmail = 0
  let skippedDisabled = 0
  let failed = 0
  const errors: { userId: string; message: string }[] = []
  let sampleHtml: string | null = null
  let sampleText: string | null = null
  let sampleRecipient: string | null = null

  let page = 1
  const perPage = 1000

  outer: for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = (data.users || []) as AuthUserRow[]
    if (batch.length === 0) break

    const profileIds = forcedUserId ? [forcedUserId] : batch.map((u) => u.id)
    const { data: prefRows, error: prefError } = await admin
      .from('profiles')
      .select('id, weekly_digest_enabled')
      .in('id', profileIds)
    if (prefError) {
      const extra = /weekly_digest_enabled/i.test(prefError.message)
        ? ' (run supabase/weekly-digest-email.sql to add the weekly digest preference column)'
        : ''
      return NextResponse.json({ error: `${prefError.message}${extra}` }, { status: 500 })
    }
    const prefById = new Map((prefRows || []).map((row) => [row.id as string, row as ProfilePrefRow]))

    for (const u of batch) {
      if (forcedUserId && u.id !== forcedUserId) continue

      const pref = prefById.get(u.id)
      const weeklyEnabled = pref?.weekly_digest_enabled !== false
      if (!forceSend && !weeklyEnabled) {
        skippedDisabled += 1
        continue
      }

      const email = forcedEmail || u.email?.trim()
      if (!email) {
        skippedNoEmail += 1
        continue
      }

      let vars
      try {
        vars = await buildHappeningThingsDataVariables({
          admin,
          siteUrl,
          recipientUserId: u.id,
          startIso,
          endIso,
          networkPostsCount,
          newMembers,
        })
      } catch (e) {
        failed += 1
        errors.push({ userId: u.id, message: e instanceof Error ? e.message : String(e) })
        continue
      }

      if (shouldSkipHappeningThingsSend(vars)) {
        skippedEmpty += 1
        continue
      }

      const unsubscribeUrl = buildWeeklyDigestUnsubscribeUrl(siteUrl, u.id, unsubscribeSecret || '')
      const html = renderHappeningThingsEmailHtml(vars, { unsubscribeUrl })
      const text = renderHappeningThingsEmailText(vars, { unsubscribeUrl })

      if (sampleHtml === null) sampleHtml = html
      if (sampleText === null) sampleText = text
      if (sampleRecipient === null) sampleRecipient = email

      if (dryRun || disabled) {
        sent += 1
      } else {
        const { error: sendErr } = await resend!.emails.send({
          from: from!,
          to: [email],
          subject: happeningThingsSubjectLine(vars),
          html,
          text,
        })

        if (sendErr) {
          failed += 1
          errors.push({ userId: u.id, message: sendErr.message })
        } else {
          sent += 1
        }

        await sleep(120)
      }

      if (maxRecipients !== null && sent >= maxRecipients) break outer
      if (forcedUserId) break outer
    }

    if (batch.length < perPage || forcedUserId) break
    page += 1
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    disabled: disabled && !dryRun,
    window: { start: startIso, end: endIso },
    siteUrl,
    network: { networkPostsCount, newMembersCount: newMembers.length },
    sent,
    skippedEmpty,
    skippedNoEmail,
    skippedDisabled,
    failed,
    errors: errors.slice(0, 40),
    errorCount: errors.length,
    sampleRecipient,
    sampleHtml: dryRun ? sampleHtml : undefined,
    sampleText: dryRun ? sampleText : undefined,
    hint: dryRun
      ? 'Remove ?dryRun=1 to send. Optional: add ?userId=<uuid>&email=<address>&force=1 for a targeted test.'
      : undefined,
  })
}
