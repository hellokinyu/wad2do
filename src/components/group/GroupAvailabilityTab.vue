<template>
  <!-- Root element: the starter file's data-testid is kept for Playwright -->
  <div class="availability-tab" data-testid="group-availability-tab">
    <div class="tab-intro">
      <h2 class="h5 fw-bold mb-1">Availability</h2>
      <p class="text-secondary mb-0">Mark when you're free, then pick a time that works for everyone.</p>
    </div>

    <!-- LOADING: spinner controlled by the `loading` variable with v-if (handbook "Shared on every page") -->
    <div v-if="loading" class="text-center text-secondary py-5" data-testid="avail-loading">
      <span class="spinner-border spinner-border-sm me-2" role="status"></span>
      Loading availability…
    </div>

    <!-- ERROR: red alert with a Try again button -->
    <div v-else-if="errorMsg" class="alert alert-danger" data-testid="avail-error">
      {{ errorMsg }}
      <button class="btn btn-sm btn-outline-danger rounded-pill px-3 ms-2" @click="loadAll">Try again</button>
    </div>

    <div v-else>
      <!-- CELEBRATION POPUP: shown once per group when everyone has responded and a common time exists -->
      <div v-if="showPopup" class="popup-backdrop" data-testid="celebration-popup" @click.self="closePopup">
        <div class="popup-card">
          <div class="popup-emoji">🎉</div>
          <h3 class="h5">Everyone has responded!</h3>
          <p class="mb-3">
            Found {{ fullWindows.length }} time window{{ fullWindows.length === 1 ? '' : 's' }}
            where all {{ members.length }} of you are free.
          </p>
          <button class="btn btn-dark rounded-pill px-4" data-testid="popup-view" @click="viewHeatmap">
            See the heatmap
          </button>
          <button class="btn btn-link text-secondary" @click="closePopup">Close</button>
        </div>
      </div>

      <!-- CHOSEN SLOT: shown above the grid once the group has confirmed a time -->
      <!-- Icons in this tab are adapted from Feather Icons (MIT licence), https://feathericons.com -->
      <div v-if="group.chosen_start" class="status-banner chosen" data-testid="chosen-slot">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        <span>
          Chosen time:
          <a href="#" class="chosen-link" @click.prevent="goToDay(fromDb(group.chosen_start).slice(0, 10))">
            {{ chosenLabel }}
          </a>
        </span>
      </div>

      <!-- ALL-FREE BANNER: lists every window where all members are free; click one to select it -->
      <div v-if="everyoneCanMeet" class="status-banner all-free celebrate" data-testid="all-free-banner">
        <div class="w-100">
          <strong>Everyone is free at these times</strong>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button
              v-for="w in fullWindows"
              :key="w.startKey"
              class="window-chip"
              @click="useWindow(w)"
            >
              {{ w.label }}
            </button>
          </div>
          <div class="small text-secondary mt-2">Tap a time to select it, then press "Confirm time".</div>
        </div>
      </div>

      <!-- MODE TOGGLE: "My availability" / "Group heatmap" -->
      <div class="mode-toggle mb-3" role="group" aria-label="View">
        <button
          class="mode-option"
          :class="{ active: mode === 'mine' }"
          :aria-pressed="mode === 'mine'"
          data-testid="mode-mine"
          @click="mode = 'mine'"
        >
          My availability
        </button>
        <button
          class="mode-option"
          :class="{ active: mode === 'heatmap' }"
          :aria-pressed="mode === 'heatmap'"
          data-testid="mode-heatmap"
          @click="mode = 'heatmap'"
        >
          Group heatmap
        </button>
      </div>

      <!-- NO OVERLAP: everyone has responded but no slot has all members free -->
      <div v-if="noOverlap" class="alert alert-warning" data-testid="no-overlap">
        <strong>No time works for everyone.</strong>
        <span v-if="bestSlot">
          Best slots (⭐): {{ bestSlot.count }} of {{ members.length }} free, e.g.
          <a href="#" class="alert-link" @click.prevent="mode = 'heatmap'; goToDay(bestSlot.day)">
            {{ formatDay(bestSlot.day) }} {{ formatTime(bestSlot.time) }}
          </a>.
        </span>
        <button
          class="btn btn-sm btn-outline-dark rounded-pill px-3 ms-2"
          data-testid="extend-range"
          @click="extendDateRange"
        >
          Extend date range
        </button>
      </div>

      <!-- The grid and everything about it sit together in one card -->
      <div class="avail-card">
      <!-- PAGE NAV: 3 days per page on phones, 7 on laptops -->
      <div v-if="pageCount > 1" class="d-flex align-items-center justify-content-center gap-3 mb-3" data-testid="day-pager">
        <button
          class="btn btn-outline-dark rounded-pill px-3"
          :disabled="page === 0"
          aria-label="Previous days"
          data-testid="prev-days"
          @click="prevPage"
        >
          &larr; <span class="d-none d-md-inline">Prev</span>
        </button>
        <span class="fw-semibold text-center">
          {{ pageLabel }}
          <span class="d-block small text-secondary fw-normal">Page {{ page + 1 }} of {{ pageCount }}</span>
        </span>
        <button
          class="btn btn-outline-dark rounded-pill px-3"
          :disabled="page === pageCount - 1"
          aria-label="Next days"
          data-testid="next-days"
          @click="nextPage"
        >
          <span class="d-none d-md-inline">Next</span> &rarr;
        </button>
      </div>

      <!-- THE GRID: days across the top, 30-minute slots down the side (CSS Grid, see <style>) -->
      <div class="grid-scroll" data-testid="availability-grid">
        <div class="avail-grid" :style="{ '--cols': daysPerPage }" @mouseleave="hoveredKey = null">
          <!-- time labels column -->
          <div class="time-col">
            <div class="head-cell"></div>
            <div v-for="t in times" :key="t" class="time-cell">
              {{ t.endsWith(':00') ? formatTime(t) : '' }}
            </div>
          </div>

          <!-- one column per visible day (3 per page on phones, 7 on laptops) -->
          <div
            v-for="day in visibleDays"
            :key="day"
            class="day-col"
          >
            <div class="head-cell">{{ formatDay(day) }}</div>
            <div
              v-for="t in times"
              :key="t"
              class="slot"
              :class="{
                'slot-free': mode === 'mine' && mySlots[makeKey(day, t)],
                'slot-picked': mode === 'heatmap' && isInPick(makeKey(day, t)),
                'slot-all': mode === 'heatmap' && isEveryoneFree(day, t),
                'slot-chosen': isChosen(makeKey(day, t)),
              }"
              :style="cellStyle(day, t)"
              :data-testid="'slot-' + makeKey(day, t)"
              @mousedown.prevent="onCellDown(day, t)"
              @mouseenter="onCellEnter(day, t)"
            >
              {{ slotLabel(day, t) }}
            </div>
          </div>
        </div>
      </div>
      <p v-if="saving" class="text-secondary small mt-2 mb-0">Saving...</p>
      <div v-if="saveError" class="alert alert-danger mt-2" role="alert" data-testid="availability-save-error">
        {{ saveError }}
        <button
          class="btn btn-sm btn-outline-danger rounded-pill px-3 ms-2"
          :disabled="saving"
          @click="saveMySlots"
        >
          Try again
        </button>
      </div>

      <!-- LEGEND: one swatch per shade so the colours are easy to read -->
      <div v-if="mode === 'heatmap'" class="small text-secondary d-flex flex-wrap align-items-center gap-2 mt-3">
        <span>Nobody</span>
        <span v-for="c in shadeColors" :key="c" class="swatch" :style="{ backgroundColor: c }"></span>
        <span>Everyone 🎉</span>
        <span class="ms-2">Number = people free · ⭐ = best slot</span>
      </div>

      <!-- HEATMAP: hover/tap info, e.g. "4 of 5 free" and who is missing -->
      <div v-if="mode === 'heatmap'">
        <p class="mt-2 mb-1 small" data-testid="slot-info">
          <span v-if="inspect">
            <strong>{{ inspect.free }} of {{ inspect.total }} free</strong>
            <span v-if="inspect.missing.length"> (missing: {{ inspect.missing.join(', ') }})</span>
          </span>
          <span v-else class="text-secondary">Hover or tap a slot to see who is free.</span>
        </p>

        <!-- PICK A SLOT: click a start slot, then an end slot on the same day, then Confirm -->
        <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
          <span class="small">
            <span v-if="pickLabel">Selected: <strong>{{ pickLabel }}</strong></span>
            <span v-else class="text-secondary">Click a start slot, then an end slot.</span>
          </span>
          <button
            class="btn btn-dark rounded-pill px-4 ms-auto"
            :disabled="!pickStart"
            data-testid="confirm-time"
            @click="confirmSlot"
          >
            Confirm time
          </button>
        </div>
      </div>
      </div>

      <!-- WHO HAS RESPONDED: tick or "not yet" for each member -->
      <h3 class="h6 fw-bold mt-4 mb-2">Who has responded</h3>
      <ul class="responded-list" data-testid="responded-list">
        <li v-for="m in members" :key="m.id" :class="{ done: respondedIds.includes(m.id) }">
          <svg v-if="respondedIds.includes(m.id)" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {{ m.name }}
          <span v-if="!respondedIds.includes(m.id)" class="text-secondary small">· not yet</span>
        </li>
      </ul>

      <!-- PLAN BUTTON: disabled until a slot is picked; spinner while planning runs -->
      <button
        class="btn btn-dark btn-lg rounded-pill w-100 mt-3 plan-button"
        :disabled="!group.chosen_start || planning"
        data-testid="plan-button"
        @click="onPlan"
      >
        <span v-if="planning" class="spinner-border spinner-border-sm me-2"></span>
        Plan our day
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// Shared Supabase client (handbook: src/lib/supabase.js). If it is a default export, use: import supabase from ...
import { supabase } from '../../lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'

