<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseDialog from '@/components/BaseDialog.vue'
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
let accountId

function completed(id) {
  return results.value[id] === 'shared' || results.value[id] === 'already'
}

function invalidate() {
  requestNumber += 1
  controller?.abort()
}

// BaseDialog puts focus back on the share button, or the results summary if it's gone
function close() {
  if (sharing.value) return
  invalidate()
  emit('close')
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
    if (request === requestNumber) {
      sharing.value = false
      // Safari drops focus when the submit button is disabled; restore it after rendering.
      await nextTick()
      if (request === requestNumber && props.activity) dialog.value?.focusClose()
    }
  }
}

watch(
  () => props.activity?.id,
  (id) => {
    invalidate()
    sharing.value = false
    if (!id) return
    accountId = user.value?.id
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
  <BaseDialog
    ref="dialog"
    :open="Boolean(activity)"
    title="Share to groups"
    close-label="Close share menu"
    :closable="!sharing"
    form
    return-focus-to="#activities-results-summary"
    data-testid="activity-share-dialog"
    :aria-busy="loading || sharing"
    @close="close"
    @submit="shareActivity"
  >
    <p class="text-secondary mb-3" data-testid="share-activity-name">{{ activity?.name }}</p>
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

    <fieldset v-if="!loading && groups.length" :disabled="sharing || needsLogin">
      <legend class="fs-6">Choose one or more groups</legend>
      <label
        v-for="group in groups"
        :key="group.id"
        class="group-option"
        :class="{ 'is-selected': selectedIds.includes(group.id) }"
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
        <span class="group-copy">
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
        </span>
      </label>
    </fieldset>

    <template #footer>
      <button
        v-if="!loading && groups.length"
        type="submit"
        class="btn btn-dark rounded-pill w-100"
        :disabled="sharing || needsLogin || !pendingGroups.length"
        data-testid="share-confirm"
      >
        {{
          sharing
            ? 'Sharing…'
            : `Share to ${pendingGroups.length} group${pendingGroups.length === 1 ? '' : 's'}`
        }}
      </button>
      <RouterLink v-if="!sharing" to="/groups" class="mt-2" @click="close"
        >Create a new group</RouterLink
      >
    </template>
  </BaseDialog>
</template>

<style scoped>
.group-option {
  display: flex;
  align-items: start;
  gap: 12px;
  min-height: 48px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  cursor: pointer;
}
.group-option.is-selected {
  background: var(--surface-2);
  border-color: var(--line-strong);
}
.group-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}
.group-name {
  flex: 1;
  overflow-wrap: anywhere;
}
</style>
