import { ref, watch, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { readSavedStatus, setActivitySaved } from '@/lib/activityFavourites'

// The page passes its activity ref; all writes use the authenticated user's ID.
export function useActivityActions(activity) {
  const saved = ref(false)
  const saving = ref(false)
  const actionError = ref('')
  const needsLogin = ref(false)
  const message = ref('')

  let messageTimer
  // Request numbers stop an older response from changing the current screen.
  let savedRequest = 0
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
      actionError.value = 'Log in to save activities.'
    }
    return user
  }

  // Refresh saved state when another activity is opened.
  watch(
    () => activity.value?.id,
    async (id) => {
      const request = ++savedRequest
      saved.value = false
      actionError.value = ''
      needsLogin.value = false
      message.value = ''
      clearTimeout(messageTimer)
      if (!id) return

      try {
        const user = await getUser()
        if (!user || request !== savedRequest) return
        const isSaved = await readSavedStatus(user.id, id)
        if (request === savedRequest) saved.value = isSaved
      } catch {
        if (request === savedRequest) {
          actionError.value = "Couldn't load your saved status. Try Save again."
        }
      }
    },
    { immediate: true },
  )

  async function toggleSaved() {
    if (!activity.value || saving.value) return
    const id = activity.value.id
    const shouldSave = !saved.value
    // A delayed initial read must not overwrite the result of this click.
    savedRequest += 1
    saving.value = true
    actionError.value = ''
    needsLogin.value = false

    try {
      const user = await getUser(true)
      if (!user) return

      const isSaved = await setActivitySaved(user.id, id, shouldSave)

      if (!disposed && activity.value?.id === id) {
        saved.value = isSaved
        announce(isSaved ? 'Activity saved.' : 'Removed from saved activities.')
      }
    } catch {
      if (!disposed && activity.value?.id === id) {
        actionError.value = "Couldn't update your saved activities. Please try again."
      }
    } finally {
      saving.value = false
    }
  }

  onUnmounted(() => {
    disposed = true
    savedRequest += 1
    clearTimeout(messageTimer)
  })

  return {
    saved,
    saving,
    actionError,
    needsLogin,
    message,
    toggleSaved,
    announce,
  }
}
