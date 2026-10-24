import { supabase } from '@/lib/supabase'

export async function readSavedStatus(userId, activityId) {
  const { data, error } = await supabase
    .from('favourites')
    .select('activity_id')
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function setActivitySaved(userId, activityId, shouldSave) {
  const { data, error } = shouldSave
    ? await supabase.from('favourites').insert({ user_id: userId, activity_id: activityId })
    : await supabase
        .from('favourites')
        .delete()
        .eq('user_id', userId)
        .eq('activity_id', activityId)
        .select('activity_id')

  // A lost response, duplicate insert or empty delete may already match the requested state.
  if (error || (!shouldSave && !data?.length)) {
    if ((await readSavedStatus(userId, activityId)) !== shouldSave) {
      throw error || new Error('The favourite was not removed')
    }
  }

  return shouldSave
}
