<template>
  <div class="container py-4 py-md-5" data-testid="login-page">
    <section class="auth-card card rounded-4 mx-auto">
      <div class="card-body p-4 p-md-5">
        <h1 class="h2 fw-bold">Log in</h1>
        <p class="text-muted">Welcome back to WAD2Do.</p>

        <div
          v-if="errorMessage || authError"
          class="alert alert-danger"
          role="alert"
          data-testid="login-error"
        >
          {{ errorMessage || authError }}
        </div>
        <div v-if="message" class="alert alert-success" role="status" data-testid="login-message">
          {{ message }}
        </div>

        <form @submit.prevent="logIn">
          <div class="mb-3">
            <label for="login-email" class="form-label">Email</label>
            <input
              id="login-email"
              v-model.trim="email"
              type="email"
              class="form-control"
              autocomplete="email"
              required
              :disabled="loading"
              data-testid="login-email"
            />
          </div>
          <div class="mb-4">
            <label for="login-password" class="form-label">Password</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="form-control"
              autocomplete="current-password"
              required
              :disabled="loading"
              data-testid="login-password"
            />
          </div>
          <button
            type="submit"
            class="btn btn-dark rounded-pill w-100"
            :disabled="loading"
            data-testid="login-submit"
          >
            {{ loggingIn ? 'Logging in…' : 'Log in' }}
          </button>
        </form>

        <button
          type="button"
          class="btn btn-link text-body px-0 mt-3"
          :disabled="loading || !email"
          data-testid="resend-confirmation"
          @click="resendConfirmation"
        >
          {{ resending ? 'Sending…' : 'Resend confirmation email' }}
        </button>
        <p class="small text-muted">Enter your email above if you need a new confirmation link.</p>
        <p class="mb-0">
          New to WAD2Do? <RouterLink to="/signup" class="text-body">Sign up</RouterLink>
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, useAuth } from '@/composables/useAuth'

const router = useRouter()
const { authError } = useAuth()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const message = ref('')
const loggingIn = ref(false)
const resending = ref(false)
const loading = computed(() => loggingIn.value || resending.value)

async function logIn() {
  if (loading.value) return
  loggingIn.value = true
  errorMessage.value = ''
  authError.value = ''
  message.value = ''

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
    password.value = ''
    await router.replace({ name: 'activities' })
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    loggingIn.value = false
  }
}

async function resendConfirmation() {
  if (loading.value || !email.value) return
  resending.value = true
  errorMessage.value = ''
  authError.value = ''
  message.value = ''

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.value,
      options: {
        emailRedirectTo: new URL(import.meta.env.BASE_URL + 'onboarding', window.location.origin).href,
      },
    })
    if (error) throw error
    message.value =
      'If your account needs confirmation, check your inbox and spam folder for a new link.'
  } catch (error) {
    errorMessage.value = authErrorMessage(error)
  } finally {
    resending.value = false
  }
}
</script>

<style scoped>
.auth-card {
  max-width: 480px;
}
</style>
