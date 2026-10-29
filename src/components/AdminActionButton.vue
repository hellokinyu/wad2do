<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  action: {
    type: String,
    required: true,
    validator: (value) => ['edit', 'approve', 'reject', 'delete'].includes(value),
  },
  disabled: Boolean,
  busy: Boolean,
})
const emit = defineEmits(['click'])
const label = computed(
  () =>
    ({
      edit: 'Edit submission',
      approve: 'Approve submission',
      reject: 'Reject submission',
      delete: 'Delete submission',
    })[props.action],
)
const crossId = `admin-cross-${useId()}`
const crossShape = 'M10 5 18 13 26 5 31 10 23 18 31 26 26 31 18 23 10 31 5 26 13 18 5 10Z'
const tickShape = 'M5 18 10 13 16 19 27 7 32 12 16 30Z'
</script>

<template>
  <button
    type="button"
    class="admin-action"
    :class="`admin-action-${action}`"
    :disabled="disabled || busy"
    :aria-label="label"
    :aria-busy="busy || undefined"
    :title="label"
    @click="emit('click', $event)"
  >
    <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true" focusable="false">
      <g v-if="action === 'edit'" transform="rotate(-135 18 18)" stroke-linejoin="round">
        <rect
          x="14"
          y="5"
          width="8"
          height="18"
          rx="2"
          fill="#e2e8f0"
          stroke="#475569"
          stroke-width="2"
        />
        <path d="M14 22 18 29 22 22Z" fill="white" stroke="#475569" stroke-width="2" />
        <path d="M18 23v4" stroke="#475569" stroke-width="1.5" />
        <g class="pen-cap">
          <rect
            x="13"
            y="18"
            width="10"
            height="13"
            rx="3"
            fill="#64748b"
            stroke="#475569"
            stroke-width="2"
          />
          <path d="M20 20v8" stroke="#f8fafc" stroke-width="1.5" stroke-linecap="round" />
        </g>
      </g>
      <g
        v-else-if="action === 'approve'"
        class="approve-tick"
        stroke="#198754"
        stroke-width="2.8"
        stroke-linejoin="round"
      >
        <path :d="tickShape" fill="white" />
        <path class="tick-fill" :d="tickShape" fill="#198754" />
      </g>
      <g v-else-if="action === 'reject'">
        <defs>
          <clipPath :id="crossId"><path :d="crossShape" /></clipPath>
        </defs>
        <path
          :d="crossShape"
          fill="white"
          stroke="#dc3545"
          stroke-width="2.8"
          stroke-linejoin="round"
        />
        <g
          :clip-path="`url(#${crossId})`"
          fill="none"
          stroke="#dc3545"
          stroke-width="8"
          stroke-linecap="round"
        >
          <path class="cross-stroke cross-first" d="M8 8 28 28" pathLength="1" />
          <path class="cross-stroke cross-second" d="M28 8 8 28" pathLength="1" />
        </g>
      </g>
      <g v-else stroke="#6b7280" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13h16l-1.5 18h-13Z" fill="#9ca3af" />
        <path d="M15 17v9m6-9v9" stroke="#f3f4f6" stroke-width="1.8" />
        <g class="bin-lid" fill="none">
          <path d="M14 9V5h8v4" />
          <path d="M8 10h20" stroke-width="3" />
        </g>
      </g>
    </svg>
  </button>
</template>

<style scoped>
.admin-action {
  display: inline-grid;
  place-items: center;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: white;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 180ms ease;
}
.admin-action svg {
  overflow: visible;
  pointer-events: none;
}
.admin-action:is(:hover, :focus-visible):not(:disabled) {
  background: #f1f5f9;
}
.admin-action:focus-visible {
  outline: 3px solid #86b7fe;
  outline-offset: 2px;
}
.admin-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pen-cap {
  transform-origin: 18px 24px;
  transition: transform 380ms cubic-bezier(0.2, 0.8, 0.3, 1.2);
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .pen-cap {
  transform: translateY(14px);
}
.approve-tick {
  transform-origin: 18px 18px;
  transition: transform 350ms ease;
}
.tick-fill {
  clip-path: inset(100% 0 0 0);
  transition: clip-path 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .approve-tick {
  transform: translateY(-1px) scale(1.05);
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .tick-fill {
  clip-path: inset(0 0 0 0);
}
.cross-stroke {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 220ms ease-in-out;
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .cross-stroke {
  stroke-dashoffset: 0;
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .cross-second {
  transition-delay: 200ms;
}
.bin-lid {
  transform-origin: 27px 10px;
  transition: transform 380ms cubic-bezier(0.2, 0.8, 0.3, 1.2);
}
.admin-action:is(:hover, :focus-visible):not(:disabled) .bin-lid {
  transform: translateY(-2px) rotate(26deg);
}
@media (prefers-reduced-motion: reduce) {
  .admin-action,
  .pen-cap,
  .approve-tick,
  .tick-fill,
  .cross-stroke,
  .bin-lid {
    transition: none;
  }
  .admin-action:is(:hover, :focus-visible):not(:disabled) .cross-second {
    transition-delay: 0s;
  }
  .admin-action:is(:hover, :focus-visible):not(:disabled) .pen-cap,
  .admin-action:is(:hover, :focus-visible):not(:disabled) .approve-tick,
  .admin-action:is(:hover, :focus-visible):not(:disabled) .bin-lid {
    transform: none;
  }
}
</style>
