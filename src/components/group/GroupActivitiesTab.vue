<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getPrice, formatPrice } from '@/lib/activityDisplay'

const route = useRoute()
const groupId = route.params.id

const userId = ref('') // the logged-in user's id
const sharedActivities = ref([]) // rows from group_activities, each with its activity's details
const votes = ref([]) // every vote in this group: { activity_id, user_id, value }
const memberNames = ref({}) // user id -> display name, for "Shared by ..." and who voted

const loading = ref(true)
const errorMessage = ref('')
const savingIds = ref([]) // activities whose vote or removal is being saved
const confirmRemoveId = ref('') // the activity asking "Remove from this group?"
const brokenImages = ref({}) // activity id -> true when its photo failed to load
const showHelp = ref(false)
const toast = ref(null) // { text, retry } for removals and saves that failed
const announcement = ref('') // read out by screen readers
const votersFor = ref('') // the activity whose "who voted" popup is open
const votersDialog = ref(null)

// The order the cards are shown in. It only changes when the user taps "Update rankings",
// so cards don't jump around while people are voting.
const shownOrder = ref([])
const justMoved = ref([]) // cards that just slid to a new place, briefly highlighted
const sliding = ref(false) // true while cards are moving, so a tap can't land on the wrong card
const listRef = ref(null)

let toastTimer
let slideTimer
let highlightTimer
let votersTrigger // the button that opened the popup, to give focus back when it closes
let channel // the Supabase Realtime subscription

// Moves keyboard focus to an element when it appears, e.g. the remove confirmation
const vFocus = { mounted: (el) => el.focus() }

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
      .select(
        'activity_id, shared_by, activities!group_activities_activity_id_fkey(id, name, image_url, price_per_person, category)',
      )
      .eq('group_id', groupId)
    if (sharedError) throw sharedError

    // 2. Every vote in this group
    const { data: groupVotes, error: votesError } = await supabase
      .from('votes')
      .select('activity_id, user_id, value')
      .eq('group_id', groupId)
    if (votesError) throw votesError

    // 3. Everyone's names, for whoever shared or voted on each activity
    const sharerIds = shared.map((row) => row.shared_by)
    const names = {}
    if (sharerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase.rpc(
        'get_group_member_names',
        { p_group_id: groupId },
      )
      if (profilesError) throw profilesError
      for (const p of profiles) names[p.id] = p.display_name
    }

    // Skip rows whose activity no longer exists
    sharedActivities.value = shared.filter((row) => row.activities)
    votes.value = groupVotes
    memberNames.value = names

    // First load: show the current ranking straight away
    if (shownOrder.value.length === 0) takeSnapshot()
  } catch (error) {
    console.log(error)
    errorMessage.value =
      "Couldn't load this group's activities. Check your connection, then try again."
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

// Everything a card needs, by activity id
const activitiesById = computed(() => {
  const byId = {}
  for (const row of sharedActivities.value) {
    const keenVoters = []
    const notKeenVoters = []
    for (const v of votes.value) {
      if (v.activity_id !== row.activity_id) continue
      if (v.value > 0) keenVoters.push(v.user_id)
      else if (v.value < 0) notKeenVoters.push(v.user_id)
    }

    byId[row.activity_id] = {
      id: row.activity_id,
      name: row.activities.name,
      imageUrl: row.activities.image_url,
      price: row.activities.price_per_person,
      category: row.activities.category,
      sharedBy: row.shared_by,
      keenVoters,
      notKeenVoters,
      score: getScore(row.activity_id),
      myVote: getMyVote(row.activity_id),
    }
  }
  return byId
})

// The live ranking, highest score first. Ties keep the order they're shown in,
// so a tie never counts as the ranking changing.
const rankedIds = computed(() => {
  const shownIndex = (id) => {
    const index = shownOrder.value.indexOf(id)
    return index === -1 ? Infinity : index
  }
  return Object.values(activitiesById.value)
    .sort(
      (a, b) =>
        b.score - a.score || shownIndex(a.id) - shownIndex(b.id) || a.name.localeCompare(b.name),
    )
    .map((activity) => activity.id)
})

// Save the current ranking as the order on screen
function takeSnapshot() {
  shownOrder.value = [...rankedIds.value]
}

// The cards in the order they're shown. Newly shared activities go at the end until the
// order updates. move is how many places a card is about to go up (or down if negative).
const shownActivities = computed(() => {
  const byId = activitiesById.value
  const isNew = (id) => !shownOrder.value.includes(id)

  const ids = shownOrder.value.filter((id) => byId[id])
  for (const id of rankedIds.value) {
    if (isNew(id)) ids.push(id)
  }

  return ids.map((id, index) => ({
    ...byId[id],
    rank: index + 1,
    isNew: isNew(id),
    move: index - rankedIds.value.indexOf(id),
  }))
})

const orderChanged = computed(() => shownActivities.value.some((a) => a.move !== 0))
const memberCount = computed(() => Object.keys(memberNames.value).length)
const allVoted = computed(() => shownActivities.value.every((a) => a.myVote !== 0))

// Re-sort the cards. TransitionGroup slides each card to its new place,
// and the cards that moved get a short highlight so they're easy to follow.
function applyRanking() {
  justMoved.value = shownActivities.value.filter((a) => a.move !== 0).map((a) => a.id)
  takeSnapshot()
  announcement.value = 'Rankings updated.'
  // The button disappears once tapped, so move keyboard focus to the list
  listRef.value?.focus({ preventScroll: true })

  // Ignore taps on the list until the slide (0.8s) has finished
  sliding.value = true
  clearTimeout(slideTimer)
  slideTimer = setTimeout(() => {
    sliding.value = false
  }, 900)

  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    justMoved.value = []
  }, 1800)
}

