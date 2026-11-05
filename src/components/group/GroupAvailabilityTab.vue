<template>
  <div
    class="availability-tab"
    :style="{ '--action-height': actionHeight + 'px' }"
    data-testid="group-availability-tab"
  >
    <div class="tab-intro">
      <h2 class="h5 fw-bold mb-1">Availability</h2>
      <p class="text-secondary mb-0">
        First add your free times, then choose when the group will meet.
      </p>
    </div>
    <div
      v-if="loading"
      class="text-center text-secondary py-5"
      data-testid="avail-loading"
      role="status"
    >
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Loading availability…
    </div>
    <div v-else-if="errorMsg" class="alert alert-danger" role="alert" data-testid="avail-error">
      {{ errorMsg }}
      <button class="btn btn-sm btn-outline-danger rounded-pill px-3 ms-2" @click="loadAll">
        Try again
      </button>
    </div>
    <fieldset v-else class="flow-controls" :disabled="confirming || planning">
      <div class="mode-toggle mb-3" role="group" aria-label="Availability steps">
        <button
          type="button"
          class="mode-option"
          :class="{ active: mode === 'mine' }"
          :aria-pressed="mode === 'mine'"
          data-testid="mode-mine"
          @click="changeMode('mine')"
        >
          <span aria-hidden="true">1.</span> Your availability
        </button>
        <button
          type="button"
          class="mode-option"
          :class="{ active: mode === 'heatmap' }"
          :aria-pressed="mode === 'heatmap'"
          data-testid="mode-heatmap"
          @click="changeMode('heatmap')"
        >
          <span aria-hidden="true">2.</span> Choose group time
        </button>
      </div>
      <div class="step-intro">
        <h3
          ref="stepHeading"
          tabindex="-1"
          class="h5 fw-bold mb-1"
          data-testid="availability-step-heading"
        >
          {{ mode === 'mine' ? 'When are you free?' : 'Choose a time for the outing' }}
        </h3>
        <p class="text-secondary mb-1">
          {{
            mode === 'mine'
              ? "Tap or drag the times you're free. Saves automatically."
              : 'Tap the first and last block of your time.'
          }}
        </p>
        <p class="small text-secondary mb-0" data-testid="availability-response-count">
          {{ respondedIds.length }} of {{ members.length }} members have added availability.
        </p>
      </div>
      <div v-if="group.chosen_start" class="status-banner chosen" data-testid="chosen-slot">
        <span>
          📌 Confirmed:
          <button type="button" class="btn btn-link chosen-link p-0" @click="showChosenTime">
            {{ chosenLabel }}
          </button>
          <span v-if="hasPlan" class="d-block small">Itinerary ready.</span>
        </span>
      </div>
      <div
        v-if="refreshError"
        class="alert alert-warning"
        role="alert"
        data-testid="availability-refresh-error"
      >
        {{ refreshError }}
        <button class="btn btn-sm btn-outline-dark ms-2" @click="refreshShared">Try again</button>
      </div>
      <p
        v-if="datesNotice"
        class="alert alert-info"
        role="status"
        data-testid="availability-dates-notice"
      >
        {{ datesNotice }}
      </p>
      <div
        v-if="mode === 'heatmap' && everyoneCanMeet"
        class="suggestions"
        data-testid="all-free-banner"
      >
        <h4 class="h6 fw-bold mb-2"><span aria-hidden="true">🎉 </span>Times everyone can make</h4>
        <div class="d-flex flex-wrap gap-2">
          <button
            v-for="w in fullWindows"
            :key="w.startKey"
            type="button"
            class="window-chip"
            :aria-pressed="pickStart === w.startKey && pickEnd === w.endKey"
            @click="useWindow(w)"
          >
            <span aria-hidden="true">{{
              pickStart === w.startKey && pickEnd === w.endKey ? '✓ ' : ''
            }}</span
            >{{ w.label }}
            <span class="d-block small"
              >🎉 Everyone free · {{ durationLabel(w.startKey, nextSlotKey(w.endKey)) }}</span
            >
          </button>
        </div>
        <p class="small text-secondary mt-2 mb-0">
          Select a time above, or choose a different range in the heatmap.
        </p>
      </div>
      <div
        v-if="mode === 'heatmap' && noOverlap"
        class="alert alert-warning"
        data-testid="no-overlap"
      >
        <strong>No time works for everyone.</strong>
        <span v-if="bestSlot">
          ⭐ Best blocks have {{ bestSlot.count }} of {{ members.length }} people free.</span
        >
        Choose a range below, or
        <button
          type="button"
          class="btn btn-sm btn-outline-dark rounded-pill px-3"
          @click="extendDateRange"
          data-testid="extend-range"
        >
          Extend date range
        </button>
      </div>
      <div class="availability-layout">
        <div class="availability-main">
          <div class="avail-card surface-card">
            <div
              v-if="pageCount > 1"
              class="d-flex align-items-center justify-content-center gap-3 mb-3"
              data-testid="day-pager"
            >
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
                <span class="d-block small text-secondary fw-normal"
                  >Page {{ page + 1 }} of {{ pageCount }}</span
                >
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
            <p id="availability-keyboard-help" class="small text-secondary">
              <template v-if="mode === 'mine'">Tap or drag your free times.</template>
              <template v-else>Tap the first and last block (same day).</template>
              Arrow keys move, Enter selects.
            </p>
            <div class="grid-scroll" data-testid="availability-grid">
              <div
                class="avail-grid"
                role="group"
                aria-label="Availability slots"
                aria-describedby="availability-keyboard-help"
                :style="{ '--cols': visibleDays.length }"
                @mouseleave="hoveredKey = null"
              >
                <!-- time labels column -->
                <div class="time-col">
                  <div class="head-cell"></div>
                  <div v-for="t in times" :key="t" class="time-cell">
                    {{ t.endsWith(':00') ? formatTime(t) : '' }}
                  </div>
                </div>

                <!-- one column per visible day (3 per page on phones, 7 on laptops) -->
                <div v-for="day in visibleDays" :key="day" class="day-col">
                  <div class="head-cell">{{ formatDay(day) }}</div>
                  <button
                    v-for="t in times"
                    :key="t"
                    type="button"
                    class="slot"
                    :class="{
                      'slot-free': mode === 'mine' && mySlots[makeKey(day, t)],
                      'slot-picked': mode === 'heatmap' && isInPick(makeKey(day, t)),
                      'slot-all': mode === 'heatmap' && isEveryoneFree(day, t),
                      'slot-chosen': isChosen(makeKey(day, t)),
                    }"
                    :style="cellStyle(day, t)"
                    :data-testid="'slot-' + makeKey(day, t)"
                    :tabindex="tabStop === makeKey(day, t) ? 0 : -1"
                    :aria-label="slotAccessibleLabel(day, t)"
                    :aria-pressed="
                      mode === 'mine' ? !!mySlots[makeKey(day, t)] : isInPick(makeKey(day, t))
                    "
                    @focus="focusedSlot = hoveredKey = makeKey(day, t)"
                    @keydown="moveSlotFocus($event, day, t)"
                    @click="activateSlot($event, day, t)"
                    @mousedown.left.prevent="onCellDown(day, t)"
                    @mouseenter="onCellEnter(day, t)"
                  >
                    {{ slotLabel(day, t) }}
                  </button>
                </div>
              </div>
            </div>
            <div
              v-if="mode === 'heatmap'"
              class="small text-secondary d-flex flex-wrap align-items-center gap-2 mt-3"
            >
              <span>Nobody free</span>
              <span
                v-for="c in shadeColors"
                :key="c"
                class="swatch"
                :style="{ backgroundColor: c }"
              ></span>
              <span>Everyone free 🎉</span>
              <span>Number = people free · ⭐ = most free · 📌 = confirmed</span>
            </div>
            <p v-if="mode === 'heatmap'" class="mt-2 mb-0 small" data-testid="slot-info">
              <template v-if="inspect">
                <strong>{{ inspect.free }} of {{ inspect.total }} free</strong>
                <span v-if="inspect.missing.length">
                  (missing: {{ inspect.missing.join(', ') }})</span
                >
              </template>
              <span v-else class="text-secondary">Hover or tap a block to see who is free.</span>
            </p>
          </div>

          <h4 class="h6 fw-bold mt-4 mb-2">Who has added availability</h4>
          <ul class="responded-list" data-testid="responded-list">
            <li v-for="m in members" :key="m.id" :class="{ done: respondedIds.includes(m.id) }">
              <span v-if="respondedIds.includes(m.id)" aria-hidden="true">✓</span>
              {{ m.name
              }}<span v-if="!respondedIds.includes(m.id)" class="text-secondary small"
                >· not yet</span
              >
            </li>
          </ul>
        </div>
        <section
          ref="actionPanel"
          class="flow-action surface-card"
          aria-label="Next step"
          data-testid="availability-action"
        >
          <div class="action-summary" aria-live="polite" aria-atomic="true">
            <template v-if="mode === 'mine'">
              <h4 class="h6 fw-bold mb-1">Next: choose a group time</h4>
              <p class="small text-secondary mb-0">
                Your free times help the group find a time together.
              </p>
            </template>
            <template v-else-if="pickStart && !pickEnd">
              <h4 class="h6 fw-bold mb-1">
                Starts {{ formatDay(pickStart.slice(0, 10)) }} at
                {{ formatTime(pickStart.slice(11)) }}
              </h4>
              <p class="small text-secondary mb-0">Now tap the last block.</p>
            </template>
            <template v-else-if="actionRange">
              <h4 class="h6 fw-bold mb-1">{{ actionRange.label }}</h4>
              <p class="small mb-1">
                {{ durationLabel(actionRange.start, actionRange.end) }} · {{ rangeAttendance }}
              </p>
              <p class="small text-secondary mb-0">
                {{ pickStart ? 'Not confirmed yet' : '📌 Confirmed' }} · {{ budgetLabel }} each
              </p>
            </template>
            <template v-else>
              <h4 class="h6 fw-bold mb-1">Choose your outing time</h4>
              <p class="small text-secondary mb-0">Tap a start block, then an end block.</p>
            </template>
          </div>
          <p v-if="saving" role="status" class="small mb-0" data-testid="availability-save-status">
            Saving your availability…
          </p>
          <div
            v-else-if="saveError"
            class="alert alert-danger mb-0"
            role="alert"
            data-testid="availability-save-error"
          >
            {{ saveError }}
            <button
              type="button"
              class="btn btn-sm btn-outline-danger rounded-pill mt-2"
              @click="saveMySlots"
            >
              Try again
            </button>
          </div>
          <p
            v-else-if="Object.keys(mySlots).length"
            class="small mb-0"
            data-testid="availability-save-status"
          >
            ✓ Your availability is saved.
          </p>
          <p v-else class="small text-secondary mb-0">You haven't added any availability yet.</p>
          <p
            v-if="mode === 'heatmap' && hasPlan && selectionChanged"
            class="small text-danger mb-0"
            data-testid="replace-plan-warning"
          >
            Changing the time replaces your itinerary.
          </p>
          <div
            v-if="actionError"
            class="alert alert-danger mb-0"
            role="alert"
            data-testid="availability-action-error"
          >
            {{ actionError }}
          </div>
          <button
            v-if="mode === 'mine'"
            type="button"
            class="btn btn-dark rounded-pill plan-button"
            :disabled="personalSavePending"
            data-testid="availability-next"
            @click="changeMode('heatmap')"
          >
            Choose group time →
          </button>
          <button
            v-else
            type="button"
            class="btn btn-dark rounded-pill plan-button"
            :disabled="!canPlan"
            data-testid="confirm-time"
            @click="confirmAndPlan"
          >
            {{ actionLabel }}
          </button>
          <button
            v-if="mode === 'heatmap' && pickStart"
            type="button"
            class="btn btn-link text-body p-0"
            data-testid="clear-time-selection"
            @click="clearSelection"
          >
            Clear selection
          </button>
        </section>
      </div>
    </fieldset>
  </div>
