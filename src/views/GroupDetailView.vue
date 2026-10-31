<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import {
  getStatus,
  isPast,
  getTimeRange,
  formatRange,
  getCountdown,
  getBudgetText,
  getStageStyle,
} from '@/lib/groupDisplay'
import { findProfileAnimal } from '@/data/profileAnimals'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import GroupTicketStub from '@/components/group/GroupTicketStub.vue'
import GroupSettingsForm from '@/components/group/GroupSettingsForm.vue'
import GroupMembersPanel from '@/components/group/GroupMembersPanel.vue'
import GroupInviteCode from '@/components/group/GroupInviteCode.vue'

const route = useRoute()
const groupId = route.params.id
const inviteCode = computed(() =>
  typeof route.query.invite === 'string' ? route.query.invite : '',
)

const group = ref(null) // the group's details, or null if we couldn't find it
const isMember = ref(false) // false means we show the "Join group" screen
const loading = ref(true)
const errorMessage = ref('')

const showInvite = ref(false)
const showMembers = ref(false)
const showSettings = ref(false)
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

    const { data, error } = await supabase.rpc('wad2do_group_details', { p_group_id: groupId })

    // Error code 22P02 means the id in the URL isn't a real id, so treat it as "not found"
    if (error && error.code !== '22P02') throw error
    group.value = data

    isMember.value = data?.is_member === true
    if (isMember.value) {
      loadMemberFaces()
      await loadPlanStatus()
    }
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load this group. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadGroup)

// wad2do_group_details doesn't say whether a plan exists, so check the itineraries table
// (the Groups list gets this from its query). Without it a planned group would show as
// "Time picked" here and the hero's colour wouldn't match its card on the Groups page.
async function loadPlanStatus() {
  try {
    const { data, error } = await supabase
      .from('itineraries')
      .select('group_id')
      .eq('group_id', groupId)
      .limit(1)
    if (error) throw error
    group.value.itineraries = data ?? []
  } catch (error) {
    console.log(error)
  }
}

// Picking a time (Availability) and making the plan (Itinerary) happen inside the tabs,
// so recheck the stage when the tab changes; the hero's colour and ticks then keep up
async function refreshStage() {
  if (!group.value || !isMember.value) return
  try {
    const { data, error } = await supabase.rpc('wad2do_group_details', { p_group_id: groupId })
    if (error) throw error
    if (data) {
      group.value.chosen_start = data.chosen_start
      group.value.chosen_end = data.chosen_end
    }
  } catch (error) {
    console.log(error)
  }
  await loadPlanStatus()
}

watch(() => route.name, refreshStage)

function getMemberCount() {
  return group.value.group_members?.[0]?.count ?? 0
}

// ----- The hero at the top: the group's ticket, as on the Groups page -----

const memberFaces = ref([]) // [{ id, animal, initial }]; the hero shows the count until these load

// { get: true } because it only reads, and get_group_member_names is a "stable" function
async function loadMemberFaces() {
  try {
    const { data, error } = await supabase.rpc(
      'get_group_member_names',
      { p_group_id: groupId },
      { get: true },
    )
    if (error) throw error
    memberFaces.value = data.map((member) => ({
      id: member.id,
      animal: findProfileAnimal(member.avatar_animal)?.id || '',
      initial: (member.display_name || 'M').charAt(0).toUpperCase(),
    }))
  } catch (error) {
    console.log(error)
  }
}

// The tabs follow the planning steps in order, so they double as the group's progress
const steps = [
  { route: 'group-activities', testid: 'tab-activities', label: 'Activities', icon: 'compass' },
  {
    route: 'group-availability',
    testid: 'tab-availability',
    label: 'Availability',
    icon: 'calendar',
  },
  { route: 'group-itinerary', testid: 'tab-itinerary', label: 'Itinerary', icon: 'map' },
]

// How many steps are finished: picking a time finishes voting too
const doneSteps = computed(
  () => ({ Voting: 0, 'Time picked': 2, Planned: 3 })[getStatus(group.value)],
)

// e.g. '2026-10-30' -> 'Fri 30 Oct'
function formatDay(date, withYear = false) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
  })
}

