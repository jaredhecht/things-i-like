/** Single tag slug: lowercase letters, digits, hyphen; 1–32 chars. */
const TAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export function normalizeTagSlug(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!s || s.length > 32) return null
  if (!TAG_RE.test(s)) return null
  return s
}

/** Up to two distinct tags from optional composer fields. */
export function tagsFromComposerInputs(a: string, b: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [a, b]) {
    const t = normalizeTagSlug(raw)
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
    if (out.length >= 2) break
  }
  return out
}

/** Coerce DB / JSON value to a clean tag array (max 2). */
export function parsePostTags(raw: unknown): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const t = normalizeTagSlug(item)
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
    if (out.length >= 2) break
  }
  return out
}
