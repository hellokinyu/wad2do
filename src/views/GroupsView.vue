<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import {
  stages,
  getStatus,
  getToday,
  getOutingDay,
  isPast as isPastOn,
  getWhenText,
  getBudgetText,
  getStageStyle,
} from '@/lib/groupDisplay'
import { findProfileAnimal } from '@/data/profileAnimals'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import GroupInviteCode from '@/components/group/GroupInviteCode.vue'
import GroupTicketStub from '@/components/group/GroupTicketStub.vue'

const router = useRouter()
const route = useRoute()

const groups = ref([]) // array of the user's groups
const loading = ref(true)
const errorMessage = ref('')
// group id -> [{ animal, initial }], filled in after the list shows
const memberFaces = ref({})
const freshGroupId = ref(null) // the group just created, marked "New" in the list

// Create group form
const showCreateForm = ref(false)
const groupName = ref('')
const startDate = ref('')
const endDate = ref('')
const budget = ref('')
const fieldErrors = ref({}) // { name, start, end, budget } -> message
const createError = ref('') // for when saving fails, not for form mistakes
const newGroup = ref(null) // the group we just made, so we can show its invite code
const creating = ref(false)
let newGroupId = crypto.randomUUID()

// "Create a new group" in an activity's share menu sends ?share=<activity id>. That activity is
// shared to the group as soon as it's made, so the user doesn't have to find it again.
const pendingShare = ref(null) // { id, name }
const shareOutcome = ref(null) // { status: 'shared' | 'failed', name }, shown with the invite code

// Join group form
const showJoinForm = ref(false)
const joinCode = ref('')
const joinError = ref('')
const joining = ref(false)

// Elements we move focus to when panels open and close
const createButton = ref(null)
const joinButton = ref(null)
const groupNameInput = ref(null)
const startDateInput = ref(null)
const endDateInput = ref(null)
const budgetInput = ref(null)
const createSubmitButton = ref(null)
const joinCodeInput = ref(null)
const inviteHeading = ref(null)

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
        'groups(id, name, start_date, end_date, budget_per_person, chosen_start, chosen_end, group_members(count), itineraries(group_id))',
      )
      .eq('user_id', user.id)

    if (error) throw error

    groups.value = data.map((row) => row.groups)
    groups.value.forEach(loadMemberFaces)
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load your groups. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadGroups)

async function loadPendingShare() {
  const activityId = typeof route.query.share === 'string' ? route.query.share : ''
  if (!activityId) return
  // Tidy the address bar; the note in the form shows what will be shared
  router.replace({ query: {} })
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, name')
      .eq('id', activityId)
      .maybeSingle()
    if (error) throw error
    if (!data) return
    pendingShare.value = data
    openCreateForm()
  } catch (error) {
    // Without the activity the page still works; the user can share it from its card later
    console.log(error)
  }
}

onMounted(loadPendingShare)

async function sharePendingActivity(groupId) {
  const activity = pendingShare.value
  pendingShare.value = null
  try {
    const user = await getUser()
    const { error } = await requestWithTimeout((signal) =>
      supabase
        .from('group_activities')
        .insert({ group_id: groupId, activity_id: activity.id, shared_by: user.id })
        .abortSignal(signal),
    )
    if (error) throw error
    shareOutcome.value = { status: 'shared', name: activity.name }
  } catch (error) {
    console.log(error)
    shareOutcome.value = { status: 'failed', name: activity.name }
  }
}

// The members' avatars for one card. If this fails the card just shows the member count.
// { get: true } because it only reads, and get_group_member_names is a "stable" function.
async function loadMemberFaces(group) {
  try {
    const { data, error } = await supabase.rpc(
      'get_group_member_names',
      { p_group_id: group.id },
      { get: true },
    )
    if (error) throw error
    memberFaces.value = {
      ...memberFaces.value,
      [group.id]: data.map((member) => ({
        id: member.id,
        animal: findProfileAnimal(member.avatar_animal)?.id || '',
        initial: (member.display_name || 'M').charAt(0).toUpperCase(),
      })),
    }
  } catch (error) {
    console.log(error)
  }
}

// Stages, dates and stage colours come from @/lib/groupDisplay, shared with the group page
const nextSteps = {
  Voting: 'Next: pick a time',
  'Time picked': 'Next: make the plan',
  Planned: 'Itinerary ready',
}

