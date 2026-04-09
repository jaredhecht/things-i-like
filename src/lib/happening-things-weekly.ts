import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const FOLLOWER_ROWS_IN_EMAIL = 5
const NEW_MEMBER_ROWS_IN_EMAIL = 15
const POST_IDS_CHUNK = 500

export type HappeningThingsPerson = {
  username: string
  avatarUrl: string
  profileUrl: string
}

export type HappeningThingsDataVariables = {
  newFollowersCount: number
  newFollowers: HappeningThingsPerson[]
  newFollowersOverflow: number
  notificationsUrl: string
  newLikesCount: number
  followingPostsCount: number
  followingUrl: string
  networkPostsCount: number
  everythingUrl: string
  newMembersCount: number
  newMembers: HappeningThingsPerson[]
  newMembersOverflow: number
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

function personCard(siteUrl: string, p: ProfileRow): HappeningThingsPerson | null {
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

export async function fetchRecentSignupPosters(
  admin: SupabaseClient,
  siteUrl: string,
  startIso: string,
  endIso: string,
): Promise<HappeningThingsPerson[]> {
  const recentSignups: Array<{ id: string; createdAt: string }> = []
  let page = 1
  const perPage = 1000

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    const batch = data.users || []
    if (batch.length === 0) break

    for (const user of batch) {
      const createdAt = user.created_at
      if (!createdAt) continue
      if (createdAt >= startIso && createdAt < endIso) {
        recentSignups.push({ id: user.id, createdAt })
      }
    }

    if (batch.length < perPage) break
    page += 1
  }

  if (recentSignups.length === 0) return []

  recentSignups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const signupIds = recentSignups.map((user) => user.id)
  const posters = new Set<string>()
  const chunk = 200

  for (let i = 0; i < signupIds.length; i += chunk) {
    const slice = signupIds.slice(i, i + chunk)
    const { data, error } = await admin.from('posts').select('user_id').in('user_id', slice)
    if (error) throw new Error(error.message)
    for (const row of data || []) {
      if (row.user_id) posters.add(row.user_id as string)
    }
  }

  const eligibleIds = recentSignups.map((user) => user.id).filter((id) => posters.has(id))
  const profileMap = await profilesByIds(admin, eligibleIds)
  const people: HappeningThingsPerson[] = []

  for (const id of eligibleIds) {
    const profile = profileMap.get(id)
    if (!profile) continue
    const card = personCard(siteUrl, profile)
    if (card) people.push(card)
  }

  return people
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
  newMembers: HappeningThingsPerson[]
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
  const newFollowers: HappeningThingsPerson[] = []
  for (const fid of sliceIds) {
    const p = profs.get(fid)
    if (!p) continue
    const card = personCard(siteUrl, p)
    if (card) newFollowers.push(card)
  }

  const [newLikesCount, followingPostsCount] = await Promise.all([
    countLikesOnUserPostsInWindow(admin, recipientUserId, startIso, endIso),
    countFollowingPostsInWindow(admin, recipientUserId, startIso, endIso),
  ])

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
    newMembersCount: newMembers.length,
    newMembers: newMembers.slice(0, NEW_MEMBER_ROWS_IN_EMAIL),
    newMembersOverflow: Math.max(0, newMembers.length - NEW_MEMBER_ROWS_IN_EMAIL),
  }
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

export function happeningThingsSubjectLine(vars: HappeningThingsDataVariables): string {
  const parts: string[] = []
  if (vars.newFollowersCount > 0) parts.push(`${vars.newFollowersCount} ${pluralize(vars.newFollowersCount, 'follower')}`)
  if (vars.newLikesCount > 0) parts.push(`${vars.newLikesCount} ${pluralize(vars.newLikesCount, 'like')}`)
  if (vars.followingPostsCount > 0) parts.push(`${vars.followingPostsCount} ${pluralize(vars.followingPostsCount, 'new thing')}`)
  if (vars.newMembersCount > 0) parts.push(`${vars.newMembersCount} ${vars.newMembersCount === 1 ? 'new person' : 'new people'}`)
  if (parts.length === 0) return 'Things are Happening'
  return `Things are Happening · ${parts.join(', ')}`
}

export function renderHappeningThingsEmailHtml(
  vars: HappeningThingsDataVariables,
  options: { unsubscribeUrl: string },
): string {
  const sections: string[] = []

  if (vars.newFollowersCount > 0) {
    const followerRows = vars.newFollowers
      .map(
        (row) => `
          <tr>
            <td style="width:44px;vertical-align:middle;padding:0 0 12px;">
              <a href="${escapeHtml(row.profileUrl)}" style="text-decoration:none;">
                <img src="${escapeHtml(row.avatarUrl)}" width="32" height="32" alt="" style="display:block;border-radius:50%;border:1px solid #e4e4e7;width:32px;height:32px;object-fit:cover;" />
              </a>
            </td>
            <td style="vertical-align:middle;padding:0 0 12px 12px;text-align:left;">
              <a href="${escapeHtml(row.profileUrl)}" style="color:#18181b;text-decoration:none;font-size:14px;font-weight:500;">@${escapeHtml(row.username)}</a>
            </td>
          </tr>`,
      )
      .join('')

    sections.push(`
      <tr>
        <td style="padding:24px 16px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">
            <tr>
              <td style="padding:24px;">
                <div style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:6px;">New followers</div>
                <div style="color:#18181b;font-size:18px;font-weight:600;line-height:1.35;padding-bottom:16px;">
                  ${vars.newFollowersCount} new ${pluralize(vars.newFollowersCount, 'follower')} this week
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${followerRows}
                </table>
                ${
                  vars.newFollowersOverflow > 0
                    ? `<div style="color:#71717a;font-size:13px;padding-top:4px;">and ${vars.newFollowersOverflow} more</div>`
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
  }

  if (vars.newLikesCount > 0) {
    sections.push(`
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">
            <tr>
              <td style="padding:24px;">
                <div style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:6px;">New likes</div>
                <div style="color:#18181b;font-size:18px;font-weight:600;line-height:1.35;">
                  ${vars.newLikesCount} new ${pluralize(vars.newLikesCount, 'like')} on your things
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
  }

  if (vars.followingPostsCount > 0) {
    sections.push(`
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">
            <tr>
              <td style="padding:24px;">
                <div style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:6px;">From people you follow</div>
                <div style="color:#18181b;font-size:18px;font-weight:600;line-height:1.35;padding-bottom:16px;">
                  ${vars.followingPostsCount} new ${pluralize(vars.followingPostsCount, 'thing')} from people you follow
                </div>
                <a href="${escapeHtml(vars.followingUrl)}" style="display:inline-block;background:#18181b;border-radius:9999px;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;text-decoration:none;">See Things</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
  }

  if (vars.networkPostsCount > 0) {
    sections.push(`
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">
            <tr>
              <td style="padding:24px;">
                <div style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:6px;">All The Things</div>
                <div style="color:#18181b;font-size:18px;font-weight:600;line-height:1.35;padding-bottom:16px;">
                  ${vars.networkPostsCount} new ${pluralize(vars.networkPostsCount, 'thing')} were posted
                </div>
                <a href="${escapeHtml(vars.everythingUrl)}" style="display:inline-block;background:#18181b;border-radius:9999px;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;text-decoration:none;">See All The Things</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
  }

  if (vars.newMembersCount > 0) {
    const newMemberRows = vars.newMembers
      .map(
        (row) => `
          <tr>
            <td style="width:44px;vertical-align:middle;padding:0 0 12px;">
              <a href="${escapeHtml(row.profileUrl)}" style="text-decoration:none;">
                <img src="${escapeHtml(row.avatarUrl)}" width="32" height="32" alt="" style="display:block;border-radius:50%;border:1px solid #e4e4e7;width:32px;height:32px;object-fit:cover;" />
              </a>
            </td>
            <td style="vertical-align:middle;padding:0 0 12px 12px;text-align:left;">
              <a href="${escapeHtml(row.profileUrl)}" style="color:#18181b;text-decoration:none;font-size:14px;font-weight:500;">@${escapeHtml(row.username)}</a>
            </td>
          </tr>`,
      )
      .join('')

    sections.push(`
      <tr>
        <td style="padding:8px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">
            <tr>
              <td style="padding:24px;">
                <div style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:6px;">New People</div>
                <div style="color:#18181b;font-size:18px;font-weight:600;line-height:1.35;padding-bottom:16px;">
                  ${vars.newMembersCount} ${vars.newMembersCount === 1 ? 'new person signed up and shared their first thing' : 'new people signed up and shared their first thing'}
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${newMemberRows}
                </table>
                ${
                  vars.newMembersOverflow > 0
                    ? `<div style="color:#71717a;font-size:13px;padding-top:4px;">and ${vars.newMembersOverflow} more</div>`
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`)
  }

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
            <tr>
              <td style="padding:40px 24px 8px;text-align:center;">
                <div style="font-size:28px;font-weight:300;line-height:1.2;letter-spacing:-0.02em;padding-bottom:8px;">Things I Like</div>
                <div style="color:#71717a;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Things are Happening</div>
              </td>
            </tr>
            ${sections.join('')}
            <tr>
              <td style="padding:16px 16px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:6px;">
                  <tr>
                    <td style="padding:32px 24px;text-align:center;">
                      <div style="font-size:17px;font-weight:600;padding-bottom:14px;">Like things? Share them.</div>
                      <a href="${escapeHtml(vars.everythingUrl.replace('/?feed=everything', '/'))}" style="display:inline-block;background:#18181b;border-radius:9999px;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;text-decoration:none;">Things I Like</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px 48px;text-align:center;color:#a1a1aa;font-size:12px;line-height:1.6;">
                You&rsquo;re getting this weekly because you have weekly updates turned on for Things I Like.<br />
                <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#71717a;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderHappeningThingsEmailText(
  vars: HappeningThingsDataVariables,
  options: { unsubscribeUrl: string },
): string {
  const lines = ['Things I Like', 'Things are Happening', '']

  if (vars.newFollowersCount > 0) {
    lines.push(`NEW FOLLOWERS`, `${vars.newFollowersCount} new ${pluralize(vars.newFollowersCount, 'follower')} this week`)
    for (const follower of vars.newFollowers) lines.push(`- @${follower.username}`)
    if (vars.newFollowersOverflow > 0) lines.push(`- and ${vars.newFollowersOverflow} more`)
    lines.push('')
  }

  if (vars.newLikesCount > 0) {
    lines.push('NEW LIKES', `${vars.newLikesCount} new ${pluralize(vars.newLikesCount, 'like')} on your things`, '')
  }

  if (vars.followingPostsCount > 0) {
    lines.push(
      'FROM PEOPLE YOU FOLLOW',
      `${vars.followingPostsCount} new ${pluralize(vars.followingPostsCount, 'thing')} from people you follow`,
      `See Things: ${vars.followingUrl}`,
      '',
    )
  }

  if (vars.networkPostsCount > 0) {
    lines.push(
      'ALL THE THINGS',
      `${vars.networkPostsCount} new ${pluralize(vars.networkPostsCount, 'thing')} were posted`,
      `See All The Things: ${vars.everythingUrl}`,
      '',
    )
  }

  if (vars.newMembersCount > 0) {
    lines.push(
      'NEW PEOPLE',
      `${vars.newMembersCount} ${vars.newMembersCount === 1 ? 'new person signed up and shared their first thing' : 'new people signed up and shared their first thing'}`,
    )
    for (const member of vars.newMembers) lines.push(`- @${member.username}`)
    if (vars.newMembersOverflow > 0) lines.push(`- and ${vars.newMembersOverflow} more`)
    lines.push('')
  }

  lines.push('Like things? Share them.', vars.everythingUrl.replace('/?feed=everything', '/'), '', `Unsubscribe: ${options.unsubscribeUrl}`)
  return lines.join('\n')
}

function weeklyDigestToken(secret: string, userId: string): string {
  return createHmac('sha256', secret).update(`weekly-digest:${userId}`).digest('base64url')
}

export function buildWeeklyDigestUnsubscribeUrl(siteUrl: string, userId: string, secret: string): string {
  const token = weeklyDigestToken(secret, userId)
  return `${siteUrl}/unsubscribe/weekly?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`
}

export function verifyWeeklyDigestUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(weeklyDigestToken(secret, userId))
  const actual = Buffer.from(token)
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
