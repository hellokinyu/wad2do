<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'

const router = useRouter()

const groups = ref([]) // array of the user's groups
const loading = ref(true)
const errorMessage = ref('')

// Create group form
const showCreateForm = ref(false)
const groupName = ref('')
const startDate = ref('')
const endDate = ref('')
const budget = ref('')
const createError = ref('')
const newGroup = ref(null) // the group we just made, so we can show its invite code
const creating = ref(false)
let newGroupId = crypto.randomUUID()

// Join group form
const showJoinForm = ref(false)
const joinCode = ref('')
const joinError = ref('')

const copyMessage = ref('')

// Get the logged-in user from Supabase Auth (null if nobody is logged in)
async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

// Load the user's groups when the page opens
async function loadGroups() {
  loading.value = true
  errorMessage.value = ''

  try {
    const user = await getUser()
    if (!user) {
      errorMessage.value = 'Please log in to see your groups.'
      return
    }

    // Find every group this user is a member of.
    // group_members(count) counts the members, itineraries tells us if the group has a plan.
    const { data, error } = await supabase
      .from('group_members')
      .select(
        'groups(id, name, start_date, end_date, chosen_start, group_members(count), itineraries(group_id))',
      )
      .eq('user_id', user.id)

    if (error) throw error

    groups.value = data.map((row) => row.groups)
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load your groups. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadGroups)

// "Voting" -> "Time picked" -> "Planned"
function getStatus(group) {
  // No plan yet comes back as [] or null, depending on how the table is set up
  if (group.itineraries && group.itineraries.length !== 0) return 'Planned'
  if (group.chosen_start) return 'Time picked'
  return 'Voting'
}

function getMemberCount(group) {
  return group.group_members[0].count
}

// Make a random 6-character code like "K7Q2XM"
function makeInviteCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (let i = 0; i < 6; i++) {
    code += letters[bytes[i] % letters.length]
  }
  return code
}

function getInviteLink(group) {
  return window.location.origin + '/groups/' + group.id + '?invite=' + encodeURIComponent(group.invite_code)
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(getInviteLink(newGroup.value))
    copyMessage.value = 'Link copied!'
  } catch {
    // Some browsers block clipboard access, so let the user copy it by hand.
    copyMessage.value = "Couldn't copy automatically. Select the link above and copy it."
  }
}

// ----- Create a group -----

function openCreateForm() {
  if (creating.value) return
  showCreateForm.value = true
  showJoinForm.value = false
  groupName.value = ''
  startDate.value = ''
  endDate.value = ''
  budget.value = ''
  createError.value = ''
  newGroup.value = null
  newGroupId = crypto.randomUUID()
  copyMessage.value = ''
}

async function createGroup() {
  if (creating.value) return
  createError.value = ''

  // Check the form first
  if (groupName.value.trim() === '') {
    createError.value = 'Please enter a group name.'
    return
  }
  if (startDate.value === '' || endDate.value === '') {
    createError.value = 'Please pick a start and end date.'
    return
  }
  if (endDate.value < startDate.value) {
    createError.value = 'The end date must be after the start date.'
    return
  }
  if (typeof budget.value !== 'number' || !Number.isFinite(budget.value) || budget.value < 0) {
    createError.value = 'Please enter a budget of $0 or more.'
    return
  }

  creating.value = true
  try {
    const { data, error } = await requestWithTimeout((signal) =>
      supabase.rpc('create_group', {
        p_group_id: newGroupId,
        p_name: groupName.value.trim(),
        p_start_date: startDate.value,
        p_end_date: endDate.value,
        p_budget_per_person: budget.value,
        p_invite_code: makeInviteCode(),
      }).single().abortSignal(signal),
    )

    if (error) throw error

    newGroup.value = data // shows the invite panel
    loadGroups()
  } catch (error) {
    console.log(error)
    createError.value = "Couldn't create the group. Please try again."
  } finally {
    creating.value = false
  }
}

// ----- Join a group -----

function openJoinForm() {
  showJoinForm.value = true
  showCreateForm.value = false
  joinCode.value = ''
  joinError.value = ''
}

async function joinGroup() {
  joinError.value = ''
  const code = joinCode.value.trim().toUpperCase()

  try {
    const { data: joinedId, error } = await requestWithTimeout((signal) =>
      supabase.rpc('wad2do_join_group', { p_invite_code: code }).abortSignal(signal),
    )
    if (error?.code === 'P0002') {
      joinError.value = 'No group with that code.'
      return
    }
    if (error) throw error
    router.push('/groups/' + joinedId)
  } catch (error) {
    console.log(error)
    joinError.value = "Couldn't join the group. Please try again."
  }
}
</script>

