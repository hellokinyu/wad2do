<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import { findStation, findStationInDirection, mrtStations } from '@/data/mrtStations'
import { lrtStops } from '@/data/lrtStops'

const props = defineProps({
  modelValue: { type: String, default: null },
  // The home area chosen without a station, so the summary chip can still show it
  area: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const id = useId()

// Half size is the smallest level where station labels are readable and markers are 24px
const zoomLevels = [0.25, 0.5, 0.75, 1]
const zoom = ref(0.5)
const viewport = ref(null)
const canvas = ref(null)
const imageFailed = ref(false)
const showInfo = ref(false)
const selected = computed(() => findStation(props.modelValue))

function selectStation(value) {
  if (!props.disabled) emit('update:modelValue', value || null)
}

// ---------- Search ----------
const query = ref('')
const activeIndex = ref(0)
const searchFocused = ref(false)

function normalise(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const searchIndex = [
  ...mrtStations.map((station) => ({
    key: 'mrt-' + station.id,
    station,
    label: station.name,
    terms: [normalise(station.name), ...station.codes.map(normalise)],
  })),
  ...lrtStops.map((stop) => ({
    key: 'lrt-' + normalise(stop.name),
    station: findStation(stop.stationId),
    label: stop.name,
    via: stop.name + ' LRT',
    terms: [normalise(stop.name)],
  })),
].filter((entry) => entry.station)

const results = computed(() => {
  const term = normalise(query.value)
  if (!term) return []
  const ranked = []
  for (const entry of searchIndex) {
    // An exact name or code ("EW2") beats one that only starts the same way ("EW27")
    const exact = entry.terms.includes(term)
    const starts = exact || entry.terms.some((value) => value.startsWith(term))
    const contains = starts || entry.terms.some((value) => value.includes(term))
    if (contains) ranked.push({ ...entry, rank: exact ? 0 : starts ? 1 : 2 })
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).slice(0, 6)
})
const showResults = computed(() => searchFocused.value && results.value.length > 0)

function choose(result) {
  if (!result) return
  selectStation(result.station.id)
  query.value = ''
  activeIndex.value = 0
  // Search is where people go when they can't find it, so bring the station into view
  if (zoom.value < 0.5) zoom.value = 0.5
  revealStation(result.station)
}

function onSearchKey(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!results.value.length) return
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + step + results.value.length) % results.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    // Stop the page's own Enter-to-continue from running as well
    event.stopPropagation()
    choose(results.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    query.value = ''
  }
}

function onSearchInput() {
  activeIndex.value = 0
}

// ---------- Map ----------
function canvasWidth() {
  return canvas.value?.clientWidth || 0
}

async function revealStation(station = selected.value || findStation('dhoby-ghaut')) {
  await nextTick()
  const container = viewport.value
  if (!container || !canvas.value || imageFailed.value || !station) return
  const width = canvasWidth()
  container.scrollTo({
    left: (station.x / 100) * width - container.clientWidth / 2,
    top: ((station.y / 100) * width * 1007) / 1410 - container.clientHeight / 2,
  })
}

// Zooming keeps whatever is in the middle of the map in the middle, instead of jumping
async function setZoom(next) {
  const container = viewport.value
  const level = Math.min(1, Math.max(0.25, next))
  if (level === zoom.value) return
  const width = canvasWidth()
  const centreX =
    container && width ? (container.scrollLeft + container.clientWidth / 2) / width : 0.5
  const centreY =
    container && width ? (container.scrollTop + container.clientHeight / 2) / width : 0.35
  zoom.value = level
  await nextTick()
  if (!container) return
  const newWidth = canvasWidth()
  container.scrollTo({
    left: centreX * newWidth - container.clientWidth / 2,
    top: centreY * newWidth - container.clientHeight / 2,
  })
}

function zoomBy(direction) {
  const index = zoomLevels.indexOf(zoom.value)
  setZoom(zoomLevels[Math.min(zoomLevels.length - 1, Math.max(0, index + direction))])
}

// A tap anywhere near a station picks the closest one, so the hit area is about 44px across
// even when the visible markers are smaller and close together
const tapRadius = 22
function pickFromTap(event) {
  if (props.disabled) return
  const marker = event.target.closest?.('[data-station-id]')
  if (marker) {
    selectStation(marker.dataset.stationId)
    return
  }
  const bounds = canvas.value.getBoundingClientRect()
  let closest = null
  let closestDistance = tapRadius
  for (const station of mrtStations) {
    const dx = bounds.left + (station.x / 100) * bounds.width - event.clientX
    const dy = bounds.top + (station.y / 100) * bounds.height - event.clientY
    const distance = Math.hypot(dx, dy)
    if (distance < closestDistance) {
      closest = station
      closestDistance = distance
    }
  }
  if (closest) selectStation(closest.id)
}

// Two-finger pinch steps through the zoom levels
let pinchStart = 0
function touchDistance(touches) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  )
}
function onTouchStart(event) {
  if (event.touches.length === 2) pinchStart = touchDistance(event.touches)
}
function onTouchMove(event) {
  if (event.touches.length !== 2 || !pinchStart || props.disabled) return
  const ratio = touchDistance(event.touches) / pinchStart
  if (ratio > 1.25 || ratio < 0.8) {
    zoomBy(ratio > 1 ? 1 : -1)
    pinchStart = touchDistance(event.touches)
  }
}
function onTouchEnd() {
  pinchStart = 0
}