const route = useRoute()
const router = useRouter()
// The group id comes from the URL /groups/:id/availability
const groupId = computed(() => route.params.id)

// ---------- state ----------
const loading = ref(true)
const errorMsg = ref('')
const saving = ref(false)
const saveError = ref('')
let saveQueued = false
let saveController
let disposed = false
const planning = ref(false)

// ---------- pagination: 3 days per page on phones, 7 on laptops ----------
const isPhone = ref(window.innerWidth < 768) // same breakpoint as Bootstrap's md
const page = ref(0) // which page of days is showing (0 = first)
function onResize() {
  isPhone.value = window.innerWidth < 768
}

const userId = ref(null) // current logged-in user
const group = ref({}) // start_date, end_date, chosen_start, chosen_end
const members = ref([]) // [{ id, name }]
const allSlots = ref([]) // everyone's saved slots: [{ user_id, key }]
const mySlots = ref({}) // my slots as an object: { "2026-10-17T14:00": true }

const mode = ref('mine') // 'mine' | 'heatmap'
const hoveredKey = ref(null) // slot being hovered/tapped in the heatmap
const pickStart = ref(null) // first slot picked on the heatmap
const pickEnd = ref(null) // second slot picked on the heatmap
const showPopup = ref(false) // celebration popup

// dragging state for "tap or drag to mark free slots"
const isDragging = ref(false)
const paintValue = ref(true) // true = marking free, false = unmarking