</template>
<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import { useAuth } from '@/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()
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
const confirming = ref(false)
const actionError = ref('')
const hasPlan = ref(false)
const stepHeading = ref(null)
const actionPanel = ref(null)
const actionHeight = ref(0)
let confirmController
onBeforeRouteLeave(() => {
  confirmController?.abort()
})
let actionObserver
watch(actionPanel, (panel) => {
  actionObserver?.disconnect()
  if (!panel) return
  actionObserver = new ResizeObserver(() => {
    actionHeight.value = panel.getBoundingClientRect().height
  })
  actionObserver.observe(panel)
})
const refreshError = ref('')
const datesNotice = ref('')
let refreshNumber = 0
let refreshTimer
let channel

// ---------- pagination: 3 days per page on phones, 7 on laptops ----------
const isPhone = ref(window.innerWidth < 768) // same breakpoint as Bootstrap's md
const page = ref(0)
function onResize() {
  isPhone.value = window.innerWidth < 768
}

const userId = ref(null)
const group = ref({}) // start_date, end_date, chosen_start, chosen_end
const members = ref([]) // [{ id, name }]
const allSlots = ref([]) // everyone's saved slots: [{ user_id, key }]
const mySlots = ref({}) // my slots as an object: { "2026-10-17T14:00": true }

