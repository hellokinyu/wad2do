<template>
  <fieldset :disabled="disabled" class="animal-picker">
    <legend class="h6 fw-bold mb-3">
      Choose your profile picture <span class="text-muted">(required)</span>
    </legend>
    <div class="animal-options">
      <label v-for="animal in profileAnimals" :key="animal.id" class="animal-option">
        <input
          v-model="selection"
          type="radio"
          name="profile-animal"
          :value="animal.id"
          required
          :data-testid="'avatar-' + animal.id"
        />
        <span class="animal-tile">
          <AnimalAvatar :animal="animal.id" :size="72" decorative />
          <span class="fw-semibold">{{ animal.label }}</span>
          <span class="selection-mark" aria-hidden="true">{{
            selection === animal.id ? '✓' : ''
          }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<script setup>
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import { profileAnimals } from '@/data/profileAnimals'

defineProps({ disabled: { type: Boolean, default: false } })
const selection = defineModel({ type: String, default: '' })
</script>

<style scoped>
.animal-picker {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.animal-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
}
.animal-option {
  position: relative;
  cursor: pointer;
}
.animal-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.animal-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 1.15rem 0.35rem 0.8rem;
  border: 2px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.animal-option input:checked + .animal-tile {
  /* Festive themes outline the chosen animal in the navbar's second colour */
  border-color: var(--accent-edge, var(--ink));
  background: var(--surface-2);
  /* Every festive tile already has a coloured border, so the chosen one gets a thicker ring */
  box-shadow: 0 0 0 2px var(--accent-edge, transparent);
}
.animal-option input:focus-visible + .animal-tile {
  outline: var(--focus-ring);
  outline-offset: 3px;
}
.animal-option:hover .animal-tile {
  border-color: var(--line-strong);
}
.animal-option input:disabled + .animal-tile {
  opacity: 0.65;
  cursor: wait;
}
.selection-mark {
  position: absolute;
  right: 0.35rem;
  top: 0.2rem;
  font-size: 0.85rem;
}
@media (max-width: 575px) {
  .animal-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
