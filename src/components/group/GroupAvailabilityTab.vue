<template>
  <div
    class="availability-tab"
    :style="{ '--action-height': actionHeight + 'px' }"
    data-testid="group-availability-tab"
  >
    <!-- Icons used on the grid, legend and status lines -->
    <svg class="icon-sprite" aria-hidden="true" focusable="false">
      <symbol id="avail-icon-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></symbol>
      <symbol id="avail-icon-star" viewBox="0 0 24 24">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
      </symbol>
      <symbol id="avail-icon-pin" viewBox="0 0 24 24">
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </symbol>
    </svg>
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
      <div class="tab-intro">
        <div class="intro-text">
          <h2
            ref="stepHeading"
            tabindex="-1"
            class="h5 fw-bold mb-1"
            data-testid="availability-step-heading"
          >
            {{ mode === 'mine' ? 'When are you free?' : 'Choose a time for the outing' }}
          </h2>
          <p class="text-secondary mb-0">
            {{
              mode === 'mine'
                ? (isTouch ? 'Tap' : 'Tap or drag') +
                  " the times you're free, or tap a date for the whole day. Saves automatically."
                : 'Darker blocks have more people free.'
            }}
          </p>
        </div>
        <div class="mode-toggle" role="group" aria-label="Availability steps">
          <button
            type="button"
            class="mode-option"
            :class="{ active: mode === 'mine' }"
            :aria-pressed="mode === 'mine'"
            data-testid="mode-mine"
            @click="changeMode('mine')"
          >
            <span aria-hidden="true">1.</span> Your times
          </button>
          <button
            type="button"
            class="mode-option"
            :class="{ active: mode === 'heatmap' }"
            :aria-pressed="mode === 'heatmap'"
            data-testid="mode-heatmap"
            @click="changeMode('heatmap')"
          >
            <span aria-hidden="true">2.</span> Group time
          </button>
        </div>
      </div>

      <!-- Who has added times: one count, one row of names -->
      <div class="responses">
        <span class="small text-secondary" data-testid="availability-response-count">
          {{ respondedIds.length }} of {{ members.length }} have added times
        </span>
        <ul class="responded-list" data-testid="responded-list">
          <li v-for="m in members" :key="m.id" :class="{ done: respondedIds.includes(m.id) }">
            <AnimalAvatar v-if="m.animal" :animal="m.animal" :size="20" decorative />
            <span v-else class="member-initial" aria-hidden="true">{{ m.name.charAt(0) }}</span>
            {{ m.name }}
            <svg v-if="respondedIds.includes(m.id)" class="done-icon" aria-hidden="true">
              <use href="#avail-icon-check" />
            </svg>
            <span v-else class="visually-hidden">, not added yet</span>
          </li>
        </ul>
      </div>

      <div v-if="group.chosen_start" class="status-banner chosen" data-testid="chosen-slot">
        <svg aria-hidden="true"><use href="#avail-icon-pin" /></svg>
        <span>
          Confirmed:
          <button type="button" class="btn btn-link chosen-link p-0" @click="showChosenTime">
            {{ chosenLabel }}
          </button>
          <span v-if="hasPlan"> · Itinerary ready</span>
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
        <h3 class="h6 fw-bold mb-2">Times everyone can make</h3>
        <div class="d-flex flex-wrap gap-2">
          <button
            v-for="w in fullWindows"
            :key="w.startKey"
            type="button"
            class="window-chip"
            :aria-pressed="pickStart === w.startKey && pickEnd === w.endKey"
            @click="useWindow(w)"
          >
            {{ w.label }}
            <span class="d-block small chip-duration">{{
              durationLabel(w.startKey, nextSlotKey(w.endKey))
            }}</span>
          </button>
        </div>
      </div>
      <div
        v-if="mode === 'heatmap' && noOverlap"
        class="alert alert-warning no-overlap"
        data-testid="no-overlap"
      >
        <p class="mb-2">
          <strong>No time works for everyone.</strong>
          <span v-if="bestSlot">
            The best blocks have {{ bestSlot.count }} of {{ members.length }} people free. Pick one
            of those, or add another day.</span
          >
        </p>
        <button
          v-if="!extendStep"
          type="button"
          class="btn btn-sm btn-outline-dark rounded-pill px-3"
          data-testid="extend-range"
          @click="extendStep = 'confirm'"
        >
          Add a day
        </button>
        <div v-else class="d-flex flex-wrap align-items-center gap-2" data-testid="extend-confirm">
          <span>Add {{ nextDayLabel }} to the group's dates? Everyone will see it.</span>
          <button
            type="button"
            class="btn btn-sm btn-dark rounded-pill px-3"
            :disabled="extendStep === 'saving'"
            data-testid="extend-range-confirm"
            @click="extendDateRange"
          >
            {{ extendStep === 'saving' ? 'Adding…' : 'Add ' + nextDayLabel }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-link text-body p-0"
            :disabled="extendStep === 'saving'"
            @click="cancelExtend"
          >
            Cancel
          </button>
        </div>
        <p v-if="extendError" class="text-danger small mt-2 mb-0" role="alert">
          {{ extendError }}
        </p>
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
            <p id="availability-keyboard-help" class="visually-hidden">
              Arrow keys move, Enter selects.
              <template v-if="mode === 'mine'">
                From the first row, press Arrow Up to reach the date and mark the whole day.
              </template>
              <template v-else>Select the first and last block on the same day.</template>
            </p>
            <div class="grid-scroll" data-testid="availability-grid">
              <div
                class="avail-grid"
                role="group"
                aria-label="Availability slots"
                aria-describedby="availability-keyboard-help"
                :style="{ '--cols': visibleDays.length }"
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
                  <button
                    v-if="mode === 'mine'"
                    type="button"
                    class="head-cell day-toggle"
                    tabindex="-1"
                    :aria-label="dayToggleLabel(day)"
                    :data-testid="'day-head-' + day"
                    @click="toggleDay(day)"
                    @keydown="moveHeadFocus($event, day)"
                  >
                    {{ formatDay(day) }}
                  </button>
                  <div v-else class="head-cell">{{ formatDay(day) }}</div>
                  <button
                    v-for="t in times"
                    :key="t"
                    type="button"
                    class="slot"
                    :class="{
                      'slot-free': mode === 'mine' && mySlots[makeKey(day, t)],
                      'slot-pop': mode === 'mine' && popKeys[makeKey(day, t)],
                      'slot-picked': mode === 'heatmap' && isInPick(makeKey(day, t)),
                      'slot-chosen': isChosen(makeKey(day, t)),
                    }"
                    :style="cellStyle(day, t)"
                    :data-testid="'slot-' + makeKey(day, t)"
                    :data-mark="slotMark(day, t) || undefined"
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
                    <svg v-if="slotMark(day, t) === 'pin'" class="cell-icon" aria-hidden="true">
                      <use href="#avail-icon-pin" />
                    </svg>
                    <svg
                      v-else-if="slotMark(day, t) === 'all'"
                      class="cell-icon cell-icon-bold"
                      aria-hidden="true"
                    >
                      <use href="#avail-icon-check" />
                    </svg>
                    <svg
                      v-else-if="slotMark(day, t) === 'best'"
                      class="cell-icon icon-fill"
                      aria-hidden="true"
                    >
                      <use href="#avail-icon-star" />
                    </svg>
                    <template v-else>{{ slotCount(day, t) }}</template>
                  </button>
                </div>
              </div>
            </div>
            <div
              v-if="mode === 'heatmap'"
              class="legend small text-secondary"
              data-testid="heatmap-legend"
            >
              <span class="legend-item">
                Nobody
                <span
                  v-for="(c, i) in shadeColors"
                  :key="c"
                  class="swatch"
                  :style="{ backgroundColor: c }"
                >
                  <svg
                    v-if="i === shadeColors.length - 1"
                    class="cell-icon cell-icon-bold"
                    aria-hidden="true"
                  >
                    <use href="#avail-icon-check" />
                  </svg>
                </span>
                Everyone free
              </span>
              <span class="legend-item">Numbers show how many are free</span>
              <span class="legend-item">
                <svg class="icon-fill" aria-hidden="true"><use href="#avail-icon-star" /></svg>
                Most free
              </span>
              <span v-if="group.chosen_start" class="legend-item">
                <svg aria-hidden="true"><use href="#avail-icon-pin" /></svg>
                Confirmed
              </span>
            </div>
          </div>
        </div>
        <section
          ref="actionPanel"
          class="flow-action surface-card"
          aria-label="Next step"
          data-testid="availability-action"
        >
          <div
            v-if="mode === 'heatmap'"
            class="action-summary"
            aria-live="polite"
            aria-atomic="true"
          >
            <template v-if="pickStart && !pickEnd">
              <h3 class="h6 fw-bold mb-1">
                Starts {{ formatDay(pickStart.slice(0, 10)) }} at
                {{ formatTime(pickStart.slice(11)) }}
              </h3>
              <p class="small text-secondary mb-0">
                {{ isTouch ? 'Now tap the last block' : 'Now tap or drag to the last block' }}
                (same day).
              </p>
            </template>
            <template v-else-if="pickStart && actionRange">
              <h3 class="h6 fw-bold mb-1">{{ actionRange.label }}</h3>
              <p class="small mb-0">
                {{ durationLabel(actionRange.start, actionRange.end) }} · {{ rangeAttendance }}
                <span class="text-secondary text-nowrap">· Not confirmed yet</span>
              </p>
            </template>
            <template v-else-if="actionRange">
              <h3 class="h6 fw-bold mb-1">Confirmed time</h3>
              <p class="small mb-1">
                {{ durationLabel(actionRange.start, actionRange.end) }} · {{ rangeAttendance }}
              </p>
              <p class="small text-secondary mb-0">Pick new blocks to change it.</p>
            </template>
            <template v-else>
              <h3 class="h6 fw-bold mb-1">No time picked yet</h3>
              <p class="small text-secondary mb-0">
                {{
                  isTouch
                    ? 'Tap the first block, then the last.'
                    : 'Drag across blocks, or tap the first and last.'
                }}
              </p>
            </template>
          </div>
          <p
            v-if="mode === 'heatmap' && inspect"
            class="slot-info small mb-0"
            :class="{ 'has-range': !!pickEnd }"
            data-testid="slot-info"
          >
            <strong>{{ inspect.label }}</strong> · {{ inspect.free }} of {{ inspect.total }} free
            <span v-if="inspect.missing.length" class="d-block text-secondary"
              >Not free: {{ inspect.missing.join(', ') }}</span
            >
          </p>
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
          <template v-else-if="mode === 'mine'">
            <p
              v-if="Object.keys(mySlots).length"
              class="small mb-0 save-status"
              data-testid="availability-save-status"
            >
              <svg aria-hidden="true"><use href="#avail-icon-check" /></svg>
              Your availability is saved.
            </p>
            <p v-else class="small text-secondary mb-0">You haven't added any times yet.</p>
          </template>
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
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import { findProfileAnimal } from '@/data/profileAnimals'

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
// On touch screens a drag scrolls the page instead of painting, so the copy says "tap" only
const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false
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
const popKeys = ref({}) // slots just marked free, so only they play the "pop" animation
// dragging state for picking a range on the heatmap (nothing renders from these directly)
let isPicking = false
let pickAnchor = null // the block the drag started from
let pickFromPending = false // the drag started as the "last block" tap of a pending pick

