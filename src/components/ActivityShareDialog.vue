<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import { useAuth } from '@/composables/useAuth'

const props = defineProps({ activity: { type: Object, default: null } })
const emit = defineEmits(['close', 'shared'])
const { user } = useAuth()
const dialog = ref(null)
const groups = ref([])
const selectedIds = ref([])
const results = ref({})
const loading = ref(false)
const sharing = ref(false)
const errorMessage = ref('')
const needsLogin = ref(false)
const pendingGroups = computed(() =>
  groups.value.filter((group) => selectedIds.value.includes(group.id) && !completed(group.id)),
)
let requestNumber = 0
let controller
let trigger
let accountId

function completed(id) {
  return results.value[id] === 'shared' || results.value[id] === 'already'
}

function invalidate() {
  requestNumber += 1
  controller?.abort()
}

function close() {
  if (sharing.value) return
  invalidate()
  dialog.value?.close()
  emit('close')
  nextTick(() => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    else document.getElementById('activities-results-summary')?.focus({ preventScroll: true })
  })
}

function moveFocus(event) {
  // Keep Tab inside the picker even when Safari skips native button/checkbox stops.
  const controls = [...dialog.value.querySelectorAll('button, input, a[href]')].filter(
    (element) => !element.matches(':disabled') && element.getClientRects().length,
  )
  const index = controls.indexOf(document.activeElement)
  const next = event.shiftKey
    ? controls[index - 1] || controls.at(-1)
    : controls[index + 1] || controls[0]
  next?.focus()
}

async function checkedUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error && error.name !== 'AuthSessionMissingError') throw error
  if (!data?.user || data.user.id !== accountId || user.value?.id !== accountId) {
    throw Object.assign(new Error('Your login has changed'), { name: 'AuthSessionMissingError' })
  }
  return data.user
}

async function loadGroups() {
  invalidate()
  const request = requestNumber
  controller = new AbortController()
  loading.value = true
  errorMessage.value = ''
  needsLogin.value = false
  groups.value = []
  selectedIds.value = []
  results.value = {}

  try {
    const loaded = await requestWithTimeout(
      async (signal) => {
        const member = await checkedUser()
        signal.throwIfAborted()
        const { data: memberships, error } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', member.id)
          .abortSignal(signal)
        if (error) throw error
        const ids = (memberships ?? []).map((row) => row.group_id)
        if (!ids.length) return []
        const { data, error: groupError } = await supabase
          .from('groups')
          .select('id, name')
          .in('id', ids)
          .order('name')
          .abortSignal(signal)
        if (groupError) throw groupError
        return data ?? []
      },
      controller,
      15000,
    )
    if (request === requestNumber) groups.value = loaded
  } catch (error) {
    if (request === requestNumber) {
      needsLogin.value = error.name === 'AuthSessionMissingError' || error.status === 401
      errorMessage.value = needsLogin.value
        ? 'Log in again before sharing this activity.'
        : "Couldn't load your groups. Try again."
    }
  } finally {
    if (request === requestNumber) loading.value = false
  }
}

async function shareActivity() {
  if (sharing.value || loading.value || !pendingGroups.value.length) return
  const activityId = props.activity.id
  const targets = [...pendingGroups.value]
  const request = ++requestNumber
  controller = new AbortController()
  sharing.value = true
  errorMessage.value = ''

  try {
    const member = await requestWithTimeout(checkedUser, controller, 15000)
    if (request !== requestNumber) return
    const outcomes = await Promise.allSettled(
      targets.map((group) =>
        requestWithTimeout(
          async (signal) => {
            const { error } = await supabase
              .from('group_activities')
              .insert({ group_id: group.id, activity_id: activityId, shared_by: member.id })
              .abortSignal(signal)
            if (!error) return 'shared'
            if (error.code !== '23505') throw error
            // Confirm the pair before treating a uniqueness error as an existing share.
            const { data, error: readError } = await supabase
              .from('group_activities')
              .select('activity_id')
              .eq('group_id', group.id)
              .eq('activity_id', activityId)
              .maybeSingle()
              .abortSignal(signal)
            if (readError || !data) throw readError || error
            return 'already'
          },
          controller,
          15000,
        ),
      ),
    )
    if (request !== requestNumber) return
    outcomes.forEach((outcome, index) => {
      results.value[targets[index].id] = outcome.status === 'fulfilled' ? outcome.value : 'failed'
    })
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      errorMessage.value = "Couldn't share this activity to every selected group. Please try again."
      return
    }

    const messages = []
    for (const [status, label] of [
      ['shared', 'Shared to '],
      ['already', 'Already shared to '],
    ]) {
      const names = groups.value
        .filter((group) => results.value[group.id] === status)
        .map((group) => group.name)
      if (names.length) messages.push(label + names.join(', ') + '.')
    }
    emit('shared', messages.join(' '))
    sharing.value = false
    close()
  } catch (error) {
    if (request === requestNumber) {
      needsLogin.value = error.name === 'AuthSessionMissingError' || error.status === 401
      errorMessage.value = needsLogin.value
        ? 'Log in again before sharing this activity.'
        : "Couldn't check your account. Please try again."
    }
  } finally {
    if (request === requestNumber) sharing.value = false
  }
}