// A past group that never reached "Planned" ended without a plan
function getStepText(group) {
  const status = getStatus(group)
  if (!isPast(group)) return nextSteps[status]
  return status === 'Planned' ? 'Ended' : 'Ended without a plan'
}

// A planned group opens straight on its itinerary; the rest open on Activities (the default tab)
function getGroupLink(group) {
  const link = '/groups/' + group.id
  return getStatus(group) === 'Planned' ? link + '/itinerary' : link
}

function getMemberCount(group) {
  return group.group_members?.[0]?.count ?? 0
}

// ----- Dates on the group cards -----

// Today as YYYY-MM-DD in the user's time zone, so it compares with start_date/end_date
const today = getToday()

function isPast(group) {
  return isPastOn(group, today)
}

// Upcoming groups first (soonest at the top), then past ones (most recent first)
const upcomingGroups = computed(() =>
  groups.value
    .filter((group) => !isPast(group))
    .sort((a, b) =>
      (getOutingDay(a) || a.start_date).localeCompare(getOutingDay(b) || b.start_date),
    ),
)
const pastGroups = computed(() =>
  groups.value
    .filter(isPast)
    .sort((a, b) => (getOutingDay(b) || b.end_date).localeCompare(getOutingDay(a) || a.end_date)),
)
// "Coming up" always shows (with a note if it's empty); "Past outings" only if there are some
const groupSections = computed(() =>
  [
    { key: 'upcoming', title: 'Coming up', list: upcomingGroups.value },
    { key: 'past', title: 'Past outings', list: pastGroups.value },
  ].filter((section) => section.key === 'upcoming' || section.list.length > 0),
)

// Past outings start folded away so the list leads with what's next.
// With nothing coming up there's nothing to lead with, so they're shown straight away.
const pastOpen = ref(false)
const showPast = computed(() => pastOpen.value || upcomingGroups.value.length === 0)

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

// Close whichever panel is open and put focus back on the button that opened it
function closePanel() {
  const trigger = showJoinForm.value ? joinButton.value : createButton.value
  showCreateForm.value = false
  showJoinForm.value = false
  trigger?.focus()
}

// ----- Create a group -----

async function openCreateForm() {
  if (creating.value) return
  showCreateForm.value = true
  showJoinForm.value = false
  // Keep a half-filled form (and its id, so a retry can't make the group twice).
  // Only start fresh after a group was made.
  if (newGroup.value) {
    groupName.value = ''
    startDate.value = ''
    endDate.value = ''
    budget.value = ''
    newGroup.value = null
    newGroupId = crypto.randomUUID()
    shareOutcome.value = null
  }
  fieldErrors.value = {}
  createError.value = ''
  await nextTick()
  groupNameInput.value?.focus()
}

// Check every field at once, so each mistake shows under its own field
function checkCreateForm() {
  const errors = {}
  if (groupName.value.trim() === '') errors.name = 'Please enter a group name.'
  if (startDate.value === '') errors.start = 'Please pick a start date.'
  if (endDate.value === '') errors.end = 'Please pick an end date.'
  else if (startDate.value !== '' && endDate.value < startDate.value) {
    errors.end = "The end date can't be before the start date."
  }
  if (typeof budget.value !== 'number' || !Number.isFinite(budget.value) || budget.value < 0) {
    errors.budget = 'Please enter a budget of S$0 or more.'
  }
  return errors
}

// Once a field is flagged, re-check it as the user fixes it (but don't flag new ones mid-typing)
watch([groupName, startDate, endDate, budget], () => {
  const errors = checkCreateForm()
  fieldErrors.value = Object.fromEntries(
    Object.keys(fieldErrors.value)
      .filter((key) => errors[key])
      .map((key) => [key, errors[key]]),
  )
})

