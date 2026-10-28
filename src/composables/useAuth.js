import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { findProfileAnimal, hasProfileIdentity } from '@/data/profileAnimals'

// These refs are shared by every component that calls useAuth().
const session = ref(null)
const user = computed(() => session.value?.user ?? null)
const avatarAnimal = computed(
  () => findProfileAnimal(user.value?.user_metadata?.avatar_animal)?.id || '',
)
const needsOnboarding = computed(
  () => !!user.value && !hasProfileIdentity(user.value.user_metadata),
)
const authError = ref('')
const isAdmin = ref(false)
const adminError = ref('')
let initialization

// The router calls this after restoring the session and before opening a page.
async function loadAdminStatus() {
  const userId = user.value?.id
  adminError.value = ''
  if (!userId) {
    isAdmin.value = false
    return
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    // Ignore the response if the account changed while this request was running.
    if (user.value?.id === userId) isAdmin.value = data?.is_admin === true
  } catch {
    if (user.value?.id === userId) {
      isAdmin.value = false
      adminError.value = "Couldn't check your admin access. Please try again."
    }
  }
}

export function authErrorMessage(error) {
  if (error?.code === 'email_not_confirmed') {
    return 'Please confirm your email before logging in. Check your inbox and spam folder.'
  }
  if (error?.code === 'invalid_credentials') {
    return 'Your email or password is incorrect.'
  }
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
    return 'Too many attempts. Please wait a little before trying again.'
  }
  if (error instanceof TypeError || error?.name === 'AuthRetryableFetchError') {
    return 'Could not connect. Please check your internet connection and try again.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}

function initializeAuth() {
  if (!initialization) {
    // Supabase redirects failed confirmation links back with an error in the URL.
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    if (hash.has('error') || query.has('error')) {
      authError.value = 'Your confirmation link is invalid or has expired. You can resend it below.'
    }

    // Keep this callback synchronous; awaiting Supabase calls here can cause a deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (session.value?.user?.id !== newSession?.user?.id) isAdmin.value = false
      session.value = newSession
    })

    initialization = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error
        session.value = data.session
      })
      .catch((error) => {
        authError.value = authErrorMessage(error)
        session.value = null
      })

    if (import.meta.hot) {
      import.meta.hot.dispose(() => data.subscription.unsubscribe())
    }
  }
  return initialization
}

export function useAuth() {
  return {
    user,
    avatarAnimal,
    needsOnboarding,
    authError,
    isAdmin,
    adminError,
    initializeAuth,
    loadAdminStatus,
  }
}