function moveStationFocus(event) {
  if (props.disabled) return
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return
  event.preventDefault()
  const currentId = event.target.dataset.stationId || selected.value?.id || 'dhoby-ghaut'
  let next = findStationInDirection(currentId, event.key)
  if (event.key === 'Home') next = mrtStations[0]
  if (event.key === 'End') next = mrtStations[mrtStations.length - 1]
  viewport.value.querySelector(`[data-station-id="${next.id}"]`).focus()
}

let resizeObserver
onMounted(() => {
  revealStation()
  if (!viewport.value) return
  resizeObserver = new ResizeObserver(() => revealStation())
  resizeObserver.observe(viewport.value)
})
function closeInfoOnOutside(event) {
  if (showInfo.value && !event.target.closest('.map-info')) showInfo.value = false
}
function closeInfoOnEscape(event) {
  if (event.key === 'Escape') showInfo.value = false
}
onMounted(() => {
  document.addEventListener('click', closeInfoOnOutside)
  document.addEventListener('keydown', closeInfoOnEscape)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('click', closeInfoOnOutside)
  document.removeEventListener('keydown', closeInfoOnEscape)
})
</script>

<template>
  <div class="mrt-picker" data-testid="mrt-picker">
    <div class="mrt-search">
      <label :for="id + '-search'" class="form-label fw-semibold">Find your station</label>
      <div class="search-box">
        <input
          :id="id + '-search'"
          v-model="query"
          type="search"
          class="form-control"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="showResults"
          :aria-controls="id + '-results'"
          :aria-activedescendant="showResults ? id + '-result-' + activeIndex : undefined"
          autocomplete="off"
          placeholder="e.g. Tampines, EW2 or Cheng Lim"
          :disabled="disabled"
          data-testid="mrt-search"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
          @input="onSearchInput"
          @keydown="onSearchKey"
        />
        <ul
          v-show="showResults"
          :id="id + '-results'"
          class="search-results"
          role="listbox"
          aria-label="Matching stations"
        >
          <li
            v-for="(result, index) in results"
            :id="id + '-result-' + index"
            :key="result.key"
            role="option"
            :aria-selected="index === activeIndex"
            :class="{ active: index === activeIndex }"
            data-testid="mrt-search-option"
            @mousedown.prevent="choose(result)"
          >
            <span class="result-name">{{ result.via || result.station.name }}</span>
            <span class="result-detail">
              {{
                result.via
                  ? 'Uses ' + result.station.name + ' MRT'
                  : result.station.codes.join(' · ')
              }}
            </span>
          </li>
        </ul>
      </div>
      <p
        v-if="query.trim() && !results.length"
        class="search-empty"
        role="status"
        data-testid="mrt-search-empty"
      >
        No station called “{{ query.trim() }}”. Check the spelling, or pick your area below.
      </p>
    </div>

    <!-- What's picked sits above the map, where it's seen, rather than below it -->
    <div class="selection" role="status" data-testid="mrt-confirmation">
      <p class="mb-0">
        <template v-if="selected">
          Starting from
          <strong
            >{{ selected.name }} MRT ·
            <span class="codes">{{ selected.codes.join(' / ') }}</span></strong
          >
        </template>
        <template v-else-if="area">
          Starting around <strong>{{ area }}</strong>
        </template>
        <template v-else>Search, or tap your station on the map.</template>
      </p>
      <button
        v-if="selected || area"
        type="button"
        class="clear-btn"
        :disabled="disabled"
        data-testid="mrt-clear"
        @click="selectStation(null)"
      >
        Clear
      </button>
    </div>

    <template v-if="!imageFailed">
      <div class="map-tools">
        <div
          class="zoom"
          role="group"
          aria-label="Map zoom"
          :data-zoom="Math.round(zoom * 100)"
          data-testid="mrt-zoom"
        >
          <button
            type="button"
            class="tool-btn"
            aria-label="Zoom out"
            :disabled="disabled || zoom <= 0.25"
            data-testid="mrt-zoom-out"
            @click="zoomBy(-1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 12h12" />
            </svg>
          </button>
          <span class="zoom-level" aria-live="polite" data-testid="mrt-zoom-level"
            >{{ Math.round(zoom * 100) }}%</span
          >
          <button
            type="button"
            class="tool-btn"
            aria-label="Zoom in"
            :disabled="disabled || zoom >= 1"
            data-testid="mrt-zoom-in"
            @click="zoomBy(1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 6v12M6 12h12" />
            </svg>
          </button>
        </div>
        <div class="map-info">
          <button
            type="button"
            class="tool-btn"
            aria-label="How to use the map"
            :aria-expanded="showInfo"
            :aria-controls="id + '-help'"
            data-testid="mrt-info"
            @click="showInfo = !showInfo"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7.5v.01" />
            </svg>
          </button>
          <div
            v-if="showInfo"
            :id="id + '-help'"
            class="info-popover"
            data-testid="mrt-info-popover"
          >
            <ul class="mb-0 ps-3">
              <li>Search for your station, or tap it on the map.</li>
              <li>Drag to move around. Pinch, or use − and +, to zoom.</li>
              <li>On an LRT line? Search your stop and we'll use the MRT station it joins.</li>
              <li class="keyboard-tip">
                With a keyboard, arrow keys move between stations and Enter picks one.
              </li>
            </ul>
          </div>
        </div>
      </div>
      <p :id="id + '-map-help'" class="visually-hidden">
        Use the arrow keys to move between stations, and Enter to pick one.
      </p>
      <div
        ref="viewport"
        class="map-viewport"
        role="region"
        aria-label="MRT station map"
        :aria-describedby="id + '-map-help'"
        tabindex="0"
        data-testid="mrt-map-viewport"
        @keydown="moveStationFocus"
        @touchstart.passive="onTouchStart"
        @touchmove.passive="onTouchMove"
        @touchend="onTouchEnd"
      >
        <div
          ref="canvas"
          class="map-canvas"
          :style="{ width: 3600 * zoom + 'px', '--marker-size': 48 * zoom + 'px' }"
          data-testid="mrt-map-canvas"
          @click="pickFromTap"
        >
          <img
            src="/images/mrt-map.svg"
            alt="Singapore MRT and LRT network diagram"
            width="1410"
            height="1007"
            data-testid="mrt-map-image"
            @error="imageFailed = true"
          />
          <button
            v-for="station in mrtStations"
            :key="station.id"
            type="button"
            class="station-marker"
            :class="{ selected: modelValue === station.id }"
            :style="{ left: station.x + '%', top: station.y + '%' }"
            :aria-label="station.name + ' MRT · ' + station.codes.join(' / ')"
            :aria-pressed="modelValue === station.id"
            :title="station.name + ' · ' + station.codes.join(' / ')"
            :disabled="disabled"
            tabindex="-1"
            :data-testid="'mrt-marker-' + station.id"
            :data-station-id="station.id"
          >
            <span class="dot" aria-hidden="true"></span>
            <span v-if="modelValue === station.id" class="pin-label" aria-hidden="true">{{
              station.name
            }}</span>
          </button>
        </div>
      </div>
    </template>
    <p v-else class="map-error" role="status" data-testid="mrt-map-error">
      The map couldn't load. Search above, or pick your area below.
    </p>
    <slot />
  </div>