watch(
  () => props.activity?.id,
  (id) => {
    invalidate()
    sharing.value = false
    if (!id) {
      dialog.value?.close()
      return
    }
    trigger = document.activeElement
    accountId = user.value?.id
    dialog.value.showModal()
    void loadGroups()
  },
  { flush: 'post' },
)

watch(
  () => user.value?.id,
  () => {
    invalidate()
    sharing.value = false
    if (props.activity) close()
  },
)

onUnmounted(invalidate)
</script>

<template>
  <dialog
    ref="dialog"
    class="share-dialog"
    aria-labelledby="share-dialog-title"
    data-testid="activity-share-dialog"
    :aria-busy="loading || sharing"
    @cancel.prevent="close"
    @keydown.tab.prevent="moveFocus"
  >
    <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
      <div>
        <h2 id="share-dialog-title" class="h4 fw-bold mb-2">Share to groups</h2>
        <p class="text-secondary mb-0">{{ activity?.name }}</p>
      </div>
      <button
        type="button"
        class="btn-close"
        aria-label="Close share menu"
        :disabled="sharing"
        @click="close"
      ></button>
    </div>

    <p v-if="loading" role="status">Loading your groups…</p>
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert" data-testid="share-error">
      {{ errorMessage }}
      <RouterLink v-if="needsLogin" to="/login" class="d-block mt-2" @click="close"
        >Log in</RouterLink
      >
      <button
        v-else-if="!groups.length"
        type="button"
        class="btn btn-outline-danger mt-2"
        data-testid="share-retry-groups"
        @click="loadGroups"
      >
        Try again
      </button>
    </div>
    <p v-else-if="!groups.length" data-testid="share-no-groups">You're not in any groups yet.</p>

    <form v-if="!loading && groups.length" @submit.prevent="shareActivity">
      <fieldset :disabled="sharing || needsLogin">
        <legend class="fs-6">Choose one or more groups</legend>
        <label
          v-for="group in groups"
          :key="group.id"
          class="group-option"
          data-testid="share-group-option"
        >
          <input
            v-model="selectedIds"
            type="checkbox"
            class="form-check-input flex-shrink-0"
            :value="group.id"
            :disabled="completed(group.id)"
            :data-testid="`share-group-${group.id}`"
          />
          <span class="group-name">{{ group.name }}</span>
          <span
            v-if="results[group.id]"
            class="small"
            :class="results[group.id] === 'failed' ? 'text-danger' : 'text-success'"
            role="status"
          >
            {{
              { shared: 'Shared', already: 'Already shared', failed: 'Failed — try again' }[
                results[group.id]
              ]
            }}
          </span>
        </label>
      </fieldset>
      <button
        type="submit"
        class="btn btn-dark rounded-pill w-100 mt-3"
        :disabled="sharing || needsLogin || !pendingGroups.length"
        data-testid="share-confirm"
      >
        {{
          sharing
            ? 'Sharing…'
            : `Share to ${pendingGroups.length} group${pendingGroups.length === 1 ? '' : 's'}`
        }}
      </button>
    </form>
    <RouterLink v-if="!sharing" to="/groups" class="d-inline-block mt-3" @click="close"
      >Create a new group</RouterLink
    >
  </dialog>
</template>

<style scoped>
.share-dialog {
  width: min(460px, calc(100% - 32px));
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 28px;
  border: 1px solid #e5e5e5;
  border-radius: 20px;
  box-shadow: 0 16px 48px rgb(0 0 0 / 15%);
}
.share-dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.group-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 10px 0;
  cursor: pointer;
}
.group-name {
  flex: 1;
  overflow-wrap: anywhere;
}
</style>
