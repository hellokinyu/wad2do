<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/activityDisplay'
import GroupSettingsForm from '@/components/group/GroupSettingsForm.vue'
import GroupMembersPanel from '@/components/group/GroupMembersPanel.vue'

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

    const { data, error } = await supabase.rpc('wad2do_group_details', { p_group_id: groupId })

    // Error code 22P02 means the id in the URL isn't a real id, so treat it as "not found"
    if (error && error.code !== '22P02') throw error
    group.value = data

    isMember.value = data?.is_member === true
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

// Same S$ format as the activity prices, e.g. 'S$50.00 per person'
function getBudgetText() {
  const budget = getPrice(group.value.budget_per_person)
  return budget === null ? 'No budget set' : 'S$' + budget.toFixed(2) + ' per person'
}

function getInviteLink() {
  return (
    window.location.origin +
    '/groups/' +
    groupId +
    '?invite=' +
    encodeURIComponent(group.value.invite_code)
  )
}

async function copyInviteLink() {
  await navigator.clipboard.writeText(getInviteLink())
  copyMessage.value = 'Link copied!'
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

    <!-- Member view: header, tabs and the current tab -->
    <div v-else>
      <header class="group-header" data-testid="group-header">
        <div class="min-width-0">
          <h1 class="group-name fw-bold">{{ group.name }}</h1>
          <ul class="meta-chips">
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {{ getDateText() }}
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="6" width="20" height="14" rx="2" />
                <path d="M16 13h.01M2 10h20" />
              </svg>
              Budget {{ getBudgetText() }}
            </li>
          </ul>
        </div>

        <!-- Each button opens a panel below the header; it fills in while its panel is open -->
        <div class="header-actions">
          <button
            type="button"
            class="btn btn-outline-dark rounded-pill action-button"
            :class="{ active: showMembers }"
            :aria-expanded="showMembers"
            data-testid="members-button"
            @click="showMembers = !showMembers"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              />
            </svg>
            Members ({{ getMemberCount() }})
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
            Invite
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
            Settings
          </button>
        </div>
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
          Send them the link, or share the code for them to type in.
        </p>

        <label for="invite-link" class="form-label">Invite link</label>
        <div class="d-flex gap-2 mb-2">
          <input
            id="invite-link"
            class="form-control invite-input"
            :value="getInviteLink()"
            readonly
            data-testid="invite-link"
          />
          <button
            type="button"
            class="btn btn-dark rounded-pill px-4 flex-shrink-0"
            data-testid="copy-invite-link"
            @click="copyInviteLink"
          >
            Copy
          </button>
        </div>
        <p v-if="copyMessage" class="small text-success fw-semibold mb-2" role="status">
          {{ copyMessage }}
        </p>
        <p class="mb-0 mt-3 d-flex align-items-center gap-2 flex-wrap">
          <span class="small fw-semibold">Group code</span>
          <strong class="invite-code" data-testid="invite-code">{{ group.invite_code }}</strong>
        </p>
      </section>

      <!-- Tabs, styled like the category chips on the Activities page -->
      <nav class="group-tabs" aria-label="Group sections">
        <RouterLink
          class="group-tab"
          active-class="active"
          :to="{ name: 'group-activities' }"
          data-testid="tab-activities"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
          </svg>
          Activities
        </RouterLink>
        <RouterLink
          class="group-tab"
          active-class="active"
          :to="{ name: 'group-availability' }"
          data-testid="tab-availability"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          Availability
        </RouterLink>
        <RouterLink
          class="group-tab"
          active-class="active"
          :to="{ name: 'group-itinerary' }"
          data-testid="tab-itinerary"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" />
          </svg>
          Itinerary
        </RouterLink>
      </nav>

      <RouterView />
    </div>
  </div>
</template>

<style scoped>
/* Matches the Activities page: near-black accents, pill buttons and soft grey panels */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: var(--bs-secondary-color);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  color: var(--bs-emphasis-color);
}

.back-link svg,
.meta-chips svg,
.action-button svg,
.group-tab svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-top: 0.5rem;
}

.min-width-0 {
  min-width: 0;
}

.group-name {
  margin-bottom: 0.75rem;
  overflow-wrap: anywhere;
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
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: white;
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
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: #fafafa;
}

.join-panel {
  max-width: 34rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.invite-input {
  min-height: 44px;
  border-radius: 12px;
}

/* The 6-character code, spaced out so it's easy to read aloud or type */
.invite-code {
  padding: 4px 14px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: white;
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2em;
}

/* Tabs */
.group-tabs {
  display: flex;
  gap: 8px;
  margin: 1.75rem 0 1.5rem;
  padding: 4px 2px 1rem;
  overflow-x: auto;
  border-bottom: 1px solid #e5e5e5;
}

.group-tab {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 18px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: white;
  color: #111;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.group-tab:hover {
  background: #f3f3f3;
}

.group-tab.active {
  border-color: #111;
  background: #111;
  color: white;
}

.group-page :is(a, button):focus-visible {
  outline: 2px solid #111;
  outline-offset: 2px;
  box-shadow: none;
}

/* Phones: drop the button and tab icons so each row fits on one line */
@media (max-width: 575.98px) {
  .action-button svg,
  .group-tab svg {
    display: none;
  }

  .action-button {
    padding-inline: 0.85rem;
  }

  .group-tab {
    padding-inline: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .group-tab {
    transition: none;
  }
}
</style>
