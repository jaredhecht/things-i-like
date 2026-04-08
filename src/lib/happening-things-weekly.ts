import type { SupabaseClient } from '@supabase/supabase-js'

const FOLLOWER_ROWS_IN_EMAIL = 10
const POST_IDS_CHUNK = 500

/** Matches `email/happening-things-weekly/index.mjml` dataVariables. */
export type HappeningThingsDataVariables = {
  newFollowersCount: number
  newFollowers: Array<{ username: string; avatarUrl: string; profileUrl: string }>
  newFollowersOverflow: number
  notificationsUrl: string
  newLikesCount: number
  followingPostsCount: number
  followingUrl: string
  networkPostsCount: number
  everythingUrl: string
  newMembersCount: number
  newMembers: Array<{ username: string; avatarUrl: string; profileUrl: string }>
}

export function getHappeningThingsWindow(end: Date): { start: Date; end: Date } {
  const windowMs = 7 * 24 * 60 * 60 * 1000
  return { start: new Date(end.getTime() - windowMs), end }
}

export function normalizeSiteUrl(raw: string | undefined): string {
  const s = raw?.trim() || 'https://thingsilike.app'
  return s.replace(/\/+$/, '')
}

function avatarForEmail(siteUrl: string, raw: string | null | undefined): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t) return t
  return `${siteUrl}/icon.svg`
}

type ProfileRow = { id: string; username: string | null; avatar_url: string | null }

async function profilesByIds(admin: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>()
  if (ids.length === 0) return map
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const { data, error } = await admin.from('profiles').select('id, username, avatar_url').in('id', slice)
    if (error) throw new Error(error.message)
    for (const p of data || []) {
      map.set(p.id as string, p as ProfileRow)
    }
  }
  return map
}

function memberCard(siteUrl: string, p: ProfileRow): { username: string; avatarUrl: string; profileUrl: string } | null {
  const u = p.username?.trim()
  if (!u) return null
  return {
    username: u,
    avatarUrl: avatarForEmail(siteUrl, p.avatar_url),
    profileUrl: `${siteUrl}/${encodeURIComponent(u)}`,
  }
}

export async function fetchNetworkPostsCount(
  admin: SupabaseClient,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', endIso)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Users whose first-ever post timestamp falls in [start, end). Requires `happening_first_post_users_in_window` RPC in Supabase. */
export async function fetchFirstPostAuthorsInWindow(
  admin: SupabaseClient,
  siteUrl: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ username: string; avatarUrl: string; profileUrl: string }>> {
  const { data, error } = await admin.rpc('happening_first_post_users_in_window', {
    window_start: startIso,
    window_end: endIso,
  })
  if (error) {
    throw new Error(
      `${error.message} (run supabase/happening-things-weekly-rpc.sql if this function is missing)`,
    )
  }
  const rows = (data || []) as { user_id?: string }[]
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])]
  const profs = await profilesByIds(admin, ids)
  const out: Array<{ username: string; avatarUrl: string; profileUrl: string }> = []
  for (const id of ids) {
    const p = profs.get(id)
    if (!p) continue
    const card = memberCard(siteUrl, p)
    if (card) out.push(card)
  }
  return out
}

async function countLikesOnUserPostsInWindow(
  admin: SupabaseClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data: posts, error: pe } = await admin.from('posts').select('id').eq('user_id', userId)
  if (pe) throw new Error(pe.message)
  const ids = (posts || []).map((r) => r.id as string)
  let total = 0
  for (let i = 0; i < ids.length; i += POST_IDS_CHUNK) {
    const slice = ids.slice(i, i + POST_IDS_CHUNK)
    if (slice.length === 0) break
    const { count, error } = await admin
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .in('post_id', slice)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
    if (error) throw new Error(error.message)
    total += count ?? 0
  }
  return total
}

