<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AdminNav from '@/components/AdminNav.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { activityTags, isOfficialCategory } from '@/data/activityCategories'
import TagPicker from '@/components/TagPicker.vue'

const activities = ref([])
const loading = ref(true)
const errorMessage = ref('')
const search = ref('')
const onlyUnofficial = ref(false)
// activity id -> { state: 'saving' | 'saved' | 'error', message, previous }
const status = ref({})
let disposed = false

async function fetchBatch(columns, start, batchSize) {
  return supabase
    .from('activities')
    .select(columns)
    .order('name')
    .range(start, start + batchSize - 1)
}

async function loadActivities() {
  loading.value = true
  errorMessage.value = ''
  try {
    // The catalogue is small, so load it all in batches and filter here
    const batchSize = 200
    let columns = 'id, name, category, tags, source, area, image_url'
    const records = []
    for (let start = 0; ; start += batchSize) {
      let { data, error } = await fetchBatch(columns, start, batchSize)
      // Before docs/sql/admin_activity_categories.sql has run there's no tags column yet
      if (error?.code === '42703' && columns.includes('tags')) {
        columns = 'id, name, category, source, area, image_url'
        ;({ data, error } = await fetchBatch(columns, start, batchSize))
      }
      if (error) throw error
      records.push(...(data ?? []))
      if ((data ?? []).length < batchSize) break
    }
    if (!disposed) activities.value = records
  } catch {
    if (!disposed) errorMessage.value = "Couldn't load activities. Check your connection."
  } finally {
    if (!disposed) loading.value = false
  }
}

onMounted(loadActivities)
onUnmounted(() => {
  disposed = true
})

const hasUnofficialTag = (activity) => {
  const tags = activityTags(activity)
  return !tags.length || tags.some((tag) => !isOfficialCategory(tag))
}

const unofficialCount = computed(() => activities.value.filter(hasUnofficialTag).length)

// A row you just fixed stays on screen (with its Saved and Undo) until the filter changes,
// instead of vanishing the moment its tags become official
const keptIds = ref(new Set())
watch(onlyUnofficial, () => {
  keptIds.value = new Set()
})

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  return activities.value.filter(
    (activity) =>
      (!onlyUnofficial.value || hasUnofficialTag(activity) || keptIds.value.has(activity.id)) &&
      (!term ||
        String(activity.name ?? '')
          .toLowerCase()
          .includes(term)),
  )
})

function saveError(error) {
  if (error?.code === '42501') return 'Only admins can change tags.'
  if (error?.code === '22023') return 'Pick tags from the list.'
  if (error?.code === 'P0002') return 'This activity no longer exists.'
  if (error?.code === 'PGRST202') return 'Tags can’t be saved yet. The database needs updating.'
  return "Couldn't save the tags. Try again."
}

async function saveTags(activity, tags) {
  const previous = activityTags(activity)
  status.value[activity.id] = { state: 'saving' }
  keptIds.value.add(activity.id)
  try {
    const { data, error } = await supabase.rpc('admin_set_activity_tags', {
      p_activity_id: activity.id,
      p_tags: tags,
    })
    if (error) throw error
    const saved = Array.isArray(data) ? data[0] : data
    activity.tags = saved?.tags ?? tags
    activity.category = saved?.category ?? tags[0]
    status.value[activity.id] = { state: 'saved', previous }
    return true
  } catch (error) {
    status.value[activity.id] = { state: 'error', message: saveError(error) }
    return false
  }
}

const canUndo = (activity) => {
  const previous = status.value[activity.id]?.previous
  return Boolean(previous?.length) && previous.every(isOfficialCategory)
}

function undo(activity) {
  if (canUndo(activity)) saveTags(activity, status.value[activity.id].previous)
}

// ---------- Edit tags dialog ----------
const editing = ref(null)
const draft = ref([]) // ticked tags, main tag first
const dialogError = ref('')
const savingDialog = ref(false)

