<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import BaseDialog from '@/components/BaseDialog.vue'
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
const toast = ref(null) // { text, retry } for removals and saves that failed
const announcement = ref('') // read out by screen readers
const votersFor = ref('') // the activity whose "who voted" popup is open

// The order the cards are shown in. It only changes when the user taps "Update rankings",
// so cards don't jump around while people are voting.
const shownOrder = ref([])
const justMoved = ref([]) // cards that just slid to a new place, briefly highlighted
const sliding = ref(false) // true while cards are moving, so a tap can't land on the wrong card
const shuffling = ref(false) // true during the "shuffle the deck" reorder (see shuffleCards)
const newLeaderId = ref('') // a card that just climbed to first place, for its light sweep
const rollDirection = ref({}) // activity id -> 'up' or 'down', which way its rank number rolls
const listRef = ref(null)

let toastTimer
let slideTimer
let highlightTimer
let leaderTimer
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
// The list (and its count and buttons in the intro) only once there is something to show
const showList = computed(
  () => !loading.value && !errorMessage.value && shownActivities.value.length > 0,
)
const memberCount = computed(() => Object.keys(memberNames.value).length)
const allVoted = computed(() => shownActivities.value.every((a) => a.myVote !== 0))

// The reorder's length and curve. Exponential ease-out: cards set off quickly and
// decelerate smoothly into place, with no bounce or overshoot.
const SHUFFLE_MS = 900
const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'

// Re-sort the cards when the user taps "Update rankings". The list never moves by itself,
// so this one tap gets its own moment: see shuffleCards. Cards that moved also get a
// short highlight, and a card that climbs to first place gets a light sweep.
async function applyRanking() {
  const moves = Object.fromEntries(shownActivities.value.map((a) => [a.id, a.move]))
  const newLeader = shownActivities.value.find((a) => a.move > 0 && a.rank - a.move === 1)
  justMoved.value = Object.keys(moves).filter((id) => moves[id] !== 0)
  rollDirection.value = Object.fromEntries(
    Object.entries(moves).map(([id, move]) => [id, move < 0 ? 'down' : 'up']),
  )

  // Where every card is before the re-sort, so each can fly from there to its new place
  const before = getCardPlaces()
  shuffling.value = true
  takeSnapshot()
  announcement.value = 'Rankings updated.'
  // The button disappears once tapped, so move keyboard focus to the list
  listRef.value?.focus({ preventScroll: true })
  await nextTick()

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shuffleCards(before, moves)
  }

  // Ignore taps on the list until the cards have landed
  sliding.value = true
  clearTimeout(slideTimer)
  slideTimer = setTimeout(() => {
    sliding.value = false
    shuffling.value = false
  }, SHUFFLE_MS + 100)

  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    justMoved.value = []
  }, 1800)

  clearTimeout(leaderTimer)
  newLeaderId.value = newLeader ? newLeader.id : ''
  leaderTimer = setTimeout(() => {
    newLeaderId.value = ''
  }, 2000)
}

// A removed card fades out exactly where it was, pinned over its old grid slot, while the
// cards after it slide along to close the gap
function holdLeavingCard(el) {
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = el
  Object.assign(el.style, {
    position: 'absolute',
    left: offsetLeft + 'px',
    top: offsetTop + 'px',
    width: offsetWidth + 'px',
    height: offsetHeight + 'px',
  })
}

// Where each card is on screen, by activity id
function getCardPlaces() {
  const places = {}
  for (const item of listRef.value?.querySelectorAll('.list-item') ?? []) {
    const { left, top } = item.getBoundingClientRect()
    places[item.dataset.id] = { left, top }
  }
  return places
}

