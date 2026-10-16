<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'

const route = useRoute()
const groupId = route.params.id

const group = ref(null) // the group's details, or null if we couldn't find it
const isMember = ref(false) // false means we show the "Join group" screen
const loading = ref(true)
const errorMessage = ref('')

const showInvite = ref(false)
const copyMessage = ref('')
const joinError = ref('')

// Get the logged-in user from Supabase Auth (null if nobody is logged in)
async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

// Load the group and check if the user is in it
async function loadGroup() {
  loading.value = true
  errorMessage.value = ''

  try {
    const user = await getUser()
    if (!user) {
      errorMessage.value = 'Please log in to see this group.'
      return
    }

    // 1. Get the group. group_members(count) counts the members.
    const { data, error } = await supabase
      .from('groups')
      .select(
        'id, name, start_date, end_date, budget_per_person, invite_code, group_members(count)',
      )
      .eq('id', groupId)
      .maybeSingle()

    // Error code 22P02 means the id in the URL isn't a real id, so treat it as "not found"
    if (error && error.code !== '22P02') throw error
    group.value = data

    if (!group.value) return

    // 2. Check if this user is a member
    const { data: membership, error: memberError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (memberError) throw memberError
    isMember.value = membership !== null
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load this group. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadGroup)

function getMemberCount() {
  return group.value.group_members[0].count
}

function getInviteLink() {
  return window.location.origin + '/groups/' + groupId
}

async function copyInviteLink() {
  await navigator.clipboard.writeText(getInviteLink())
  copyMessage.value = 'Link copied!'
}

// For someone who opened an invite link but isn't in the group yet
async function joinGroup() {
  joinError.value = ''

  try {
    const user = await getUser()

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: user.id })

    // Error code 23505 means they are already in the group, which is fine
    if (error && error.code !== '23505') throw error

    // Reload so the header shows the new member count and the tabs appear
    loadGroup()
  } catch (error) {
    console.log(error)
    joinError.value = "Couldn't join the group. Please try again."
  }
}
</script>

<template>
  <div class="container py-4" data-testid="group-page">
    <RouterLink to="/groups" data-testid="back-to-groups">← Your groups</RouterLink>

    <p v-if="loading" class="mt-3">Loading group...</p>

    <p v-else-if="errorMessage" class="text-danger mt-3" data-testid="group-error">
      {{ errorMessage }}
    </p>

    <!-- Wrong link or the group doesn't exist -->
    <div v-else-if="!group" class="mt-3" data-testid="group-not-found">
      <p>We couldn't find that group.</p>
      <RouterLink to="/groups" class="btn btn-primary">Back to Groups</RouterLink>
    </div>

    <!-- Opened an invite link but not a member yet -->
    <div v-else-if="!isMember" class="card mt-3" data-testid="group-join-screen">
      <div class="card-body">
        <h1 class="h3">{{ group.name }}</h1>
        <p class="mb-1">{{ group.start_date }} to {{ group.end_date }}</p>
        <p>{{ getMemberCount() }} members</p>

        <p v-if="joinError" class="text-danger">{{ joinError }}</p>
        <button class="btn btn-primary" data-testid="join-this-group" @click="joinGroup">
          Join group
        </button>
      </div>
    </div>

    <!-- Member view: header, tabs and the current tab -->
    <div v-else>
      <header class="mt-3" data-testid="group-header">
        <h1>{{ group.name }}</h1>
        <p class="mb-1">{{ group.start_date }} to {{ group.end_date }}</p>
        <p class="mb-1">Budget: ${{ group.budget_per_person }} per person</p>
        <p>{{ getMemberCount() }} members</p>

        <button
          class="btn btn-outline-primary"
          data-testid="invite-button"
          @click="showInvite = !showInvite"
        >
          Invite
        </button>
      </header>

      <!-- Invite panel -->
      <div v-if="showInvite" class="card mt-3" data-testid="invite-panel">
        <div class="card-body">
          <label for="invite-link" class="form-label">Invite link</label>
          <div class="input-group mb-2">
            <input
              id="invite-link"
              class="form-control"
              :value="getInviteLink()"
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
          <p class="mb-0">
            Code: <strong data-testid="invite-code">{{ group.invite_code }}</strong>
          </p>
        </div>
      </div>

      <ul class="nav nav-tabs my-3">
        <li class="nav-item">
          <RouterLink
            class="nav-link"
            active-class="active"
            :to="{ name: 'group-activities' }"
            data-testid="tab-activities"
          >
            Activities
          </RouterLink>
        </li>
        <li class="nav-item">
          <RouterLink
            class="nav-link"
            active-class="active"
            :to="{ name: 'group-availability' }"
            data-testid="tab-availability"
          >
            Availability
          </RouterLink>
        </li>
        <li class="nav-item">
          <RouterLink
            class="nav-link"
            active-class="active"
            :to="{ name: 'group-itinerary' }"
            data-testid="tab-itinerary"
          >
            Itinerary
          </RouterLink>
        </li>
      </ul>

      <RouterView />
    </div>
  </div>
</template>
