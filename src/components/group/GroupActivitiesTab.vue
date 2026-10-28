<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getPrice, formatPrice } from '@/lib/activityDisplay'

const route = useRoute()
const groupId = route.params.id

const userId = ref('') // the logged-in user's id
const sharedActivities = ref([]) // rows from group_activities, each with its activity's details
const votes = ref([]) // every vote in this group: { activity_id, user_id, value }
const memberNames = ref({}) // user id -> display name, for "Shared by ..."

const loading = ref(true)
const errorMessage = ref('')
const savingId = ref('') // the activity whose vote or removal is being saved
const toastMessage = ref('')

let toastTimer
let channel // the Supabase Realtime subscription

// Load everything this tab needs. showSpinner is false for live refreshes,
// so the list doesn't flash every time someone votes.
async function loadActivities(showSpinner = true) {
  if (showSpinner) loading.value = true
  errorMessage.value = ''

  try {
    const { data: auth } = await supabase.auth.getUser()
    userId.value = auth.user.id

    // 1. The activities shared to this group, with their details from the activities table
    const { data: shared, error: sharedError } = await supabase
      .from('group_activities')
      .select('activity_id, shared_by, activities(id, name, image_url, price_per_person, category)')
      .eq('group_id', groupId)
    if (sharedError) throw sharedError

    // 2. Every vote in this group
    const { data: groupVotes, error: votesError } = await supabase
      .from('votes')
      .select('activity_id, user_id, value')
      .eq('group_id', groupId)
    if (votesError) throw votesError

    // 3. The names of whoever shared each activity
    const sharerIds = shared.map((row) => row.shared_by)
    const names = {}
    if (sharerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .rpc('get_group_member_names', { p_group_id: groupId })
      if (profilesError) throw profilesError
      for (const p of profiles) names[p.id] = p.display_name
    }

    // Skip rows whose activity no longer exists
    sharedActivities.value = shared.filter((row) => row.activities)
    votes.value = groupVotes
    memberNames.value = names
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load this group's activities."
  } finally {
    loading.value = false
  }
}

// Add up all the votes for one activity, e.g. 3 upvotes and 1 downvote = 2
function getScore(activityId) {
  let score = 0
  for (const v of votes.value) {
    if (v.activity_id === activityId) score += v.value
  }
  return score
}

// The logged-in user's vote on one activity: 1, -1, or 0 if they haven't voted
function getMyVote(activityId) {
  const mine = votes.value.find((v) => v.activity_id === activityId && v.user_id === userId.value)
  return mine ? mine.value : 0
}

// The list shown on screen, highest score first.
// It re-sorts by itself whenever votes or sharedActivities change.
const sortedActivities = computed(() => {
  const list = sharedActivities.value.map((row) => ({
    id: row.activity_id,
    name: row.activities.name,
    imageUrl: row.activities.image_url,
    price: row.activities.price_per_person,
    category: row.activities.category,
    sharedBy: row.shared_by,
    score: getScore(row.activity_id),
    myVote: getMyVote(row.activity_id),
  }))

  // Highest score first. Ties are sorted by name so the order doesn't jump around.
  return list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
})

function getPriceText(price) {
  return getPrice(price) > 0 ? formatPrice(price) + ' / person' : formatPrice(price)
}

function getSharedByText(activity) {
  if (activity.sharedBy === userId.value) return 'Shared by you'
  return 'Shared by ' + (memberNames.value[activity.sharedBy] || 'a member')
}

// e.g. 2 -> "+2", -1 -> "-1", 0 -> "0"
function formatScore(score) {
  return score > 0 ? '+' + score : String(score)
}

function showToast(text) {
  clearTimeout(toastTimer)
  toastMessage.value = text
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

// Change the user's vote on screen straight away (newValue 0 means no vote)
function setMyVote(activityId, newValue) {
  votes.value = votes.value.filter(
    (v) => !(v.activity_id === activityId && v.user_id === userId.value),
  )
  if (newValue !== 0) {
    votes.value.push({ activity_id: activityId, user_id: userId.value, value: newValue })
  }
}

// value is 1 (upvote) or -1 (downvote). Tapping the same arrow again removes the vote.
async function vote(activity, value) {
  if (savingId.value) return

  const oldVote = activity.myVote
  const newVote = oldVote === value ? 0 : value
  savingId.value = activity.id
  setMyVote(activity.id, newVote)

  try {
    if (newVote === 0) {
      // Remove the vote
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('group_id', groupId)
        .eq('activity_id', activity.id)
        .eq('user_id', userId.value)
      if (error) throw error
    } else if (oldVote === 0) {
      // First vote on this activity
      const { error } = await supabase
        .from('votes')
        .insert({
          group_id: groupId,
          activity_id: activity.id,
          user_id: userId.value,
          value: newVote,
        })
      if (error) throw error
    } else {
      // Switch from upvote to downvote, or the other way round
      const { error } = await supabase
        .from('votes')
        .update({ value: newVote })
        .eq('group_id', groupId)
        .eq('activity_id', activity.id)
        .eq('user_id', userId.value)
      if (error) throw error
    }

    showToast(newVote === 0 ? 'Vote removed' : 'Vote saved')
  } catch (error) {
    console.log(error)
    showToast("Couldn't save your vote. Please try again.")
    loadActivities(false) // put the real votes back on screen
  } finally {
    savingId.value = ''
  }
}

// Remove an activity the user shared. It stays in the app, just not in this group.
async function removeActivity(activity) {
  if (savingId.value) return
  savingId.value = activity.id

  try {
    const { error } = await supabase
      .from('group_activities')
      .delete()
      .eq('group_id', groupId)
      .eq('activity_id', activity.id)
      .eq('shared_by', userId.value)
    if (error) throw error

    // Clear its votes too, so Plan doesn't pick an activity that was removed
    const { error: votesError } = await supabase
      .from('votes')
      .delete()
      .eq('group_id', groupId)
      .eq('activity_id', activity.id)
    if (votesError) throw votesError

    sharedActivities.value = sharedActivities.value.filter((row) => row.activity_id !== activity.id)
    votes.value = votes.value.filter((v) => v.activity_id !== activity.id)
    showToast('Removed ' + activity.name + ' from the group')
  } catch (error) {
    console.log(error)
    showToast("Couldn't remove this activity. Please try again.")
    loadActivities(false)
  } finally {
    savingId.value = ''
  }
}

// Reload when anyone in the group votes, shares or removes an activity.
// Deleted rows can't be filtered by group in Supabase, so we check the group ourselves.
function onLiveChange(payload) {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new
  if (!row.group_id || String(row.group_id) === String(groupId)) {
    loadActivities(false)
  }
}

onMounted(() => {
  loadActivities()

  channel = supabase
    .channel('group-activities-' + groupId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, onLiveChange)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_activities' },
      onLiveChange,
    )
    .subscribe()
})