// The reorder: every card glides straight from its old place to its new one, across and
// down the grid (FLIP: measure, re-sort, then animate from the old spot). Two layers move:
// - the card's slot slides, setting off quickly and easing out (exponential), so it settles;
// - the card itself rises toward you if it's climbing (a little larger, deeper shadow,
//   passing over the others) or sinks back if it's falling (a little smaller and fainter,
//   passing under), then returns to rest.
function shuffleCards(before, moves) {
  for (const item of listRef.value?.querySelectorAll('.list-item') ?? []) {
    const id = item.dataset.id
    if (before[id] === undefined) continue
    const now = item.getBoundingClientRect()
    const dx = before[id].left - now.left
    const dy = before[id].top - now.top
    const move = moves[id] || 0
    const climbing = move > 0
    const falling = move < 0
    // Cards travelling further start a beat later, so the movement reads as a sequence
    const delay = Math.min(Math.abs(move), 4) * 30

    item.style.zIndex = climbing ? 3 : falling ? 1 : 2
    const slide = item.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      {
        duration: SHUFFLE_MS,
        delay,
        easing: EASE_OUT_EXPO,
        fill: 'backwards',
      },
    )
    slide.onfinish = slide.oncancel = () => {
      item.style.zIndex = ''
    }

    if (!climbing && !falling) continue
    const rest = { transform: 'none', opacity: 1, boxShadow: '0 4px 16px rgb(0 0 0 / 4%)' }
    const away = climbing
      ? { transform: 'scale(1.025)', opacity: 1, boxShadow: '0 28px 56px rgb(0 0 0 / 16%)' }
      : { transform: 'scale(0.975)', opacity: 0.72, boxShadow: '0 2px 8px rgb(0 0 0 / 3%)' }
    item.firstElementChild?.animate([rest, { ...away, offset: 0.3 }, rest], {
      duration: SHUFFLE_MS + delay,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    })
  }
}

// Width of one part of the tally bar: a share of the whole group, so the empty part
// shows who still hasn't voted
function getTallyWidth(activity, count) {
  const voted = activity.keenVoters.length + activity.notKeenVoters.length
  const total = Math.max(memberCount.value, voted, 1)
  return (count / total) * 100 + '%'
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

// Safari doesn't focus buttons on click; focus it so BaseDialog can hand focus back on close
function openVoters(activity, event) {
  event.currentTarget.focus({ preventScroll: true })
  votersFor.value = activity.id
}

function closeVoters() {
  votersFor.value = ''
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
  clearTimeout(leaderTimer)
})
</script>

