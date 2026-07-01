import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Resend } from 'resend'
import { isResendDisabled } from './lib/resend-config.mjs'

function usage() {
  console.log(`Usage:
  npm run email:send-one-off -- \\
    --html email/resend-things-of-the-week-2026-04-13/preview.html \\
    --subject "Things of the Week: six things worth passing along" \\
    --to you@example.com[,other@example.com] \\
    [--from "Things I Like <hello@thingsilike.app>"] \\
    [--reply-to hello@thingsilike.app] \\
    [--text /path/to/message.txt] \\
    [--dry-run]
`)
}

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

function splitRecipients(raw) {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function main() {
  if (isResendDisabled()) {
    console.log('RESEND_DISABLED is set; skipping send.')
    return
  }

  const args = parseArgs(process.argv.slice(2))

  if (!args.html || !args.subject || !args.to) {
    usage()
    process.exit(1)
  }

  const resendKey = process.env.RESEND_API_KEY?.trim()
  const from =
    args.from?.trim() ||
    process.env.WEEKLY_DIGEST_FROM?.trim() ||
    process.env.ADMIN_DIGEST_FROM?.trim()

  if (!resendKey) {
    throw new Error('Missing RESEND_API_KEY in environment.')
  }

  if (!from) {
    throw new Error('Missing from address. Pass --from or set WEEKLY_DIGEST_FROM / ADMIN_DIGEST_FROM.')
  }

  const html = await readFile(args.html, 'utf8')
  const text = args.text ? await readFile(args.text, 'utf8') : undefined
  const to = splitRecipients(args.to)

  if (to.length === 0) {
    throw new Error('No recipients found in --to.')
  }

  const payload = {
    from,
    to,
    subject: args.subject,
    html,
    ...(text ? { text } : {}),
    ...(args['reply-to'] ? { replyTo: args['reply-to'] } : {}),
  }

  if (args.dryRun) {
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

  const resend = new Resend(resendKey)
  const { data, error } = await resend.emails.send(payload)

  if (error) {
    throw new Error(error.message)
  }

  console.log(`Sent: ${data?.id ?? 'ok'}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
