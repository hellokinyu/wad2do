<script setup>
import { ref } from 'vue'

// Week 6: props configure the link; the slot supplies its label.
defineProps({
  to: { type: String, required: true },
  primary: Boolean,
})

// Weeks 4–5: each component instance owns its hover state and class binding.
const isHovered = ref(false)
</script>

<template>
  <RouterLink
    :to="to"
    class="pill d-inline-flex align-items-center justify-content-center"
    :class="{ primary, 'is-active': isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <span class="action-spark" aria-hidden="true"><i></i><i></i><i></i></span>
    <slot></slot>
    <span class="action-arrow" aria-hidden="true">→</span>
  </RouterLink>
</template>

<style scoped>
.pill {
  position: relative;
  gap: 20px;
  min-width: 180px;
  min-height: 60px;
  padding: 16px 32px;
  border: 1px solid var(--ink);
  border-radius: 100px;
  color: var(--ink);
  font-size: 17px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.2s,
    color 0.2s;
}

.pill.primary {
  border-color: var(--accent);
  color: var(--on-accent);
  background: var(--accent);
  box-shadow: 0 6px 16px #00000018;
}

.pill.is-active {
  color: var(--ink);
  background: var(--surface-3);
}

.pill.primary.is-active {
  border-color: var(--accent-hover);
  color: var(--on-accent);
  background: var(--accent-hover);
}

.action-arrow {
  transition: transform 0.2s;
}

.pill.is-active .action-arrow {
  transform: translateX(4px);
}

.pill:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 5px;
}

.action-spark {
  position: absolute;
  top: -18px;
  left: -17px;
  width: 22px;
  height: 22px;
  opacity: 0;
  color: var(--ink);
  pointer-events: none;
  transform: translateY(3px);
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.pill.is-active .action-spark {
  opacity: 1;
  transform: translateY(0);
}

.action-spark i {
  position: absolute;
  height: 2px;
  width: 10px;
  background: currentColor;
  transform: rotate(20deg);
  top: 17px;
}

.action-spark i:nth-child(2) {
  transform: rotate(50deg);
  top: 8px;
  left: 5px;
}

.action-spark i:nth-child(3) {
  transform: rotate(75deg);
  top: 2px;
  left: 14px;
}

@media (max-width: 1000px) {
  .pill {
    min-width: 160px;
    min-height: 56px;
    padding: 14px 26px;
    font-size: 16px;
  }
}

@media (max-width: 600px) {
  .action-spark {
    display: none;
  }
}

@media (max-width: 480px) {
  .pill {
    min-width: 125px;
    gap: 16px;
    padding: 14px 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pill,
  .action-arrow,
  .action-spark {
    transition: none;
  }
}
</style>
