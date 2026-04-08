import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import {
  buildHappeningThingsDataVariables,
  fetchFirstPostAuthorsInWindow,
  fetchNetworkPostsCount,
  getHappeningThingsWindow,
  happeningThingsIdempotencyKey,
  normalizeSiteUrl,
  shouldSkipHappeningThingsSend,
  toHappeningThingsEventProperties,
} from '@/src/lib/happening-things-weekly'
import { loopsSendEvent } from '@/src/lib/loops'

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

const DEFAULT_EVENT_NAME = 'happening_things_weekly'

/**
 * Weekly Happening Things email via Loops **event** → **Loop** (not transactional API).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Query:
 * - dryRun=1 — compute payloads, do not call Loops.
 *
 * Env:
 * - LOOPS_API_KEY
 * - LOOPS_HAPPENING_THINGS_EVENT_NAME — optional; default `happening_things_weekly` (must match Loops event + Loop trigger).
 * - NEXT_PUBLIC_SITE_URL
 * - HAPPENING_THINGS_DISABLED=1, HAPPENING_THINGS_MAX_RECIPIENTS (optional)
 *
 * Loops setup:
 * 1. Register event properties (see `email/happening-things-weekly/index.mjml` header comment).
 * 2. Create a Loop whose trigger is “Event received” for that event name.
 * 3. Paste/import the MJML email into that Loop’s message step.
 *
 * Supabase: `supabase/happening-things-weekly-rpc.sql`
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const loopsKey = process.env.LOOPS_API_KEY?.trim()
  const eventName = process.env.LOOPS_HAPPENING_THINGS_EVENT_NAME?.trim() || DEFAULT_EVENT_NAME
  const disabled = process.env.HAPPENING_THINGS_DISABLED === '1' || process.env.HAPPENING_THINGS_DISABLED === 'true'

  if (!dryRun && !disabled) {
    if (!loopsKey) {
      return NextResponse.json({ error: 'Missing LOOPS_API_KEY' }, { status: 500 })
    }
  }

  const maxRaw = process.env.HAPPENING_THINGS_MAX_RECIPIENTS?.trim()
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
  let newMembers: Awaited<ReturnType<typeof fetchFirstPostAuthorsInWindow>> = []
  try {
    ;[networkPostsCount, newMembers] = await Promise.all([
      fetchNetworkPostsCount(admin, startIso, endIso),
      fetchFirstPostAuthorsInWindow(admin, siteUrl, startIso, endIso),
    ])
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  let sent = 0
  let skippedEmpty = 0
  let skippedNoEmail = 0
  let failed = 0
  const errors: { userId: string; message: string }[] = []
  let sampleEventProperties: Record<string, string | number> | null = null

  let page = 1
  const perPage = 1000

  outer: for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = (data.users || []) as AuthUserRow[]
    if (batch.length === 0) break

    for (const u of batch) {
      const email = u.email?.trim()
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

      const eventProperties = toHappeningThingsEventProperties(vars)
      if (sampleEventProperties === null) {
        sampleEventProperties = eventProperties
      }

      if (dryRun) {
        sent += 1
        if (maxRecipients !== null && sent >= maxRecipients) break outer
        continue
      }

      if (disabled) {
        continue
      }

      if (maxRecipients !== null && sent >= maxRecipients) {
        break outer
      }

      const result = await loopsSendEvent(
        loopsKey!,
        {
          email,
          userId: u.id,
          eventName,
          eventProperties,
        },
        { idempotencyKey: happeningThingsIdempotencyKey(windowEnd, u.id) },
      )

      if (!result.ok) {
        failed += 1
        errors.push({ userId: u.id, message: result.message })
      } else {
        sent += 1
      }

      await sleep(120)
    }

    if (batch.length < perPage) break
    page += 1
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    disabled: disabled && !dryRun,
    eventName,
    window: { start: startIso, end: endIso },
    siteUrl,
    network: { networkPostsCount, newMembersCount: newMembers.length },
    sent,
    skippedEmpty,
    skippedNoEmail,
    failed,
    errors: errors.slice(0, 40),
    errorCount: errors.length,
    sampleEventProperties,
    hint: dryRun
      ? 'Remove ?dryRun=1 to call Loops. Ensure the event + properties exist and a Loop is subscribed to this eventName.'
      : undefined,
  })
}
