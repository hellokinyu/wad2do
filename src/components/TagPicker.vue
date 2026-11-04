<script setup>
// Pick one or more activity tags and say which is the main one.
// v-model is the list of tags with the main tag first, ready to save as `tags`
// (and its first item as `category`). Used by the submit form and both admin editors.
import { computed } from 'vue'
import { ACTIVITY_CATEGORIES } from '@/data/activityCategories'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // Makes the ids unique when several pickers are on one page
  idPrefix: { type: String, default: 'tags' },
  testidPrefix: { type: String, default: 'tag' },
  invalid: { type: Boolean, default: false },
  describedby: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const main = computed(() => props.modelValue[0] ?? '')

function toggle(tag, checked) {
  const rest = props.modelValue.filter((value) => value !== tag)
  // A newly ticked tag goes on the end, so the main tag stays put
  emit('update:modelValue', checked ? [...rest, tag] : rest)
}

function setMain(tag) {
  emit('update:modelValue', [tag, ...props.modelValue.filter((value) => value !== tag)])
}
</script>

<template>
  <fieldset class="tag-picker" :aria-describedby="describedby" :aria-invalid="invalid || undefined">
    <legend class="form-label">Tags *</legend>
    <p class="form-text mt-0 mb-2">Pick every tag that fits.</p>
    <div class="tag-options">
      <label v-for="tag in ACTIVITY_CATEGORIES" :key="tag" class="tag-option">
        <input
          type="checkbox"
          class="form-check-input"
          :value="tag"
          :checked="modelValue.includes(tag)"
          :data-testid="`${testidPrefix}-option`"
          @change="toggle(tag, $event.target.checked)"
        />
        {{ tag }}
      </label>
    </div>

    <label :for="`${idPrefix}-main`" class="form-label mt-3">Main tag</label>
    <select
      :id="`${idPrefix}-main`"
      class="form-select"
      :value="main"
      :disabled="modelValue.length < 2"
      :data-testid="`${testidPrefix}-main`"
      @change="setMain($event.target.value)"
    >
      <option v-if="!modelValue.length" value="">Pick a tag first</option>
      <option v-for="tag in modelValue" :key="tag" :value="tag">{{ tag }}</option>
    </select>
    <p class="form-text mb-0">Shown first on the activity's card.</p>
  </fieldset>
</template>

<style scoped>
.tag-picker {
  margin: 0;
  padding: 0;
  border: 0;
}

/* Bootstrap draws legends large; match the form's other field labels */
.tag-picker legend {
  float: none;
  margin-bottom: 0;
  font-size: inherit;
}

.tag-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0 16px;
}

.tag-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
}

.tag-option .form-check-input {
  margin: 0;
}

.tag-picker[aria-invalid='true'] .tag-options {
  padding: 4px 8px;
  border: 1px solid var(--bs-form-invalid-border-color);
  border-radius: var(--radius-md);
}
</style>
