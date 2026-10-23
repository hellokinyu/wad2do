<script setup>
import { computed, reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import {
  formatPrice,
  formatDuration,
  getSetting,
  getWeeklyHours,
  getWebsiteUrl,
} from '@/lib/activityDisplay'

const props = defineProps({ submission: { type: Object, required: true } })
const emit = defineEmits(['saved', 'reviewed'])
const editing = ref(false)
const rejecting = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')
const rejectReason = ref('')
const imageFailed = ref(false)
const form = reactive({})
const hours = reactive({})
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const categories = [
  'Food',
  'Cafes',
  'Outdoors',
  'Arts and culture',
  'Nightlife',
  'Shopping',
  'Family-friendly',
  'Wellness',
]
const weeklyHours = computed(() => getWeeklyHours(props.submission.opening_hours).rows)
const websiteUrl = computed(() => getWebsiteUrl(props.submission))
const pending = computed(() => props.submission.status === 'pending')

function formatDate(value) {
  if (!value) return 'Date unavailable'
  return new Date(value).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function startEdit() {
  const submission = props.submission
  Object.assign(form, {
    name: submission.name ?? '',
    category: submission.category ?? '',
    price_per_person: submission.price_per_person ?? '',
    duration_min: submission.duration_min ?? '',
    indoor: submission.indoor ?? '',
    address: submission.address ?? '',
    area: submission.area ?? '',
    description: submission.description ?? '',
    website: submission.website ?? '',
    image_url: submission.image_url ?? '',
  })
  for (const day of days) {
    const entry = submission.opening_hours?.[day]
    hours[day] = {
      mode: entry?.closed ? 'closed' : entry?.open24h ? '24h' : 'open',
      open: entry?.open ?? '',
      close: entry?.close ?? '',
    }
  }
  editing.value = true
  rejecting.value = false
  errorMessage.value = ''
  savedMessage.value = ''
}

function validUrl(value) {
  if (!value.trim()) return true
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function startReject() {
  rejecting.value = true
  errorMessage.value = ''
  savedMessage.value = ''
}

function cancelEdit() {
  editing.value = false
  errorMessage.value = ''
}

function cancelReject() {
  rejecting.value = false
  errorMessage.value = ''
}

async function saveEdits() {
  if (busy.value) return
  errorMessage.value = ''
  savedMessage.value = ''
  if (
    !form.name.trim() ||
    !form.category.trim() ||
    !form.address.trim() ||
    !form.area.trim() ||
    typeof form.price_per_person !== 'number' ||
    !Number.isFinite(form.price_per_person) ||
    form.price_per_person < 0 ||
    !Number.isInteger(form.duration_min) ||
    form.duration_min <= 0 ||
    typeof form.indoor !== 'boolean'
  ) {
    errorMessage.value = 'Complete the required fields with a valid price and duration.'
    return
  }
  if (!validUrl(form.website) || !validUrl(form.image_url)) {
    errorMessage.value = 'Website and photo URLs must start with http:// or https://.'
    return
  }
  const openingHours = {}
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  for (const day of days) {
    const entry = hours[day]
    if (entry.mode === 'closed') openingHours[day] = { closed: true }
    else if (entry.mode === '24h') openingHours[day] = { open24h: true }
    else {
      if (
        !timePattern.test(entry.open) ||
        !timePattern.test(entry.close) ||
        entry.open === entry.close
      ) {
        errorMessage.value = `Enter different opening and closing times for ${day}.`
        return
      }
      openingHours[day] = { open: entry.open, close: entry.close }
    }
  }
  if (days.every((day) => hours[day].mode === 'closed')) {
    errorMessage.value = 'The activity must be open on at least one day.'
    return
  }

  busy.value = true
  try {
    // Only editable activity details are sent. Review fields are set by SQL functions.
    const { data, error } = await supabase
      .from('submissions')
      .update({
        name: form.name.trim(),
        category: form.category.trim(),
        price_per_person: form.price_per_person,
        duration_min: form.duration_min,
        indoor: form.indoor,
        address: form.address.trim(),
        area: form.area.trim(),
        description: form.description.trim() || null,
        website: form.website.trim() || null,
        image_url: form.image_url.trim() || null,
        opening_hours: openingHours,
      })
      .eq('id', props.submission.id)
      .eq('status', 'pending')
      .select('*')
      .single()
    if (error) throw error
    emit('saved', data)
    editing.value = false
    imageFailed.value = false
    savedMessage.value = 'Changes saved. You can now approve this submission.'
  } catch {
    errorMessage.value =
      "Couldn't save changes. Your edits are still here. It may have been reviewed by another admin."
  } finally {
    busy.value = false
  }
}

async function approve() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    // One database call creates the activity and marks the submission approved.
    // rpc() means "run a database function"
    const { data, error } = await supabase
      .rpc('approve_submission', {
        p_submission_id: props.submission.id,
      })
      .single()
    if (error) throw error
    emit('reviewed', data)
  } catch {
    errorMessage.value =
      "Couldn't approve this submission. Try again, or refresh to check whether another admin reviewed it."
  } finally {
    busy.value = false
  }
}

async function reject() {
  if (busy.value) return
  const reason = rejectReason.value.trim()
  if (!reason || reason.length > 300) {
    errorMessage.value = 'Enter a rejection reason between 1 and 300 characters.'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const { data, error } = await supabase
    // rpc() means run a database function
      .rpc('reject_submission', {
        p_submission_id: props.submission.id,
        p_reason: reason,
      })
      .single()
    if (error) throw error
    emit('reviewed', data)
  } catch {
    errorMessage.value =
      "Couldn't reject this submission. Your reason is still here. Try again, or refresh to check its status."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <article
    class="card rounded-4 overflow-hidden"
    :data-testid="`admin-submission-${submission.id}`"
    :aria-busy="busy"
  >
    <div class="row g-0">
      <div class="col-md-4 photo-panel">
        <img
          v-if="submission.image_url && !imageFailed"
          :src="submission.image_url"
          :alt="submission.name"
          class="submission-photo"
          loading="lazy"
          @error="imageFailed = true"
        />
        <div v-else class="photo-placeholder text-secondary">
          {{ submission.image_url ? 'Photo unavailable' : 'No photo submitted' }}
        </div>
      </div>
      <div class="col-md-8 p-4">
        <span class="badge rounded-pill text-bg-light mb-2 text-capitalize">{{
          submission.status
        }}</span>
        <h2 class="h4 fw-bold">{{ submission.name }}</h2>
        <p class="small text-secondary mb-1">
          Submitted by
          {{ submission.submitter?.display_name || submission.submitted_by || 'Unknown user' }}
        </p>
        <p class="small text-secondary">{{ formatDate(submission.created_at) }} (Singapore time)</p>
        <dl class="row mb-0 details">
          <dt class="col-sm-4">Category</dt>
          <dd class="col-sm-8">{{ submission.category || 'Not provided' }}</dd>
          <dt class="col-sm-4">Price / person</dt>
          <dd class="col-sm-8">{{ formatPrice(submission.price_per_person) }}</dd>
          <dt class="col-sm-4">Duration</dt>
          <dd class="col-sm-8">{{ formatDuration(submission.duration_min) }}</dd>
          <dt class="col-sm-4">Setting</dt>
          <dd class="col-sm-8">{{ getSetting(submission.indoor) }}</dd>
          <dt class="col-sm-4">Address</dt>
          <dd class="col-sm-8">{{ submission.address || 'Not provided' }}</dd>
          <dt class="col-sm-4">Area</dt>
          <dd class="col-sm-8">{{ submission.area || 'Not provided' }}</dd>
          <dt class="col-sm-4">Description</dt>
          <dd class="col-sm-8 description">{{ submission.description || 'Not provided' }}</dd>
          <dt class="col-sm-4">Website</dt>
          <dd class="col-sm-8">
            <a v-if="websiteUrl" :href="websiteUrl" target="_blank" rel="noopener noreferrer">{{
              submission.website
            }}</a>
            <span v-else>{{ submission.website || 'Not provided' }}</span>
          </dd>
        </dl>
        <details class="mt-2">
          <summary class="fw-semibold">Opening hours (Singapore time)</summary>
          <ul class="list-unstyled mt-2 mb-0">
            <li v-for="day in weeklyHours" :key="day.day">{{ day.day }}: {{ day.hours }}</li>
          </ul>
        </details>
        <p v-if="submission.reviewed_at" class="small text-secondary mt-3 mb-0">
          Reviewed {{ formatDate(submission.reviewed_at) }}
        </p>
        <p v-if="submission.reject_reason" class="alert alert-light mt-3 mb-0">
          <strong>Reason:</strong> {{ submission.reject_reason }}
        </p>
        <RouterLink
          v-if="submission.status === 'approved' && submission.activity_id"
          :to="`/activities/${submission.activity_id}`"
          class="d-inline-block mt-3"
          >View published activity</RouterLink
        >

        <div v-if="pending && !editing && !rejecting" class="d-flex flex-wrap gap-2 mt-4">
          <button
            class="btn btn-outline-dark"
            :disabled="busy"
            data-testid="admin-edit"
            @click="startEdit"
          >
            Edit
          </button>
          <button
            class="btn btn-dark"
            :disabled="busy"
            data-testid="admin-approve"
            @click="approve"
          >
            {{ busy ? 'Saving...' : 'Approve' }}
          </button>
          <button
            class="btn btn-outline-danger"
            :disabled="busy"
            data-testid="admin-reject"
            @click="startReject"
          >
            Reject
          </button>
        </div>
        <form v-if="pending && rejecting" class="mt-4" @submit.prevent="reject">
          <fieldset :disabled="busy">
            <legend class="h6">Why is this submission being rejected?</legend>
            <label :for="`reason-${submission.id}`" class="form-label"
              >Reason shown to the submitter</label
            >
            <textarea
              :id="`reason-${submission.id}`"
              v-model="rejectReason"
              class="form-control mb-2"
              rows="3"
              maxlength="300"
              required
              placeholder="For example: Duplicate of Gardens by the Bay"
              data-testid="admin-reject-reason"
            ></textarea>
            <button type="submit" class="btn btn-danger me-2" data-testid="admin-confirm-reject">
              {{ busy ? 'Saving...' : 'Confirm rejection' }}
            </button>
            <button type="button" class="btn btn-outline-dark" @click="cancelReject">Cancel</button>
          </fieldset>
        </form>
        <p v-if="savedMessage" class="alert alert-success mt-3 mb-0" role="status">
          {{ savedMessage }}
        </p>
        <p
          v-if="errorMessage"
          class="alert alert-danger mt-3 mb-0"
          role="alert"
          data-testid="admin-action-error"
        >
          {{ errorMessage }}
        </p>
      </div>
    </div>

    <form
      v-if="pending && editing"
      class="border-top p-4"
      @submit.prevent="saveEdits"
      data-testid="admin-edit-form"
    >
      <fieldset :disabled="busy">
        <legend class="h5">Edit submission</legend>
        <p class="small text-secondary">
          Save your changes before approving. Fields marked * are required.
        </p>
        <div class="row g-3">
          <div class="col-12">
            <label :for="`name-${submission.id}`" class="form-label">Name *</label>
            <input
              :id="`name-${submission.id}`"
              v-model="form.name"
              class="form-control"
              required
              data-testid="admin-edit-name"
            />
          </div>
          <div class="col-sm-6">
            <label :for="`category-${submission.id}`" class="form-label">Category *</label>
            <select
              :id="`category-${submission.id}`"
              v-model="form.category"
              class="form-select"
              required
            >
              <option
                v-if="form.category && !categories.includes(form.category)"
                :value="form.category"
              >
                {{ form.category }}
              </option>
              <option v-for="category in categories" :key="category">{{ category }}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label :for="`price-${submission.id}`" class="form-label"
              >Price per person (S$) *</label
            >
            <input
              :id="`price-${submission.id}`"
              v-model.number="form.price_per_person"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              required
              data-testid="admin-edit-price"
            />
          </div>
          <div class="col-sm-6">
            <label :for="`duration-${submission.id}`" class="form-label"
              >Duration (minutes) *</label
            >
            <input
              :id="`duration-${submission.id}`"
              v-model.number="form.duration_min"
              type="number"
              min="1"
              step="1"
              class="form-control"
              required
            />
          </div>
          <div class="col-sm-6">
            <label :for="`setting-${submission.id}`" class="form-label">Setting *</label>
            <select
              :id="`setting-${submission.id}`"
              v-model="form.indoor"
              class="form-select"
              required
            >
              <option disabled value="">Choose a setting</option>
              <option :value="true">Indoor</option>
              <option :value="false">Outdoor</option>
            </select>
          </div>
          <div class="col-sm-8">
            <label :for="`address-${submission.id}`" class="form-label">Address *</label>
            <input
              :id="`address-${submission.id}`"
              v-model="form.address"
              class="form-control"
              required
            />
          </div>
          <div class="col-sm-4">
            <label :for="`area-${submission.id}`" class="form-label">Area *</label>
            <input
              :id="`area-${submission.id}`"
              v-model="form.area"
              class="form-control"
              required
            />
          </div>
          <div class="col-12">
            <label :for="`description-${submission.id}`" class="form-label">Description</label>
            <textarea
              :id="`description-${submission.id}`"
              v-model="form.description"
              class="form-control"
              rows="3"
              maxlength="300"
            ></textarea>
          </div>
          <div class="col-sm-6">
            <label :for="`website-${submission.id}`" class="form-label">Website</label>
            <input
              :id="`website-${submission.id}`"
              v-model="form.website"
              type="url"
              class="form-control"
            />
          </div>
          <div class="col-sm-6">
            <label :for="`image-${submission.id}`" class="form-label">Photo URL</label>
            <input
              :id="`image-${submission.id}`"
              v-model="form.image_url"
              type="url"
              class="form-control"
            />
          </div>
        </div>
        <h3 class="h6 mt-4">Opening hours (Singapore time) *</h3>
        <p class="small text-secondary">
          A closing time earlier than opening means the following day.
        </p>
        <div v-for="day in days" :key="day" class="row g-2 align-items-end mb-3">
          <div class="col-12 col-sm-2 fw-semibold">{{ day }}</div>
          <div class="col-12 col-sm-4">
            <label :for="`mode-${submission.id}-${day}`" class="visually-hidden"
              >{{ day }} opening status</label
            >
            <select
              :id="`mode-${submission.id}-${day}`"
              v-model="hours[day].mode"
              class="form-select"
              :data-testid="`admin-hours-${day}-mode`"
            >
              <option value="open">Set hours</option>
              <option value="closed">Closed</option>
              <option value="24h">Open 24 hours</option>
            </select>
          </div>
          <template v-if="hours[day].mode === 'open'">
            <div class="col-6 col-sm-3">
              <label :for="`open-${submission.id}-${day}`" class="form-label small"
                >{{ day }} opens</label
              >
              <input
                :id="`open-${submission.id}-${day}`"
                v-model="hours[day].open"
                type="time"
                class="form-control"
                required
                :data-testid="`admin-hours-${day}-open`"
              />
            </div>
            <div class="col-6 col-sm-3">
              <label :for="`close-${submission.id}-${day}`" class="form-label small"
                >{{ day }} closes</label
              >
              <input
                :id="`close-${submission.id}-${day}`"
                v-model="hours[day].close"
                type="time"
                class="form-control"
                required
                :data-testid="`admin-hours-${day}-close`"
              />
            </div>
          </template>
        </div>
        <button type="submit" class="btn btn-dark me-2" data-testid="admin-save-edits">
          {{ busy ? 'Saving...' : 'Save changes' }}
        </button>
        <button type="button" class="btn btn-outline-dark" @click="cancelEdit">Cancel</button>
      </fieldset>
    </form>
  </article>
</template>

<style scoped>
.submission-photo {
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}
.photo-panel,
.photo-placeholder {
  background: #f3f3f3;
}
.photo-placeholder {
  min-height: 200px;
  display: grid;
  place-items: center;
  padding: 1rem;
}
.details dd,
.details dt,
a {
  overflow-wrap: anywhere;
}
.description {
  white-space: pre-wrap;
}
.form-control,
.form-select {
  min-height: 44px;
}
</style>