function getPriceText(price) {
  return getPrice(price) > 0 ? formatPrice(price) + ' / person' : formatPrice(price)
}

function getSharedByText(activity) {
  if (activity.sharedBy === userId.value) return 'Shared by you'
  return 'Shared by ' + (memberNames.value[activity.sharedBy] || 'a member')
}

// e.g. "3 of 4 voted", on the button that opens the "who voted" popup
function getVotedText(activity) {
  const voted = activity.keenVoters.length + activity.notKeenVoters.length
  if (memberCount.value === 0) return voted + (voted === 1 ? ' vote' : ' votes')
  return voted + ' of ' + memberCount.value + ' voted'
}

// Shown for the moment before the card slides, e.g. "Moving up 2 places"
function getMoveLabel(activity) {
  const places = Math.abs(activity.move) === 1 ? ' place' : ' places'
  return 'Moving ' + (activity.move > 0 ? 'up ' : 'down ') + Math.abs(activity.move) + places
}

// Names for the popup, e.g. [my id, friend's id] -> ['You', 'Friend']. You're always first.
function getNames(ids) {
  return [...ids]
    .sort((a, b) => (b === userId.value) - (a === userId.value))
    .map((id) => (id === userId.value ? 'You' : memberNames.value[id] || 'A member'))
}

// The popup's three lists. It reads the live votes, so it updates if someone votes while it's open.
const votersGroups = computed(() => {
  const activity = activitiesById.value[votersFor.value]
  if (!activity) return []
  const voted = [...activity.keenVoters, ...activity.notKeenVoters]
  const waiting = Object.keys(memberNames.value).filter((id) => !voted.includes(id))
  return [
    { key: 'up', label: 'Thumbs up', names: getNames(activity.keenVoters) },
    { key: 'down', label: 'Thumbs down', names: getNames(activity.notKeenVoters) },
    { key: 'waiting', label: "Haven't voted", names: getNames(waiting) },
  ]
})

async function openVoters(activity, event) {
  votersTrigger = event.currentTarget
  votersFor.value = activity.id
  await nextTick()
  votersDialog.value?.showModal()
}

function closeVoters() {
  votersDialog.value?.close()
  votersFor.value = ''
  votersTrigger?.focus()
}

// A click on the dim area around the popup lands on the <dialog> itself
function closeVotersOnBackdrop(event) {
  if (event.target === votersDialog.value) closeVoters()
}

