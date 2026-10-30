<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import GroupInviteCode from '@/components/group/GroupInviteCode.vue'

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
const joining = ref(false)

// Elements we move focus to when panels open and close
const createButton = ref(null)
const joinButton = ref(null)
const groupNameInput = ref(null)
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
const stages = ['Voting', 'Time picked', 'Planned']
const nextSteps = {
  Voting: 'Next: pick a time',
  'Time picked': 'Next: make the plan',
  Planned: 'Itinerary ready',
}

function getStatus(group) {
  // No plan yet comes back as [] or null, depending on how the table is set up
  if (group.itineraries && group.itineraries.length !== 0) return 'Planned'
  if (group.chosen_start) return 'Time picked'
  return 'Voting'
}

function getMemberCount(group) {
  return group.group_members[0].count
}

// ----- Dates on the group cards -----

// Today as YYYY-MM-DD in the user's time zone, so it compares with start_date/end_date
const today = new Date().toLocaleDateString('en-CA')

function isPast(group) {
  return group.end_date < today
}

// Upcoming groups first (soonest at the top), then past ones (most recent first)
const upcomingGroups = computed(() =>
  groups.value
    .filter((group) => !isPast(group))
    .sort((a, b) => a.start_date.localeCompare(b.start_date)),
)
const pastGroups = computed(() =>
  groups.value.filter(isPast).sort((a, b) => b.end_date.localeCompare(a.end_date)),
)
const groupSections = computed(() =>
  [
    { key: 'upcoming', title: 'Upcoming', list: upcomingGroups.value },
    { key: 'past', title: 'Past', list: pastGroups.value },
  ].filter((section) => section.list.length > 0),
)

// "2026-10-30" -> a local Date (new Date("2026-10-30") would read it as UTC)
function toDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatPart(value, options) {
  return toDate(value).toLocaleDateString('en-SG', options)
}