<template>
  <div class="container py-4" data-testid="groups-page">
    <h1>Your groups</h1>

    <button class="btn btn-primary me-2" data-testid="create-group-button" @click="openCreateForm">
      Create group
    </button>
    <button class="btn btn-outline-primary" data-testid="join-group-button" @click="openJoinForm">
      Join a group
    </button>

    <!-- Create group form -->
    <div v-if="showCreateForm" class="card my-3" data-testid="create-group-form">
      <div class="card-body">
        <!-- After creating: show the invite link and code -->
        <div v-if="newGroup" data-testid="invite-panel">
          <h2 class="h5">Invite your friends to {{ newGroup.name }}</h2>

          <label for="invite-link" class="form-label">Invite link</label>
          <div class="input-group mb-2">
            <input
              id="invite-link"
              class="form-control"
              :value="getInviteLink(newGroup)"
              readonly
              data-testid="invite-link"
            />
            <button
              class="btn btn-outline-secondary"
              data-testid="copy-invite-link"
              @click="copyInviteLink"
            >
              Copy
            </button>
          </div>
          <p v-if="copyMessage">{{ copyMessage }}</p>

          <p>
            Code: <strong data-testid="invite-code">{{ newGroup.invite_code }}</strong>
          </p>

          <RouterLink :to="'/groups/' + newGroup.id" class="btn btn-primary"
            >Go to group</RouterLink
          >
        </div>

        <!-- Before creating: the form -->
        <form v-else @submit.prevent="createGroup">
          <fieldset :disabled="creating">
            <h2 class="h5">Create a group</h2>

            <label for="group-name" class="form-label">Group name</label>
            <input
              id="group-name"
              v-model="groupName"
              class="form-control mb-2"
              data-testid="group-name-input"
            />

            <label for="start-date" class="form-label">Start date</label>
            <input
              id="start-date"
              v-model="startDate"
              type="date"
              class="form-control mb-2"
              data-testid="group-start-input"
            />

            <label for="end-date" class="form-label">End date</label>
            <input
              id="end-date"
              v-model="endDate"
              type="date"
              class="form-control mb-2"
              data-testid="group-end-input"
            />

            <label for="budget" class="form-label">Budget per person ($)</label>
            <input
              id="budget"
              v-model.number="budget"
              type="number"
              min="0"
              class="form-control mb-2"
              data-testid="group-budget-input"
            />

            <p v-if="createError" class="text-danger" data-testid="create-group-error">
              {{ createError }}
            </p>

            <button type="submit" class="btn btn-primary me-2" data-testid="create-group-submit">
              Create
            </button>
            <button type="button" class="btn btn-secondary" @click="showCreateForm = false">
              Cancel
            </button>
          </fieldset>
        </form>
      </div>
    </div>

    <!-- Join group form -->
    <div v-if="showJoinForm" class="card my-3" data-testid="join-group-form">
      <div class="card-body">
        <form @submit.prevent="joinGroup">
          <h2 class="h5">Join a group</h2>

          <label for="join-code" class="form-label">Invite code</label>
          <input
            id="join-code"
            v-model="joinCode"
            class="form-control mb-2"
            maxlength="6"
            placeholder="e.g. K7Q2XM"
            data-testid="join-code-input"
          />

          <p v-if="joinError" class="text-danger" data-testid="join-group-error">{{ joinError }}</p>

          <button type="submit" class="btn btn-primary me-2" data-testid="join-group-submit">
            Join
          </button>
          <button type="button" class="btn btn-secondary" @click="showJoinForm = false">
            Cancel
          </button>
        </form>
      </div>
    </div>

    <!-- List of groups -->
    <p v-if="loading" class="mt-3">Loading your groups...</p>

    <p v-else-if="errorMessage" class="text-danger mt-3" data-testid="groups-error">
      {{ errorMessage }}
    </p>

    <p v-else-if="groups.length === 0" class="mt-3" data-testid="groups-empty">
      You're not in any groups yet.
    </p>

    <div v-else class="row g-3 mt-1">
      <div v-for="group in groups" :key="group.id" class="col-12 col-md-6 col-lg-4">
        <RouterLink
          :to="'/groups/' + group.id"
          class="card h-100 text-decoration-none"
          data-testid="group-card"
        >
          <div class="card-body">
            <h2 class="h5">{{ group.name }}</h2>
            <p class="mb-1">{{ group.start_date }} to {{ group.end_date }}</p>
            <p class="mb-1">{{ getMemberCount(group) }} members</p>
            <span class="badge text-bg-secondary" data-testid="group-status">{{
              getStatus(group)
            }}</span>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