const mode = ref('mine') // 'mine' | 'heatmap'
const hoveredKey = ref(null)
const focusedSlot = ref(null)
const pickStart = ref(null)
const pickEnd = ref(null)

// dragging state for "tap or drag to mark free slots"
const isDragging = ref(false)
const paintValue = ref(true) // true = marking free, false = unmarking

// ---------- heatmap shades ----------
// One green that gets darker as more people are free: index 0 = nobody ... index 5 = everyone
const shadeColors = ['var(--surface)', '#d8f0df', '#a3dbb3', '#5fbf80', '#2a8f57', '#0b5d3b']

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
const tabStop = computed(() =>
  visibleDays.value.some((day) => focusedSlot.value?.startsWith(day))
    ? focusedSlot.value
    : makeKey(visibleDays.value[0], times.value[0]),
)
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
const allResponded = computed(
  () => members.value.length > 0 && respondedIds.value.length === members.value.length,
)

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
  () => allResponded.value && (!bestSlot.value || bestSlot.value.count < members.value.length),
)
// Mark tied best slots from the responses so far; everyone-free slots use 🎉 instead.
function isBestSlot(day, t) {
  return bestSlot.value && freeCount(day, t) === bestSlot.value.count
}

// What to print inside a heatmap cell: 📌 first block of the confirmed time, 🎉 everyone,
// ⭐ best slot, otherwise the number of people free
function slotLabel(day, t) {
  if (mode.value !== 'heatmap') return ''
  // 📌 marks the first block of the confirmed group time
  if (group.value.chosen_start && makeKey(day, t) === fromDb(group.value.chosen_start)) return '📌'
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
  group.value.chosen_start ? formatRange(group.value.chosen_start, group.value.chosen_end) : '',
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

async function changeMode(nextMode) {
  if (confirming.value || planning.value) return
  mode.value = nextMode
  await nextTick()
  stepHeading.value?.focus({ preventScroll: true })
  stepHeading.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
function showChosenTime() {
  void changeMode('heatmap')
  goToDay(fromDb(group.value.chosen_start).slice(0, 10))
}
function useWindow(w) {
  if (confirming.value || planning.value) return
  pickStart.value = w.startKey
  pickEnd.value = w.endKey
  actionError.value = ''
  goToDay(w.startKey.slice(0, 10))
}
function clearSelection() {
  pickStart.value = null
  pickEnd.value = null
  actionError.value = ''
}
function durationLabel(start, end) {
  const minutes = (new Date(toDb(end)) - new Date(toDb(start))) / 60000
  const hours = Math.floor(minutes / 60)
  return [
    hours ? hours + (hours === 1 ? ' hour' : ' hours') : '',
    minutes % 60 ? (minutes % 60) + ' minutes' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
const personalSavePending = computed(() => saving.value || !!saveError.value || isDragging.value)
const actionRange = computed(() => {
  if (pickStart.value)
    return pickEnd.value
      ? {
          start: pickStart.value,
          end: nextSlotKey(pickEnd.value),
          label: pickLabel.value,
        }
      : null
  if (!group.value.chosen_start || !group.value.chosen_end) return null
  return {
    start: fromDb(group.value.chosen_start),
    end: fromDb(group.value.chosen_end),
    label: chosenLabel.value,
  }
})
const selectionChanged = computed(
  () =>
    !!pickEnd.value &&
    (pickStart.value !== (group.value.chosen_start && fromDb(group.value.chosen_start)) ||
      nextSlotKey(pickEnd.value) !== (group.value.chosen_end && fromDb(group.value.chosen_end))),
)
const rangeAttendance = computed(() => {
  if (!actionRange.value) return ''
  const { start, end } = actionRange.value
  const keys = times.value
    .map((time) => makeKey(start.slice(0, 10), time))
    .filter((key) => key >= start && key < end)
  const count = members.value.filter(
    (member) => keys.length && keys.every((key) => freeBySlot.value[key]?.includes(member.id)),
  ).length
  if (count === members.value.length && count > 0) return '🎉 Everyone free'
  const best = count > 0 && count === bestSlot.value?.count
  return (best ? '⭐ ' : '') + count + ' of ' + members.value.length + ' free throughout' + (best ? (allResponded.value ? ' · Best available' : ' · Best so far') : '')
})
const budgetLabel = computed(() => 'S$' + (group.value.budget_per_person ?? 0))
const canPlan = computed(
  () => !!actionRange.value && !personalSavePending.value && !confirming.value && !planning.value,
)
const actionLabel = computed(() => {
  if (confirming.value) return 'Saving group time…'
  if (planning.value) return 'Opening itinerary…'
  if (hasPlan.value && !selectionChanged.value) return 'View itinerary'
  if (hasPlan.value && selectionChanged.value) return 'Replace time & rebuild'
  return pickStart.value ? 'Confirm time & build itinerary' : 'Build itinerary'
})

// ---------- loading data from Supabase ----------
async function refreshShared() {
  const request = ++refreshNumber
  const requestedGroup = groupId.value
  const requestedUser = userId.value
  try {
    const [groupResult, memberResult, availabilityResult, planResult] = await requestWithTimeout(
      (signal) =>
        Promise.all([
          supabase
            .from('groups')
            .select('start_date, end_date, chosen_start, chosen_end, budget_per_person')
            .eq('id', requestedGroup)
            .single()
            .abortSignal(signal),
          supabase
            .rpc('get_group_member_names', { p_group_id: requestedGroup })
            .abortSignal(signal),
          supabase
            .from('availability')
            .select('user_id, slot_start')
            .eq('group_id', requestedGroup)
            .abortSignal(signal),
          supabase
            .from('itineraries')
            .select('group_id')
            .eq('group_id', requestedGroup)
            .maybeSingle()
            .abortSignal(signal),
        ]),
    )
    if (
      disposed ||
      request !== refreshNumber ||
      groupId.value !== requestedGroup ||
      userId.value !== requestedUser
    )
      return false
    const failed = [groupResult, memberResult, availabilityResult, planResult].find(
      (result) => result.error,
    )
    if (failed) throw failed.error
    group.value = groupResult.data
    hasPlan.value = !!planResult.data?.group_id
    const outsideDates = (key) => key && !days.value.includes(key.slice(0, 10))
    const removedKeys = Object.keys(mySlots.value).filter(outsideDates)
    for (const key of removedKeys) delete mySlots.value[key]
    const removedPick = outsideDates(pickStart.value) || outsideDates(pickEnd.value)
    if (removedPick) {
      pickStart.value = null
      pickEnd.value = null
    }
    if (removedKeys.length || removedPick)
      datesNotice.value =
        'The group dates changed. Selections outside the new dates were removed. Your remaining selections are kept.'
    members.value = memberResult.data.map((member) => ({
      id: member.id,
      name: member.display_name || 'Member',
    }))
    const memberIds = new Set(members.value.map((member) => member.id))
    allSlots.value = availabilityResult.data
      .map((r) => ({ user_id: r.user_id, key: fromDb(r.slot_start) }))
      .filter(
        (row) =>
          memberIds.has(row.user_id) &&
          days.value.includes(row.key.slice(0, 10)) &&
          times.value.includes(row.key.slice(11)),
      )
    refreshError.value = ''
    return true
  } catch {
    if (!disposed && request === refreshNumber)
      refreshError.value =
        "Couldn't refresh the group's availability. Your selection is still here."
    return false
  }
}

async function loadAll() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data: auth, error } = await supabase.auth.getUser()
    if (error || !auth.user) throw error || new Error('Log in again.')
    userId.value = auth.user.id
    if (!(await refreshShared())) throw new Error('Availability unavailable.')
    if (disposed) return

    // Restore the current member's saved slots.
    const mine = {}
    for (const r of allSlots.value) {
      if (r.user_id === userId.value) mine[r.key] = true
    }
    mySlots.value = mine

    page.value = 0
  } catch {
    errorMsg.value = "Couldn't load availability"
  } finally {
    loading.value = false
  }
}

// ---------- marking my availability (tap or drag) ----------
function slotAccessibleLabel(day, t) {
  const key = makeKey(day, t)
  const status =
    mode.value === 'mine'
      ? mySlots.value[key]
        ? 'Free'
        : 'Not free'
      : `${freeCount(day, t)} of ${members.value.length} free`
  return `${formatDay(day)}, ${formatTime(t)} to ${formatTime(nextSlotKey(key).slice(11))}. ${status}`
}

function moveSlotFocus(event, day, t) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  const dayIndex =
    visibleDays.value.indexOf(day) +
    (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)
  const timeIndex =
    times.value.indexOf(t) + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)
  if (!visibleDays.value[dayIndex] || !times.value[timeIndex]) return
  const key = makeKey(visibleDays.value[dayIndex], times.value[timeIndex])
  event.currentTarget.closest('.avail-grid').querySelector(`[data-testid="slot-${key}"]`).focus()
}