// "Add a day" when no time works for everyone: '' | 'confirm' | 'saving'
const extendStep = ref('')
const extendError = ref('')

// ---------- heatmap shades ----------
// One green that gets darker as more people are free: index 0 = nobody ... index 5 = everyone.
// The greens are defined once in <style> as --heat-1 ... --heat-5.
const shadeColors = [
  'var(--surface)',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
  'var(--heat-5)',
]

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
    color: level >= 4 ? 'var(--heat-text-on-dark)' : 'var(--heat-text)', // light text on dark shades
  }
}
// Info for the hovered or tapped slot: "Fri 30 Oct, 10am · 4 of 5 free" + who is missing
const inspect = computed(() => {
  if (!hoveredKey.value) return null
  const freeIds = freeBySlot.value[hoveredKey.value] || []
  return {
    label: formatDay(hoveredKey.value.slice(0, 10)) + ', ' + formatTime(hoveredKey.value.slice(11)),
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
// The count that earns a star. A "best" of 1 person would star every block anyone marked,
// so stars only start once 2 or more people overlap.
const bestCount = computed(() => (bestSlot.value?.count >= 2 ? bestSlot.value.count : 0))
// Mark tied best slots from the responses so far; everyone-free slots get a tick instead.
function isBestSlot(day, t) {
  return bestCount.value > 0 && freeCount(day, t) === bestCount.value
}

// Which icon a heatmap cell shows: 'pin' = first block of the confirmed time,
// 'all' = everyone free, 'best' = most free so far, '' = just the number
function slotMark(day, t) {
  if (mode.value !== 'heatmap') return ''
  if (group.value.chosen_start && makeKey(day, t) === fromDb(group.value.chosen_start)) return 'pin'
  if (freeCount(day, t) === 0) return ''
  if (isEveryoneFree(day, t)) return 'all'
  if (isBestSlot(day, t)) return 'best'
  return ''
}
// The number printed in a heatmap cell with no icon (blank when nobody is free)
function slotCount(day, t) {
  if (mode.value !== 'heatmap') return ''
  return freeCount(day, t) || ''
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
  if (count === members.value.length && count > 0) return 'Everyone free'
  const best = count > 0 && count === bestCount.value
  const bestNote = best ? (allResponded.value ? ' · Best available' : ' · Best so far') : ''
  return count + ' of ' + members.value.length + ' free throughout' + bestNote
})
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
      animal: findProfileAnimal(member.avatar_animal)?.id || '',
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
  const marks = { pin: '. Confirmed time starts here', all: '. Everyone free', best: '. Most free' }
  const status =
    mode.value === 'mine'
      ? mySlots.value[key]
        ? 'Free'
        : 'Not free'
      : `${freeCount(day, t)} of ${members.value.length} free${marks[slotMark(day, t)] || ''}`
  return `${formatDay(day)}, ${formatTime(t)} to ${formatTime(nextSlotKey(key).slice(11))}. ${status}`
}

function focusInGrid(event, testid) {
  event.currentTarget.closest('.avail-grid').querySelector(`[data-testid="${testid}"]`)?.focus()
}
function moveSlotFocus(event, day, t) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  const dayIndex =
    visibleDays.value.indexOf(day) +
    (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)
  const timeIndex =
    times.value.indexOf(t) + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)
  // Arrow Up from the first row reaches the date button, which marks the whole day
  if (timeIndex < 0 && mode.value === 'mine') return focusInGrid(event, 'day-head-' + day)
  if (!visibleDays.value[dayIndex] || !times.value[timeIndex]) return
  focusInGrid(event, 'slot-' + makeKey(visibleDays.value[dayIndex], times.value[timeIndex]))
}
function moveHeadFocus(event, day) {
  if (!['ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'ArrowDown') return focusInGrid(event, 'slot-' + makeKey(day, times.value[0]))
  const next =
    visibleDays.value[visibleDays.value.indexOf(day) + (event.key === 'ArrowRight' ? 1 : -1)]
  if (next) focusInGrid(event, 'day-head-' + next)
}

// ---------- whole-day toggle (tap a date in step 1) ----------
function dayIsAllFree(day) {
  return times.value.every((t) => mySlots.value[makeKey(day, t)])
}
function dayToggleLabel(day) {
  return dayIsAllFree(day) ? `Clear all of ${formatDay(day)}` : `Mark all of ${formatDay(day)} free`
}
function toggleDay(day) {
  if (confirming.value || planning.value) return
  paintValue.value = !dayIsAllFree(day)
  for (const t of times.value) paint(makeKey(day, t))
  void saveMySlots()
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
    startPick(key)
  }
}
function onCellEnter(day, t) {
  const key = makeKey(day, t)
  if (mode.value === 'mine' && isDragging.value) paint(key)
  if (mode.value === 'heatmap') {
    hoveredKey.value = key
    if (isPicking) dragPick(key)
  }
}
function paint(key) {
  if (paintValue.value) {
    if (mySlots.value[key]) return
    mySlots.value[key] = true
    // Only freshly marked blocks pop, not every free block when you come back to step 1
    popKeys.value[key] = true
    setTimeout(() => delete popKeys.value[key], 300)
  } else delete mySlots.value[key]
}
// When the mouse is released anywhere, stop dragging and save
async function onMouseUp() {
  isPicking = false
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

// ---------- picking a range on the heatmap ----------
// Drag across blocks on one day, or tap the first block then the last.
// A tap after a finished range (or on another day) starts a new pick.
function startPick(key) {
  actionError.value = ''
  isPicking = true
  pickFromPending =
    !!pickStart.value && !pickEnd.value && pickStart.value.slice(0, 10) === key.slice(0, 10)
  if (pickFromPending) {
    pickAnchor = pickStart.value
    dragPick(key)
  } else {
    pickAnchor = key
    pickStart.value = key
    pickEnd.value = null
  }
}
function dragPick(key) {
  if (key.slice(0, 10) !== pickAnchor.slice(0, 10)) return // a range stays on one day
  if (key === pickAnchor && !pickFromPending) {
    // dragged back to where it started: still waiting for the last block
    pickStart.value = key
    pickEnd.value = null
    return
  }
  pickStart.value = key < pickAnchor ? key : pickAnchor
  pickEnd.value = key < pickAnchor ? pickAnchor : key
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

// ---------- no overlap: add one day to the group's dates (after confirming) ----------
const nextDay = computed(() => {
  const last = days.value[days.value.length - 1]
  if (!last) return ''
  return new Date(new Date(last + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
})
const nextDayLabel = computed(() => (nextDay.value ? formatDay(nextDay.value) : ''))
function cancelExtend() {
  extendStep.value = ''
  extendError.value = ''
}
async function extendDateRange() {
  const newEnd = nextDay.value
  if (!newEnd) return
  extendStep.value = 'saving'
  extendError.value = ''
  const { error } = await supabase
    .from('groups')
    .update({ end_date: newEnd })
    .eq('id', groupId.value)
  if (disposed) return
  if (error) {
    extendStep.value = 'confirm'
    extendError.value = `Couldn't add ${formatDay(newEnd)}. Try again.`
    return
  }
  extendStep.value = ''
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
/* Heatmap greens: one green that darkens as more people are free. These carry meaning, so they
   stay the same in light and dark mode (see DESIGN.md). Text on them is fixed for the same reason. */
.availability-tab {
  --heat-1: #d8f0df;
  --heat-2: #a3dbb3;
  --heat-3: #5fbf80;
  --heat-4: #2a8f57;
  --heat-5: #0b5d3b;
  --heat-text: #111219;
  --heat-text-on-dark: #ffffff;
}

.flow-controls {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}

/* Step heading on the left, step switch on the right (stacks on phones) */
.tab-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.tab-intro h2 {
  scroll-margin-top: calc(var(--navbar-height, 86px) + 16px);
}
.suggestions {
  margin-bottom: 1.25rem;
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
  /* On touch, tapping is picking, so once a full range is picked the range's own
     attendance line already says who can come. Keep the bottom sheet short. */
  .slot-info.has-range {
    display: none;
  }
}
@media (max-width: 767.98px) {
  .tab-intro {
    flex-direction: column;
  }
  .tab-intro h2 {
    scroll-margin-top: 16px;
  }
  .flow-action {
    bottom: var(--navbar-height, 61px);
  }
  .mode-toggle {
    display: flex;
    align-self: stretch;
  }
  .mode-option {
    flex: 1;
    padding: 6px 8px;
  }
}
/* Scroll sideways if the group has many days; the grid also fades in when it first appears */
.grid-scroll {
  overflow-x: auto;
  user-select: none;
  animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
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
  --head-height: 2rem;
  display: grid;
  grid-template-columns: 3.5rem repeat(var(--cols), minmax(3.5rem, 1fr));
}

.time-col,
.day-col {
  display: grid;
  grid-template-rows: var(--head-height);
  grid-auto-rows: var(--slot-height);
  row-gap: 2px;
}

.head-cell {
  height: var(--head-height);
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
}

/* In step 1 the date is a button that marks the whole day */
.day-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
  padding: 0 2px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink);
  line-height: 1.1;
  text-decoration: underline dotted var(--line-strong);
  text-underline-offset: 3px;
  transition: background-color 0.2s ease;
}
.day-toggle:hover {
  background: var(--surface-2);
  text-decoration-color: currentColor;
}

.time-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
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
  font-variant-numeric: tabular-nums;
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
    --head-height: 2.75rem;
  }
}
/* Hover: the slot lifts up a little (mouse only, so a tapped block on a phone doesn't stay lifted) */
@media (hover: hover) {
  .slot:not(.slot-picked, .slot-chosen):hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-sm);
    position: relative;
    z-index: 1;
  }
}

