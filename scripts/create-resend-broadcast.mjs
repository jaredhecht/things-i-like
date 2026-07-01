import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Resend } from 'resend'
import { isResendDisabled } from './lib/resend-config.mjs'

function usage() {
  console.log(`Usage:
  npm run email:create-broadcast -- \\
    --html email/resend-things-of-the-week-2026-04-13/preview.html \\
    --subject "Things of the Week: six things worth passing along" \\
    [--name "Things of the Week — April 13, 2026"] \\
    [--preview-text "Six things from the feed this week, plus one person to follow."] \\
    [--segment-id "<segment-id>"] \\
    [--reply-to hello@thingsilike.app] \\
    [--send] \\
    [--scheduled-at "2026-04-13T22:00:00.000Z"] \\
    [--dry-run]
`)
}

function parseArgs(argv) {
  const parsed = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (!arg.startsWith('--')) continue

    if (arg === '--dry-run' || arg === '--send') {
      parsed[arg.slice(2)] = true
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

  if (error) {
    throw new Error(`Unable to list Resend segments: ${error.message}`)
  }

  const segments = data?.data ?? []

  if (segments.length === 1) {
    return segments[0].id
  }

  if (segments.length === 0) {
    throw new Error('No Resend segments found. Create one in Resend or pass --segment-id.')
  }

  const names = segments.map((segment) => `${segment.name} (${segment.id})`).join(', ')
  throw new Error(`Multiple Resend segments found. Pass --segment-id. Available: ${names}`)
}

async function main() {
  if (isResendDisabled()) {
    console.log('RESEND_DISABLED is set; skipping broadcast.')
    return
  }

  const args = parseArgs(process.argv.slice(2))

  if (!args.html || !args.subject) {
    usage()
    process.exit(1)
  }

  if (args['scheduled-at'] && !args.send) {
    throw new Error('--scheduled-at can only be used together with --send.')
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const from =
    args.from?.trim() ||
    process.env.WEEKLY_DIGEST_FROM?.trim() ||
    process.env.ADMIN_DIGEST_FROM?.trim()
  const topicId = args['topic-id']?.trim() || process.env.RESEND_THINGS_OF_WEEK_TOPIC_ID?.trim() || undefined

  if (!resendKey) {
    throw new Error('Missing RESEND_API_KEY in environment.')
  }

  if (!from) {
    throw new Error('Missing from address. Pass --from or set WEEKLY_DIGEST_FROM / ADMIN_DIGEST_FROM.')
  }

  const resend = new Resend(resendKey)
  const segmentId = await resolveSegmentId(resend, args['segment-id']?.trim())
  const html = await readFile(args.html, 'utf8')
  const text = args.text ? await readFile(args.text, 'utf8') : undefined

  const payload = {
    name: args.name?.trim() || args.subject.trim(),
    from,
    subject: args.subject.trim(),
    html,
    ...(text ? { text } : {}),
    ...(args['preview-text'] ? { previewText: args['preview-text'] } : {}),
    ...(args['reply-to'] ? { replyTo: args['reply-to'] } : {}),
    ...(topicId ? { topicId } : {}),
    segmentId,
    ...(args.send ? { send: true, ...(args['scheduled-at'] ? { scheduledAt: args['scheduled-at'] } : {}) } : {}),
  }

  if (args['dry-run']) {
    console.log(
      JSON.stringify(
        {
          ...payload,
          html: `[${html.length} chars omitted]`,
          text: text ? `[${text.length} chars omitted]` : undefined,
        },
        null,
        2,
      ),
    )
    return
  }

  const { data, error } = await resend.broadcasts.create(payload)

  if (error) {
    throw new Error(error.message)
  }

  console.log(`Broadcast ${args.send ? 'created and queued' : 'created'}: ${data?.id ?? 'ok'}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
