import { ref, watch, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'

// The page passes its activity ref; all writes use the authenticated user's ID.
export function useActivityActions(activity) {
  const saved = ref(false)
  const saving = ref(false)
  const sharing = ref(false)
  const actionError = ref('')
  const needsLogin = ref(false)
  const message = ref('')
  const showShareDialog = ref(false)
  const groups = ref([])
  const groupsLoading = ref(false)
  const groupsError = ref('')
  const selectedGroupId = ref('')

  let messageTimer
  let selectionVersion = 0
  let groupRequest = 0
  let disposed = false

  function announce(text) {
    if (disposed) return
    clearTimeout(messageTimer)
    message.value = text
    messageTimer = setTimeout(() => {
      message.value = ''
    }, 3000)
  }

  async function getUser(promptForLogin = false) {
    const { data, error } = await supabase.auth.getUser()
    if (error && error.name !== 'AuthSessionMissingError') throw error
    const user = data?.user ?? null

    if (!user && promptForLogin) {
      needsLogin.value = true
      actionError.value = 'Log in to save or share activities.'
    }
    return user
  }

  async function readSavedStatus(userId, activityId) {
    const { data, error } = await supabase
      .from('favourites')
      .select('activity_id')
      .eq('user_id', userId)
      .eq('activity_id', activityId)
      .maybeSingle()

    if (error) throw error
    return Boolean(data)
  }

  function closeShare() {
    if (sharing.value) return
    groupRequest += 1
    showShareDialog.value = false
    groupsLoading.value = false
  }

  // Refresh saved state when another activity is opened.
  watch(
    () => activity.value?.id,
    async (id) => {
      const version = ++selectionVersion
      saved.value = false
      actionError.value = ''
      needsLogin.value = false
      message.value = ''
      clearTimeout(messageTimer)
      showShareDialog.value = false
      groupRequest += 1
      if (!id) return

      try {
        const user = await getUser()
        if (!user || version !== selectionVersion) return
        const isSaved = await readSavedStatus(user.id, id)
        if (version === selectionVersion) saved.value = isSaved
      } catch {
        if (version === selectionVersion) {
          actionError.value = "Couldn't load your saved status. Try Save again."
        }
      }
    },
  )

  async function toggleSaved() {
    if (!activity.value || saving.value) return
    const id = activity.value.id
    // A delayed initial read must not overwrite the result of this click.
    selectionVersion += 1
    saving.value = true
    actionError.value = ''
    needsLogin.value = false

    try {
      const user = await getUser(true)
      if (!user) return

      // Check the database first, including changes made from another tab.
      const isSaved = await readSavedStatus(user.id, id)
      if (isSaved) {
        const { data, error } = await supabase
          .from('favourites')
          .delete()
          .eq('user_id', user.id)
          .eq('activity_id', id)
          .select('activity_id')

        if (error) throw error
        if (!data?.length) throw new Error('No favourite was removed')
      } else {
        const { error } = await supabase
          .from('favourites')
          .insert({ user_id: user.id, activity_id: id })

        if (error && error.code !== '23505') throw error
      }

      if (!disposed && activity.value?.id === id) {
        saved.value = !isSaved
        announce(isSaved ? 'Removed from saved activities.' : 'Activity saved.')
      }
    } catch {
      if (!disposed && activity.value?.id === id) {
        actionError.value = "Couldn't update your saved activities. Please try again."
      }
    } finally {
      saving.value = false
    }
  }

  async function openShare() {
    if (!activity.value || sharing.value) return
    const id = activity.value.id
    actionError.value = ''
    needsLogin.value = false

    try {
      const user = await getUser(true)
      if (!user || disposed || activity.value?.id !== id) return

      const request = ++groupRequest
      showShareDialog.value = true
      groupsLoading.value = true
      groupsError.value = ''
      groups.value = []
      selectedGroupId.value = ''

      try {
        const { data: memberships, error: membershipError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id)

        if (membershipError) throw membershipError
        const ids = (memberships ?? []).map((row) => row.group_id)

        if (ids.length) {
          const { data, error } = await supabase
            .from('groups')
            .select('id, name')
            .in('id', ids)
            .order('name')

          if (error) throw error
          if (request === groupRequest) groups.value = data ?? []
        }
      } catch {
        if (request === groupRequest) {
          groupsError.value = "Couldn't load your groups. Try again."
        }
      } finally {
        if (request === groupRequest) groupsLoading.value = false
      }
    } catch {
      actionError.value = "Couldn't check your account. Please try again."
    }
  }

  async function shareActivity() {
    if (!activity.value || sharing.value || groupsLoading.value) return
    const group = groups.value.find((item) => item.id === selectedGroupId.value)
    if (!group) return

    const id = activity.value.id
    sharing.value = true
    actionError.value = ''
    groupsError.value = ''

    try {
      const user = await getUser(true)
      if (!user) {
        groupsError.value = 'Log in again before sharing this activity.'
        return
      }

      const { error } = await supabase
        .from('group_activities')
        .insert({ group_id: group.id, activity_id: id, shared_by: user.id })

      if (error && error.code !== '23505') throw error

      if (!disposed && activity.value?.id === id) {
        announce(error ? 'Already shared to ' + group.name + '.' : 'Shared to ' + group.name + '.')
        showShareDialog.value = false
      }
    } catch {
      groupsError.value = "Couldn't share this activity. Please try again."
    } finally {
      sharing.value = false
    }
  }

  onUnmounted(() => {
    disposed = true
    selectionVersion += 1
    groupRequest += 1
    clearTimeout(messageTimer)
  })

  return {
    saved,
    saving,
    sharing,
    actionError,
    needsLogin,
    message,
    showShareDialog,
    groups,
    groupsLoading,
    groupsError,
    selectedGroupId,
    toggleSaved,
    openShare,
    closeShare,
    shareActivity,
  }
}