// Close the popup if its activity is removed from the group while it's open
watch(
  () => votersFor.value && !activitiesById.value[votersFor.value],
  (gone) => {
    if (gone) closeVoters()
  },
)

// Read out by screen readers after a vote. Sighted users see the button fill in instead.
function getVoteMessage(activity, value) {
  if (value === 1) return "You're keen on " + activity.name
  if (value === -1) return "You're not keen on " + activity.name
  return 'Vote taken back from ' + activity.name
}

// Toasts are for removals and for saves that failed. retry adds a Retry button.
function showToast(text, retry = null) {
  toast.value = { text, retry }
  announcement.value = text
  startToastTimer(retry ? 8000 : 4000)
}

function startToastTimer(ms) {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, ms)
}

function holdToast() {
  clearTimeout(toastTimer)
}

function releaseToast() {
  if (toast.value) startToastTimer(3000)
}

function retryFromToast() {
  const retry = toast.value?.retry
  clearTimeout(toastTimer)
  toast.value = null
  if (retry) retry()
}

function isSaving(activityId) {
  return savingIds.value.includes(activityId)
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

// value is 1 (keen) or -1 (not keen). Tapping your current vote again takes it back.
function vote(activity, value) {
  saveVote(activity, activity.myVote === value ? 0 : value)
}

// Save newVote (1, -1, or 0 for no vote)
async function saveVote(activity, newVote) {
  if (isSaving(activity.id)) return

  const oldVote = getMyVote(activity.id)
  if (oldVote === newVote) return
  savingIds.value.push(activity.id)
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
      const { error } = await supabase.from('votes').insert({
        group_id: groupId,
        activity_id: activity.id,
        user_id: userId.value,
        value: newVote,
      })
      if (error) throw error
    } else {
      // Switch from keen to not keen, or the other way round
      const { error } = await supabase
        .from('votes')
        .update({ value: newVote })
        .eq('group_id', groupId)
        .eq('activity_id', activity.id)
        .eq('user_id', userId.value)
      if (error) throw error
    }

    announcement.value = getVoteMessage(activity, newVote)
  } catch (error) {
    console.log(error)
    setMyVote(activity.id, oldVote)
    showToast("Couldn't save your vote on " + activity.name + '.', () =>
      saveVote(activity, newVote),
    )
    loadActivities(false) // make sure the real votes are on screen
  } finally {
    savingIds.value = savingIds.value.filter((id) => id !== activity.id)
  }
}

// Close the "Remove from this group?" question and put focus back on its Remove button
function cancelRemove(activity) {
  confirmRemoveId.value = ''
  document.getElementById('remove-' + activity.id)?.focus()
}

// Remove an activity the user shared. It stays in the app, just not in this group.
async function removeActivity(activity) {
  if (isSaving(activity.id)) return
  savingIds.value.push(activity.id)

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

    confirmRemoveId.value = ''
    sharedActivities.value = sharedActivities.value.filter((row) => row.activity_id !== activity.id)
    votes.value = votes.value.filter((v) => v.activity_id !== activity.id)
    shownOrder.value = shownOrder.value.filter((id) => id !== activity.id)
    showToast('Removed ' + activity.name + ' from the group')
  } catch (error) {
    console.log(error)
    showToast("Couldn't remove " + activity.name + '.', () => removeActivity(activity))
    loadActivities(false)
  } finally {
    savingIds.value = savingIds.value.filter((id) => id !== activity.id)
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

// Stop listening and clear the timers when the user leaves this tab
onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
  clearTimeout(toastTimer)
  clearTimeout(highlightTimer)
  clearTimeout(slideTimer)
})
</script>

