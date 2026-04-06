import type { Post } from '@/src/lib/post-helpers'
import { stripHtml } from '@/src/lib/post-helpers'
import { parsePostTags } from '@/src/lib/post-tags'
import { sanitizeRichHtml } from '@/src/lib/sanitize-rich-html'

/**
 * Preserved commentary + tags from each layer when rething (Tumblr-style chain).
 * `parent` points at the older snapshot when rething a rething.
 */
export type RethingOriginalBlock = {
  caption: string | null
  tags: string[]
  parent?: RethingOriginalBlock | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Parse and validate `metadata.rething_original` from the DB. */
export function parseRethingOriginalFromMetadata(metadata: unknown): RethingOriginalBlock | null {
  let m: unknown = metadata
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m) as unknown
    } catch {
      return null
    }
  }
  if (!m || !isRecord(m)) return null
  const raw = m.rething_original
  if (!isRecord(raw)) return null
  return parseBlock(raw)
}

function parseBlock(raw: Record<string, unknown>): RethingOriginalBlock | null {
  const caption = typeof raw.caption === 'string' ? raw.caption : null
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : []
  let parent: RethingOriginalBlock | null = null
  if (raw.parent != null && isRecord(raw.parent)) {
    parent = parseBlock(raw.parent)
  }
  return { caption, tags, parent: parent ?? undefined }
}

/** Oldest layer first (original poster), then each rething layer up to the immediate source. */
export function flattenRethingChainFromRoot(block: RethingOriginalBlock | null | undefined): RethingOriginalBlock[] {
  if (!block) return []
  const parent = block.parent != null ? flattenRethingChainFromRoot(block.parent) : []
  return [...parent, { caption: block.caption, tags: block.tags ?? [], parent: undefined }]
}

/**
 * Snapshot the source post’s caption + tags for the new rething row.
 * Chains `parent` from the source’s own `rething_original` when rething a rething.
 */
export function buildRethingSnapshotForInsert(source: Post): RethingOriginalBlock {
  const priorRoot =
    source.metadata && isRecord(source.metadata) && source.metadata.rething_original && isRecord(source.metadata.rething_original)
      ? parseBlock(source.metadata.rething_original as Record<string, unknown>)
      : null

  const rawCap = source.caption?.trim() ? sanitizeRichHtml(source.caption.trim()) : null
  const caption = rawCap && stripHtml(rawCap).length ? rawCap : null
  const tags = parsePostTags(source.tags)

  return {
    caption,
    tags,
    ...(priorRoot ? { parent: priorRoot } : {}),
  }
}