async function createGroup() {
  if (creating.value) return
  createError.value = ''

  fieldErrors.value = checkCreateForm()
  if (Object.keys(fieldErrors.value).length > 0) {
    // Move to the first field that needs fixing
    const inputs = {
      name: groupNameInput,
      start: startDateInput,
      end: endDateInput,
      budget: budgetInput,
    }
    const first = Object.keys(inputs).find((key) => fieldErrors.value[key])
    inputs[first].value?.focus()
    return
  }

  creating.value = true
  try {
    const { data, error } = await requestWithTimeout((signal) =>
      supabase
        .rpc('create_group', {
          p_group_id: newGroupId,
          p_name: groupName.value.trim(),
          p_start_date: startDate.value,
          p_end_date: endDate.value,
          p_budget_per_person: budget.value,
          p_invite_code: makeInviteCode(),
        })
        .single()
        .abortSignal(signal),
    )

    if (error) throw error

    if (pendingShare.value) await sharePendingActivity(data.id)
    newGroup.value = data // shows the invite panel
    freshGroupId.value = data.id
    loadGroups()
    await nextTick()
    inviteHeading.value?.focus()
  } catch (error) {
    console.log(error)
    createError.value = "Couldn't create the group. Please try again."
  } finally {
    creating.value = false
  }

  // The form was disabled while saving, which drops focus; put it back so retrying is one tap
  if (createError.value) {
    await nextTick()
    createSubmitButton.value?.focus()
  }
}

// ----- Join a group -----

async function openJoinForm() {
  showJoinForm.value = true
  showCreateForm.value = false
  joinCode.value = ''
  joinError.value = ''
  await nextTick()
  joinCodeInput.value?.focus()
}

// Codes only use these characters (see makeInviteCode), so drop anything else as it's typed
watch(joinCode, (value) => {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, '')
    .slice(0, 6)
  if (cleaned !== value) joinCode.value = cleaned
  joinError.value = ''
})

async function joinGroup() {
  if (joining.value || joinCode.value.length !== 6) return
  joinError.value = ''
  const code = joinCode.value.trim().toUpperCase()

  joining.value = true
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
  } finally {
    joining.value = false
    // Back to the code box so it can be fixed (the form was disabled while checking)
    if (joinError.value) {
      await nextTick()
      joinCodeInput.value?.focus()
    }
  }
}
</script>

