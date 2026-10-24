<template>
  <!-- Root element: the starter file's data-testid is kept for Playwright -->
  <div data-testid="group-availability-tab">
    <h2 class="h4">Availability 🗓️</h2>

    <!-- LOADING: spinner controlled by the `loading` variable with v-if (handbook "Shared on every page") -->
    <div v-if="loading" class="text-center py-5" data-testid="avail-loading">
      <div class="spinner-border" role="status"></div>
    </div>

    <!-- ERROR: red alert with a Try again button -->
    <div v-else-if="errorMsg" class="alert alert-danger" data-testid="avail-error">
      {{ errorMsg }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="loadAll">Try again</button>
    </div>

    <div v-else>
      <!-- CHOSEN SLOT: shown above the grid once the group has confirmed a time -->
      <div v-if="group.chosen_start" class="alert alert-success" data-testid="chosen-slot">
        Chosen time: <strong>{{ chosenLabel }}</strong>
      </div>

      <!-- MODE TOGGLE: "My availability" / "Group heatmap" -->
      <div class="btn-group mb-3" role="group">
        <button
          class="btn"
          :class="mode === 'mine' ? 'btn-primary' : 'btn-outline-primary'"
          data-testid="mode-mine"
          @click="mode = 'mine'"
        >
          My availability
        </button>
        <button
          class="btn"
          :class="mode === 'heatmap' ? 'btn-primary' : 'btn-outline-primary'"
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
          Best slot: {{ formatDay(bestSlot.day) }} {{ formatTime(bestSlot.time) }}
          ({{ bestSlot.count }} of {{ members.length }} free).
        </span>
        <button class="btn btn-sm btn-outline-dark ms-2" data-testid="extend-range" @click="extendDateRange">
          Extend date range
        </button>
      </div>

      <!-- DAY TABS: only visible on phones (d-md-none); the grid shows one day at a time there -->
      <div class="d-md-none mb-2 d-flex flex-wrap gap-1">
        <button
          v-for="day in days"
          :key="day"
          class="btn btn-sm"
          :class="day === selectedDay ? 'btn-secondary' : 'btn-outline-secondary'"
          @click="selectedDay = day"
        >
          {{ formatDay(day) }}
        </button>
      </div>

      <!-- THE GRID: days across the top, 30-minute slots down the side (CSS Grid, see <style>) -->
      <div class="grid-scroll" data-testid="availability-grid">
        <div class="avail-grid" :style="{ '--cols': days.length }" @mouseleave="hoveredKey = null">
          <!-- time labels column -->
          <div class="time-col">
            <div class="head-cell"></div>
            <div v-for="t in times" :key="t" class="time-cell">
              {{ t.endsWith(':00') ? formatTime(t) : '' }}
            </div>
          </div>

          <!-- one column per day; on phones only the selected day is shown -->
          <div
            v-for="day in days"
            :key="day"
            class="day-col"
            :class="{ 'd-none d-md-flex': day !== selectedDay }"
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
              }"
              :style="cellStyle(day, t)"
              :data-testid="'slot-' + makeKey(day, t)"
              @mousedown.prevent="onCellDown(day, t)"
              @mouseenter="onCellEnter(day, t)"
            >
              {{ slotSticker(day, t) }}
            </div>
          </div>
        </div>
      </div>
      <p v-if="saving" class="text-muted small mt-1">Saving...</p>

      <!-- LEGEND: explains the heatmap colours -->
      <div v-if="mode === 'heatmap'" class="small text-muted d-flex align-items-center gap-2 mt-2">
        <span>Nobody free</span>
        <span class="legend-bar"></span>
        <span>Everyone free 🎉</span>
      </div>

      <!-- HEATMAP: hover/tap info, e.g. "4 of 5 free" and who is missing -->
      <div v-if="mode === 'heatmap'">
        <p class="mt-2 mb-1 small" data-testid="slot-info">
          <span v-if="inspect">
            <strong>{{ inspect.free }} of {{ inspect.total }} free</strong>
            <span v-if="inspect.missing.length"> (missing: {{ inspect.missing.join(', ') }})</span>
          </span>
          <span v-else class="text-muted">Hover or tap a slot to see who is free.</span>
        </p>

        <!-- PICK A SLOT: click a start slot, then an end slot on the same day, then Confirm -->
        <div class="d-flex align-items-center gap-2 my-2">
          <span class="small">
            <span v-if="pickLabel">Selected: <strong>{{ pickLabel }}</strong></span>
            <span v-else class="text-muted">Click a start slot, then an end slot.</span>
          </span>
          <button
            class="btn btn-success btn-sm"
            :disabled="!pickStart"
            data-testid="confirm-time"
            @click="confirmSlot"
          >
            Confirm time
          </button>
        </div>
      </div>

      <!-- WHO HAS RESPONDED: tick or "not yet" for each member -->
      <h3 class="h6 mt-3">Who has responded</h3>
      <ul class="list-unstyled" data-testid="responded-list">
        <li v-for="m in members" :key="m.id">
          <span v-if="respondedIds.includes(m.id)" class="text-success">&#10003;</span>
          <span v-else class="text-muted small">not yet</span>
          {{ m.name }}
        </li>
      </ul>

      <!-- PLAN BUTTON: disabled until a slot is picked; spinner while planning runs -->
      <button
        class="btn btn-primary btn-lg w-100 mt-2"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// Shared Supabase client (handbook: src/lib/supabase.js). If it is a default export, use: import supabase from ...