<template>
  <div class="activities-tab" data-testid="group-activities-tab">
    <!-- Same intro as the Availability and Itinerary tabs: heading, then one line about it.
         Adding more sits beside the heading, so the header stays two lines, even on a phone. -->
    <div class="tab-intro">
      <div class="intro-text">
        <h2 class="h5 fw-bold mb-1">
          Shared with the group
          <span v-if="showList" class="list-count">{{ shownActivities.length }}</span>
        </h2>
        <p class="text-secondary mb-0">Vote for your favourite activities!</p>
      </div>
      <!-- A round + on a phone; the full label from tablet width up -->
      <RouterLink
        v-if="showList"
        to="/activities"
        class="btn btn-outline-dark rounded-pill add-button"
        aria-label="Add from Activities"
        title="Add from Activities"
        data-testid="add-from-activities"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span class="add-label">Add from Activities</span>
      </RouterLink>
    </div>
    <p class="visually-hidden" role="status">{{ announcement }}</p>

    <!-- Placeholder cards while loading, shaped like the real ones -->
    <div v-if="loading" class="activity-list" data-testid="group-activities-loading">
      <span class="visually-hidden">Loading activities...</span>
      <div v-for="n in 3" :key="n" class="vote-card surface-card skeleton placeholder-glow" aria-hidden="true">
        <span class="placeholder photo"></span>
        <div class="card-body">
          <span class="placeholder col-7"></span>
          <span class="placeholder col-4"></span>
          <span class="placeholder col-9"></span>
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
      <div ref="listRef" tabindex="-1" class="list-focus">
        <TransitionGroup
          tag="div"
          name="rank"
          class="activity-list"
          :class="{ sliding, shuffling }"
          aria-label="Group activities"
          @before-leave="holdLeavingCard"
        >
          <div
            v-for="activity in shownActivities"
            :key="activity.id"
            class="list-item"
            :data-id="activity.id"
          >
            <article
              class="vote-card surface-card"
              :class="{
                'just-moved': justMoved.includes(activity.id),
                'new-leader': newLeaderId === activity.id,
              }"
              :aria-labelledby="'name-' + activity.id"
              data-testid="shared-activity"
            >
              <!-- Photo, or a plain strip naming the category when there isn't one -->
              <RouterLink
                :to="{ name: 'activity-detail', params: { id: activity.id } }"
                class="photo"
                :class="{ 'no-photo': !activity.imageUrl || brokenImages[activity.id] }"
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
                <span v-else class="photo-fallback">{{ activity.category || 'Activity' }}</span>

                <!-- The group's current favourite, once it has more keen than not keen -->
                <span v-if="activity.rank === 1 && activity.score > 0" class="top-pick"
                  >Top pick</span
                >

                <!-- A single sweep of light across the photo when a card climbs to first place -->
                <span v-if="newLeaderId === activity.id" class="sheen"></span>
              </RouterLink>

              <div class="card-body">
                <!-- The card's place on the leaderboard, beside its name like a chart.
                     The number rolls like an odometer when the rankings update. -->
                <span class="rank" aria-hidden="true">
                  <Transition :name="'roll-' + (rollDirection[activity.id] || 'up')" mode="out-in">
                    <span :key="activity.rank" class="rank-number" data-testid="activity-rank">{{
                      activity.rank
                    }}</span>
                  </Transition>
                </span>
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

                <!-- How the group's votes split: keen, not keen, and still to vote -->
                <span class="tally" aria-hidden="true">
                  <span
                    class="tally-keen"
                    :style="{ width: getTallyWidth(activity, activity.keenVoters.length) }"
                  ></span>
                  <span
                    class="tally-not-keen"
                    :style="{ width: getTallyWidth(activity, activity.notKeenVoters.length) }"
                  ></span>
                </span>

                <!-- Your vote on the left, who has voted on the right -->
                <div class="card-footer">
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
                        'Keen on ' + activity.name + ', ' + activity.keenVoters.length + ' so far'
                      "
                      :title="activity.myVote === 1 ? 'Tap again to take back your vote' : 'Keen'"
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
                        'Not keen on ' +
                        activity.name +
                        ', ' +
                        activity.notKeenVoters.length +
                        ' so far'
                      "
                      :title="
                        activity.myVote === -1 ? 'Tap again to take back your vote' : 'Not keen'
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

    <!-- "Who voted" popup -->
    <BaseDialog
      :open="Boolean(votersFor)"
      class="voters-dialog"
      title="Who voted"
      close-testid="close-voters"
      data-testid="voters-dialog"
      @close="closeVoters"
    >
      <template #subtitle>
        <p class="text-body-secondary mb-0 mt-1">{{ activitiesById[votersFor]?.name }}</p>
      </template>
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
    </BaseDialog>

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

/* Heading and its line on the left, like the other tabs; the add button on the right,
   level with the heading */
.tab-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.intro-text {
  flex: 1;
  min-width: 0;
}

/* How many activities are shared, like the section counts on the Groups page */
.list-count {
  margin-left: 0.35rem;
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  vertical-align: 3px;
}

/* Text buttons in near-black, like the links on the Activities page */
.voters-button {
  --bs-btn-color: var(--ink);
  --bs-btn-hover-color: var(--ink);
  --bs-btn-active-color: var(--ink);
}

.add-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding-inline: 1rem;
  white-space: nowrap;
}

.add-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

/* Two columns of cards, read left to right then down (one column on smaller screens).
   Positioned so a removed card can be pinned in place while it fades. */
.activity-list {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem 1rem;
}

/* Positioned so a card can pass over (or under) the others during the shuffle;
   flex so cards in the same row stretch to the same height */
.list-item {
  position: relative;
  display: flex;
}

/* Photo on top, details and votes underneath.
   Same family as ActivityCard: soft border, rounded corners, light shadow. */
