<script setup>
// Small line icons for the travel modes, drawn with SVG like the other icons in the app
defineProps({
  kind: { type: String, required: true }, // 'TRAIN', 'BUS', 'WALK' or 'CYCLE'
})
</script>

<template>
  <svg class="travel-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <template v-if="kind === 'TRAIN'">
      <rect x="6" y="3" width="12" height="14" rx="3" />
      <path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4" />
    </template>
    <template v-else-if="kind === 'BUS'">
      <rect x="5" y="3" width="14" height="15" rx="2" />
      <path d="M5 11h14M8 21v-3M16 21v-3" />
    </template>
    <template v-else-if="kind === 'CYCLE'">
      <circle cx="5.5" cy="17" r="3.5" />
      <circle cx="18.5" cy="17" r="3.5" />
      <path d="M5.5 17l4-7h6l3 7M9.5 10l4 7M12 6h3l.5 4" />
    </template>
    <template v-else>
      <circle cx="13" cy="4" r="2" />
      <path d="M13 7l-2 6 3 3 1 5M11 13l-3 3-2 5M12 8l4 3h3M12 8l-4 2-1 3" />
    </template>
  </svg>
</template>

<style scoped>
.travel-icon {
  width: 1.1em;
  height: 1.1em;
  vertical-align: -0.15em;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>