<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { findStation, findStationInDirection, mrtStations } from '@/data/mrtStations'

const props = defineProps({
  modelValue: { type: String, default: null },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const id = useId()
const zoom = ref(0.25)
const viewport = ref(null)
const canvas = ref(null)
const imageFailed = ref(false)
const showInfo = ref(false)
const selected = computed(() => findStation(props.modelValue))

function selectStation(value) {
  if (!props.disabled) emit('update:modelValue', value || null)
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

async function revealStation() {
  await nextTick()
  const station = selected.value || findStation('dhoby-ghaut')
  const container = viewport.value
  if (!container || !canvas.value || imageFailed.value) return
  const width = canvas.value.clientWidth
  container.scrollTo({
    left: (station.x / 100) * width - container.clientWidth / 2,
    top: ((station.y / 100) * width * 1007) / 1410 - container.clientHeight / 2,
  })
}

let resizeObserver
onMounted(() => {
  revealStation()
  if (!viewport.value) return
  resizeObserver = new ResizeObserver(revealStation)
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
watch([() => props.modelValue, zoom], revealStation)
</script>

<template>
  <div class="mrt-picker" data-testid="mrt-picker">
    <template v-if="!imageFailed">
      <div class="d-flex align-items-center justify-content-end gap-2 mb-2">
        <button
          type="button"
          class="btn btn-outline-secondary"
          aria-label="Zoom map"
          :disabled="disabled"
          :data-zoom="Math.round(zoom * 100)"
          data-testid="mrt-zoom"
          @click="zoom = zoom >= 1 ? 0.25 : zoom + 0.25"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5" stroke-width="2" /><path d="M7 8.5a3.5 3.5 0 0 1 3-2" stroke-width="1.5" opacity=".6" /><path d="M15 15l6 6" stroke-width="3.5" /></svg>
        </button>
        <div class="map-info">
          <button
            type="button"
            class="btn btn-outline-secondary info-btn"
            aria-label="How to use the map"
            :aria-expanded="showInfo"
            :aria-controls="id + '-help'"
            data-testid="mrt-info"
            @click="showInfo = !showInfo"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.01" /></svg>
          </button>
          <div v-if="showInfo" :id="id + '-help'" class="info-popover" role="dialog" aria-label="How to use the map" data-testid="mrt-info-popover">
            <ul class="mb-0 ps-3">
              <li>Scroll or swipe to move the map.</li>
              <li>Choose an MRT station using its marker.</li>
              <li>LRT stops are shown for reference only.</li>
              <li>Use arrow keys to move to nearby stations in that direction, then Enter to choose.</li>
              <li>If no station is nearby in that direction, focus stays put.</li>
            </ul>
          </div>
        </div>
      </div>
      <div
        ref="viewport"
        class="map-viewport"
        role="region"
        aria-label="MRT station map"
        tabindex="0"
        data-testid="mrt-map-viewport"
        @keydown="moveStationFocus"
      >
        <div
          ref="canvas"
          class="map-canvas"
          :style="{ width: 3600 * zoom + 'px', '--marker-size': 48 * zoom + 'px' }"
          data-testid="mrt-map-canvas"
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
            @click="selectStation(station.id)"
          >
            <span aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </template>
    <p v-else class="alert alert-secondary" role="status" data-testid="mrt-map-error">
      The map couldn't load. You can still choose and save a home area below.
    </p>
    <p v-if="selected" role="status" class="mt-3" data-testid="mrt-confirmation">
      Starting from <strong>{{ selected.name }} MRT · {{ selected.codes.join(' / ') }}</strong
      >.
    </p>
    <slot />
    <button
      type="button"
      class="btn btn-outline-secondary mt-3"
      :disabled="disabled"
      data-testid="mrt-clear"
      @click="selectStation(null)"
    >
      Clear starting location
    </button>
  </div>
</template>

<style scoped>
.mrt-picker {
  min-width: 0;
}
.btn {
  min-height: 44px;
  min-width: 44px;
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
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}
.map-viewport {
  width: 100%;
  height: 420px;
  overflow: auto;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
}
/* Scale targets with the map so neighbouring stations stay separate at 25%. */
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
.station-marker span {
  display: block;
  width: min(14px, 50%);
  height: min(14px, 50%);
  margin: auto;
  border: 2px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
}
.station-marker:hover {
  background: rgba(var(--bs-emphasis-color-rgb), 0.08);
}
.station-marker.selected {
  background: #165bc633;
  box-shadow: inset 0 0 0 3px #165bc6;
}
.station-marker.selected span {
  background: #165bc6;
  border-color: #165bc6;
}
.station-marker:focus-visible,
.map-viewport:focus-visible {
  outline: 3px dashed #a23900;
  outline-offset: 3px;
}
</style>