.vote-card {
  display: grid;
  flex: 1;
  grid-template-rows: auto 1fr;
  min-width: 0;
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.vote-card:hover {
  box-shadow: var(--shadow-raised);
}

/* A wide, short photo, so it sets the scene without making the card tall */
.photo {
  position: relative;
  display: block;
  aspect-ratio: 5 / 2;
  overflow: hidden;
  background: var(--bs-secondary-bg);
}

.photo img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.vote-card:hover .photo img {
  transform: scale(1.04);
}

/* No photo (e.g. places from Google, whose photos aren't stored): a calm strip naming the
   category, the same as the cards on the Activities page */
.photo-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

/* The rank, numbered like a chart: the same size and weight as the name, in grey, so it
   reads as part of the title line rather than a separate graphic. The box clips the
   number so it rolls in and out like an odometer. */
.rank {
  grid-row: 1;
  align-self: start;
  height: 1.2em;
  overflow: hidden;
  color: var(--subtle);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.rank-number {
  display: block;
  font-variant-numeric: tabular-nums;
}

/* "Top pick" on the leading card: a crisp white label in the photo's top corner */
.top-pick {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

/* Rank beside the name and its two detail lines; the tally and the footer run the full
   width underneath, pushed to the bottom so cards side by side line up */
.card-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto auto auto 1fr auto;
  gap: 0.3rem 0.6rem;
  min-width: 0;
  padding: 1.1rem 1.25rem 1.25rem 1rem;
}

.card-body > .name-row,
.card-body > .meta {
  grid-column: 2;
}

.card-body > .tally {
  grid-column: 1 / -1;
  align-self: end;
  margin-top: 0.75rem;
}

.card-body > .card-footer {
  grid-column: 1 / -1;
}

/* Your vote on the left, "2 of 3 voted" on the right */
.card-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
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
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
  overflow-wrap: anywhere;
  text-wrap: balance;
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
  border-radius: var(--radius-pill);
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
  background: var(--keen-subtle);
  color: var(--keen-ink);
}

.chip-down {
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
}

/* Tally bar: keen, not keen, and the grey rest is who still has to vote */
.tally {
  display: flex;
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
}

.tally-keen,
.tally-not-keen {
  height: 100%;
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.tally-keen {
  background: var(--keen);
}

.tally-not-keen {
  background: var(--nope);
}

/* "3 of 4 voted" button that opens the popup */
.voters-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  margin-right: -0.25rem;
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

/* "Who voted" popup: BaseDialog does the layout; this only sets the width */
.voters-dialog {
  --dialog-width: 400px;
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
  color: var(--keen-ink);
}

.voters-heading.down {
  color: var(--nope-ink);
}

.voters-count {
  min-width: 1.5rem;
  padding: 0 0.45rem;
  border-radius: var(--radius-pill);
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  font-size: 0.75rem;
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
  border-radius: var(--radius-pill);
  background: var(--bs-tertiary-bg);
  font-size: 0.875rem;
}

.voters-none {
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.875rem;
}

/* Keen (thumbs up) / not keen (thumbs down) buttons, side by side under the details.
   Icon and count only, so they stay compact pills rather than stretching across the card. */
.vote-buttons {
  display: flex;
  gap: 0.5rem;
}

.vote-buttons > * {
  flex: 0 0 5.5rem;
}

.vote-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--bs-border-color);
  border-radius: var(--radius-pill);
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
  border-color: var(--keen);
  background: var(--keen-subtle);
  color: var(--keen-ink);
}

.vote-button.not-keen:hover {
  border-color: var(--nope);
  background: var(--nope-subtle);
  color: var(--nope-ink);
}

.vote-button.keen.active {
  border-color: var(--keen);
  background: var(--keen);
  color: var(--on-keen);
}

.vote-button.keen.active svg {
  fill: rgb(6 34 27 / 18%);
}

/* Not keen stays quiet even when chosen, so saying no doesn't shout */
.vote-button.not-keen.active {
  border-color: var(--nope);
  background: var(--nope-subtle);
  color: var(--nope-ink);
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
  border-radius: var(--radius-pill);
  background: rgba(var(--bs-emphasis-color-rgb), 0.06);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.vote-button.keen.active .vote-count {
  background: rgb(6 34 27 / 12%);
}

.remove-confirm {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin: 0 1rem 1rem;
  padding: 0.75rem;
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-lg);
  background: var(--bs-tertiary-bg);
}

.next-step .btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

.activity-list.sliding {
  pointer-events: none;
}

/* Cards glide up to fill the gap when one is removed. "Update rankings" uses its own
   shuffle (shuffleCards in the script), so this glide is switched off while it plays. */