/* Your free time in step 1 uses the same green family as the heatmap */
.slot-free {
  background-color: var(--heat-4);
  border-color: var(--heat-4);
}
/* Only a block you just marked "pops" in */
.slot-pop {
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

/* Icons inside cells and the legend */
.availability-tab .icon-sprite {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
.availability-tab .cell-icon {
  width: 12px;
  height: 12px;
}
.availability-tab .cell-icon-bold {
  stroke-width: 3.5;
}
.availability-tab .icon-fill {
  fill: currentColor;
}

/* The group's confirmed time: a solid ink frame on every block (the pin sits on the first) */
/* Both frames sit on a thin card-coloured inner ring, so they stay visible on the darkest greens */
.slot-chosen {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
  box-shadow: inset 0 0 0 3px var(--surface);
}

/* The range you're picking: a dashed ink frame, drawn over the confirmed frame */
.slot-picked,
.slot-picked.slot-chosen {
  outline: 2px dashed var(--ink);
  outline-offset: -2px;
  box-shadow: inset 0 0 0 3px var(--surface);
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

/* Who has added times: one compact row of names */
.responses {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 1.25rem;
}

.responded-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.responded-list li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 10px 3px 4px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: 0.8125rem;
}

.responded-list li.done {
  border: 1px solid var(--bs-success-border-subtle);
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
  font-weight: 600;
}

.availability-tab .done-icon {
  width: 14px;
  height: 14px;
  stroke-width: 3;
}

.member-initial {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--ink);
  font-size: 0.7rem;
  font-weight: 700;
}

/* Confirmed time */
.status-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 1rem;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.status-banner.chosen {
  border-color: var(--bs-success-border-subtle);
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}

.status-banner.chosen svg {
  margin-top: 3px;
}

.chosen-link {
  color: inherit;
  font-weight: 700;
  vertical-align: baseline;
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

.chip-duration {
  font-weight: 500;
  opacity: 0.8;
}

/* "Your availability" / "Choose group time" switch, styled like the category chips */
.mode-toggle {
  display: inline-flex;
  flex-shrink: 0;
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
  background: var(--surface-3);
}

.mode-option.active {
  background: var(--ink);
  color: var(--on-ink);
}

/* The grid and legend share one card, like the activity cards */
.avail-card {
  padding: 16px;
}

/* Legend under the heatmap */
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-top: 12px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 0.9rem;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line);
  color: var(--heat-text-on-dark);
}
.legend-item .swatch + .swatch {
  margin-left: -4px;
}

.plan-button {
  min-height: 52px;
}

/* Accessibility: turn animations off for people who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  .slot,
  .slot-pop,
  .grid-scroll,
  .window-chip,
  .mode-option,
  .day-toggle {
    animation: none;
    transition: none;
  }
}
</style>