<template>
  <div class="container groups-page py-4 py-md-5" data-testid="groups-page">
    <header class="groups-header">
      <div>
        <h1 class="fw-bold">Your groups</h1>
        <p class="text-secondary mb-0">Vote on activities, pick a time and get a plan together.</p>
      </div>

      <!-- Black marks the panel that's open; with nothing open, Create is the main action -->
      <div class="group-actions">
        <button
          ref="createButton"
          type="button"
          class="group-action"
          :class="{ active: !showJoinForm }"
          :aria-expanded="showCreateForm"
          aria-controls="group-panel"
          data-testid="create-group-button"
          @click="openCreateForm"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>Create</span>
        </button>
        <button
          ref="joinButton"
          type="button"
          class="group-action"
          :class="{ active: showJoinForm }"
          :aria-expanded="showJoinForm"
          aria-controls="group-panel"
          data-testid="join-group-button"
          @click="openJoinForm"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
          <span>Join</span>
        </button>
      </div>
    </header>

    <div id="group-panel">
      <Transition name="panel" mode="out-in">
        <!-- Create group form -->
        <section
          v-if="showCreateForm"
          key="create"
          class="panel"
          aria-labelledby="create-panel-title"
          data-testid="create-group-form"
          @keydown.esc="closePanel"
        >
          <!-- After creating: show the QR code and group code -->
          <div v-if="newGroup" data-testid="invite-panel">
            <div class="panel-heading">
              <span class="done-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              </span>
              <div>
                <h2 id="create-panel-title" ref="inviteHeading" class="panel-title" tabindex="-1">
                  {{ newGroup.name }} is ready
                </h2>
                <p class="text-secondary mb-0">
                  Get your friends to scan the QR code, or give them the group code.
                </p>
              </div>
            </div>

            <p
              v-if="shareOutcome"
              class="share-note"
              :class="{ 'is-failed': shareOutcome.status === 'failed' }"
              role="status"
              data-testid="pending-share-result"
            >
              <template v-if="shareOutcome.status === 'shared'">
                <strong>{{ shareOutcome.name }}</strong> is in this group's Activities, ready for
                votes.
              </template>
              <template v-else>
                Couldn't share <strong>{{ shareOutcome.name }}</strong
                >. Share it again from its card on Activities.
              </template>
            </p>

            <GroupInviteCode
              :group-id="newGroup.id"
              :group-name="newGroup.name"
              :invite-code="newGroup.invite_code"
            />

            <div class="panel-footer">
              <button type="button" class="btn btn-link text-secondary" @click="closePanel">
                Done
              </button>
              <RouterLink :to="'/groups/' + newGroup.id" class="btn btn-dark rounded-pill px-4">
                Go to group
              </RouterLink>
            </div>
          </div>

          <!-- Before creating: the form -->
          <form v-else novalidate @submit.prevent="createGroup">
            <fieldset :disabled="creating">
              <div class="panel-heading">
                <div>
                  <h2 id="create-panel-title" class="panel-title">Create a group</h2>
                  <p class="text-secondary mb-0">
                    Then you'll get a QR code and a group code for friends to join.
                  </p>
                </div>
              </div>

              <p v-if="pendingShare" class="share-note" data-testid="pending-share">
                <span>
                  <strong>{{ pendingShare.name }}</strong> will be shared to this group once it's
                  made.
                </span>
                <button
                  type="button"
                  class="btn btn-link p-0 text-body"
                  data-testid="pending-share-cancel"
                  @click="pendingShare = null"
                >
                  Don't share it
                </button>
              </p>

              <div class="row g-3">
                <div class="col-12">
                  <label for="group-name" class="form-label">Group name</label>
                  <input
                    id="group-name"
                    ref="groupNameInput"
                    v-model="groupName"
                    class="form-control"
                    :class="{ 'is-invalid': fieldErrors.name }"
                    :aria-invalid="Boolean(fieldErrors.name)"
                    :aria-describedby="fieldErrors.name ? 'group-name-error' : undefined"
                    autocomplete="off"
                    placeholder="e.g. Saturday makan crew"
                    data-testid="group-name-input"
                  />
                  <p v-if="fieldErrors.name" id="group-name-error" class="field-error">
                    {{ fieldErrors.name }}
                  </p>
                </div>
                <div class="col-6 col-md-4">
                  <label for="start-date" class="form-label">Start date</label>
                  <input
                    id="start-date"
                    ref="startDateInput"
                    v-model="startDate"
                    type="date"
                    :min="today"
                    class="form-control"
                    :class="{ 'is-invalid': fieldErrors.start }"
                    :aria-invalid="Boolean(fieldErrors.start)"
                    :aria-describedby="fieldErrors.start ? 'start-date-error' : undefined"
                    data-testid="group-start-input"
                  />
                  <p v-if="fieldErrors.start" id="start-date-error" class="field-error">
                    {{ fieldErrors.start }}
                  </p>
                </div>
                <div class="col-6 col-md-4">
                  <label for="end-date" class="form-label">End date</label>
                  <input
                    id="end-date"
                    ref="endDateInput"
                    v-model="endDate"
                    type="date"
                    :min="startDate || today"
                    class="form-control"
                    :class="{ 'is-invalid': fieldErrors.end }"
                    :aria-invalid="Boolean(fieldErrors.end)"
                    :aria-describedby="fieldErrors.end ? 'end-date-error' : undefined"
                    data-testid="group-end-input"
                  />
                  <p v-if="fieldErrors.end" id="end-date-error" class="field-error">
                    {{ fieldErrors.end }}
                  </p>
                </div>
                <div class="col-12 col-md-4">
                  <label for="budget" class="form-label">Budget per person</label>
                  <div class="input-group" :class="{ 'has-validation': fieldErrors.budget }">
                    <span class="input-group-text">S$</span>
                    <input
                      id="budget"
                      ref="budgetInput"
                      v-model.number="budget"
                      type="number"
                      min="0"
                      inputmode="decimal"
                      class="form-control"
                      :class="{ 'is-invalid': fieldErrors.budget }"
                      :aria-invalid="Boolean(fieldErrors.budget)"
                      :aria-describedby="
                        fieldErrors.budget ? 'budget-error budget-hint' : 'budget-hint'
                      "
                      data-testid="group-budget-input"
                    />
                  </div>
                  <p v-if="fieldErrors.budget" id="budget-error" class="field-error">
                    {{ fieldErrors.budget }}
                  </p>
                  <p id="budget-hint" class="field-hint">The plan only picks stops within this.</p>
                </div>
              </div>
              <p
                v-if="createError"
                class="form-error"
                role="alert"
                data-testid="create-group-error"
              >
                {{ createError }}
              </p>

              <div class="panel-footer">
                <button type="button" class="btn btn-link text-secondary" @click="closePanel">
                  Cancel
                </button>
                <button
                  ref="createSubmitButton"
                  type="submit"
                  class="btn btn-dark rounded-pill px-4"
                  data-testid="create-group-submit"
                >
                  <span
                    v-if="creating"
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                  ></span>
                  {{ creating ? 'Creating…' : 'Create group' }}
                </button>
              </div>
            </fieldset>
          </form>
        </section>

        <!-- Join group form -->
        <section
          v-else-if="showJoinForm"
          key="join"
          class="panel join-panel"
          aria-labelledby="join-panel-title"
          data-testid="join-group-form"
          @keydown.esc="closePanel"
        >
          <form novalidate @submit.prevent="joinGroup">
            <fieldset :disabled="joining">
              <div class="panel-heading">
                <div class="flex-grow-1">
                  <h2 id="join-panel-title" class="panel-title">Join a group</h2>
                  <p class="text-secondary mb-0">
                    Ask a friend for their group code, or scan their QR code.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn-close"
                  aria-label="Close"
                  @click="closePanel"
                ></button>
              </div>

              <label for="join-code" class="form-label">Group code</label>
              <div class="join-row">
                <input
                  id="join-code"
                  ref="joinCodeInput"
                  v-model="joinCode"
                  class="form-control code-input"
                  :class="{ 'is-invalid': joinError }"
                  :aria-invalid="Boolean(joinError)"
                  :aria-describedby="
                    joinError ? 'join-code-error join-code-hint' : 'join-code-hint'
                  "
                  autocomplete="off"
                  autocapitalize="characters"
                  spellcheck="false"
                  placeholder="K7Q2XM"
                  data-testid="join-code-input"
                />
                <button
                  type="submit"
                  class="btn btn-dark rounded-pill px-4"
                  :disabled="joinCode.length !== 6"
                  data-testid="join-group-submit"
                >
                  <span
                    v-if="joining"
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                  ></span>
                  {{ joining ? 'Joining…' : 'Join group' }}
                </button>
              </div>

              <p
                v-if="joinError"
                id="join-code-error"
                class="field-error"
                role="alert"
                data-testid="join-group-error"
              >
                {{ joinError }}
              </p>
              <p id="join-code-hint" class="field-hint">
                6 letters and numbers ({{ joinCode.length }}/6). Codes never use O, 0, I or 1.
              </p>
            </fieldset>
          </form>
        </section>
      </Transition>
    </div>

    <!-- List of groups -->
    <div v-if="loading" class="ticket-grid" role="status">
      <span class="visually-hidden">Loading your groups…</span>
      <div v-for="n in 3" :key="n" class="ticket surface-card ticket-skeleton" aria-hidden="true">
        <div class="skeleton-stub"></div>
        <div class="ticket-body">
          <span class="skeleton-line w-75"></span>
          <span class="skeleton-line w-50"></span>
          <span class="skeleton-line w-100 mt-auto"></span>
        </div>
      </div>
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-danger"
      role="alert"
      data-testid="groups-error"
    >
      <p>{{ errorMessage }}</p>
      <button type="button" class="btn btn-outline-danger" @click="loadGroups">Try again</button>
    </div>

    <div v-else-if="groups.length === 0" class="empty-groups" data-testid="groups-empty">
      <div class="avatar-crowd" aria-hidden="true">
        <AnimalAvatar
          v-for="animal in ['dog', 'cat', 'duck', 'panda', 'goldfish']"
          :key="animal"
          :animal="animal"
          :size="56"
          decorative
        />
      </div>
      <h2 class="h4 fw-bold">You're not in any groups yet</h2>
      <p class="text-secondary mb-0">
        Planning an outing? Tap Create. Got a code or QR code from a friend? Tap Join.
      </p>
    </div>

    <template v-else>
      <section
        v-for="section in groupSections"
        :key="section.key"
        class="group-section"
        :class="'group-section-' + section.key"
        :aria-labelledby="'groups-' + section.key"
      >
        <div class="section-head">
          <h2 :id="'groups-' + section.key" class="section-title">
            {{ section.title }} <span class="section-count">{{ section.list.length }}</span>
          </h2>

          <button
            v-if="section.key === 'past' && upcomingGroups.length > 0"
            type="button"
            class="past-toggle"
            :aria-expanded="showPast"
            aria-controls="groups-past-list"
            data-testid="past-outings-toggle"
            @click="pastOpen = !pastOpen"
          >
            {{
              showPast
                ? 'Hide past outings'
                : 'Show ' +
                  section.list.length +
                  (section.list.length === 1 ? ' past outing' : ' past outings')
            }}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>

        <p v-if="section.key === 'upcoming' && section.list.length === 0" class="nothing-next">
          Nothing coming up. Tap Create to plan your next outing.
        </p>

        <ul
          v-show="section.key !== 'past' || showPast"
          :id="'groups-' + section.key + '-list'"
          class="ticket-grid"
        >
          <li v-for="group in section.list" :key="group.id">
            <RouterLink
              :to="getGroupLink(group)"
              class="ticket surface-card"
              :class="{ past: isPast(group) }"
              :style="getStageStyle(group, today)"
              :aria-labelledby="'group-' + group.id + '-name'"
              :aria-describedby="'group-' + group.id + '-details'"
              data-testid="group-card"
            >
              <GroupTicketStub :group="group" />

              <div class="ticket-body">
                <div class="ticket-top">
                  <h3 :id="'group-' + group.id + '-name'" class="ticket-name" :title="group.name">
                    {{ group.name }}
                  </h3>
                  <span v-if="group.id === freshGroupId" class="new-badge">New</span>
                  <svg class="ticket-arrow" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>

                <div :id="'group-' + group.id + '-details'">
                  <ul class="ticket-meta">
                    <li>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                        <path d="M3.5 10h17M8 3v4M16 3v4" />
                      </svg>
                      <span>{{ getWhenText(group) }}</span>
                    </li>
                    <li>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="9" cy="8" r="3.5" />
                        <path
                          d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"
                        />
                      </svg>
                      <span>
                        {{ getMemberCount(group) }}
                        {{ getMemberCount(group) === 1 ? 'member' : 'members' }}
                      </span>
                      <!-- After the count, so the text doesn't shift when the faces load -->
                      <span v-if="memberFaces[group.id]" class="faces" aria-hidden="true">
                        <template v-for="face in memberFaces[group.id].slice(0, 4)" :key="face.id">
                          <AnimalAvatar
                            v-if="face.animal"
                            :animal="face.animal"
                            :size="24"
                            decorative
                          />
                          <span v-else class="face-initial">{{ face.initial }}</span>
                        </template>
                        <span v-if="memberFaces[group.id].length > 4" class="face-initial face-more"
                          >+{{ memberFaces[group.id].length - 4 }}</span
                        >
                      </span>
                    </li>
                    <li>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="6" width="18" height="13" rx="2.5" />
                        <path d="M3 10h18M16.5 14.5h1" />
                      </svg>
                      {{ getBudgetText(group) }}
                    </li>
                  </ul>

                  <div class="stage">
                    <div class="stage-track" aria-hidden="true">
                      <span
                        v-for="(stage, index) in stages"
                        :key="stage"
                        :class="{ done: index <= stages.indexOf(getStatus(group)) }"
                      ></span>
                    </div>
                    <p class="stage-label">
                      <span class="stage-name" data-testid="group-status">{{
                        getStatus(group)
                      }}</span>
                      <span class="stage-step"> · {{ getStepText(group) }}</span>
                    </p>
                  </div>
                </div>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Ink, lines and surfaces come from the theme in src/assets/styles.css */
