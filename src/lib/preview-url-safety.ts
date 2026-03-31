/**
 * Block obvious SSRF / internal targets for server-side URL fetching (link preview).
 * Does not resolve DNS; hostnames that later resolve to private IPs are still a residual risk.
 */
export function isSafePublicHttpUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false

  const host = parsed.hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host === '0.0.0.0') return false
  if (host === '::1' || host === '[::1]') return false
  if (host === 'metadata.google.internal') return false
  if (host === '169.254.169.254' || host === 'metadata.google' || host === 'metadata') return false

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const m = host.match(ipv4)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const c = Number(m[3])
    const d = Number(m[4])
    if ([a, b, c, d].some((n) => n > 255)) return false
    if (a === 0 || a === 127) return false
    if (a === 10) return false
    if (a === 169 && b === 254) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    return true
  }

  return true
}
