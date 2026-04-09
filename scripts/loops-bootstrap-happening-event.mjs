/**
 * Prime Loops with the `happening_things_weekly` event + all event properties in one API call.
 * Uses test@example.com so Loops does not deliver real mail (per their transactional/event testing docs).
 *
 * Prerequisites: LOOPS_API_KEY in .env.local
 *
 *   node --env-file=.env.local scripts/loops-bootstrap-happening-event.mjs
 *
 * After success in Loops UI:
 *   1. Confirm the event + properties under Settings → Events (or equivalent).
 *   2. Create a Loop → trigger “Event received” → `happening_things_weekly`.
 *   3. Import `email/happening-things-weekly/happening-things-loops.zip` (or paste index.mjml) into the email step.
 *   4. Publish.
 */

const LOOPS_API_BASE = 'https://app.loops.so/api/v1'
const DEFAULT_EVENT_NAME = 'happening_things_weekly'

const key = process.env.LOOPS_API_KEY?.trim()
const eventName = process.env.LOOPS_HAPPENING_THINGS_EVENT_NAME?.trim() || DEFAULT_EVENT_NAME

if (!key) {
  console.error('Missing LOOPS_API_KEY. Add to .env.local and run:\n  node --env-file=.env.local scripts/loops-bootstrap-happening-event.mjs')
  process.exit(1)
}

/** Mirrors `toHappeningThingsEventProperties` sample shape (keep in sync with src/lib/happening-things-weekly.ts). */
function sampleEventProperties() {
  const site = 'https://thingsilike.app'
  const out = {
    newFollowersCount: 2,
    newFollowersOverflow: 0,
    notificationsUrl: `${site}/notifications`,
    newLikesCount: 5,
    followingPostsCount: 3,
    followingUrl: `${site}/?feed=following`,
    networkPostsCount: 42,
    everythingUrl: `${site}/?feed=everything`,
    newMembersCount: 2,
    first_posters_overflow: 0,
  }
  const fillFollower = (slot, u, av, path) => {
    out[`follower_${slot}_username`] = u
    out[`follower_${slot}_avatar_url`] = av
    out[`follower_${slot}_profile_url`] = path
  }
  fillFollower(1, 'preview_one', `${site}/icon.svg`, `${site}/preview_one`)
  fillFollower(2, 'preview_two', `${site}/icon.svg`, `${site}/preview_two`)
  for (let s = 3; s <= 5; s++) {
    fillFollower(s, '', '', '')
  }
  const fillPoster = (slot, u, av, path) => {
    out[`firstposter_${slot}_username`] = u
    out[`firstposter_${slot}_avatar_url`] = av
    out[`firstposter_${slot}_profile_url`] = path
  }
  fillPoster(1, 'newbie_a', `${site}/icon.svg`, `${site}/newbie_a`)
  fillPoster(2, 'newbie_b', `${site}/icon.svg`, `${site}/newbie_b`)
  for (let s = 3; s <= 15; s++) {
    fillPoster(s, '', '', '')
  }
  return out
}

const body = {
  email: 'test@example.com',
  userId: 'til-bootstrap-preview-user',
  eventName,
  eventProperties: sampleEventProperties(),
}

console.error(`POST ${LOOPS_API_BASE}/events/send`)
console.error(`eventName: ${eventName}`)
console.error(`recipient: test@example.com (no delivery per Loops test-address policy)\n`)

const res = await fetch(`${LOOPS_API_BASE}/events/send`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(body),
})

const data = await res.json().catch(() => ({}))
console.log(JSON.stringify(data, null, 2))

if (!res.ok) {
  console.error(`\nHTTP ${res.status}`)
  process.exit(1)
}

console.error(
  '\nNext: In Loops, create a Loop triggered by this event, attach the MJML from email/happening-things-weekly/, publish.',
)
