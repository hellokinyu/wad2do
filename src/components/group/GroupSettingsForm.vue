<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'

const props = defineProps({
  group: Object, // { id, name, start_date, end_date, budget_per_person, chosen_start }
})
const emit = defineEmits(['saved', 'cancel'])

const router = useRouter()

// Start the form with the group's current settings
const groupName = ref(props.group.name)
const startDate = ref(props.group.start_date)
const endDate = ref(props.group.end_date)
const budget = ref(props.group.budget_per_person)
const saveError = ref('')
const saving = ref(false)

// "2026-10-31" (Singapore date) from a timestamp like "2026-10-31T06:00:00+00:00"
function toSingaporeDate(ts) {
  return new Date(new Date(ts).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

async function saveSettings() {
  if (saving.value) return
  saveError.value = ''

  // Same checks as the create group form
  if (groupName.value.trim() === '') {
    saveError.value = 'Please enter a group name.'
    return
  }
  if (startDate.value === '' || endDate.value === '') {
    saveError.value = 'Please pick a start and end date.'
    return
  }
  if (endDate.value < startDate.value) {
    saveError.value = 'The end date must be after the start date.'
    return
  }
  if (typeof budget.value !== 'number' || !Number.isFinite(budget.value) || budget.value < 0) {
    saveError.value = 'Please enter a budget of $0 or more.'
    return
  }

  // If the chosen time is no longer inside the dates, it (and the plan built on it) has to go
  let clearChosen = false
  if (props.group.chosen_start) {
    const chosenDay = toSingaporeDate(props.group.chosen_start)
    const chosenEndDay = props.group.chosen_end ? toSingaporeDate(props.group.chosen_end) : chosenDay
    clearChosen = chosenDay < startDate.value || chosenDay > endDate.value || chosenEndDay > endDate.value
  }
  if (clearChosen) {
    const ok = confirm(
      'The chosen time is outside the new dates. Saving will clear the chosen time and the itinerary. Continue?',
    )
    if (!ok) return
  }

  saving.value = true
  try {
    const { error } = await requestWithTimeout((signal) =>
      supabase.rpc('update_group_settings', {
        p_group_id: props.group.id,
        p_name: groupName.value.trim(),
        p_start_date: startDate.value,
        p_end_date: endDate.value,
        p_budget_per_person: budget.value,
        p_clear_chosen: clearChosen,
      }).abortSignal(signal),
    )
    if (error) throw error

    emit('saved')
  } catch (error) {
    console.log(error)
    saveError.value = error?.code === '22023'
      ? 'The chosen time or settings changed. Reload the group and try again.'
      : "Couldn't save the settings. Please try again."
  } finally {
    saving.value = false
  }
}

// Deleting runs a database function (see docs/sql/group_members.sql), because it
// also clears everyone's availability and votes, which normal members can't delete.
const deleteError = ref('')

async function deleteGroup() {
  if (!confirm('Delete ' + props.group.name + ' for everyone? This cannot be undone.')) return
  deleteError.value = ''

  try {
    const { error } = await supabase.rpc('delete_group', { p_group_id: props.group.id })
    if (error) throw error
    router.push('/groups')
  } catch (error) {
    console.log(error)
    deleteError.value = "Couldn't delete the group. Please try again."
  }
}
</script>

<template>
  <div class="card mt-3" data-testid="group-settings-form">
    <div class="card-body">
      <form @submit.prevent="saveSettings">
        <fieldset :disabled="saving">
          <h2 class="h5">Group settings</h2>

          <label for="settings-name" class="form-label">Group name</label>
          <input
            id="settings-name"
            v-model="groupName"
            class="form-control mb-2"
            data-testid="settings-name-input"
          />

          <label for="settings-start" class="form-label">Start date</label>
          <input
            id="settings-start"
            v-model="startDate"
            type="date"
            class="form-control mb-2"
            data-testid="settings-start-input"
          />

          <label for="settings-end" class="form-label">End date</label>
          <input
            id="settings-end"
            v-model="endDate"
            type="date"
            class="form-control mb-2"
            data-testid="settings-end-input"
          />

          <label for="settings-budget" class="form-label">Budget per person ($)</label>
          <input
            id="settings-budget"
            v-model.number="budget"
            type="number"
            min="0"
            class="form-control mb-2"
            data-testid="settings-budget-input"
          />

          <p v-if="saveError" class="text-danger" data-testid="settings-error">{{ saveError }}</p>

          <button type="submit" class="btn btn-primary me-2" data-testid="settings-save">Save</button>
          <button type="button" class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
        </fieldset>
      </form>

      <hr />

      <p v-if="deleteError" class="text-danger" data-testid="delete-group-error">
        {{ deleteError }}
      </p>
      <button class="btn btn-danger" data-testid="delete-group-button" @click="deleteGroup">
        Delete group
      </button>
    </div>
  </div>
</template>
