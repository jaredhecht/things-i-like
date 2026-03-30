/** Loose UUID check for `[username]/[postId]` route param (avoids conflicting with future slugs). */
export const PUBLIC_POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPublicPostIdParam(id: string): boolean {
  return PUBLIC_POST_ID_RE.test(id.trim())
}

export function buildPublicPostUrl(origin: string, username: string, postId: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/${encodeURIComponent(username.toLowerCase())}/${postId}`
}