// ---------- heatmap shades ----------
// One green that gets darker as more people are free: index 0 = nobody ... index 5 = everyone
const shadeColors = ['#ffffff', '#d8f0df', '#a3dbb3', '#5fbf80', '#2a8f57', '#0b5d3b']

// ---------- slot keys and time helpers ----------
// A slot is identified by a string like "2026-10-17T14:00" (Singapore time).
function makeKey(day, time) {
  return day + 'T' + time
}
// Convert a key to the timestamp we store in Supabase (Singapore is always UTC+8)
function toDb(key) {
  return key + ':00+08:00'
}
// Convert a timestamp from Supabase back into a key
function fromDb(ts) {
  return new Date(new Date(ts).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 16)
}
function pad(n) {
  return String(n).padStart(2, '0')
}
// The key of the slot right after this one (used for the END of a chosen range)
function nextSlotKey(key) {
  const [day, t] = key.split('T')
  const [h, m] = t.split(':').map(Number)
  const total = h * 60 + m + 30
  return day + 'T' + pad(Math.floor(total / 60)) + ':' + pad(total % 60)
}
function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return h12 + (m === 0 ? '' : ':' + pad(m)) + (h < 12 ? 'am' : 'pm')
}
function formatDay(day) {
  return new Date(day + 'T00:00:00Z').toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
// "Sat 18 Oct, 2:00pm to 8:00pm" from two timestamps
function formatRange(startTs, endTs) {
  const s = new Date(startTs)
  const e = new Date(endTs)
  const day = s.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Singapore',
  })
  const t = (d) =>
    d
      .toLocaleTimeString('en-SG', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Singapore',
      })
      .replace(' ', '')
      .toLowerCase()
  return day + ', ' + t(s) + ' to ' + t(e)
}