function openEditor(activity, event) {
  // Safari doesn't focus buttons on click; focus it so BaseDialog can hand focus back on close
  event.currentTarget.focus({ preventScroll: true })
  const current = activityTags(activity).filter(isOfficialCategory)
  draft.value = current
  dialogError.value = ''
  editing.value = activity
}

function closeEditor() {
  if (!savingDialog.value) editing.value = null
}

const leftOutTags = computed(() =>
  editing.value ? activityTags(editing.value).filter((tag) => !isOfficialCategory(tag)) : [],
)

async function saveEditor() {
  if (!draft.value.length) {
    dialogError.value = 'Pick at least one tag.'
    return
  }
  const tags = [...draft.value]
  savingDialog.value = true
  dialogError.value = ''
  const activity = editing.value
  const saved = await saveTags(activity, tags)
  savingDialog.value = false
  if (saved) editing.value = null
  else dialogError.value = status.value[activity.id].message
}
</script>

<template>
  <div class="container admin-page py-4 py-md-5" data-testid="admin-activities-page">
    <AdminNav />
    <header class="mb-4">
      <h1 class="fw-bold">All activities</h1>
      <p class="text-secondary mb-0">
        Give any activity one or more tags. The first is its main tag, shown first on its card.
      </p>
    </header>

    <div class="controls mb-3">
      <div class="search">
        <label for="admin-activities-search" class="form-label">Search activity names</label>
        <input
          id="admin-activities-search"
          v-model="search"
          type="search"
          class="form-control"
          placeholder="Search by part of a name"
          data-testid="admin-activities-search"
        />
      </div>
      <div class="form-check form-switch">
        <input
          id="admin-activities-unofficial"
          v-model="onlyUnofficial"
          class="form-check-input"
          type="checkbox"
          role="switch"
          data-testid="admin-activities-unofficial"
        />
        <label class="form-check-label" for="admin-activities-unofficial">
          Only tags not on the list ({{ unofficialCount }})
        </label>
      </div>
    </div>

    <div v-if="loading" class="py-5 text-center" role="status">Loading activities…</div>
    <div
      v-else-if="errorMessage"
      class="alert alert-danger"
      role="alert"
      data-testid="admin-activities-error"
    >
      <p>{{ errorMessage }}</p>
      <button
        type="button"
        class="btn btn-outline-danger rounded-pill"
        data-testid="admin-activities-retry"
        @click="loadActivities"
      >
        Try again
      </button>
    </div>
    <template v-else>
      <p class="text-secondary small" role="status" data-testid="admin-activities-count">
        Showing {{ shown.length }} of {{ activities.length }} activities
      </p>
      <p v-if="!shown.length" class="empty surface-card p-4" data-testid="admin-activities-empty">
        {{
          onlyUnofficial && !search.trim()
            ? 'Every activity uses tags from the list.'
            : 'No activities match that search.'
        }}
      </p>
      <ul v-else class="rows">
        <li
          v-for="activity in shown"
          :key="activity.id"
          class="row-card surface-card"
          :class="{ unofficial: hasUnofficialTag(activity) }"
          data-testid="admin-activity-row"
        >
          <img
            v-if="activity.image_url"
            :src="activity.image_url"
            alt=""
            class="thumb"
            loading="lazy"
          />
          <span v-else class="thumb thumb-empty" aria-hidden="true"></span>

          <div class="info">
            <RouterLink :to="`/activities/${activity.id}`" class="name">{{
              activity.name
            }}</RouterLink>
            <p class="meta">
              <span v-if="activity.area">{{ activity.area }}</span>
              <span class="source">{{
                activity.source === 'community' ? 'Community' : 'Curated'
              }}</span>
            </p>
            <ul class="tag-list" aria-label="Tags">
              <li
                v-for="(tag, index) in activityTags(activity)"
                :key="tag"
                class="tag-pill"
                :class="{ off: !isOfficialCategory(tag) }"
                data-testid="admin-activity-tag"
              >
                {{ tag }}<span v-if="index === 0" class="main-note"> · main</span>
              </li>
              <li v-if="!activityTags(activity).length" class="tag-pill off">No tags</li>
            </ul>
            <p
              v-if="hasUnofficialTag(activity)"
              class="warning"
              data-testid="admin-activity-unofficial"
            >
              Some tags aren't on the list. Edit tags to fix them.
            </p>
          </div>

          <div class="actions">
            <button
              type="button"
              class="btn btn-outline-dark btn-sm rounded-pill px-3"
              :disabled="status[activity.id]?.state === 'saving'"
              :aria-label="`Edit tags for ${activity.name}`"
              data-testid="admin-activity-edit"
              @click="openEditor(activity, $event)"
            >
              Edit tags
            </button>
            <p class="save-status" role="status" data-testid="admin-activity-status">
              <template v-if="status[activity.id]?.state === 'saving'">Saving…</template>
              <template v-else-if="status[activity.id]?.state === 'saved'">
                Saved
                <button
                  v-if="canUndo(activity)"
                  type="button"
                  class="undo"
                  data-testid="admin-activity-undo"
                  @click="undo(activity)"
                >
                  Undo
                </button>
              </template>
              <span v-else-if="status[activity.id]?.state === 'error'" class="error">
                {{ status[activity.id].message }}
              </span>
            </p>
          </div>
        </li>
      </ul>
    </template>

    <BaseDialog
      :open="Boolean(editing)"
      :title="editing ? `Tags for ${editing.name}` : 'Tags'"
      :closable="!savingDialog"
      class="tags-dialog"
      data-testid="admin-tags-dialog"
      @close="closeEditor"
    >
      <fieldset :disabled="savingDialog">
        <TagPicker v-model="draft" id-prefix="admin-tags" testid-prefix="admin-tag" />
        <p v-if="leftOutTags.length" class="warning mt-3 mb-0" data-testid="admin-tags-left-out">
          Not on the list, so they'll be dropped: {{ leftOutTags.join(', ') }}.
        </p>
        <p v-if="dialogError" class="error mt-2 mb-0" role="alert" data-testid="admin-tags-error">
          {{ dialogError }}
        </p>
      </fieldset>
      <template #footer>
        <button
          type="button"
          class="btn btn-outline-dark rounded-pill px-4"
          :disabled="savingDialog"
          @click="closeEditor"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-dark rounded-pill px-4 flex-grow-1"
          :disabled="savingDialog"
          data-testid="admin-tags-save"
          @click="saveEditor"
        >
          {{ savingDialog ? 'Saving…' : 'Save tags' }}
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 1000px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 24px;
}