// Stop listening and clear the timer when the user leaves this tab
onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div data-testid="group-activities-tab">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div>
        <h2 class="h4 mb-1">Activities</h2>
        <p class="text-body-secondary mb-0">
          Vote on what the group should do. Highest score first.
        </p>
      </div>
      <RouterLink to="/activities" class="btn btn-primary" data-testid="add-from-activities">
        + Add from Activities
      </RouterLink>
    </div>

    <div v-if="loading" class="text-center py-5" data-testid="group-activities-loading">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="errorMessage" class="alert alert-danger" data-testid="group-activities-error">
      {{ errorMessage }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="loadActivities()">
        Try again
      </button>
    </div>

    <div
      v-else-if="sortedActivities.length === 0"
      class="text-center py-5"
      data-testid="group-activities-empty"
    >
      <p>No activities yet. Browse Activities and share some here.</p>
      <RouterLink to="/activities" class="btn btn-outline-primary">Browse Activities</RouterLink>
    </div>

    <ul v-else class="list-group">
      <li
        v-for="activity in sortedActivities"
        :key="activity.id"
        class="list-group-item d-flex align-items-center gap-3 py-3"
        data-testid="shared-activity"
      >
        <img
          v-if="activity.imageUrl"
          :src="activity.imageUrl"
          :alt="activity.name"
          class="thumbnail rounded"
        />
        <div
          v-else
          class="thumbnail rounded bg-secondary-subtle d-flex align-items-center justify-content-center"
        >
          {{ activity.name.charAt(0) }}
        </div>

        <div class="flex-grow-1 min-width-0">
          <RouterLink
            :to="{ name: 'activity-detail', params: { id: activity.id } }"
            class="fw-semibold text-decoration-none"
            data-testid="shared-activity-name"
          >
            {{ activity.name }}
          </RouterLink>
          <div class="small">{{ getPriceText(activity.price) }}</div>
          <div class="small text-body-secondary">
            {{ getSharedByText(activity) }}
            <button
              v-if="activity.sharedBy === userId"
              class="btn btn-link btn-sm text-danger p-0 ms-2 align-baseline"
              :disabled="savingId === activity.id"
              data-testid="remove-activity"
              @click="removeActivity(activity)"
            >
              Remove
            </button>
          </div>
        </div>

        <!-- Vote buttons: the user's current vote is highlighted -->
        <div class="d-flex flex-column align-items-center">
          <button
            class="btn btn-sm vote-button"
            :class="{
              'btn-success': activity.myVote === 1,
              'btn-outline-secondary': activity.myVote !== 1,
            }"
            :disabled="savingId === activity.id"
            :aria-pressed="activity.myVote === 1"
            :aria-label="'Upvote ' + activity.name"
            data-testid="upvote-button"
            @click="vote(activity, 1)"
          >
            ▲
          </button>
          <span
            class="fw-bold my-1"
            :class="{ 'text-success': activity.score > 0, 'text-danger': activity.score < 0 }"
            data-testid="activity-score"
          >
            {{ formatScore(activity.score) }}
          </span>
          <button
            class="btn btn-sm vote-button"
            :class="{
              'btn-danger': activity.myVote === -1,
              'btn-outline-secondary': activity.myVote !== -1,
            }"
            :disabled="savingId === activity.id"
            :aria-pressed="activity.myVote === -1"
            :aria-label="'Downvote ' + activity.name"
            data-testid="downvote-button"
            @click="vote(activity, -1)"
          >
            ▼
          </button>
        </div>
      </li>
    </ul>

    <!-- Toast: bottom-right on desktop, bottom-centre on phones, gone after 3 seconds -->
    <div
      v-if="toastMessage"
      class="toast-message bg-dark text-white rounded px-3 py-2"
      role="status"
      data-testid="group-activities-toast"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>

<style scoped>
.thumbnail {
  width: 64px;
  height: 64px;
  object-fit: cover;
  flex-shrink: 0;
}

/* Lets long activity names wrap instead of pushing the vote buttons off screen */
.min-width-0 {
  min-width: 0;
}

.vote-button {
  width: 2.5rem;
}

.toast-message {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1080;
}

@media (max-width: 575.98px) {
  .toast-message {
    right: 50%;
    transform: translateX(50%);
  }
}
</style>