async function countFollowingPostsInWindow(
  admin: SupabaseClient,
  followerId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { data: follows, error: fe } = await admin
    .from('follows')
    .select('following_id')
    .eq('follower_id', followerId)
  if (fe) throw new Error(fe.message)
  const followingIds = [...new Set((follows || []).map((f) => f.following_id as string))]
  if (followingIds.length === 0) return 0
  const { count, error } = await admin
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .in('user_id', followingIds)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function buildHappeningThingsDataVariables(args: {
  admin: SupabaseClient
  siteUrl: string
  recipientUserId: string
  startIso: string
  endIso: string
  networkPostsCount: number
  newMembers: HappeningThingsDataVariables['newMembers']
}): Promise<HappeningThingsDataVariables> {
  const { admin, siteUrl, recipientUserId, startIso, endIso, networkPostsCount, newMembers } = args

  const notificationsUrl = `${siteUrl}/notifications`
  const followingUrl = `${siteUrl}/?feed=following`
  const everythingUrl = `${siteUrl}/?feed=everything`

  const { data: followRows, error: followErr } = await admin
    .from('follows')
    .select('follower_id, created_at')
    .eq('following_id', recipientUserId)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
  if (followErr) throw new Error(followErr.message)

  const followerIdsOrdered = (followRows || []).map((r) => r.follower_id as string)
  const totalNewFollowers = followerIdsOrdered.length
  const sliceIds = followerIdsOrdered.slice(0, FOLLOWER_ROWS_IN_EMAIL)
  const profs = await profilesByIds(admin, sliceIds)
  const newFollowers: HappeningThingsDataVariables['newFollowers'] = []
  for (const fid of sliceIds) {
    const p = profs.get(fid)
    if (!p) continue
    const card = memberCard(siteUrl, p)
    if (card) newFollowers.push(card)
  }

  const [newLikesCount, followingPostsCount] = await Promise.all([
    countLikesOnUserPostsInWindow(admin, recipientUserId, startIso, endIso),
    countFollowingPostsInWindow(admin, recipientUserId, startIso, endIso),
  ])

  const newMembersCount = newMembers.length

  return {
    newFollowersCount: totalNewFollowers,
    newFollowers,
    newFollowersOverflow: Math.max(0, totalNewFollowers - FOLLOWER_ROWS_IN_EMAIL),
    notificationsUrl,
    newLikesCount,
    followingPostsCount,
    followingUrl,
    networkPostsCount,
    everythingUrl,
    newMembersCount,
    newMembers,
  }
}

/** Loops event API: keep each string value under ~500 chars (see API debugging docs). */
const LOOPS_EVENT_VALUE_MAX_CHARS = 450

export function clampForLoopsEventString(s: string): string {
  const t = s.trim()
  if (t.length <= LOOPS_EVENT_VALUE_MAX_CHARS) return t
  return `${t.slice(0, LOOPS_EVENT_VALUE_MAX_CHARS - 1)}…`
}

const FIRST_POSTER_SLOTS_IN_EVENT = 15

/**
 * Flatten digest data for `POST /v1/events/send` — event properties are scalar only (no arrays).
 * Register these property names on the `happening_things_weekly` event in Loops before sending.
 */
export function toHappeningThingsEventProperties(vars: HappeningThingsDataVariables): Record<string, string | number> {
  const out: Record<string, string | number> = {
    newFollowersCount: vars.newFollowersCount,
    newFollowersOverflow: vars.newFollowersOverflow,
    notificationsUrl: clampForLoopsEventString(vars.notificationsUrl),
    newLikesCount: vars.newLikesCount,
    followingPostsCount: vars.followingPostsCount,
    followingUrl: clampForLoopsEventString(vars.followingUrl),
    networkPostsCount: vars.networkPostsCount,
    everythingUrl: clampForLoopsEventString(vars.everythingUrl),
    newMembersCount: vars.newMembersCount,
  }
  for (let i = 0; i < FOLLOWER_ROWS_IN_EMAIL; i++) {
    const slot = i + 1
    const row = vars.newFollowers[i]
    out[`follower_${slot}_username`] = row ? clampForLoopsEventString(row.username) : ''
    out[`follower_${slot}_avatar_url`] = row ? clampForLoopsEventString(row.avatarUrl) : ''
    out[`follower_${slot}_profile_url`] = row ? clampForLoopsEventString(row.profileUrl) : ''
  }
  for (let i = 0; i < FIRST_POSTER_SLOTS_IN_EVENT; i++) {
    const slot = i + 1
    const row = vars.newMembers[i]
    out[`firstposter_${slot}_username`] = row ? clampForLoopsEventString(row.username) : ''
    out[`firstposter_${slot}_avatar_url`] = row ? clampForLoopsEventString(row.avatarUrl) : ''
    out[`firstposter_${slot}_profile_url`] = row ? clampForLoopsEventString(row.profileUrl) : ''
  }
  out.first_posters_overflow = Math.max(0, vars.newMembers.length - FIRST_POSTER_SLOTS_IN_EVENT)
  return out
}

export function shouldSkipHappeningThingsSend(vars: HappeningThingsDataVariables): boolean {
  return (
    vars.newFollowersCount === 0 &&
    vars.newLikesCount === 0 &&
    vars.followingPostsCount === 0 &&
    vars.networkPostsCount === 0 &&
    vars.newMembersCount === 0
  )
}

export function happeningThingsIdempotencyKey(end: Date, recipientUserId: string): string {
  const day = end.toISOString().slice(0, 10)
  return `happening-${day}-${recipientUserId}`.slice(0, 100)
}
