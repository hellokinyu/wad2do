<template>
  <div class="container py-4 py-md-5" data-testid="signup-page">
    <section class="auth-card card rounded-4 mx-auto">
      <div class="card-body p-4 p-md-5">
        <h1 class="h2 fw-bold">Sign up</h1>
        <p class="text-muted">Start planning your next outing with WAD2Do.</p>

        <div v-if="errorMessage" class="alert alert-danger" role="alert" data-testid="signup-error">
          {{ errorMessage }}
        </div>
        <div v-if="message" class="alert alert-success" role="status" data-testid="signup-message">
          {{ message }}
        </div>

        <form @submit.prevent="signUp">
          <div class="mb-3">
            <label for="signup-email" class="form-label">Email</label>
            <input
              id="signup-email"
              v-model.trim="email"
              type="email"
              class="form-control"
              autocomplete="email"
              required
              :disabled="loading"
              data-testid="signup-email"
            />
          </div>
          <div class="mb-3">
            <label for="signup-password" class="form-label">Password</label>
            <input
              id="signup-password"
              v-model="password"
              type="password"
              class="form-control"
              autocomplete="new-password"
              minlength="6"
              required
              :disabled="loading"
              data-testid="signup-password"
            />
            <div class="form-text">
              Use at least 6 characters. Additional password rules may apply.
            </div>
          </div>
          <div class="mb-4">
            <label for="signup-confirm-password" class="form-label">Confirm password</label>
            <input
              id="signup-confirm-password"
              v-model="confirmPassword"
              type="password"
              class="form-control"
              autocomplete="new-password"
              minlength="6"
              required
              :disabled="loading"
              data-testid="signup-confirm-password"
            />
          </div>
          <button
            type="submit"
            class="btn btn-dark rounded-pill w-100"
            :disabled="loading"
            data-testid="signup-submit"
          >
            {{ loading ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="mt-4 mb-0">
          Already have an account? <RouterLink to="/login" class="text-body">Log in</RouterLink>
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { authErrorMessage } from '@/composables/useAuth'

const router = useRouter()
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')
const message = ref('')

async function signUp() {
  if (loading.value) return
  errorMessage.value = ''
  message.value = ''
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Your passwords do not match.'
    return
  }

  loading.value = true
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: {
        emailRedirectTo: new URL(import.meta.env.BASE_URL + 'onboarding', window.location.origin).href,
      },
    })
    if (error) throw error
    password.value = ''
    confirmPassword.value = ''

    // With email confirmation required, signup succeeds without signing the user in.
    if (data.session) {
      await router.replace('/onboarding')
    } else {
      message.value =
        'Check your inbox and spam folder for a confirmation email. Confirm your email to continue to onboarding. If you already have an account, log in instead.'
    }
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-card {
  max-width: 480px;
}
</style>