<template>
  <div class="activities-tab" data-testid="group-activities-tab">
    <h2 class="visually-hidden">Activities</h2>
    <p class="visually-hidden" role="status">{{ announcement }}</p>

    <!-- Placeholder cards while loading, shaped like the real ones -->
    <div v-if="loading" data-testid="group-activities-loading">
      <span class="visually-hidden">Loading activities...</span>
      <div v-for="n in 3" :key="n" class="vote-card skeleton placeholder-glow" aria-hidden="true">
        <div class="card-main">
          <span class="placeholder thumb"></span>
          <div>
            <span class="placeholder col-7 mb-2"></span>
            <span class="placeholder col-4 d-block mb-3"></span>
            <span class="placeholder col-9 d-block"></span>
          </div>
          <div class="vote-buttons">
            <span class="placeholder vote-placeholder"></span>
            <span class="placeholder vote-placeholder"></span>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="alert alert-danger" data-testid="group-activities-error">
      <p class="mb-2">{{ errorMessage }}</p>
      <button type="button" class="btn btn-danger rounded-pill px-4" @click="loadActivities()">
        Try again
      </button>
    </div>

    <div
      v-else-if="shownActivities.length === 0"
      class="empty-state"
      data-testid="group-activities-empty"
    >
      <!-- Compass icon adapted from Feather Icons (MIT licence), https://feathericons.com -->
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32">
          <circle cx="12" cy="12" r="10" />
          <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
        </svg>
      </div>
      <h3 class="h5">No activities yet</h3>
      <p class="text-body-secondary mb-4">
        Share ideas from Activities, then vote on them together. The favourites become your
        itinerary.
      </p>
      <ol class="empty-steps">
        <li><span>1</span>Browse activities</li>
        <li><span>2</span>Share them to this group</li>
        <li><span>3</span>Vote together</li>
      </ol>
      <RouterLink to="/activities" class="btn btn-dark rounded-pill px-4"
        >Browse Activities</RouterLink
      >
    </div>

    <template v-else>
      <!-- One compact row, so the first card's vote buttons fit on a phone's first screen -->
      <div class="toolbar">
        <button
          type="button"
          class="btn btn-link help-toggle"
          :aria-expanded="showHelp"
          aria-controls="voting-help"
          data-testid="voting-help-toggle"
          @click="showHelp = !showHelp"
        >
          How it works
        </button>
        <RouterLink
          to="/activities"
          class="btn btn-outline-dark rounded-pill px-3 add-button"
          data-testid="add-from-activities"
        >
          + Add<span class="d-none d-sm-inline">&nbsp;from Activities</span>
        </RouterLink>
      </div>

      <div v-if="showHelp" id="voting-help" class="help-panel" data-testid="voting-help">
        <ul class="small mb-0">
          <li>Thumbs up if you're keen, thumbs down if you're not. Tap again to take it back.</li>
          <li>
            Activities with more thumbs up than thumbs down go into the itinerary, top first, as
            long as each fits your time and budget.
          </li>
          <li>Tap "voted" on an activity to see who gave it a thumbs up or down.</li>
          <li>
            The list stays still while people vote, and each card shows where it would move. Tap
            <strong>Update rankings</strong> at the bottom of the screen to re-sort it.
          </li>
        </ul>
      </div>

      <div ref="listRef" tabindex="-1" class="list-focus">
        <TransitionGroup
          tag="div"
          name="rank"
          class="activity-list"
          :class="{ sliding }"
          aria-label="Group activities"
        >
          <div v-for="activity in shownActivities" :key="activity.id" class="list-item">
            <article
              class="vote-card"
              :class="{ 'just-moved': justMoved.includes(activity.id) }"
              :aria-labelledby="'name-' + activity.id"
              data-testid="shared-activity"
            >
              <div class="card-main">
                <RouterLink
                  :to="{ name: 'activity-detail', params: { id: activity.id } }"
                  class="thumb"
                  tabindex="-1"
                  aria-hidden="true"
                >
                  <img
                    v-if="activity.imageUrl && !brokenImages[activity.id]"
                    :src="activity.imageUrl"
                    alt=""
                    loading="lazy"
                    @error="brokenImages[activity.id] = true"
                  />
                  <span v-else class="thumb-fallback">{{ activity.name.charAt(0) }}</span>
                  <span class="rank-badge" data-testid="activity-rank">
                    {{ activity.rank }}
                  </span>
                </RouterLink>

                <div class="card-info">
                  <div class="name-row">
                    <h4 :id="'name-' + activity.id" class="activity-name">
                      <RouterLink
                        :to="{ name: 'activity-detail', params: { id: activity.id } }"
                        data-testid="shared-activity-name"
                      >
                        {{ activity.name }}
                      </RouterLink>
                    </h4>
                    <span v-if="activity.isNew" class="chip chip-new">Just shared</span>
                    <span
                      v-if="activity.move !== 0"
                      class="chip"
                      :class="activity.move < 0 ? 'chip-down' : 'chip-up'"
                      :title="getMoveLabel(activity)"
                      data-testid="rank-move"
                    >
                      <!-- Arrow icons adapted from Feather Icons (MIT licence) -->
                      <svg v-if="activity.move < 0" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                      <span aria-hidden="true">{{ Math.abs(activity.move) }}</span>
                      <span class="visually-hidden">{{ getMoveLabel(activity) }}</span>
                    </span>
                  </div>

                  <p class="meta">
                    <span v-if="activity.category">{{ activity.category }} · </span>
                    {{ getPriceText(activity.price) }}
                  </p>
                  <p class="meta">
                    {{ getSharedByText(activity) }}
                    <button
                      v-if="activity.sharedBy === userId"
                      :id="'remove-' + activity.id"
                      type="button"
                      class="btn btn-link text-link-danger hit-area"
                      data-testid="remove-activity"
                      @click="confirmRemoveId = activity.id"
                    >
                      Remove
                    </button>
                  </p>

                  <!-- Opens the popup showing who gave a thumbs up or down -->
                  <!-- Users icon adapted from Feather Icons (MIT licence) -->
                  <button
                    type="button"
                    class="btn btn-link voters-button"
                    aria-haspopup="dialog"
                    :aria-label="'See who voted on ' + activity.name"
                    data-testid="show-voters"
                    @click="openVoters(activity, $event)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                      />
                    </svg>
                    {{ getVotedText(activity) }}
                  </button>
                </div>

                <!-- Vote buttons: the user's current vote is filled in -->
                <div
                  class="vote-buttons"
                  role="group"
                  :aria-label="'Your vote on ' + activity.name"
                >
                  <!-- Thumb icons adapted from Feather Icons (MIT licence), https://feathericons.com -->
                  <button
                    type="button"
                    class="vote-button keen"
                    :class="{ active: activity.myVote === 1 }"
                    :aria-pressed="activity.myVote === 1"
                    :aria-busy="isSaving(activity.id)"
                    :aria-label="
                      'Thumbs up for ' +
                      activity.name +
                      ', ' +
                      activity.keenVoters.length +
                      ' so far'
                    "
                    :title="
                      activity.myVote === 1 ? 'Tap again to take back your vote' : 'Thumbs up'
                    "
                    data-testid="upvote-button"
                    @click="vote(activity, 1)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
                      />
                    </svg>
                    <span class="vote-count" data-testid="keen-count">{{
                      activity.keenVoters.length
                    }}</span>
                  </button>
                  <button
                    type="button"
                    class="vote-button not-keen"
                    :class="{ active: activity.myVote === -1 }"
                    :aria-pressed="activity.myVote === -1"
                    :aria-busy="isSaving(activity.id)"
                    :aria-label="
                      'Thumbs down for ' +
                      activity.name +
                      ', ' +
                      activity.notKeenVoters.length +
                      ' so far'
                    "
                    :title="
                      activity.myVote === -1 ? 'Tap again to take back your vote' : 'Thumbs down'
                    "
                    data-testid="downvote-button"
                    @click="vote(activity, -1)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"
                      />
                    </svg>
                    <span class="vote-count" data-testid="not-keen-count">{{
                      activity.notKeenVoters.length
                    }}</span>
                  </button>
                </div>
              </div>

              <!-- Asks before removing, since everyone's votes on it are cleared too -->
              <div
                v-if="confirmRemoveId === activity.id"
                class="remove-confirm"
                data-testid="remove-confirm"
                @keydown.esc="cancelRemove(activity)"
              >
                <span class="small">
                  Remove <strong>{{ activity.name }}</strong> from this group? Everyone's votes on
                  it will be cleared.
                </span>
                <span class="d-flex gap-2">
                  <button
                    v-focus
                    type="button"
                    class="btn btn-outline-dark rounded-pill px-3"
                    data-testid="cancel-remove-activity"
                    @click="cancelRemove(activity)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger rounded-pill px-3"
                    :disabled="isSaving(activity.id)"
                    data-testid="confirm-remove-activity"
                    @click="removeActivity(activity)"
                  >
                    Remove
                  </button>
                </span>
              </div>
            </article>
          </div>
        </TransitionGroup>
      </div>

      <!-- Hands off to the next step of planning -->
      <div class="next-step" data-testid="next-step">
        <div>
          <p class="fw-semibold mb-0">
            {{ allVoted ? "You've voted on everything." : 'Done voting?' }}
          </p>
          <p class="small text-body-secondary mb-0">
            Next, mark when you're free so the group can pick a time.
          </p>
        </div>
        <RouterLink
          :to="{ name: 'group-availability' }"
          class="btn rounded-pill px-4"
          :class="allVoted ? 'btn-dark' : 'btn-outline-dark'"
          data-testid="go-to-availability"
        >
          Mark when you're free
        </RouterLink>
      </div>
    </template>

    <!-- "Who voted" popup. A native <dialog> keeps keyboard focus inside and closes on Esc. -->
    <dialog
      ref="votersDialog"
      class="voters-dialog"
      aria-labelledby="voters-title"
      data-testid="voters-dialog"
      @cancel.prevent="closeVoters"
      @click="closeVotersOnBackdrop"
    >
      <div v-if="votersFor" class="voters-body">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h2 id="voters-title" class="h5 fw-bold mb-1">Who voted</h2>
            <p class="text-body-secondary mb-0">{{ activitiesById[votersFor]?.name }}</p>
          </div>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            data-testid="close-voters"
            @click="closeVoters"
          ></button>
        </div>

        <section
          v-for="group in votersGroups"
          :key="group.key"
          class="voters-group"
          :data-testid="'voters-' + group.key"
        >
          <h3 class="voters-heading" :class="group.key">
            <svg v-if="group.key === 'up'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
              />
            </svg>
            <svg v-else-if="group.key === 'down'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"
              />
            </svg>
            {{ group.label }}
            <span class="voters-count">{{ group.names.length }}</span>
          </h3>
          <ul v-if="group.names.length" class="voters-names">
            <li v-for="name in group.names" :key="name">{{ name }}</li>
          </ul>
          <p v-else class="voters-none">Nobody</p>
        </section>
      </div>
    </dialog>

    <!-- Floating at the bottom: visible wherever you've scrolled to, in reach of a thumb,
         and never pushing the cards around -->
    <div class="floating">
      <Transition name="float">
        <!-- Refresh icon adapted from Feather Icons (MIT licence) -->
        <button
          v-if="!loading && !errorMessage && orderChanged"
          type="button"
          class="update-button"
          data-testid="apply-ranking"
          @click="applyRanking"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
            />
          </svg>
          Update rankings
        </button>
      </Transition>
      <Transition name="float">
        <div
          v-if="toast"
          class="toast-message"
          data-testid="group-activities-toast"
          @mouseenter="holdToast"
          @mouseleave="releaseToast"
          @focusin="holdToast"
          @focusout="releaseToast"
        >
          <span>{{ toast.text }}</span>
          <button
            v-if="toast.retry"
            type="button"
            class="btn btn-link toast-action"
            data-testid="toast-retry"
            @click="retryFromToast"
          >
            Retry
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* One visible focus ring for everything in the tab */
.activities-tab :is(a, button):focus-visible {
  outline: 2px solid #111;
  outline-offset: 2px;
  box-shadow: none;
}

