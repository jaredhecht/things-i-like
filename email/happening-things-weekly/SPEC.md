# Happening Things — weekly email (spec)

**Delivery:** server-rendered HTML email sent directly via **Resend** from `GET /api/cron/happening-things-weekly`.

**Why:** Loops was okay for simple event emails, but not a good fit for the conditional, personalized digest behavior this email needs.

## Schedule

- **One weekly job:** Wednesday **6:00pm America/New_York (ET)** (cron is `0 22 * * 3` UTC — see [vercel.json](/Users/jaredhecht/Projects/things-i-like/vercel.json)).
- No per-recipient local time.

## Current sections

Each section is rendered **only if it has data**:

- **New followers:** up to **5** avatars/usernames, plus overflow text if there are more.
- **New likes:** count only.
- **From people you follow:** count + CTA.
- **All The Things:** network-wide post count + CTA.

The old **New People** section is intentionally removed for now.

## Preferences / unsubscribe

- Preference column: [supabase/weekly-digest-email.sql](/Users/jaredhecht/Projects/things-i-like/supabase/weekly-digest-email.sql)
- Users can toggle the weekly email in [app/settings/page.tsx](/Users/jaredhecht/Projects/things-i-like/app/settings/page.tsx)
- Email unsubscribe route: [app/unsubscribe/weekly/route.ts](/Users/jaredhecht/Projects/things-i-like/app/unsubscribe/weekly/route.ts)

## Cron

- **Route:** `GET /api/cron/happening-things-weekly`
- **Auth:** `Authorization: Bearer <CRON_SECRET>`
- **Dry run:** `?dryRun=1`
- **Target one user:** `?userId=<uuid>`
- **Override destination for a test:** `?userId=<uuid>&email=<address>&force=1`

## Env

See [.env.example](/Users/jaredhecht/Projects/things-i-like/.env.example):

- `RESEND_API_KEY`
- `WEEKLY_DIGEST_FROM` or `ADMIN_DIGEST_FROM`
- `WEEKLY_DIGEST_UNSUBSCRIBE_SECRET` or `CRON_SECRET`
- `HAPPENING_THINGS_DISABLED`
- `HAPPENING_THINGS_MAX_RECIPIENTS`
