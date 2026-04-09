# Happening Things — weekly email (spec)

**Loops product:** **Loop** triggered by an **event** (not transactional email — avoids misusing transactional for promotional/lifecycle content per Loops policy).

**Backend:** `GET /api/cron/happening-things-weekly` calls `POST https://app.loops.so/api/v1/events/send` with `eventName` (default `happening_things_weekly`) and `eventProperties` (scalar fields only; Loops limits value length ~500 chars — we clamp strings).

## Schedule

- **One weekly job:** Wednesday **6:00pm America/New_York (ET)** (cron is `0 22 * * 3` UTC — see `vercel.json`).
- No per-recipient local time.

## Section 5 cohort

Users whose **first-ever post** falls in the job’s **7-day window**. Implemented in SQL + `buildHappeningThingsDataVariables`; up to **15** people included in event properties, plus `first_posters_overflow` if more.

## Loops setup checklist

We cannot configure your Loops account from here (no access to your login). You can **auto-register the event + properties** by running once from the repo (uses `test@example.com` — no real delivery):

```bash
npm run loops:happening-bootstrap
```

(`LOOPS_API_KEY` in `.env.local`; optional `LOOPS_HAPPENING_THINGS_EVENT_NAME` if not using the default.)

Then in the Loops UI only:

1. **Loop:** new Loop → trigger **Event received** → event **`happening_things_weekly`** (same name as env default).
2. **Email step:** import `email/happening-things-weekly/happening-things-loops.zip` (or `npm run email:zip-happening-loops` then upload). Fix any merge tags with the event-property picker if needed.
3. **Publish** the Loop.

### Event property names (reference — included in bootstrap payload)

Full list for manual entry in Loops (name + type, tab-separated): **`loops-event-properties.txt`** in this folder. Each **name** must match exactly — no backticks, no commas, one property per row in the Loops UI.

**Numbers:** `newFollowersCount`, `newFollowersOverflow`, `newLikesCount`, `followingPostsCount`, `networkPostsCount`, `newMembersCount`, `first_posters_overflow`

**Strings:** `notificationsUrl`, `followingUrl`, `everythingUrl`

**Per follower row (1–5):** `follower_N_username`, `follower_N_avatar_url`, `follower_N_profile_url` (empty string when unused)

**First-poster rows (1–15):** `firstposter_N_username`, `firstposter_N_avatar_url`, `firstposter_N_profile_url`

## Deep links (TIL)

Home reads `/?feed=following` and `/?feed=everything` on load.

## Cron

- **Route:** `GET /api/cron/happening-things-weekly` — `Authorization: Bearer <CRON_SECRET>`.
- **Dry run:** `?dryRun=1`.
- **SQL:** `supabase/happening-things-weekly-rpc.sql`

## Env

See `.env.example`: `LOOPS_HAPPENING_THINGS_EVENT_NAME` (optional), `HAPPENING_THINGS_DISABLED`, `HAPPENING_THINGS_MAX_RECIPIENTS`.