/* Leaves room at the bottom so the floating button doesn't cover the last card */
.activities-tab {
  padding-bottom: 6rem;
}

/* Makes a small text button easier to tap without changing the layout */
.hit-area {
  position: relative;
}

.hit-area::after {
  position: absolute;
  inset: -12px -8px;
  content: '';
}

/* Toolbar: help, and adding more */
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
}

/* Text buttons in near-black, like the links on the Activities page */
.help-toggle,
.voters-button {
  --bs-btn-color: #111;
  --bs-btn-hover-color: #111;
  --bs-btn-active-color: #111;
}

.help-toggle {
  min-height: 44px;
  margin-left: auto;
  padding: 0 0.25rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.help-toggle:hover {
  text-decoration: underline;
}

.add-button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  white-space: nowrap;
}

.help-panel {
  margin: -0.25rem 0 1rem;
  padding: 0.75rem 1rem 0.75rem 2rem;
  border-radius: 12px;
  background: var(--bs-tertiary-bg);
}

.help-panel li + li {
  margin-top: 0.25rem;
}

.list-item {
  padding-bottom: 0.75rem;
}

/* Cards match ActivityCard: soft border, rounded corners, light shadow */
.vote-card {
  padding: 1rem;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color-translucent);
  border-radius: 18px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 4%);
  transition: box-shadow 0.2s ease;
}

