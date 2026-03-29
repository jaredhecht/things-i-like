/** Server-only: Claude classification for profile modules. */

export type PostForClassification = {
  id: string
  type: string
  content: string | null
  caption: string | null
  metadata: Record<string, unknown> | null
  tags: string[] | null
  user_id: string | null
}

export type ModuleForPrompt = { id: string; name: string }

export function serializePostForPrompt(post: PostForClassification): string {
  const lp = post.metadata && typeof post.metadata === 'object' ? (post.metadata as Record<string, unknown>).link_preview : null
  const preview =
    lp && typeof lp === 'object'
      ? {
          url: typeof (lp as { url?: unknown }).url === 'string' ? (lp as { url: string }).url : undefined,
          title: typeof (lp as { title?: unknown }).title === 'string' ? (lp as { title: string }).title : undefined,
          description:
            typeof (lp as { description?: unknown }).description === 'string'
              ? (lp as { description: string }).description
              : undefined,
          siteName: typeof (lp as { siteName?: unknown }).siteName === 'string' ? (lp as { siteName: string }).siteName : undefined,
        }
      : null
  return JSON.stringify(
    {
      type: post.type,
      content: post.content,
      caption: post.caption,
      tags: post.tags ?? [],
      link_preview: preview,
      metadata: post.metadata,
    },
    null,
    0,
  )
}

export function buildClassificationPrompt(
  postJson: string,
  modules: ModuleForPrompt[],
  userPinnedModuleIds: string[],
): string {
  const lines = modules.map((m) => `- ${m.id} → "${m.name}"`).join('\n')
  const pinned =
    userPinnedModuleIds.length > 0
      ? userPinnedModuleIds.join(', ')
      : 'None (no manual module tags on this post).'
  return `You classify a social post into thematic "modules" (like Music, Films, Books). Use the post's meaning — URL, title, description, caption, tags, type — not only the post type (e.g. a YouTube link can be Music or Films depending on the title).

Rules:
1. Output ONLY a JSON object, no markdown fences, no extra text: {"module_ids":["uuid",...]}
2. Every string in module_ids MUST be copied exactly from the module list below.
3. The author manually tagged this post to these module ids — you MUST include every one of them in module_ids: ${pinned}
4. Add any other module ids from the list that clearly fit the post. A post can belong to multiple modules.
5. If nothing else fits beyond the manual tags, module_ids may contain only the manual ids.
6. Omit module_ids or use [] only if there are no modules at all in the list (should not happen).

Active modules (id → display name):
${lines}

Post (JSON):
${postJson}`
}

function parseModuleIdsFromAssistantText(text: string, allowed: Set<string>): string[] {
  const raw = text.trim()
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(unfenced)
  } catch {
    const m = unfenced.match(/\{[\s\S]*\}/)
    if (!m) return []
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const ids = (parsed as { module_ids?: unknown }).module_ids
  if (!Array.isArray(ids)) return []
  const out: string[] = []
  for (const x of ids) {
    if (typeof x === 'string' && allowed.has(x) && !out.includes(x)) out.push(x)
  }
  return out
}

export async function anthropicClassifyModuleIds(prompt: string, allowedModuleIds: Set<string>): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    console.warn('[modules] ANTHROPIC_API_KEY is not set; skipping AI module classification')
    return []
  }

  // Default: Haiku 4.5 (3.5 Haiku claude-3-5-haiku-20241022 was retired 2026-02-19).
  const model = process.env.ANTHROPIC_MODULE_MODEL || 'claude-haiku-4-5-20251001'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[modules] Anthropic API error', res.status, errText.slice(0, 500))
    return []
  }

  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = body.content?.find((c) => c.type === 'text')?.text ?? ''
  return parseModuleIdsFromAssistantText(text, allowedModuleIds)
}