</template>

<style scoped>
.mrt-picker {
  min-width: 0;
}

.mrt-search {
  margin-bottom: 12px;
}

.search-box {
  position: relative;
}

.search-box .form-control {
  min-height: 48px;
  border-radius: var(--radius-pill);
  padding-inline: 18px;
}

.search-results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-dialog);
}

.search-results li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-results li.active,
.search-results li:hover {
  background: var(--surface-2);
}

.result-name {
  font-weight: 600;
}

.result-detail {
  color: var(--muted);
  font-size: 0.875rem;
  white-space: nowrap;
}

.search-empty {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 0.875rem;
}

.selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  margin-bottom: 12px;
  padding: 8px 8px 8px 16px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

/* Keep "EW2 / DT32" together when the name wraps */
.selection .codes {
  white-space: nowrap;
}

.clear-btn {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
}

.clear-btn:hover:not(:disabled) {
  background: var(--surface-3);
}

.map-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}

.zoom {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--surface);
}

.zoom-level {
  min-width: 3.2em;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tool-btn {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink);
}

.map-info .tool-btn {
  border: 1px solid var(--line-strong);
  background: var(--surface);
}

.tool-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.tool-btn:disabled {
  opacity: 0.4;
}

.tool-btn svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-info {
  position: relative;
}