.rank-move {
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.activity-list.shuffling .rank-move {
  transition: none;
}

/* The rank number rolls like an odometer: climbing cards roll up, falling cards roll down.
   The old number leaves quickly; the new one eases out (exponential) into place. */
.roll-up-enter-active,
.roll-down-enter-active {
  transition:
    transform 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.1s,
    opacity 0.3s ease-out 0.1s;
}

.roll-up-leave-active,
.roll-down-leave-active {
  transition:
    transform 0.18s cubic-bezier(0.7, 0, 0.84, 0),
    opacity 0.18s ease-in;
}

.roll-up-enter-from,
.roll-down-leave-to {
  opacity: 0;
  transform: translateY(85%);
}

.roll-up-leave-to,
.roll-down-enter-from {
  opacity: 0;
  transform: translateY(-85%);
}

/* A card that climbs to first place: once it has nearly landed, one soft band of light
   sweeps across its photo and the "Top pick" label wipes in */
.sheen {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    105deg,
    rgb(255 255 255 / 0%) 30%,
    rgb(255 255 255 / 42%) 50%,
    rgb(255 255 255 / 0%) 70%
  );
  transform: translateX(-100%);
  pointer-events: none;
  animation: sheen 1s cubic-bezier(0.65, 0, 0.35, 1) 0.55s both;
}

@keyframes sheen {
  to {
    transform: translateX(100%);
  }
}

.new-leader .top-pick {
  animation: top-pick-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.75s both;
}

@keyframes top-pick-in {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0 round 999px);
  }

  to {
    opacity: 1;
    clip-path: inset(0 0 0 0 round 999px);
  }
}

/* A card that just moved gets a ring as it lands, so your eye can find where it went */
.vote-card.just-moved {
  animation: landed 1.2s ease-out 0.6s;
}

@keyframes landed {
  from {
    border-color: var(--ink);
    box-shadow:
      0 0 0 3px rgb(17 17 17 / 14%),
      0 8px 24px rgb(0 0 0 / 8%);
  }

  to {
    box-shadow: var(--shadow-card);
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

/* Loading placeholders */
.placeholder.photo {
  border-radius: 0;
  background-color: currentcolor;
}

.skeleton .card-body {
  display: flex;
  flex-direction: column;
}

.skeleton .card-body .placeholder:not(.vote-placeholder) {
  display: block;
  height: 1rem;
}

.vote-placeholder {
  display: block;
  height: 44px;
  border-radius: var(--radius-pill);
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
  background: var(--surface-2);
}

.empty-icon svg {
  fill: none;
  stroke: var(--ink);
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
  background: var(--ink);
  color: var(--on-ink);
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
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 600;
  box-shadow: var(--shadow-float);
  transition: background-color 0.15s ease;
}

.update-button:hover {
  background: var(--ink-hover);
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
  border-radius: var(--radius-md);
  background: var(--bs-dark);
  color: var(--on-ink);
  box-shadow: var(--shadow-float);
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

/* Tablets: a narrower photo column */
/* Below tablet width the cards stack in one column */
@media (max-width: 767.98px) {
  .activity-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Phones: a slightly taller photo so it still shows something at this width,
   and the floating bits span the screen */
@media (max-width: 575.98px) {
  /* One column here, so a card without a photo doesn't need to match its neighbour:
     a slim band instead of a big empty block */
  .photo.no-photo {
    aspect-ratio: 5 / 1;
  }

  .add-button {
    width: 44px;
    padding: 0;
  }

  .add-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .vote-card {
    border-radius: var(--radius-lg);
  }

  .photo {
    aspect-ratio: 2 / 1;
  }

  .top-pick {
    top: 10px;
    left: 10px;
  }

  .card-body {
    padding: 0.9rem 1rem 1rem 0.85rem;
  }

  .vote-button {
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
  }

  .remove-confirm {
    margin: 0 0.75rem 0.75rem;
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

/* Reduced motion: no glide (the script skips it), no rolling numbers or light sweep;
   cards simply appear in their new places with the ring around the ones that moved */
@media (prefers-reduced-motion: reduce) {
  .rank-move,
  .rank-enter-active,
  .rank-leave-active,
  .float-enter-active,
  .float-leave-active,
  .roll-up-enter-active,
  .roll-up-leave-active,
  .roll-down-enter-active,
  .roll-down-leave-active,
  .photo img,
  .tally-keen,
  .tally-not-keen {
    transition: none;
  }

  .vote-card:hover .photo img {
    transform: none;
  }

  .new-leader .top-pick {
    animation: none;
  }

  /* No glide to wait for, so the ring shows straight away */
  .vote-card.just-moved {
    animation-delay: 0s;
  }

  .sheen {
    display: none;
  }
}
</style>