function activateSlot(event, day, t) {
  // Pointer clicks already paint on mousedown; keyboard and assistive clicks have no mouse press.
  if (event.detail !== 0) return
  onCellDown(day, t)
  void onMouseUp()
}

function onCellDown(day, t) {
  if (confirming.value || planning.value) return
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
  refreshNumber += 1
  clearTimeout(refreshTimer)
  if (channel) supabase.removeChannel(channel)
  saveQueued = false
  saveController?.abort()
  confirmController?.abort()
  actionObserver?.disconnect()
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
      const { error } = await requestWithTimeout(
        (signal) =>
          supabase
            .rpc('replace_group_availability', {
              p_group_id: savedGroupId,
              p_slots: keys.map(toDb),
              p_expected_user_id: savedUserId,
            })
            .abortSignal(signal),
        saveController,
      )
      if (disposed || groupId.value !== savedGroupId || userId.value !== savedUserId) return
      if (error) throw error
      refreshNumber += 1
      allSlots.value = allSlots.value
        .filter((row) => row.user_id !== savedUserId)
        .concat(keys.map((key) => ({ user_id: savedUserId, key })))
    } while (saveQueued)
    void refreshShared()
  } catch {
    if (!disposed)
      saveError.value =
        "Couldn't confirm your availability was saved. Your selection is still here. Try again."
  } finally {
    saveController = undefined
    saveQueued = false
    saving.value = false
  }
}