// ---------- computed: the grid layout ----------
// Every day from start_date to end_date (inclusive)
const days = computed(() => {
  const out = []
  if (!group.value.start_date) return out
  let d = new Date(group.value.start_date + 'T00:00:00Z')
  const end = new Date(group.value.end_date + 'T00:00:00Z')
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return out
})

const daysPerPage = computed(() => (isPhone.value ? 3 : 7))
const pageCount = computed(() => Math.max(1, Math.ceil(days.value.length / daysPerPage.value)))
// Only the days on the current page get rendered
const visibleDays = computed(() => {
  const start = page.value * daysPerPage.value
  return days.value.slice(start, start + daysPerPage.value)
})
const pageLabel = computed(() => {
  const v = visibleDays.value
  if (!v.length) return ''
  return v.length === 1 ? formatDay(v[0]) : formatDay(v[0]) + ' – ' + formatDay(v[v.length - 1])
})

function prevPage() {
  if (page.value > 0) page.value--
}
function nextPage() {
  if (page.value < pageCount.value - 1) page.value++
}
// Jump to the page that contains a given day (used by the "everyone free" chips)
function goToDay(day) {
  const i = days.value.indexOf(day)
  if (i >= 0) page.value = Math.floor(i / daysPerPage.value)
}

// When the screen crosses the breakpoint, keep the first visible day on screen
watch(daysPerPage, (newPer, oldPer) => {
  const firstIdx = page.value * oldPer
  page.value = Math.floor(firstIdx / newPer)
})
// If the date range shrinks, don't get stuck on a page that no longer exists
watch(pageCount, (n) => {
  if (page.value > n - 1) page.value = n - 1
})

// 30-minute slots from 9:00 to 22:30 (so the last slot ends at 11pm)
const times = computed(() => {
  const out = []
  for (let mins = 9 * 60; mins < 23 * 60; mins += 30) {
    out.push(pad(Math.floor(mins / 60)) + ':' + pad(mins % 60))
  }
  return out
})

