/**
 * OAuth redirect for signInWithOAuth must match Supabase Redirect URLs **exactly**
 * (query strings count). We use a fixed `/auth/callback` URL and store the post-login
 * path in a short-lived cookie so allowlist entries like:
 *   http://localhost:3001/auth/callback
 * keep working without wildcards.
 */
export const OAUTH_RETURN_COOKIE = 'til_oauth_next'

const MAX_AGE_SEC = 600

export function safeOAuthNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) {
    return '/'
  }
  return raw
}

export function readOAuthReturnPath(): string {
  if (typeof document === 'undefined') return '/'
  const prefix = `${OAUTH_RETURN_COOKIE}=`
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(prefix)) continue
    const v = trimmed.slice(prefix.length)
    try {
      return safeOAuthNextPath(decodeURIComponent(v))
    } catch {
      return '/'
    }
  }
  return '/'
}

export function clearOAuthReturnCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${OAUTH_RETURN_COOKIE}=; Path=/; Max-Age=0`
}

/** Call immediately before signInWithOAuth. */
export function oauthSignInRedirectOptions(nextPath: string): { redirectTo: string } {
  if (typeof window === 'undefined') return { redirectTo: '' }
  const path = nextPath.startsWith('/') ? nextPath : `/${nextPath}`
  const normalized = path === '' ? '/' : path
  document.cookie = `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax`
  return { redirectTo: `${window.location.origin}/auth/callback` }
}