// ---------- picking a slot on the heatmap ----------
// 1st click = start, 2nd click (same day) = end, 3rd click starts over
function pickCell(key) {
  actionError.value = ''
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
async function confirmAndPlan() {
  if (!canPlan.value) return
  actionError.value = ''
  const requestedGroup = groupId.value
  const requestedUser = userId.value
  const range = actionRange.value
  const rebuild = !hasPlan.value || selectionChanged.value
  try {
    if (pickStart.value && selectionChanged.value) {
      confirming.value = true
      confirmController = new AbortController()
      const { data, error } = await requestWithTimeout(
        (signal) =>
          supabase
            .from('groups')
            .update({ chosen_start: toDb(range.start), chosen_end: toDb(range.end) })
            .eq('id', requestedGroup)
            .select('chosen_start, chosen_end')
            .single()
            .abortSignal(signal),
        confirmController,
      )
      if (error) throw error
      if (disposed || groupId.value !== requestedGroup || user.value?.id !== requestedUser) return
      refreshNumber += 1
      group.value = { ...group.value, ...data }
      hasPlan.value = false
      clearSelection()
    }
    if (disposed || groupId.value !== requestedGroup || user.value?.id !== requestedUser) return
    confirming.value = false
    planning.value = true
    await router.push({
      name: 'group-itinerary',
      params: { id: requestedGroup },
      query: rebuild ? { replan: '1' } : {},
    })
  } catch {
    if (!disposed)
      actionError.value = confirming.value
        ? "Couldn't save the group time. Your selection is still here. Try again."
        : "Your group time is saved, but the itinerary couldn't open. Try again."
  } finally {
    confirming.value = false
    planning.value = false
    confirmController = undefined
  }
}

// ---------- no overlap: extend the date range by one day ----------
async function extendDateRange() {
  const last = days.value[days.value.length - 1]
  const newEnd = new Date(new Date(last + 'T00:00:00Z').getTime() + 86400000)
    .toISOString()
    .slice(0, 10)
  const { error } = await supabase
    .from('groups')
    .update({ end_date: newEnd })
    .eq('id', groupId.value)
  if (error) {
    actionError.value = "Couldn't extend the date range"
    return
  }
  group.value = { ...group.value, end_date: newEnd }
  goToDay(newEnd)
}

function queueRefresh(payload) {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new
  const changedGroup = payload.table === 'groups' ? row?.id : row?.group_id
  if (changedGroup && changedGroup !== groupId.value) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshShared, 50)
}