// e.g. 'Fri 30 Oct – Sat 31 Oct 2026', or just 'Fri 30 Oct 2026' for a one-day group
function getDateText() {
  const { start_date: start, end_date: end } = group.value
  if (!start || !end) return 'Dates not set'
  if (start === end) return formatDay(start, true)
  return formatDay(start) + ' – ' + formatDay(end, true)
}

// For someone who opened an invite link but isn't in the group yet
async function joinGroup() {
  joinError.value = ''
  if (!inviteCode.value) return

  try {
    const { error } = await supabase.rpc('wad2do_join_group', {
      p_group_id: groupId,
      p_invite_code: inviteCode.value,
    })
    if (error?.code === 'P0002') {
      joinError.value =
        'This invite link is invalid. Ask a member for a new link or join using the group code.'
      return
    }
    if (error) throw error

    // Reload so the header shows the new member count and the tabs appear
    loadGroup()
  } catch (error) {
    console.log(error)
    joinError.value = "Couldn't join the group. Please try again."
  }
}

// After saving settings, reload so the header and the tabs show the new settings
function onSettingsSaved() {
  showSettings.value = false
  loadGroup()
}
</script>

<template>
  <!-- Icons on this page are adapted from Feather Icons (MIT licence), https://feathericons.com -->
  <div class="container group-page py-4 py-md-5" data-testid="group-page">
    <RouterLink to="/groups" class="back-link" data-testid="back-to-groups">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      Your groups
    </RouterLink>

    <p v-if="loading" class="py-5 text-center text-secondary" role="status">
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Loading group…
    </p>

    <div
      v-else-if="errorMessage"
      class="alert alert-danger mt-3"
      role="alert"
      data-testid="group-error"
    >
      {{ errorMessage }}
    </div>

    <!-- Wrong link or the group doesn't exist -->
    <div v-else-if="!group" class="group-panel mt-3 text-center" data-testid="group-not-found">
      <p class="fw-semibold mb-3">We couldn't find that group.</p>
      <RouterLink to="/groups" class="btn btn-dark rounded-pill px-4">Back to Groups</RouterLink>
    </div>

    <!-- Opened an invite link but not a member yet -->
    <div v-else-if="!isMember" class="group-panel join-panel mt-3" data-testid="group-join-screen">
      <p class="text-secondary small fw-semibold mb-1">You've been invited to</p>
      <h1 class="fw-bold mb-3">{{ group.name }}</h1>
      <ul class="meta-chips mb-3">
        <li>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {{ getDateText() }}
        </li>
        <li>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            />
          </svg>
          {{ getMemberCount() }} members
        </li>
      </ul>

      <p v-if="joinError" class="text-danger">{{ joinError }}</p>
      <p v-if="!inviteCode" class="text-secondary">
        Ask a member for a new invite link or join using the group code.
      </p>
      <button
        class="btn btn-dark rounded-pill px-4"
        data-testid="join-this-group"
        :disabled="!inviteCode"
        @click="joinGroup"
      >
        Join group
      </button>
    </div>

    <!-- Member view: the group's ticket (hero), its panels and the current tab -->
    <div v-else>
      <!-- The same ticket as on the Groups page, opened up: stage-coloured stub, details,
           and the three tabs as steps along the bottom -->
      <header
        class="hero"
        :class="{ past: isPast(group) }"
        :style="getStageStyle(group)"
        data-testid="group-header"
      >
        <!-- Everything about when sits in the stub: the day, and how long until it -->
        <GroupTicketStub class="hero-stub" :group="group" size="hero" :note="getCountdown(group)" />

        <div class="hero-body">
          <h1 class="hero-name">{{ group.name }}</h1>
          <ul class="hero-facts">
            <!-- The stub shows the day, so this is just the time once one is picked
                 (or the dates the group is choosing from) -->
            <li v-if="getTimeRange(group)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {{ getTimeRange(group) }}
            </li>
            <li v-else>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {{ formatRange(group) }}
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="6" width="20" height="14" rx="2" />
                <path d="M16 13h.01M2 10h20" />
              </svg>
              {{ getBudgetText(group) }}
            </li>
          </ul>
        </div>

        <!-- Each button opens a panel below the hero; it fills in while its panel is open -->
        <div class="header-actions">
          <button
            type="button"
            class="btn btn-outline-dark rounded-pill action-button"
            :class="{ active: showMembers }"
            :aria-expanded="showMembers"
            data-testid="members-button"
            @click="showMembers = !showMembers"
          >
            <span v-if="memberFaces.length" class="faces" aria-hidden="true">
              <template v-for="face in memberFaces.slice(0, 4)" :key="face.id">
                <AnimalAvatar v-if="face.animal" :animal="face.animal" :size="26" decorative />
                <span v-else class="face-initial">{{ face.initial }}</span>
              </template>
              <span v-if="memberFaces.length > 4" class="face-initial face-more"
                >+{{ memberFaces.length - 4 }}</span
              >
            </span>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              />
            </svg>
            {{ getMemberCount() }} {{ getMemberCount() === 1 ? 'member' : 'members' }}
          </button>
          <button
            type="button"
            class="btn btn-outline-dark rounded-pill action-button"
            :class="{ active: showInvite }"
            :aria-expanded="showInvite"
            data-testid="invite-button"
            @click="showInvite = !showInvite"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6"
              />
            </svg>
            <span class="action-text">Invite</span>
          </button>
          <button
            type="button"
            class="btn btn-outline-dark rounded-pill action-button"
            :class="{ active: showSettings }"
            :aria-expanded="showSettings"
            data-testid="settings-button"
            @click="showSettings = !showSettings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
            <span class="action-text">Settings</span>
          </button>
        </div>

        <!-- The tabs, as the three planning steps; finished steps fill in with the stage colour -->
        <nav class="steps" aria-label="Group sections">
          <RouterLink
            v-for="(step, index) in steps"
            :key="step.route"
            class="step"
            :class="{ done: index < doneSteps }"
            active-class="active"
            :to="{ name: step.route }"
            :data-testid="step.testid"
          >
            <!-- Icons adapted from Feather Icons (MIT licence). The circle fills with the
                 stage colour once the step is done. -->
            <span class="step-icon" aria-hidden="true">
              <svg v-if="step.icon === 'compass'" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
              </svg>
              <svg v-else-if="step.icon === 'calendar'" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" />
              </svg>
            </span>
            <span class="step-label">
              {{ step.label }}
              <span v-if="index < doneSteps" class="visually-hidden">(done)</span>
            </span>
          </RouterLink>
        </nav>
      </header>

      <GroupMembersPanel v-if="showMembers" :group="group" @changed="loadGroup" />

      <GroupSettingsForm
        v-if="showSettings"
        :group="group"
        @saved="onSettingsSaved"
        @cancel="showSettings = false"
      />

      <!-- Invite panel -->
      <section
        v-if="showInvite"
        class="group-panel mt-3"
        aria-label="Invite"
        data-testid="invite-panel"
      >
        <h2 class="h6 fw-bold mb-1">Invite friends</h2>
        <p class="text-secondary small mb-3">
          Get them to scan the QR code, or give them the group code to type in.
        </p>

        <GroupInviteCode
          :group-id="groupId"
          :group-name="group.name"
          :invite-code="group.invite_code"
        />
      </section>

      <div class="tab-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Matches the Activities page: near-black accents, pill buttons and soft grey panels */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--bs-secondary-color);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  color: var(--bs-emphasis-color);
}