// ---------- computed: heatmap data ----------
// { "2026-10-17T14:00": [userId, userId, ...] } = who is free at each slot
const freeBySlot = computed(() => {
  const map = {}
  for (const row of allSlots.value) {
    if (!map[row.key]) map[row.key] = []
    map[row.key].push(row.user_id)
  }
  return map
})
function freeCount(day, t) {
  return (freeBySlot.value[makeKey(day, t)] || []).length
}
// True when ALL members are free at this slot
function isEveryoneFree(day, t) {
  return members.value.length > 0 && freeCount(day, t) === members.value.length
}
// Heatmap colour: the more members free, the darker the shade (5 steps, easy to tell apart)
function cellStyle(day, t) {
  if (mode.value !== 'heatmap') return {}
  const n = freeCount(day, t)
  if (n === 0) return {}
  const total = members.value.length || 1
  // everyone free = darkest shade; otherwise split the rest into 4 steps
  const level = n === total ? 5 : Math.max(1, Math.min(4, Math.ceil((n / total) * 4)))
  return {
    backgroundColor: shadeColors[level],
    color: level >= 4 ? '#fff' : '#212529', // white text on dark shades
  }
}
// Info for the hovered slot: "4 of 5 free" + who is missing
const inspect = computed(() => {
  if (!hoveredKey.value) return null
  const freeIds = freeBySlot.value[hoveredKey.value] || []
  return {
    free: freeIds.length,
    total: members.value.length,
    missing: members.value.filter((m) => !freeIds.includes(m.id)).map((m) => m.name),
  }
})

// Who has responded = anyone with at least one saved slot
const respondedIds = computed(() => [...new Set(allSlots.value.map((r) => r.user_id))])
const allResponded = computed(() => members.value.length > 0 && respondedIds.value.length === members.value.length)

// Slot with the most members free (used for the "no overlap" message)
const bestSlot = computed(() => {
  let best = null
  for (const day of days.value) {
    for (const t of times.value) {
      const count = freeCount(day, t)
      if (count > 0 && (!best || count > best.count)) best = { day, time: t, count }
    }
  }
  return best
})
// True when everyone has answered but no slot has ALL members free
const noOverlap = computed(
  () => allResponded.value && (!bestSlot.value || bestSlot.value.count < members.value.length)
)
// ⭐ goes on EVERY slot tied for the most people free (only when nobody overlaps fully)
function isBestSlot(day, t) {
  return noOverlap.value && bestSlot.value && freeCount(day, t) === bestSlot.value.count
}

// What to print inside a heatmap cell: 🎉 everyone, ⭐ best slot, otherwise the number of people free
function slotLabel(day, t) {
  if (mode.value !== 'heatmap') return ''
  const n = freeCount(day, t)
  if (n === 0) return ''
  if (isEveryoneFree(day, t)) return '🎉'
  if (isBestSlot(day, t)) return '⭐'
  return n
}

// ---------- computed: windows where EVERYONE is free ----------
// Joins consecutive all-free slots into one window, e.g. "Sat 18 Oct, 2pm to 5pm"
function makeWindow(day, startT, lastT) {
  const lastKey = makeKey(day, lastT)
  const endT = nextSlotKey(lastKey).split('T')[1]
  return {
    startKey: makeKey(day, startT),
    endKey: lastKey,
    label: formatDay(day) + ', ' + formatTime(startT) + ' to ' + formatTime(endT),
  }
}
const fullWindows = computed(() => {
  const out = []
  for (const day of days.value) {
    let start = null
    let last = null
    for (const t of times.value) {
      if (isEveryoneFree(day, t)) {
        if (!start) start = t
        last = t
      } else if (start) {
        out.push(makeWindow(day, start, last))
        start = null
      }
    }
    if (start) out.push(makeWindow(day, start, last))
  }
  return out
})
// Everyone has answered AND at least one common window exists
const everyoneCanMeet = computed(() => allResponded.value && fullWindows.value.length > 0)

// ---------- computed: labels ----------
const chosenLabel = computed(() =>
  group.value.chosen_start ? formatRange(group.value.chosen_start, group.value.chosen_end) : ''
)
const pickLabel = computed(() => {
  if (!pickStart.value) return ''
  const endKey = pickEnd.value || pickStart.value
  return formatRange(toDb(pickStart.value), toDb(nextSlotKey(endKey)))
})
function isInPick(key) {
  if (!pickStart.value) return false
  const end = pickEnd.value || pickStart.value
  return key >= pickStart.value && key <= end
}

