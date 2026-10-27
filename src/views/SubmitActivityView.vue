<script setup>
import { reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import GooglePlacePicker from '@/components/GooglePlacePicker.vue'

const { user } = useAuth()
const submitting = ref(false)
const submitted = ref(false)
const recoveredSubmission = ref(false)
const errorMessage = ref('')
// Reuse the ID when a save succeeds but its response is lost.
// shortcut: the ID lasts for this open form; persist drafts if reload recovery is needed.
const submissionId = crypto.randomUUID()
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
const areas = [
  'Ang Mo Kio',
  'Bedok',
  'Bishan',
  'Bugis',
  'Bukit Batok',
  'Bukit Merah',
  'Bukit Panjang',
  'Bukit Timah',
  'Changi',
  'Choa Chu Kang',
  'City / Downtown',
  'Clementi',
  'Geylang',
  'Hougang',
  'Jurong East',
  'Jurong West',
  'Kallang',
  'Marine Parade',
  'Novena',
  'Orchard',
  'Paya Lebar',
  'Pasir Ris',
  'Punggol',
  'Queenstown',
  'Sembawang',
  'Sengkang',
  'Serangoon',
  'Tampines',
  'Tanjong Pagar',
  'Toa Payoh',
  'Woodlands',
  'Yishun',
]
const durations = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: 'Half day (4 hours)' },
]
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const form = reactive({
  name: '',
  category: '',
  price: '',
  free: false,
  duration: '',
  address: '',
  postal_code: '',
  google_place_id: null,
  area: '',
  indoor: '',
  description: '',
  website: '',
})
const hours = reactive(
  Object.fromEntries(days.map((day) => [day, { mode: 'open', open: '', close: '' }])),
)

