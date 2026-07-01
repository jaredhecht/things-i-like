import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { isResendDisabled } from './lib/resend-config.mjs'

function parseArgs(argv) {
  const parsed = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue

    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }

    const key = arg.slice(2)
    const value = argv[i + 1]

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }

    parsed[key] = value
    i += 1
  }

  return parsed
}

async function resolveSegmentId(resend, explicitSegmentId) {
  if (explicitSegmentId) return explicitSegmentId

  const { data, error } = await resend.segments.list()
  if (error) throw new Error(`Unable to list Resend segments: ${error.message}`)

  const segments = data?.data ?? []
  if (segments.length === 1) return segments[0].id
  if (segments.length === 0) throw new Error('No Resend segments found. Create one or set RESEND_BROADCAST_SEGMENT_ID.')

  const names = segments.map((segment) => `${segment.name} (${segment.id})`).join(', ')
  throw new Error(`Multiple Resend segments found. Set RESEND_BROADCAST_SEGMENT_ID. Available: ${names}`)
}

async function upsertContact({ resend, email, segmentId, topicId, enabled, dryRun }) {
  if (dryRun) {
    return { action: enabled ? 'would_opt_in' : 'would_opt_out' }
  }

  const createResult = await resend.contacts.create({
    email,
    segments: [{ id: segmentId }],
    topics: [{ id: topicId, subscription: enabled ? 'opt_in' : 'opt_out' }],
  })

  if (!createResult.error) {
    return { action: 'created' }
  }

  const exists = /already exists|duplicate|contact.*exists/i.test(createResult.error.message)
  if (!exists) {
    throw new Error(createResult.error.message)
  }

  const segmentRes = await resend.contacts.segments.add({ email, segmentId })
  if (segmentRes.error && !/already|exists|duplicate/i.test(segmentRes.error.message)) {
    throw new Error(segmentRes.error.message)
  }

  const topicRes = await resend.contacts.topics.update({
    email,
    topics: [{ id: topicId, subscription: enabled ? 'opt_in' : 'opt_out' }],
  })
  if (topicRes.error) {
    throw new Error(topicRes.error.message)
  }

  return { action: enabled ? 'updated_opt_in' : 'updated_opt_out' }
}

async function main() {
  if (isResendDisabled()) {
    console.log('RESEND_DISABLED is set; skipping audience sync.')
    return
  }

  const args = parseArgs(process.argv.slice(2))
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const topicId = args['topic-id']?.trim() || process.env.RESEND_THINGS_OF_WEEK_TOPIC_ID?.trim()
  const segmentHint = args['segment-id']?.trim() || process.env.RESEND_BROADCAST_SEGMENT_ID?.trim() || undefined
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!resendKey) throw new Error('Missing RESEND_API_KEY in environment.')
  if (!topicId) throw new Error('Missing RESEND_THINGS_OF_WEEK_TOPIC_ID in environment.')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  }

  const resend = new Resend(resendKey)
  const segmentId = await resolveSegmentId(resend, segmentHint)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let page = 1
  let scanned = 0
  let created = 0
  let updated = 0
  let optedOut = 0
  let skippedNoEmail = 0
  let prefColumnAvailable = true
  const errors = []

  while (true) {
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (authErr) throw authErr

    const users = authUsers?.users ?? []
    if (!users.length) break
    scanned += users.length

    const ids = users.map((u) => u.id)
    const { data: prefs, error: prefErr } = await supabase
      .from('profiles')
      .select('id, things_of_week_enabled')
      .in('id', ids)
    if (prefErr) {
      if (/things_of_week_enabled/i.test(prefErr.message)) {
        prefColumnAvailable = false
      } else {
        throw prefErr
      }
    }

    const prefMap = new Map((prefs ?? []).map((pref) => [pref.id, pref.things_of_week_enabled]))

    for (const user of users) {
      const email = user.email?.trim()
      if (!email) {
        skippedNoEmail += 1
        continue
      }

      const enabled = prefMap.get(user.id) !== false

      try {
        const result = await upsertContact({
          resend,
          email,
          segmentId,
          topicId,
          enabled,
          dryRun: args.dryRun === true,
        })

        if (result.action === 'created') created += 1
        else if (result.action === 'updated_opt_in') updated += 1
        else if (result.action === 'updated_opt_out') optedOut += 1
        else if (result.action === 'would_opt_in') updated += 1
        else if (result.action === 'would_opt_out') optedOut += 1
      } catch (error) {
        errors.push({ email, message: error instanceof Error ? error.message : String(error) })
      }
    }

    if (users.length < 100) break
    page += 1
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun === true,
        scanned,
        created,
        updated,
        optedOut,
        skippedNoEmail,
        prefColumnAvailable,
        segmentId,
        topicId,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