.vote-card:hover {
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
}

.skeleton {
  margin-bottom: 0.75rem;
}

.card-main {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
}

/* Photo, with its place on the shortlist in the corner */
.thumb {
  position: relative;
  display: block;
  width: 96px;
  height: 96px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--bs-secondary-bg);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-fallback {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--bs-secondary-color);
  font-size: 2rem;
  font-weight: 700;
}

.rank-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(var(--bs-dark-rgb), 0.8);
  color: white;
  font-size: 0.8rem;
  font-weight: 700;
}

.name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
}

.activity-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.activity-name a {
  color: var(--bs-emphasis-color);
  text-decoration: none;
}

.activity-name a:hover {
  text-decoration: underline;
}

.meta {
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.875rem;
}

.text-link-danger {
  margin-left: 0.5rem;
  padding: 0;
  border: 0;
  color: var(--bs-danger-text-emphasis);
  font-size: inherit;
  vertical-align: baseline;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.chip svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chip-new {
  background: var(--bs-secondary-bg);
  color: var(--bs-emphasis-color);
}

.chip-up {
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}

.chip-down {
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
}

/* "3 of 4 voted" button that opens the popup */
.voters-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  margin: 0.125rem 0 -0.5rem -0.25rem;
  padding: 0 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
}

.voters-button:hover {
  text-decoration: underline;
}