.info-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 10;
  width: min(320px, calc(100vw - 48px));
  padding: 12px 16px;
  font-size: 0.875rem;
  text-wrap: pretty;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-dialog);
}

/* Keyboard tips only matter with a keyboard and mouse */
@media (pointer: coarse) {
  .keyboard-tip {
    display: none;
  }
}

/* Short enough on a phone that the page around it can still be scrolled */
.map-viewport {
  width: 100%;
  height: min(420px, 55vh);
  overflow: auto;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
}

/* Scale targets with the map so neighbouring stations stay separate. */
.map-canvas {
  position: relative;
  min-width: 100%;
  aspect-ratio: 1410 / 1007;
}

.map-canvas img {
  display: block;
  width: 100%;
  height: 100%;
}

/* The diagram is a white image in both modes; dim it a little so it doesn't glare in Supper Club */
:global([data-bs-theme='dark']) .map-canvas img {
  filter: brightness(0.88);
}

/* The markers sit on the white diagram in both modes, so their colours are fixed like the
   MRT map blue (DESIGN.md) instead of following the theme */
.station-marker {
  position: absolute;
  width: var(--marker-size);
  height: var(--marker-size);
  padding: 0;
  transform: translate(-50%, -50%);
  border: 0;
  border-radius: 50%;
  background: transparent;
}

.station-marker .dot {
  display: block;
  width: min(14px, 50%);
  height: min(14px, 50%);
  margin: auto;
  border: 2px solid #5f6273;
  border-radius: 50%;
  background: #ffffff;
}

.station-marker:hover {
  background: rgb(17 18 25 / 10%);
}

.station-marker.selected {
  z-index: 2;
  background: #165bc633;
  box-shadow: inset 0 0 0 3px #165bc6;
}

.station-marker.selected .dot {
  background: #165bc6;
  border-color: #165bc6;
}

/* The picked station is labelled on the map, not just a blue dot */
.pin-label {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  padding: 4px 10px;
  transform: translateX(-50%);
  border-radius: var(--radius-pill);
  background: #111219;
  color: #ffffff;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}

.station-marker:focus-visible {
  outline: 3px dashed #111219;
  outline-offset: 3px;
}

.map-viewport:focus-visible {
  outline: var(--focus-ring);
  outline-style: dashed;
  outline-width: 3px;
  outline-offset: 3px;
}

.map-error {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
</style>