onMounted(async () => {
  await loadAll()
  if (disposed) return
  channel = supabase.channel('group-availability-' + groupId.value, {
    config: { postgres_changes_options: { wait: true } },
  })
  for (const table of ['availability', 'group_members', 'groups']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, queueRefresh)
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') void refreshShared()
    if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !disposed)
      refreshError.value = 'Live updates disconnected. Try again to refresh the group.'
  })
})
</script>

<style scoped>
.flow-controls {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.step-intro,
.suggestions {
  margin-bottom: 1.25rem;
}
.step-intro h3 {
  scroll-margin-top: calc(var(--navbar-height, 86px) + 16px);
}
.availability-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  align-items: start;
  gap: 24px;
}
.availability-main {
  min-width: 0;
}
.flow-action {
  position: sticky;
  top: calc(var(--navbar-height, 86px) + 16px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-wrap: anywhere;
}
.window-chip[aria-pressed='true'] {
  background: var(--ink);
  color: var(--on-ink);
  border-color: var(--ink);
}
@media (max-width: 991.98px) {
  .availability-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .availability-tab:has(.flow-action) {
    padding-bottom: calc(var(--action-height) + 24px);
  }
  .flow-action {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1010;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: 12px 16px;
    gap: 8px;
    max-height: 50svh;
    overflow-y: auto;
    box-shadow: var(--shadow-float);
  }
  .slot {
    scroll-margin-bottom: calc(var(--navbar-height, 61px) + var(--action-height) + 16px);
  }
}
@media (max-width: 767.98px) {
  .step-intro h3 {
    scroll-margin-top: 16px;
  }
  .flow-action {
    bottom: var(--navbar-height, 61px);
  }
  .mode-toggle {
    display: flex;
  }
  .mode-option {
    flex: 1;
    padding: 6px 8px;
  }
}
/* Scroll sideways if the group has many days; the grid also fades in when it appears */
.grid-scroll {
  overflow-x: auto;
  user-select: none;
  animation: fade-in 0.4s ease;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* CSS Grid: one narrow time column + one column per day (--cols is set from the template) */
.avail-grid {
  --slot-height: 24px;
  display: grid;
  grid-template-columns: 3.5rem repeat(var(--cols), minmax(3.5rem, 1fr));
}

.time-col,
.day-col {
  display: grid;
  grid-template-rows: 2rem;
  grid-auto-rows: var(--slot-height);
  row-gap: 2px;
}

.head-cell {
  height: 2rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
}

.time-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 0.7rem;
  text-align: right;
  padding-right: 0.3rem;
}

/* Rounded, soft cells that smoothly change colour */
.slot {
  padding: 0;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background-color: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    transform 0.1s ease,
    box-shadow 0.1s ease;
}

@media (max-width: 767.98px) {
  .avail-grid {
    --slot-height: 44px;
  }
}
/* Hover: the slot lifts up a little */
.slot:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-sm);
  position: relative;
  z-index: 1;
}