.voters-button svg,
.voters-heading svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* "Who voted" popup, styled like the share dialog */
.voters-dialog {
  width: min(400px, calc(100% - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  overflow-y: auto;
  border: 1px solid var(--bs-border-color-translucent);
  border-radius: 20px;
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  box-shadow: 0 16px 48px rgb(0 0 0 / 15%);
}

.voters-dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}

.voters-body {
  padding: 24px;
}

.voters-group + .voters-group {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--bs-border-color-translucent);
}

.voters-heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
}

.voters-heading.up {
  color: var(--bs-success-text-emphasis);
}

.voters-heading.down {
  color: var(--bs-danger-text-emphasis);
}

.voters-count {
  min-width: 1.5rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.voters-names {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.voters-names li {
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--bs-tertiary-bg);
  font-size: 0.9rem;
}

.voters-none {
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.875rem;
}

/* Thumbs up (keen) / thumbs down (not keen) buttons */
.vote-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 5.5rem;
}

.vote-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--bs-border-color);
  border-radius: 999px;
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  font-weight: 600;
  white-space: nowrap;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.vote-button svg {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vote-button.keen:hover {
  border-color: var(--bs-success);
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}

.vote-button.not-keen:hover {
  border-color: var(--bs-danger-border-subtle);
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.vote-button.keen.active {
  border-color: var(--bs-success);
  background: var(--bs-success);
  color: white;
}

.vote-button.keen.active svg {
  fill: rgb(255 255 255 / 35%);
}

/* Not keen stays quiet even when chosen, so saying no doesn't shout */
.vote-button.not-keen.active {
  border-color: var(--bs-danger);
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.vote-button:active {
  transform: scale(0.96);
}

.vote-button[aria-busy='true'] {
  cursor: progress;
  opacity: 0.75;
}

.vote-count {
  min-width: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: rgba(var(--bs-emphasis-color-rgb), 0.06);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.vote-button.keen.active .vote-count {
  background: rgb(255 255 255 / 25%);
}

.remove-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 12px;
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.remove-confirm .btn {
  min-height: 44px;
}

/* Next step, after the list */
.next-step {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 18px;
  background: var(--bs-tertiary-bg);
}

.next-step .btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

/* Block layout (not flex) so a card being removed stays where it was while it fades */
.activity-list {
  position: relative;
}

.activity-list.sliding {
  pointer-events: none;
}

/* Cards glide to their new places when the order updates: slow enough to follow
   a card that moves several places, easing out so it settles gently */
.rank-move {
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

/* A card that just moved glows briefly, so your eye can find where it landed */
.vote-card.just-moved {
  animation: landed 1.8s ease-out;
}

@keyframes landed {
  0%,
  35% {
    border-color: #111;
    box-shadow:
      0 0 0 3px rgb(17 17 17 / 18%),
      0 8px 24px rgb(0 0 0 / 8%);
  }

  100% {
    box-shadow: 0 4px 16px rgb(0 0 0 / 4%);
  }
}

.rank-enter-active,
.rank-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.rank-enter-from,
.rank-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.rank-leave-active {
  position: absolute;
  width: 100%;
}

/* Loading placeholders */
.placeholder.thumb {
  height: 96px;
  background-color: currentcolor;
}

.vote-placeholder {
  display: block;
  height: 44px;
  border-radius: 999px;
}

/* Empty state */
.empty-state {
  max-width: 34rem;
  margin: 0 auto;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: #f3f3f3;
}

.empty-icon svg {
  fill: none;
  stroke: #111;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem 1.25rem;
  margin-bottom: 1.5rem;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  font-weight: 600;
}

.empty-steps span {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-right: 0.4rem;
  border-radius: 50%;
  background: #111;
  color: white;
  font-size: 0.75rem;
}

/* Update rankings button and toast, floating at the bottom of the screen */
.floating {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 1080;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  pointer-events: none;
}

.floating > * {
  pointer-events: auto;
}

.update-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0.5rem 1.25rem;
  border: 0;
  border-radius: 999px;
  background: #111;
  color: white;
  font-weight: 600;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  transition: background-color 0.15s ease;
}

.update-button:hover {
  background: #333;
}

.update-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.list-focus:focus {
  outline: none;
}

.toast-message {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: calc(100vw - 2rem);
  padding: 0.75rem 1.25rem;
  border-radius: 14px;
  background: var(--bs-dark);
  color: white;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.toast-action {
  min-height: 44px;
  padding: 0 0.25rem;
  color: var(--bs-warning);
  font-weight: 700;
}

.float-enter-active,
.float-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.float-enter-from,
.float-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}

/* Phones: smaller photo, the vote buttons get a full-width row of their own,
   and the floating bits span the screen */
@media (max-width: 575.98px) {
  .toolbar {
    gap: 0.5rem;
  }

  .vote-card {
    padding: 0.85rem;
  }

  .card-main {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .thumb,
  .placeholder.thumb {
    width: 64px;
    height: 64px;
  }

  .rank-badge {
    top: 4px;
    left: 4px;
    min-width: 22px;
    height: 22px;
    font-size: 0.75rem;
  }

  .vote-buttons {
    grid-column: 1 / -1;
    flex-direction: row;
    min-width: 0;
  }

  .vote-button,
  .vote-placeholder {
    flex: 1;
  }

  .vote-button {
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
  }

  .floating {
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    align-items: stretch;
  }

  .toast-message {
    justify-content: space-between;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rank-move,
  .rank-enter-active,
  .rank-leave-active,
  .float-enter-active,
  .float-leave-active {
    transition: none;
  }
}
</style>
