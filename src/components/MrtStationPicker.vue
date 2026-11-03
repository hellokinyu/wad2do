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
onUnmounted(() => resizeObserver?.disconnect())
watch([() => props.modelValue, zoom], revealStation)
</script>

<template>
  <div class="mrt-picker" data-testid="mrt-picker">
    <template v-if="!imageFailed">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2" aria-label="Map zoom">
        <button
          type="button"
          class="btn btn-outline-secondary"
          aria-label="Zoom out"
          :disabled="disabled || zoom === 0.25"
          data-testid="mrt-zoom-out"
          @click="zoom -= 0.25"
        >
          −
        </button>
        <span data-testid="mrt-zoom-level">{{ Math.round(zoom * 100) + '%' }}</span>
        <button
          type="button"
          class="btn btn-outline-secondary"
          aria-label="Zoom in"
          :disabled="disabled || zoom === 1"
          data-testid="mrt-zoom-in"
          @click="zoom += 0.25"
        >
          +
        </button>
      </div>
      <p :id="id + '-help'" class="small text-muted">
        Scroll or swipe to move the map. Choose an MRT station using its marker; LRT stops
        are shown for reference. Use arrow keys to move to nearby stations in that direction,
        then Enter to choose. If no station is nearby in that direction, focus stays put.
      </p>
      <div
        ref="viewport"
        class="map-viewport"
        role="region"
        aria-label="MRT station map"
        :aria-describedby="id + '-help'"
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