// True when this slot is inside the time the group already confirmed
function isChosen(key) {
  if (!group.value.chosen_start) return false
  return key >= fromDb(group.value.chosen_start) && key < fromDb(group.value.chosen_end)
}

// ---------- celebration popup (shown once per group, remembered with localStorage) ----------
function popupStorageKey() {
  return 'avail-popup-seen-' + groupId.value
}
function maybeShowPopup() {
  if (!everyoneCanMeet.value) return
  try {
    if (!localStorage.getItem(popupStorageKey())) showPopup.value = true
  } catch {
    // if localStorage is unavailable, just skip the popup
  }
}
function closePopup() {
  showPopup.value = false
  try {
    localStorage.setItem(popupStorageKey(), '1')
  } catch {
    // ignore
  }
}
function viewHeatmap() {
  mode.value = 'heatmap'
  closePopup()
}
// Clicking a window chip pre-selects that range on the heatmap
function useWindow(w) {
  mode.value = 'heatmap'
  pickStart.value = w.startKey
  pickEnd.value = w.endKey === w.startKey ? null : w.endKey
  goToDay(w.startKey.split('T')[0])
}

// ---------- loading data from Supabase ----------
async function loadAll() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data: auth } = await supabase.auth.getUser()
    userId.value = auth.user.id

    // 1. the group (dates + chosen slot)
    const { data: g, error: e1 } = await supabase
      .from('groups')
      .select('start_date, end_date, chosen_start, chosen_end')
      .eq('id', groupId.value)
      .single()
    if (e1) throw e1
    group.value = g

    // 2. the members and their display names
    const { data: gm, error: e2 } = await supabase.rpc('get_group_member_names', {
      p_group_id: groupId.value,
    })
    if (e2) throw e2
    members.value = gm.map((member) => ({ id: member.id, name: member.display_name || 'Member' }))

    // 3. everyone's saved availability
    const { data: av, error: e4 } = await supabase
      .from('availability')
      .select('user_id, slot_start')
      .eq('group_id', groupId.value)
    if (e4) throw e4
    allSlots.value = av
      .map((r) => ({ user_id: r.user_id, key: fromDb(r.slot_start) }))
      .filter((row) => days.value.includes(row.key.slice(0, 10)) && times.value.includes(row.key.slice(11)))

    // 4. split out my own slots so the "My availability" grid is pre-filled
    const mine = {}
    for (const r of allSlots.value) {
      if (r.user_id === userId.value) mine[r.key] = true
    }
    mySlots.value = mine

    page.value = 0
    maybeShowPopup()
  } catch {
    errorMsg.value = "Couldn't load availability"
  } finally {
    loading.value = false
  }
}

// ---------- marking my availability (tap or drag) ----------
function onCellDown(day, t) {
  const key = makeKey(day, t)
  if (mode.value === 'mine') {
    isDragging.value = true
    paintValue.value = !mySlots.value[key] // first cell decides: mark or unmark
    paint(key)
  } else {
    hoveredKey.value = key // heatmap: show info + pick a range
    pickCell(key)
  }
}
function onCellEnter(day, t) {
  const key = makeKey(day, t)
  if (mode.value === 'mine' && isDragging.value) paint(key)
  if (mode.value === 'heatmap') hoveredKey.value = key
}
function paint(key) {
  if (paintValue.value) mySlots.value[key] = true
  else delete mySlots.value[key]
}
// When the mouse is released anywhere, stop dragging and save
async function onMouseUp() {
  if (!isDragging.value) return
  isDragging.value = false
  await saveMySlots()
}
onMounted(() => {
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  disposed = true
  saveQueued = false
  saveController?.abort()
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('resize', onResize)
})

