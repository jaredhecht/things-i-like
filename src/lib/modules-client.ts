import type { SupabaseClient } from '@supabase/supabase-js'

/** Remove a post from a module and block AI from re-assigning that pair until the user adds the module again. */
export async function removePostFromModule(
  supabase: SupabaseClient,
  postId: string,
  moduleId: string,
): Promise<{ error: string | null }> {
  await supabase.from('post_modules_user').delete().eq('post_id', postId).eq('module_id', moduleId)
  await supabase.from('post_modules_ai').delete().eq('post_id', postId).eq('module_id', moduleId)
  const { error } = await supabase.from('post_modules_ai_suppressed').insert({ post_id: postId, module_id: moduleId })
  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message || '')
    if (dup) return { error: null }
    return { error: error.message }
  }
  return { error: null }
}

export async function clearAiSuppressionForModule(
  supabase: SupabaseClient,
  postId: string,
  moduleId: string,
): Promise<void> {
  await supabase.from('post_modules_ai_suppressed').delete().eq('post_id', postId).eq('module_id', moduleId)
}

/** Remove all AI module rows for this user’s posts (e.g. when turning off AI tagging in settings). */
export async function clearAllPostModulesAiForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data: posts, error } = await supabase.from('posts').select('id').eq('user_id', userId).range(from, from + pageSize - 1)
    if (error) return { error: error.message }
    const batch = posts || []
    if (batch.length === 0) break
    const ids = batch.map((p) => p.id as string)
    const { error: delErr } = await supabase.from('post_modules_ai').delete().in('post_id', ids)
    if (delErr) return { error: delErr.message }
    if (batch.length < pageSize) break
  }
  return { error: null }
}

/** Align `post_modules_user` (and related AI rows / suppression) with the chip selection — same rules as composer + sheet. */
export async function syncPostUserModulesSelection(
  supabase: SupabaseClient,
  postId: string,
  nextModuleIds: Set<string>,
): Promise<{ error: string | null }> {
  const { data: userRows } = await supabase.from('post_modules_user').select('module_id').eq('post_id', postId)
  const prev = new Set((userRows || []).map((r) => r.module_id as string))

  for (const id of nextModuleIds) {
    if (!prev.has(id)) {
      await clearAiSuppressionForModule(supabase, postId, id)
      const { error } = await supabase.from('post_modules_user').insert({ post_id: postId, module_id: id })
      if (error && error.code !== '23505') {
        return { error: error.message }
      }
      await supabase.from('post_modules_ai').delete().eq('post_id', postId).eq('module_id', id)
    }
  }
  for (const id of prev) {
    if (!nextModuleIds.has(id)) {
      const { error } = await removePostFromModule(supabase, postId, id)
      if (error) return { error }
    }
  }
  return { error: null }
}
