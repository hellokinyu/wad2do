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
  min-width: 150px;
  padding: 12px 25px;
  border: 1px solid #222;
  border-radius: 100px;
  color: #111;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.2s,
    color 0.2s;
}

.pill.primary {
  color: #fff;
  background: #111;
  box-shadow: 0 6px 16px #00000018;
}

.pill.is-active {
  color: #111;
  background: #ececeb;
}

.pill.primary.is-active {
  color: #fff;
  background: #363636;
}

.action-arrow {
  transition: transform 0.2s;
}

.pill.is-active .action-arrow {
  transform: translateX(4px);
}

.pill:focus-visible {
  outline: 3px solid #8b7151;
  outline-offset: 5px;
}

.action-spark {
  position: absolute;
  top: -18px;
  left: -17px;
  width: 22px;
  height: 22px;
  opacity: 0;
  color: #363636;
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
    min-width: 125px;
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