// Queue later drags; the database replaces one member's slots in a single transaction.
async function saveMySlots() {
  if (disposed) return
  if (saving.value) {
    saveQueued = true
    return
  }
  saving.value = true
  saveError.value = ''
  const savedGroupId = groupId.value
  const savedUserId = userId.value
  try {
    do {
      saveQueued = false
      if (disposed || groupId.value !== savedGroupId || userId.value !== savedUserId) return
      const keys = Object.keys(mySlots.value)
      saveController = new AbortController()
      const { error } = await requestWithTimeout((signal) =>
        supabase.rpc('replace_group_availability', {
          p_group_id: savedGroupId,
          p_slots: keys.map(toDb),
          p_expected_user_id: savedUserId,
        }).abortSignal(signal),
        saveController,
      )
      if (disposed || groupId.value !== savedGroupId || userId.value !== savedUserId) return
      if (error) throw error
      allSlots.value = allSlots.value
        .filter((row) => row.user_id !== savedUserId)
        .concat(keys.map((key) => ({ user_id: savedUserId, key })))
    } while (saveQueued)
    maybeShowPopup()
  } catch {
    if (!disposed) saveError.value = "Couldn't confirm your availability was saved. Your selection is still here. Try again."
  } finally {
    saveController = undefined
    saveQueued = false
    saving.value = false
  }
}

// ---------- picking a slot on the heatmap ----------
// 1st click = start, 2nd click (same day) = end, 3rd click starts over
function pickCell(key) {
  const day = key.split('T')[0]
  if (!pickStart.value || pickEnd.value || pickStart.value.split('T')[0] !== day) {
    pickStart.value = key
    pickEnd.value = null
    return
  }
  if (key < pickStart.value) {
    pickEnd.value = pickStart.value
    pickStart.value = key
  } else {
    pickEnd.value = key
  }
}
async function confirmSlot() {
  const endKey = pickEnd.value || pickStart.value
  const chosen_start = toDb(pickStart.value)
  const chosen_end = toDb(nextSlotKey(endKey)) // end of the last selected 30-min slot
  const { error } = await supabase
    .from('groups')
    .update({ chosen_start, chosen_end })
    .eq('id', groupId.value)
  if (error) {
    errorMsg.value = "Couldn't save the chosen time"
    return
  }
  group.value = { ...group.value, chosen_start, chosen_end }
  pickStart.value = null
  pickEnd.value = null
}