.back-link svg,
.meta-chips svg,
.action-button > svg,
.hero-facts svg,
.step-icon svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.back-link svg {
  width: 18px;
  height: 18px;
}

/* ----- Hero: the group's ticket, as on the Groups page but bigger -----
   Colours come from getStageStyle (--stage, --stage-ink, --stage-mark, --tear) */
.group-page {
  --stub-width: 148px;
}

.hero {
  position: relative;
  display: grid;
  grid-template-columns: var(--stub-width) minmax(0, 1fr);
  grid-template-areas:
    'stub body'
    'stub actions'
    'steps steps';
  margin-top: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}

.hero-stub {
  grid-area: stub;
}

/* Notch at the top where the stub tears off, and two where the step strip does */
.hero::before,
.steps::before,
.steps::after {
  content: '';
  position: absolute;
  z-index: 1;
  width: 22px;
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
}

.hero::before {
  top: -12px;
  left: calc(var(--stub-width) - 11px);
}

.steps::before {
  top: -12px;
  left: -12px;
}

.steps::after {
  top: -12px;
  right: -12px;
}

.hero-body {
  grid-area: body;
  min-width: 0;
  padding: 26px 28px 12px;
}

.hero-name {
  margin-bottom: 12px;
  font-size: clamp(1.5rem, 1rem + 2.5vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.hero-facts {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hero-facts li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 1rem;
}

.hero-facts svg {
  margin-top: 4px;
  color: var(--muted);
}

.header-actions {
  grid-area: actions;
  align-self: end;
  padding: 8px 28px 24px;
}

/* Member avatars inside the Members button */
.faces {
  display: inline-flex;
  margin-right: 2px;
}

.faces > :deep(svg),
.face-initial {
  width: 26px;
  height: 26px;
  margin-left: -7px;
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
  font-size: 0.75rem;
  font-weight: 700;
}

.face-more {
  background: var(--ink);
  color: var(--on-ink);
}

/* ----- The tabs, as three planning steps along the bottom of the ticket ----- */
.steps {
  position: relative;
  display: grid;
  grid-area: steps;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 2px dashed var(--line);
}

/* Each step: its icon in a circle, then its name. The circle is grey until the step is
   done, then fills with the stage colour, so the strip doubles as the group's progress. */
.step {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  padding: 14px 16px;
  color: var(--muted);
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.step + .step {
  border-left: 1px solid var(--line);
}

.step:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.step-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
}

.step.done .step-icon {
  background: var(--stage-mark);
  color: var(--stage-ink);
}

/* Past outings: the grey stage colour needs white icons to show */
.hero.past .step.done .step-icon {
  color: white;
}

.step-label {
  font-weight: 600;
}

/* The tab you're on: ink text and an ink line under it */
.step.active {
  background: var(--surface-2);
  box-shadow: inset 0 -3px 0 var(--ink);
  color: var(--ink);
}

.step.active .step-label {
  font-weight: 700;
}

.tab-content {
  margin-top: 1.75rem;
}

/* Dates and budget, as small chips under the group name */
.meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.meta-chips li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--bs-emphasis-color);
  font-size: 0.875rem;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding-inline: 1rem;
}