.groups-page {
  --panel: var(--surface-2);
  --stub-width: 92px;
}

.groups-page ::selection {
  background: var(--ink);
  color: var(--on-ink);
}

/* Line icons. Not the animal avatars: they're SVGs too, and this stroke would outline every
   shape in them, so they'd look different from everywhere else in the app. */
svg:not(.animal-avatar) {
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ----- Header ----- */
.groups-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem 2rem;
  margin-bottom: 2rem;
}

.groups-header h1 {
  letter-spacing: -0.02em;
}

.groups-header p {
  text-wrap: pretty;
}

.group-actions {
  display: flex;
  gap: 10px;
}

.group-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 120px;
  min-height: 48px;
  padding: 10px 24px;
  border: 1px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.group-action svg {
  width: 18px;
  height: 18px;
}

.group-action.active {
  background: var(--ink);
  color: var(--on-ink);
}

.group-action:hover {
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: var(--shadow-raised);
  transform: translateY(-2px);
}

.group-action:active {
  box-shadow: none;
  transform: translateY(0);
}

/* The button whose panel is open gets a ring, so it reads as "pressed in" */
.group-action[aria-expanded='true'],
.group-action[aria-expanded='true']:hover {
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 5px var(--ink);
  transform: none;
}

/* ----- Create / join panels ----- */
.panel {
  margin-bottom: 2rem;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.join-panel {
  max-width: 34rem;
}

.panel fieldset {
  min-width: 0;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 1.5rem;
}

.panel-title {
  margin-bottom: 4px;
  font-size: 1.35rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.panel-title:focus {
  outline: none;
}

.done-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--on-ink);
}

