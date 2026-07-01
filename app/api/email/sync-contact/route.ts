import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import { isResendDisabled } from '@/src/lib/resend-config'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const thingsOfWeekTopicId = process.env.RESEND_THINGS_OF_WEEK_TOPIC_ID?.trim() || null

  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (!resendKey) {
    return NextResponse.json({ error: 'Email audience sync is not configured' }, { status: 503 })
  }

  if (isResendDisabled()) {
    return NextResponse.json({ ok: true, skipped: 'resend_disabled' })
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const email = user.email?.trim()
  if (!email) {
    return NextResponse.json({ ok: true, skipped: 'no_email' })
  }

  let thingsOfWeekEnabled = true
  const prefRes = await admin.from('profiles').select('things_of_week_enabled').eq('id', user.id).maybeSingle()
  if (!prefRes.error) {
    thingsOfWeekEnabled =
      (prefRes.data as { things_of_week_enabled?: boolean | null } | null)?.things_of_week_enabled !== false
  } else if (!/things_of_week_enabled/i.test(prefRes.error.message)) {
    return NextResponse.json({ error: prefRes.error.message }, { status: 500 })
  }

  const resend = new Resend(resendKey)
  const { data: segmentList, error: segmentErr } = await resend.segments.list()
  if (segmentErr) {
    return NextResponse.json({ error: segmentErr.message }, { status: 500 })
  }

  const segments = segmentList?.data ?? []
  const topicSubscription: 'opt_in' | 'opt_out' = thingsOfWeekEnabled ? 'opt_in' : 'opt_out'
  const topicPayload = thingsOfWeekTopicId
    ? [{ id: thingsOfWeekTopicId, subscription: topicSubscription }]
    : undefined

  const createRes = await resend.contacts.create({
    email,
    segments: segments.map((segment) => ({ id: segment.id })),
    ...(topicPayload ? { topics: topicPayload } : {}),
  })

  const alreadyExists = !!createRes.error && /already exists|duplicate|contact.*exists/i.test(createRes.error.message)
  if (createRes.error && !alreadyExists) {
    return NextResponse.json({ error: createRes.error.message }, { status: 500 })
  }

  if (alreadyExists) {
    for (const segment of segments) {
      const segmentRes = await resend.contacts.segments.add({ email, segmentId: segment.id })
      if (segmentRes.error && !/already exists|duplicate|contact.*exists/i.test(segmentRes.error.message)) {
        return NextResponse.json({ error: segmentRes.error.message }, { status: 500 })
      }
    }

    if (topicPayload) {
      const topicRes = await resend.contacts.topics.update({ email, topics: topicPayload })
      if (topicRes.error) {
        return NextResponse.json({ error: topicRes.error.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    segmentCount: segments.length,
    topicSynced: Boolean(topicPayload),
    thingsOfWeekEnabled,
  })
}