/* The panels that open under the header, like the filters panel on Activities */
.group-panel {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.join-panel {
  max-width: 34rem;
}

/* Steps sit inside the ticket's clipped edge, so their focus ring goes inside */
.group-page .step:focus-visible {
  outline-offset: -4px;
}

/* Phones: a narrower stub; the buttons and steps run the full width under it */
@media (max-width: 575.98px) {
  .group-page {
    --stub-width: 88px;
  }

  .hero {
    grid-template-areas:
      'stub body'
      'actions actions'
      'steps steps';
    border-radius: var(--radius-lg);
  }

  .hero-body {
    padding: 18px 16px 16px;
  }

  .hero-name {
    margin-bottom: 8px;
  }

  .hero-facts li {
    font-size: 0.875rem;
  }

  .header-actions {
    padding: 14px 16px 16px;
    border-top: 1px solid var(--line);
  }

  /* Members (with faces) takes the room; Invite and Settings shrink to round icon buttons.
     Their names stay readable to screen readers. */
  .header-actions {
    flex-wrap: nowrap;
  }

  .action-button {
    padding-inline: 0.85rem;
    white-space: nowrap;
  }

  .action-button:not(:has(.action-text)) {
    flex: 1;
    justify-content: center;
  }

  .faces > :deep(svg),
  .face-initial {
    width: 22px;
    height: 22px;
    margin-left: -8px;
  }

  .action-button:has(.action-text) {
    justify-content: center;
    width: 44px;
    padding: 0;
  }

  .action-button:has(.action-text) > svg {
    width: 18px;
    height: 18px;
  }

  .action-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Icon above the name, so each step fits a third of a phone without crowding */
  .step {
    flex-direction: column;
    gap: 6px;
    padding: 12px 6px;
  }

  .step-icon {
    width: 30px;
    height: 30px;
  }

  .step-label {
    font-size: 0.875rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step {
    transition: none;
  }
}
</style>