.done-mark svg {
  width: 22px;
  height: 22px;
  stroke-width: 2.5;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.panel .form-control,
.panel .input-group-text {
  min-height: 48px;
  border-color: var(--line);
  border-radius: var(--radius-md);
  caret-color: var(--ink);
}

.panel .input-group-text {
  background: var(--panel);
  color: var(--muted);
  font-weight: 600;
}

.panel .input-group > .input-group-text {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.panel .input-group > .form-control {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.panel .form-control:focus {
  border-color: var(--ink);
  box-shadow: 0 0 0 3px var(--bs-focus-ring-color);
}

.panel .btn {
  min-height: 48px;
  font-weight: 600;
}

.panel .btn-dark {
  --bs-btn-bg: var(--ink);
  --bs-btn-border-color: var(--ink);
}

/* Mistakes show under their field; Bootstrap's warning icon would cover the date picker */
.panel .form-control.is-invalid {
  padding-right: 0.75rem;
  border-color: var(--bs-danger-text-emphasis);
  background-image: none;
}

.panel .form-control.is-invalid:focus {
  box-shadow: 0 0 0 3px rgb(176 42 55 / 15%);
}

.form-error,
.field-error {
  color: var(--bs-danger-text-emphasis);
  font-weight: 600;
}

.form-error {
  margin: 1rem 0 0;
}

.field-error,
.field-hint {
  margin: 6px 0 0;
  font-size: 0.85rem;
}

.field-hint {
  color: var(--bs-secondary-color);
}

.panel-heading .btn-close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -10px -10px 0 0;
  padding: 0;
  background-size: 14px;
}

/* The activity a "Create a new group" link brought along, before and after the group is made */
.share-note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
  margin-bottom: 1.25rem;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

/* Errors use Bootstrap's danger colours (DESIGN.md); coral means "not keen", not "failed" */
.share-note.is-failed {
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.panel-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
}

.panel-footer .btn-link {
  font-weight: 600;
  text-decoration: none;
}

.panel-footer .btn-link:hover {
  color: var(--ink) !important;
}

.join-row {
  display: flex;
  gap: 10px;
}

.code-input {
  flex: 1;
  min-width: 0;
  font-size: 1.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

.code-input::placeholder {
  color: var(--subtle);
  font-weight: 500;
}

/* Panel open/close: a short drop-in, the one bit of motion on this page */
.panel-enter-active {
  transition:
    opacity 240ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ----- Group sections ----- */
.group-section + .group-section {
  margin-top: 2.5rem;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

/* Past outings sit under a divider, folded away until asked for */
.group-section-past {
  padding-top: 1.75rem;
  border-top: 1px solid var(--line);
}

.group-section-past .section-head {
  margin-bottom: 0;
}

.group-section-past .ticket-grid {
  margin-top: 1rem;
}

.past-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 180ms ease;
}

.past-toggle:hover {
  background: var(--surface-2);
}

.past-toggle svg {
  width: 16px;
  height: 16px;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.past-toggle[aria-expanded='true'] svg {
  transform: rotate(180deg);
}

.nothing-next {
  margin: 0;
  padding: 20px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--panel);
  color: var(--bs-secondary-color);
}

.section-count {
  padding: 1px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.ticket-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ----- The group "ticket": a dark date stub torn off a white card ----- */
.ticket {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 168px;
  overflow: hidden;
  color: var(--ink);
  text-decoration: none;
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* The two notches where the stub tears off */
.ticket::before,
.ticket::after {
  content: '';
  position: absolute;
  left: calc(var(--stub-width) - 10px);
  z-index: 1;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
}

.ticket::before {
  top: -11px;
}

.ticket::after {
  bottom: -11px;
}

a.ticket:hover {
  color: var(--ink);
  box-shadow: var(--shadow-raised);
  transform: translateY(-3px);
}

.ticket-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 16px 18px 16px 20px;
}

.ticket-body > div:last-child {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.ticket-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ticket-name {
  display: -webkit-box;
  flex: 1;
  margin-bottom: 8px;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ticket-arrow {
  width: 20px;
  height: 20px;
  margin-top: 3px;
  color: var(--subtle);
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    color 220ms ease;
}

a.ticket:hover .ticket-arrow {
  color: var(--ink);
  transform: translateX(4px);
}

.new-badge {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--on-ink);
  font-size: 0.75rem;
  font-weight: 700;
}

/* Members' avatars, overlapping, after the member count */
.faces {
  display: inline-flex;
  margin: -2px 0 -2px 2px;
}

.faces > :deep(svg),
.face-initial {
  width: 24px;
  height: 24px;
  margin-left: -6px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface);
}

.faces > :first-child {
  margin-left: 0;
}

.face-initial {
  display: inline-grid;
  place-items: center;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}

.face-more {
  background: var(--ink);
  color: var(--on-ink);
}

.ticket-meta {
  display: grid;
  gap: 4px;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}

.ticket-meta li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ticket-meta li > svg {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  color: var(--muted);
}

/* Voting -> Time picked -> Planned, as three bars that fill in */
.stage {
  margin-top: auto;
}

.stage-track {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.stage-track span {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
}

.stage-track span.done {
  background: var(--stage-mark, var(--stage));
}

.stage-label {
  margin: 0;
  font-size: 0.875rem;
}

.stage-name {
  font-weight: 700;
}

/* A dot in the stage colour, matching the ticket stub */
.stage-name::before {
  content: '';
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--stage-mark, var(--stage));
  vertical-align: 0.05em;
}

/* The next step is what the reader acts on, so it stays in ink, not grey */
.stage-step {
  font-weight: 500;
}

.ticket.past .stage-step {
  color: var(--bs-secondary-color);
  font-weight: 400;
}

/* ----- Loading ----- */
.skeleton-stub {
  flex-shrink: 0;
  width: var(--stub-width);
  border-right: 2px dashed rgb(0 0 0 / 8%);
  background: var(--surface-3);
}

.ticket-skeleton .ticket-body {
  gap: 10px;
}

.skeleton-line {
  display: block;
  height: 12px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--surface-2) 0%, var(--surface-2) 50%, var(--surface-2) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton-line:first-child {
  height: 18px;
}

@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

/* ----- Empty ----- */
.empty-groups {
  padding: 48px 24px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--panel);
  text-align: center;
}

.empty-groups p {
  max-width: 26rem;
  margin-inline: auto;
}

.avatar-crowd {
  display: flex;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.avatar-crowd :deep(svg) {
  margin-inline: -6px;
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--panel);
}

.avatar-crowd :deep(svg:nth-child(odd)) {
  transform: translateY(6px);
}

/* ----- Phones ----- */
@media (max-width: 575.98px) {
  .groups-page {
    --stub-width: 80px;
  }

  .groups-header {
    margin-bottom: 1.5rem;
  }

  .group-actions {
    width: 100%;
  }

  .group-action {
    flex: 1;
  }

  .panel {
    padding: 20px 16px;
  }

  .join-row {
    flex-direction: column;
  }

  .ticket-body {
    padding: 14px 14px 14px 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-action,
  .ticket,
  .ticket-arrow,
  .past-toggle,
  .past-toggle svg,
  .panel-enter-active,
  .panel-leave-active {
    transition: none;
  }

  .group-action:hover,
  a.ticket:hover,
  a.ticket:hover .ticket-arrow {
    transform: none;
  }

  .skeleton-line {
    animation: none;
  }
}
</style>