/* Marking a slot free: it "pops" in */
.slot-free {
  background-color: #198754;
  animation: pop 0.25s ease;
}
@keyframes pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* Everyone free: thick gold line on the left (joins up into one long line for consecutive slots) + a pulsing glow */
.slot-all {
  border-left: 4px solid #ffc107;
  animation: glow 1.8s ease-in-out infinite;
}
@keyframes glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 193, 7, 0);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(255, 193, 7, 0.9);
  }
}

/* The range being picked */
.slot-picked {
  outline: 3px solid var(--ink);
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

/* Chosen time and "everyone is free" messages */
.status-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
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
  min-height: 44px;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.875rem;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.window-chip:not([aria-pressed='true']):hover {
  background: var(--surface-2);
}

.mode-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.mode-option {
  min-height: 44px;
  padding: 6px 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.mode-option:hover {
  background: var(--surface-2);
}

.mode-option.active {
  background: var(--ink);
  color: var(--on-ink);
}

/* The grid, legend and slot picker share one card, like the activity cards */
.avail-card {
  padding: 16px;
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
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
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

/* The time the group already confirmed: a solid gold frame around every block in the range
   (the 📌 sits on its first block) */
.slot-chosen {
  outline: 3px solid #ffc107;
  outline-offset: -2px;
}

/* Your current pick must still show on top of the gold frame */
.slot-picked,
.slot-picked.slot-chosen {
  outline: 3px solid var(--ink);
  outline-offset: -2px;
}

/* Legend swatches (same colours as the heatmap) */
.swatch {
  width: 1.4rem;
  height: 0.9rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line);
}

/* Accessibility: turn animations off for people who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .slot,
  .slot-free,
  .slot-all,
  .grid-scroll,
  .window-chip,
  .mode-option {
    animation: none;
    transition: none;
  }
}
</style>