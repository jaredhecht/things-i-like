/**
 * Calls the Loops audience cron from your machine (loads CRON_SECRET from .env.local).
 *
 * Usage (from repo root, with dev server running for local):
 *   npm run loops:lists
 *   npm run loops:sync
 *
 * Production (same .env.local or export LOOPS_SYNC_BASE + CRON_SECRET):
 *   LOOPS_SYNC_BASE=https://thingsilike.app npm run loops:lists
 */

const mode = process.argv[2] || 'lists'
const base = (process.env.LOOPS_SYNC_BASE || 'http://localhost:3000').replace(/\/$/, '')
const secret = process.env.CRON_SECRET?.trim()

if (!secret) {
  console.error('Missing CRON_SECRET. Add it to .env.local — npm loads it via --env-file.')
  process.exit(1)
}

const path =
  mode === 'sync' ? '/api/cron/loops-sync-audience' : '/api/cron/loops-sync-audience?listsOnly=1'
const url = `${base}${path}`

console.error(`→ ${url}\n`)

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
})

const text = await res.text()
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}

if (!res.ok) {
  process.exit(1)
}