.search {
  flex: 1 1 320px;
}

.form-switch {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rows {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row-card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
}

.row-card.unofficial {
  border-color: var(--bs-warning-border-subtle);
}

.thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

.thumb-empty {
  display: block;
  background: var(--surface-2);
}

.info {
  min-width: 0;
}

.name {
  color: var(--ink);
  font-weight: 700;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.name:hover {
  text-decoration: underline;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.875rem;
}

.source {
  font-weight: 600;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.tag-pill {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: 600;
}

.tag-pill.off {
  background: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
}

.main-note {
  color: var(--muted);
  font-weight: 500;
}

.warning {
  margin: 6px 0 0;
  color: var(--bs-warning-text-emphasis);
  font-size: 0.8125rem;
  font-weight: 600;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.actions .btn {
  min-height: 40px;
}

.save-status {
  min-height: 1.4em;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.8125rem;
}

.undo {
  min-height: 32px;
  margin-left: 6px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--ink);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.error {
  color: var(--bs-danger-text-emphasis);
}

.empty {
  margin: 0;
}

.tags-dialog {
  --dialog-width: 520px;
}

/* On phones the Edit button drops below the name */
@media (max-width: 575.98px) {
  .row-card {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .thumb {
    width: 48px;
    height: 48px;
  }

  .actions {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .save-status {
    margin: 0;
  }
}
</style>
