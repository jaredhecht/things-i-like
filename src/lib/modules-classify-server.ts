import type { SupabaseClient } from '@supabase/supabase-js'
import {
  anthropicClassifyModuleIds,
  buildClassificationPrompt,
  serializePostForPrompt,
  type PostForClassification,
} from '@/src/lib/module-classification'

export async function classifyPostForOwner(
  supabase: SupabaseClient,
  postId: string,
  ownerUserId: string,
): Promise<{ ok: true; module_ids: string[] } | { ok: false; error: string }> {
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('id, type, content, caption, metadata, tags, user_id')
    .eq('id', postId)
    .maybeSingle()

  if (postErr || !post) return { ok: false, error: 'Post not found' }
  if (post.user_id !== ownerUserId) return { ok: false, error: 'Forbidden' }

  const { data: modules, error: modErr } = await supabase
    .from('profile_modules')
    .select('id, name')
    .eq('user_id', ownerUserId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (modErr) {
    console.error('[classify] modules', modErr.message)
    return { ok: false, error: modErr.message }
  }

  const moduleList = modules || []
  if (moduleList.length === 0) {
    await supabase.from('post_modules_ai').delete().eq('post_id', postId)
    return { ok: true, module_ids: [] }
  }

  const allowed = new Set(moduleList.map((m) => m.id as string))

  const { data: userRows } = await supabase.from('post_modules_user').select('module_id').eq('post_id', postId)
  const userPinned = [...new Set((userRows || []).map((r) => r.module_id as string))]

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('modules_ai_enabled')
    .eq('id', ownerUserId)
    .maybeSingle()
  if (profErr) {
    console.warn('[classify] profiles.modules_ai_enabled:', profErr.message)
  }
  const aiEnabled = prof?.modules_ai_enabled !== false

  if (!aiEnabled) {
    await supabase.from('post_modules_ai').delete().eq('post_id', postId)
    const displayIds = [...new Set(userPinned.filter((id) => allowed.has(id)))]
    return { ok: true, module_ids: displayIds }
  }

  const { data: supRows, error: supErr } = await supabase
    .from('post_modules_ai_suppressed')
    .select('module_id')
    .eq('post_id', postId)
  if (supErr) {
    console.warn('[classify] post_modules_ai_suppressed unreadable — run supabase/post-modules-ai-suppressed.sql:', supErr.message)
  }
  const suppressed = new Set<string>()
  if (!supErr) {
    for (const r of supRows || []) suppressed.add(r.module_id as string)
  }

  const postForAi = post as PostForClassification
  const prompt = buildClassificationPrompt(
    serializePostForPrompt(postForAi),
    moduleList as { id: string; name: string }[],
    userPinned,
  )

  const aiPicked = await anthropicClassifyModuleIds(prompt, allowed)

  const userSet = new Set(userPinned)
  const aiOnlyIds = [...new Set(aiPicked)].filter(
    (id) => allowed.has(id) && !userSet.has(id) && !suppressed.has(id),
  )

  await supabase.from('post_modules_ai').delete().eq('post_id', postId)

  if (aiOnlyIds.length > 0) {
    const inserts = aiOnlyIds.map((module_id) => ({ post_id: postId, module_id }))
    const { error: insErr } = await supabase.from('post_modules_ai').insert(inserts)
    if (insErr) {
      console.error('[classify] insert ai', insErr.message)
      return { ok: false, error: insErr.message }
    }
  }

  const displayIds = [...new Set([...userPinned.filter((id) => allowed.has(id)), ...aiOnlyIds])]
  return { ok: true, module_ids: displayIds }
}