// ---------- no overlap: extend the date range by one day ----------
async function extendDateRange() {
  const last = days.value[days.value.length - 1]
  const newEnd = new Date(new Date(last + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
  const { error } = await supabase.from('groups').update({ end_date: newEnd }).eq('id', groupId.value)
  if (error) {
    errorMsg.value = "Couldn't extend the date range"
    return
  }
  group.value = { ...group.value, end_date: newEnd }
  goToDay(newEnd)
}

// ---------- Plan button ----------
async function onPlan() {
  if (planning.value || !group.value.chosen_start) return
  planning.value = true
  try {
    await router.push({
      name: 'group-itinerary',
      params: { id: groupId.value },
      query: { replan: '1' },
    })
  } catch {
    errorMsg.value = "Couldn't build the plan"
  } finally {
    planning.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
/* Scroll sideways if the group has many days; the grid also fades in when it appears */
.grid-scroll {
  overflow-x: auto;
  user-select: none;
  animation: fade-in 0.4s ease;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

/* CSS Grid: one narrow time column + one column per day (--cols is set from the template) */
.avail-grid {
  display: grid;
  grid-template-columns: 3.5rem repeat(var(--cols), minmax(3.5rem, 1fr));
}

.time-col,
.day-col {
  display: flex;
  flex-direction: column;
}

.head-cell {
  height: 2rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
}

.time-cell {
  height: 1.5rem;
  font-size: 0.7rem;
  text-align: right;
  padding-right: 0.3rem;
}

/* Rounded, soft cells that smoothly change colour */
.slot {
  height: 1.5rem;
  margin: 1px;
  border: 1px solid #dfe3e6;
  border-radius: 6px;
  background-color: #fff;
  display: flex; /* centres the number / emoji */
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.25s ease, transform 0.1s ease, box-shadow 0.1s ease;
}
/* Hover: the slot lifts up a little */
.slot:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  position: relative;
  z-index: 1;
}

/* Marking a slot free: it "pops" in */
.slot-free {
  background-color: #198754;
  animation: pop 0.25s ease;
}
@keyframes pop {
  0%   { transform: scale(0.6); }
  60%  { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Everyone free: thick gold line on the left (joins up into one long line for consecutive slots) + a pulsing glow */
.slot-all {
  border-left: 4px solid #ffc107;
  animation: glow 1.8s ease-in-out infinite;
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); }
  50%      { box-shadow: 0 0 8px 2px rgba(255, 193, 7, 0.9); }
}

/* The range being picked */
.slot-picked {
  outline: 3px solid #111;
  outline-offset: -2px;
}

/* ---------- Page styling, matching the Activities page: near-black accents,
   pill buttons and soft grey panels ---------- */
.tab-intro {
  margin-bottom: 1.25rem;
}

.availability-tab svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.availability-tab :is(a, button):focus-visible {
  outline: 2px solid #111;
  outline-offset: 2px;
  box-shadow: none;
}

/* Chosen time and "everyone is free" messages */
.status-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: #fafafa;
}

.status-banner.chosen {
  border-color: var(--bs-success-border-subtle);
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}

.chosen-link {
  color: inherit;
  font-weight: 700;
}

.status-banner.chosen svg {
  margin-top: 3px;
  stroke-width: 3;
}

.window-chip {
  min-height: 40px;
  padding: 6px 14px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: white;
  color: #111;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.window-chip:hover {
  background: #f3f3f3;
}

/* "My availability" / "Group heatmap" switch, styled like the category chips */
.mode-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: #fafafa;
}

.mode-option {
  min-height: 40px;
  padding: 6px 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #111;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.mode-option:hover {
  background: #f0f0f0;
}

.mode-option.active {
  background: #111;
  color: white;
}

/* The grid, legend and slot picker share one card, like the activity cards */
.avail-card {
  padding: 16px;
  border: 1px solid #eee;
  border-radius: 18px;
  background: white;
  box-shadow: 0 4px 16px rgb(0 0 0 / 4%);
}


/* Who has responded, as name chips */
.responded-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.responded-list li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: white;
  font-size: 0.875rem;
}

.responded-list li.done {
  border-color: var(--bs-success-border-subtle);
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
  font-weight: 600;
}

.plan-button {
  min-height: 52px;
}

/* The time the group already confirmed: dashed purple outline */
.slot-chosen {
  outline: 2px dashed #6f42c1;
  outline-offset: -2px;
}

/* Legend swatches (same colours as the heatmap) */
.swatch {
  width: 1.4rem;
  height: 0.9rem;
  border-radius: 4px;
  border: 1px solid #dfe3e6;
}

/* Banner that bounces in when everyone is free */
.celebrate {
  animation: bounce-in 0.5s ease;
}

/* Celebration popup */
.popup-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fade-in 0.2s ease;
}
.popup-card {
  background: #fff;
  border-radius: 20px;
  padding: 1.5rem 2rem;
  text-align: center;
  max-width: 22rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  animation: bounce-in 0.5s ease;
}
.popup-emoji {
  font-size: 3rem;
  animation: wiggle 1s ease-in-out infinite;
}
@keyframes bounce-in {
  0%   { transform: scale(0.5); opacity: 0; }
  70%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); }
}
@keyframes wiggle {
  0%, 100% { transform: rotate(-8deg); }
  50%      { transform: rotate(8deg); }
}

/* Accessibility: turn animations off for people who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .slot,
  .slot-free,
  .slot-all,
  .grid-scroll,
  .celebrate,
  .popup-backdrop,
  .popup-card,
  .popup-emoji,
  .window-chip,
  .mode-option {
    animation: none;
    transition: none;
  }
}
</style>