import { supabase } from '../../lib/supabase'

const route = useRoute()
const router = useRouter()
// The group id comes from the URL /groups/:id/availability
const groupId = computed(() => route.params.id)

// ---------- state ----------
const loading = ref(true)
const errorMsg = ref('')
const saving = ref(false)
const planning = ref(false)

const userId = ref(null) // current logged-in user
const group = ref({}) // start_date, end_date, chosen_start, chosen_end
const members = ref([]) // [{ id, name }]
const allSlots = ref([]) // everyone's saved slots: [{ user_id, key }]
const mySlots = ref({}) // my slots as an object: { "2026-10-17T14:00": true }

const mode = ref('mine') // 'mine' | 'heatmap'
const selectedDay = ref(null) // which day is shown on phones
const hoveredKey = ref(null) // slot being hovered/tapped in the heatmap
const pickStart = ref(null) // first slot picked on the heatmap
const pickEnd = ref(null) // second slot picked on the heatmap

// dragging state for "tap or drag to mark free slots"
const isDragging = ref(false)
const paintValue = ref(true) // true = marking free, false = unmarking

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
// Darker colour = more members free. Slots with at least 1 person get a minimum tint (0.2)
// so a single free person is still visible, instead of looking empty.
function cellStyle(day, t) {
  if (mode.value !== 'heatmap') return {}
  const n = freeCount(day, t)
  if (n === 0) return {}
  const ratio = n / (members.value.length || 1)
  return { backgroundColor: 'rgba(25, 135, 84, ' + (0.2 + 0.8 * ratio) + ')' }
}
// True when ALL members are free at this slot (used for the glow and the party sticker)
function isEveryoneFree(day, t) {
  return members.value.length > 0 && freeCount(day, t) === members.value.length
}
// Which emoji sticker (if any) to show inside a slot
function slotSticker(day, t) {
  if (mode.value !== 'heatmap') return ''
  if (isEveryoneFree(day, t)) return '🎉'
  // when nobody fully overlaps, mark the best slot with a star
  if (noOverlap.value && bestSlot.value && bestSlot.value.day === day && bestSlot.value.time === t) return '⭐'
  return ''
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
    const { data: gm, error: e2 } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId.value)
    if (e2) throw e2
    const ids = gm.map((m) => m.user_id)
    const { data: profs, error: e3 } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)
    if (e3) throw e3
    members.value = ids.map((id) => {
      const p = profs.find((x) => x.id === id)
      return { id, name: p ? p.display_name : 'Member' }
    })

    // 3. everyone's saved availability
    const { data: av, error: e4 } = await supabase
      .from('availability')
      .select('user_id, slot_start')
      .eq('group_id', groupId.value)
    if (e4) throw e4
    // Skip slots outside the date range (e.g. after the dates were changed in Settings)
    allSlots.value = av
      .map((r) => ({ user_id: r.user_id, key: fromDb(r.slot_start) }))
      .filter((s) => days.value.includes(s.key.split('T')[0]))

    // 4. split out my own slots so the "My availability" grid is pre-filled
    const mine = {}
    for (const r of allSlots.value) {
      if (r.user_id === userId.value) mine[r.key] = true
    }
    mySlots.value = mine

    selectedDay.value = days.value[0]
  } catch (err) {
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
onMounted(() => window.addEventListener('mouseup', onMouseUp))
onUnmounted(() => window.removeEventListener('mouseup', onMouseUp))

// Save: delete my old rows for this group, then insert the current ones
async function saveMySlots() {
  saving.value = true
  const keys = Object.keys(mySlots.value)
  const { error: delErr } = await supabase
    .from('availability')
    .delete()
    .eq('group_id', groupId.value)
    .eq('user_id', userId.value)
  if (delErr) {
    errorMsg.value = "Couldn't save your availability"
    saving.value = false
    return
  }
  if (keys.length > 0) {
    const rows = keys.map((k) => ({
      group_id: groupId.value,
      user_id: userId.value,
      slot_start: toDb(k),
    }))
    const { error: insErr } = await supabase.from('availability').insert(rows)
    if (insErr) errorMsg.value = "Couldn't save your availability"
  }
  // keep the heatmap in sync without reloading everything
  allSlots.value = allSlots.value
    .filter((r) => r.user_id !== userId.value)
    .concat(keys.map((k) => ({ user_id: userId.value, key: k })))
  saving.value = false
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
}

// ---------- Plan button ----------
async function onPlan() {
  planning.value = true
  try {
    // Delete the group's old plan, so the Itinerary tab builds a fresh one for the new time
    const { error } = await supabase.from('itineraries').delete().eq('group_id', groupId.value)
    if (error) throw error
    router.push('/groups/' + groupId.value + '/itinerary') // open the Itinerary tab
  } catch (err) {
    console.log(err)
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
  grid-template-columns: 3.5rem repeat(var(--cols), minmax(5rem, 1fr));
}

/* Phones: time column + the single selected day */
@media (max-width: 767.98px) {
  .avail-grid {
    grid-template-columns: 3.5rem 1fr;
  }
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
  border: 1px solid #eef0f2;
  border-radius: 6px;
  background-color: #fff;
  display: flex; /* centres the emoji sticker */
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.25s ease, transform 0.1s ease, box-shadow 0.1s ease;
}
/* Hover: the slot lifts up a little */
.slot:hover {
  transform: scale(1.15);
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

/* Everyone free: gentle golden glow that pulses */
.slot-all {
  animation: glow 1.8s ease-in-out infinite;
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); }
  50%      { box-shadow: 0 0 8px 2px rgba(255, 193, 7, 0.9); }
}

/* The range being picked */
.slot-picked {
  outline: 2px solid #0d6efd;
  outline-offset: -2px;
}

/* Legend colour bar (same green as the heatmap, light to dark) */
.legend-bar {
  width: 8rem;
  height: 0.6rem;
  border-radius: 99px;
  background: linear-gradient(to right, rgba(25, 135, 84, 0.2), rgba(25, 135, 84, 1));
}

/* Accessibility: turn animations off for people who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .slot,
  .slot-free,
  .slot-all,
  .grid-scroll {
    animation: none;
    transition: none;
  }
}
</style>