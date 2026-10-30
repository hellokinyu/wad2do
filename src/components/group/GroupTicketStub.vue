<script setup>
import { computed } from 'vue'
import { formatPart, getStubDay } from '@/lib/groupDisplay'

// The coloured date stub on a group ticket (Groups list cards and the group page hero).
// Its colours come from the ticket's --stage variables (see getStageStyle).
const props = defineProps({
  group: { type: Object, required: true },
  size: { type: String, default: 'card' }, // 'card' or 'hero'
  note: { type: String, default: '' }, // a line under the date, e.g. the countdown "in 9 days"
})

const day = computed(() => getStubDay(props.group))
</script>

<template>
  <!-- The outing day, or a "?" while the group is still choosing one -->
  <div class="ticket-stub" :class="'stub-' + size" aria-hidden="true">
    <template v-if="day">
      <span class="stub-small">{{ formatPart(day, { weekday: 'short' }) }}</span>
      <span class="stub-day">{{ formatPart(day, { day: 'numeric' }) }}</span>
      <span class="stub-small">{{ formatPart(day, { month: 'short' }) }}</span>
    </template>
    <template v-else>
      <span class="stub-small">Day</span>
      <span class="stub-day">?</span>
      <span class="stub-small">TBC</span>
    </template>
    <span v-if="note" class="stub-note">{{ note }}</span>
  </div>
</template>

<style scoped>
.ticket-stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--stub-width, 92px);
  padding: 16px 8px;
  border-right: 2px dashed var(--tear, rgb(255 255 255 / 40%));
  background: var(--stage, #111);
  color: var(--stage-ink, white);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stub-small {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stub-day {
  margin: 6px 0 4px;
  font-size: 2.6rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

/* The countdown under the date, set off by a thin rule in the stub's tear colour */
.stub-note {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--tear, rgb(255 255 255 / 40%));
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

/* The bigger stub at the top of the group page */
.stub-hero .stub-small {
  font-size: 0.875rem;
}

.stub-hero .stub-day {
  margin: 8px 0 6px;
  font-size: 4.25rem;
}

@media (max-width: 575.98px) {
  .stub-day {
    font-size: 2.25rem;
  }

  .stub-hero .stub-day {
    font-size: 2.75rem;
  }
}
</style>