async function submitActivity() {
  if (submitting.value || submitted.value) return
  errorMessage.value = ''
  if (!user.value) {
    errorMessage.value = 'Please log in before submitting an activity.'
    return
  }

  const submittedBy = user.value.id
  const price = form.free ? 0 : form.price
  if (
    !form.name.trim() ||
    !form.address.trim() ||
    !categories.includes(form.category) ||
    !areas.includes(form.area) ||
    !durations.some((duration) => duration.value === form.duration) ||
    !['indoor', 'outdoor'].includes(form.indoor) ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    form.description.trim().length > 300
  ) {
    errorMessage.value = 'Complete all required fields with a valid price and duration.'
    return
  }

  if (form.postal_code && !/^\d{6}$/.test(form.postal_code)) {
    errorMessage.value = 'Enter a six-digit postal code or leave it blank.'
    return
  }

  const openingHours = {}
  for (const day of days) {
    const entry = hours[day]
    if (entry.mode === 'closed') openingHours[day] = { closed: true }
    else if (entry.mode === '24h') openingHours[day] = { open24h: true }
    else {
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
      if (
        !timePattern.test(entry.open) ||
        !timePattern.test(entry.close) ||
        entry.open === entry.close
      ) {
        errorMessage.value = `Enter different opening and closing times for ${day}, or choose Closed or Open 24 hours.`
        return
      }
      openingHours[day] = { open: entry.open, close: entry.close }
    }
  }
  if (days.every((day) => hours[day].mode === 'closed')) {
    errorMessage.value = 'The activity must be open on at least one day.'
    return
  }

  const website = form.website.trim()
  if (website) {
    try {
      if (!['http:', 'https:'].includes(new URL(website).protocol)) throw new Error('Invalid URL')
    } catch {
      errorMessage.value = 'Enter a website starting with https:// or http://.'
      return
    }
  }

  submitting.value = true
  try {
    const { error } = await supabase.from('submissions').insert({
      id: submissionId,
      submitted_by: submittedBy,
      name: form.name.trim(),
      category: form.category,
      price_per_person: price,
      duration_min: form.duration,
      indoor: form.indoor === 'indoor',
      address: form.address.trim(),
      postal_code: form.postal_code || null,
      google_place_id: form.google_place_id,
      area: form.area,
      opening_hours: openingHours,
      description: form.description.trim() || null,
      website: website || null,
      status: 'pending',
    })
    if (error?.code === '23505') {
      const { data: existing, error: readError } = await supabase
        .from('submissions')
        .select('id')
        .eq('id', submissionId)
        .eq('submitted_by', submittedBy)
        .maybeSingle()
      if (readError || !existing) throw readError || error
      recoveredSubmission.value = true
    } else if (error) throw error
    submitted.value = true
  } catch {
    errorMessage.value =
      "Couldn't submit your activity. Your entries are still here. Please try again."
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="container submission-page py-4 py-md-5" data-testid="submit-activity-page">
    <RouterLink to="/activities" class="text-dark">← Back to Activities</RouterLink>
    <header class="my-4">
      <h1 class="fw-bold">Submit an activity</h1>
      <p class="text-secondary">Know a great spot in Singapore? Share it for our team to review.</p>
    </header>

    <section
      v-if="submitted"
      class="border rounded-4 p-4"
      role="status"
      data-testid="submission-success"
    >
      <h2 class="h4">Thanks! We'll review it soon.</h2>
      <p v-if="recoveredSubmission" data-testid="submission-recovered">
        Your earlier attempt was already saved. Any changes made since then were not submitted.
      </p>
      <p>Your activity is pending review. Track its status under My submissions in Profile.</p>
      <RouterLink to="/profile" class="btn btn-dark rounded-pill" data-testid="view-submissions">
        View my submissions
      </RouterLink>
    </section>

    <form v-else @submit.prevent="submitActivity" data-testid="submission-form">
      <p class="text-secondary small">
        Fields marked * are required. Prices are in Singapore dollars.
      </p>
      <fieldset :disabled="submitting" :aria-busy="submitting">
        <legend class="visually-hidden">Activity details</legend>
        <div class="row g-3">
          <div class="col-12">
            <label for="submission-name" class="form-label">Activity name *</label>
            <input
              id="submission-name"
              v-model="form.name"
              class="form-control"
              required
              data-testid="submission-name"
            />
          </div>
          <div class="col-md-6">
            <label for="submission-category" class="form-label">Category *</label>
            <select
              id="submission-category"
              v-model="form.category"
              class="form-select"
              required
              data-testid="submission-category"
            >
              <option disabled value="">Choose a category</option>
              <option v-for="category in categories" :key="category">{{ category }}</option>
            </select>
          </div>
          <div class="col-md-6">
            <label for="submission-duration" class="form-label">Typical duration *</label>
            <select
              id="submission-duration"
              v-model="form.duration"
              class="form-select"
              required
              data-testid="submission-duration"
            >
              <option disabled value="">Choose a duration</option>
              <option v-for="duration in durations" :key="duration.value" :value="duration.value">
                {{ duration.label }}
              </option>
            </select>
          </div>
          <div class="col-md-6">
            <label for="submission-price" class="form-label">Price per person (S$) *</label>
            <input
              id="submission-price"
              v-model.number="form.price"
              type="number"
              min="0"
              step="0.01"
              :required="!form.free"
              :disabled="form.free"
              class="form-control"
              data-testid="submission-price"
            />
            <div class="form-check mt-2">
              <input
                id="submission-free"
                v-model="form.free"
                type="checkbox"
                class="form-check-input"
                data-testid="submission-free"
              />
              <label for="submission-free" class="form-check-label">This activity is free</label>
            </div>
          </div>
          <div class="col-md-6">
            <label for="submission-setting" class="form-label">Indoor or outdoor *</label>
            <select
              id="submission-setting"
              v-model="form.indoor"
              class="form-select"
              required
              data-testid="submission-setting"
            >
              <option disabled value="">Choose a setting</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div class="col-md-8">
            <label for="submission-address" class="form-label"
              >Singapore address or place name *</label
            >
            <input
              id="submission-address"
              v-model="form.address"
              class="form-control"
              required
              data-testid="submission-address"
            />
          </div>
          <div class="col-md-4">
            <label for="submission-area" class="form-label">Area *</label>
            <select
              id="submission-area"
              v-model="form.area"
              class="form-select"
              required
              data-testid="submission-area"
            >
              <option disabled value="">Choose an area</option>
              <option v-for="area in areas" :key="area">{{ area }}</option>
            </select>
          </div>
        </div>

        <GooglePlacePicker
          v-model="form.google_place_id"
          v-model:postal-code="form.postal_code"
          :name="form.name"
          :address="form.address"
          :area="form.area"
        />

        <fieldset class="mt-4">
          <legend class="h5">Opening hours *</legend>
          <p id="hours-help" class="text-secondary small">
            Use Singapore time. A closing time earlier than opening means the following day.
          </p>
          <div v-for="day in days" :key="day" class="row g-2 align-items-end mb-3">
            <div class="col-12 col-sm-2 fw-semibold">{{ day }}</div>
            <div class="col-12 col-sm-4">
              <label :for="`hours-${day}-mode`" class="visually-hidden"
                >{{ day }} opening status</label
              >
              <select
                :id="`hours-${day}-mode`"
                v-model="hours[day].mode"
                class="form-select"
                :data-testid="`hours-${day}-mode`"
              >
                <option value="open">Set hours</option>
                <option value="closed">Closed</option>
                <option value="24h">Open 24 hours</option>
              </select>
            </div>
            <template v-if="hours[day].mode === 'open'">
              <div class="col-6 col-sm-3">
                <label :for="`hours-${day}-open`" class="form-label small mb-1"
                  >{{ day }} opens</label
                >
                <input
                  :id="`hours-${day}-open`"
                  v-model="hours[day].open"
                  type="time"
                  class="form-control"
                  required
                  aria-describedby="hours-help"
                  :data-testid="`hours-${day}-open`"
                />
              </div>
              <div class="col-6 col-sm-3">
                <label :for="`hours-${day}-close`" class="form-label small mb-1"
                  >{{ day }} closes</label
                >
                <input
                  :id="`hours-${day}-close`"
                  v-model="hours[day].close"
                  type="time"
                  class="form-control"
                  required
                  aria-describedby="hours-help"
                  :data-testid="`hours-${day}-close`"
                />
              </div>
            </template>
          </div>
        </fieldset>

        <div class="mt-4">
          <label for="submission-description" class="form-label">Description (optional)</label>
          <textarea
            id="submission-description"
            v-model="form.description"
            class="form-control"
            rows="3"
            maxlength="300"
            aria-describedby="description-help"
            data-testid="submission-description"
          ></textarea>
          <p id="description-help" class="text-secondary small mt-1">
            {{ form.description.length }}/300 characters
          </p>
        </div>
        <div class="mb-4">
          <label for="submission-website" class="form-label">Official website (optional)</label>
          <input
            id="submission-website"
            v-model="form.website"
            type="url"
            placeholder="https://"
            class="form-control"
            data-testid="submission-website"
          />
        </div>
        <div
          v-if="errorMessage"
          class="alert alert-danger"
          role="alert"
          data-testid="submission-error"
        >
          {{ errorMessage }}
        </div>
        <button
          type="submit"
          class="btn btn-dark rounded-pill px-4"
          data-testid="submission-submit"
        >
          <span
            v-if="submitting"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          ></span>
          {{ submitting ? 'Submitting…' : 'Submit for review' }}
        </button>
      </fieldset>
    </form>
  </div>
</template>

<style scoped>
.submission-page {
  max-width: 860px;
}

.form-control,
.form-select {
  min-height: 44px;
}
</style>