function formatRange(group) {
  // The ticket stub already shows the weekday, so the range stays short
  const options = { day: 'numeric', month: 'short' }
  if (group.start_date.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric'
  const start = formatPart(group.start_date, options)
  if (group.end_date === group.start_date) return start
  return start + ' – ' + formatPart(group.end_date, options)
}

function getDayCount(group) {
  const days = Math.round((toDate(group.end_date) - toDate(group.start_date)) / 86400000) + 1
  return days === 1 ? '1 day' : days + ' days'
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
  groupName.value = ''
  startDate.value = ''
  endDate.value = ''
  budget.value = ''
  createError.value = ''
  newGroup.value = null
  newGroupId = crypto.randomUUID()
  await nextTick()
  groupNameInput.value?.focus()
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

    newGroup.value = data // shows the invite panel
    loadGroups()
    await nextTick()
    inviteHeading.value?.focus()
  } catch (error) {
    console.log(error)
    createError.value = "Couldn't create the group. Please try again."
  } finally {
    creating.value = false
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

async function joinGroup() {
  if (joining.value) return
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

      <div class="group-actions">
        <button
          ref="createButton"
          type="button"
          class="group-action group-action-primary"
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

            <GroupInviteCode :group-id="newGroup.id" :invite-code="newGroup.invite_code" />

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
                    You'll get an invite link to share once it's made.
                  </p>
                </div>
              </div>

              <div class="row g-3">
                <div class="col-12">
                  <label for="group-name" class="form-label">Group name</label>
                  <input
                    id="group-name"
                    ref="groupNameInput"
                    v-model="groupName"
                    class="form-control"
                    autocomplete="off"
                    placeholder="e.g. Saturday makan crew"
                    data-testid="group-name-input"
                  />
                </div>
                <div class="col-6 col-md-4">
                  <label for="start-date" class="form-label">Start date</label>
                  <input
                    id="start-date"
                    v-model="startDate"
                    type="date"
                    class="form-control"
                    data-testid="group-start-input"
                  />
                </div>
                <div class="col-6 col-md-4">
                  <label for="end-date" class="form-label">End date</label>
                  <input
                    id="end-date"
                    v-model="endDate"
                    type="date"
                    :min="startDate || undefined"
                    class="form-control"
                    data-testid="group-end-input"
                  />
                </div>
                <div class="col-12 col-md-4">
                  <label for="budget" class="form-label">Budget per person</label>
                  <div class="input-group">
                    <span class="input-group-text">S$</span>
                    <input
                      id="budget"
                      v-model.number="budget"
                      type="number"
                      min="0"
                      inputmode="decimal"
                      class="form-control"
                      data-testid="group-budget-input"
                    />
                  </div>
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
        >
          <form novalidate @submit.prevent="joinGroup">
            <fieldset :disabled="joining">
              <div class="panel-heading">
                <div>
                  <h2 id="join-panel-title" class="panel-title">Join a group</h2>
                  <p class="text-secondary mb-0">
                    Ask a friend for their group's 6-character code.
                  </p>
                </div>
              </div>

              <label for="join-code" class="form-label">Invite code</label>
              <div class="join-row">
                <input
                  id="join-code"
                  ref="joinCodeInput"
                  v-model="joinCode"
                  class="form-control code-input"
                  maxlength="6"
                  autocomplete="off"
                  autocapitalize="characters"
                  spellcheck="false"
                  placeholder="K7Q2XM"
                  data-testid="join-code-input"
                />
                <button
                  type="submit"
                  class="btn btn-dark rounded-pill px-4"
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

              <p v-if="joinError" class="form-error" role="alert" data-testid="join-group-error">
                {{ joinError }}
              </p>

              <div class="panel-footer">
                <button type="button" class="btn btn-link text-secondary" @click="closePanel">
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      </Transition>
    </div>

    <!-- List of groups -->
    <div v-if="loading" class="ticket-grid" role="status">
      <span class="visually-hidden">Loading your groups…</span>
      <div v-for="n in 3" :key="n" class="ticket ticket-skeleton" aria-hidden="true">
        <div class="ticket-stub"></div>
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
      <h2 class="h4 fw-bold">You're not in any groups yet.</h2>
      <p class="text-secondary mb-0">
        Create one for your next outing, or join a friend's group with their invite code.
      </p>
    </div>

    <template v-else>
      <section
        v-for="section in groupSections"
        :key="section.key"
        class="group-section"
        :aria-labelledby="pastGroups.length ? 'groups-' + section.key : undefined"
      >
        <h2 v-if="pastGroups.length" :id="'groups-' + section.key" class="section-title">
          {{ section.title }} <span class="section-count">{{ section.list.length }}</span>
        </h2>

        <ul class="ticket-grid">
          <li v-for="group in section.list" :key="group.id">
            <RouterLink
              :to="'/groups/' + group.id"
              class="ticket"
              :class="{ past: isPast(group) }"
              :aria-labelledby="'group-' + group.id + '-name'"
              :aria-describedby="'group-' + group.id + '-details'"
              data-testid="group-card"
            >
              <div class="ticket-stub" aria-hidden="true">
                <span class="stub-weekday">{{
                  formatPart(group.start_date, { weekday: 'short' })
                }}</span>
                <span class="stub-day">{{ formatPart(group.start_date, { day: 'numeric' }) }}</span>
                <span class="stub-month">{{
                  formatPart(group.start_date, { month: 'short' })
                }}</span>
              </div>

              <div class="ticket-body">
                <div class="ticket-top">
                  <h3 :id="'group-' + group.id + '-name'" class="ticket-name">{{ group.name }}</h3>
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
                      <span
                        >{{ formatRange(group) }}
                        <span class="text-secondary">· {{ getDayCount(group) }}</span></span
                      >
                    </li>
                    <li>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="9" cy="8" r="3.5" />
                        <path
                          d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"
                        />
                      </svg>
                      {{ getMemberCount(group) }}
                      {{ getMemberCount(group) === 1 ? 'member' : 'members' }}
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
                      <span v-if="isPast(group)" class="text-secondary"> · Ended</span>
                      <span v-else class="text-secondary">
                        · {{ nextSteps[getStatus(group)] }}</span
                      >
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
/* Matches the Activities page: near-black ink, pill buttons, soft grey hairlines */
.groups-page {
  --ink: #111;
  --line: #e5e5e5;
  --panel: #fafafa;
  --stub-width: 92px;
}

.groups-page ::selection {
  background: var(--ink);
  color: white;
}

.groups-page :is(a, button):focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
  box-shadow: none;
}

svg {
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
  border-radius: 999px;
  background: white;
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

.group-action-primary,
.group-action.active {
  background: var(--ink);
  color: white;
}

.group-action:hover {
  background: var(--ink);
  color: white;
  box-shadow: 0 6px 16px rgb(0 0 0 / 14%);
  transform: translateY(-2px);
}

.group-action:active {
  box-shadow: none;
  transform: translateY(0);
}

/* ----- Create / join panels ----- */
.panel {
  margin-bottom: 2rem;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: white;
  box-shadow: 0 10px 32px rgb(0 0 0 / 7%);
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
  color: white;
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
  border-color: #d9d9d9;
  border-radius: 12px;
  caret-color: var(--ink);
}

.panel .input-group-text {
  background: var(--panel);
  color: #555;
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
  box-shadow: 0 0 0 3px rgb(17 17 17 / 12%);
}

.panel .btn {
  min-height: 48px;
  font-weight: 600;
}

.panel .btn-dark {
  --bs-btn-bg: var(--ink);
  --bs-btn-border-color: var(--ink);
}

.form-error {
  margin: 1rem 0 0;
  color: #b02a37;
  font-weight: 600;
}

.panel-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #eee;
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
  color: #949494;
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

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  font-weight: 700;
}

.section-count {
  padding: 1px 9px;
  border-radius: 999px;
  background: #f0f0f0;
  color: #555;
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
  border: 1px solid #eee;
  border-radius: 18px;
  background: white;
  color: var(--ink);
  text-decoration: none;
  box-shadow: 0 4px 16px rgb(0 0 0 / 4%);
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
  border: 1px solid #eee;
  border-radius: 50%;
  background: white;
}

.ticket::before {
  top: -11px;
}

.ticket::after {
  bottom: -11px;
}

a.ticket:hover {
  color: var(--ink);
  box-shadow: 0 14px 32px rgb(0 0 0 / 10%);
  transform: translateY(-3px);
}

.ticket-stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--stub-width);
  padding: 16px 8px;
  border-right: 2px dashed rgb(255 255 255 / 40%);
  background: var(--ink);
  color: white;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stub-weekday,
.stub-month {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stub-weekday {
  color: rgb(255 255 255 / 70%);
}

.stub-day {
  margin: 6px 0 4px;
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: -0.03em;
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
  color: #999;
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    color 220ms ease;
}

a.ticket:hover .ticket-arrow {
  color: var(--ink);
  transform: translateX(4px);
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

.ticket-meta svg {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  color: #777;
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
  border-radius: 999px;
  background: #ececec;
}

.stage-track span.done {
  background: var(--ink);
}

.stage-label {
  margin: 0;
  font-size: 0.8rem;
}

.stage-name {
  font-weight: 700;
}

/* Past outings fade back so the upcoming ones lead */
.ticket.past .ticket-stub {
  border-right-color: rgb(0 0 0 / 15%);
  background: #ececec;
  color: #555;
}

.ticket.past .stub-weekday {
  color: #6b6b6b;
}

.ticket.past .stage-track span.done {
  background: #9a9a9a;
}

/* ----- Loading ----- */
.ticket-skeleton .ticket-stub {
  background: #ececec;
  border-right-color: rgb(0 0 0 / 8%);
}

.ticket-skeleton .ticket-body {
  gap: 10px;
}

.skeleton-line {
  display: block;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, #efefef 0%, #f7f7f7 50%, #efefef 100%);
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
  border: 1px dashed #d4d4d4;
  border-radius: 18px;
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

  .stub-day {
    font-size: 2.25rem;
  }

  .ticket-body {
    padding: 14px 14px 14px 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-action,
  .ticket,
  .ticket-arrow,
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
