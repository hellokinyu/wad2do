<script setup>
import { onUnmounted, reactive, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import GooglePlacePicker from '@/components/GooglePlacePicker.vue'
import { requestWithTimeout as timedRequest } from '@/lib/requestWithTimeout'

const { user } = useAuth()
const submitting = ref(false)
const manualLocation = ref(false)
const locationError = ref('')
const submitted = ref(false)
const recoveredSubmission = ref(false)
const errorMessage = ref('')
const imageInput = ref(null)
const imageFile = ref(null)
const imagePreview = ref('')
const imageError = ref('')
const validatingImage = ref(false)
const uploading = ref(false)
const imageExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
let selectionNumber = 0
let operationNumber = 0
let disposed = false
let attemptedInsert = false
// Reuse the ID when a save succeeds but its response is lost.
// shortcut: the ID lasts for this account's open form; persist drafts if reload recovery is needed.
let submissionId = crypto.randomUUID()
let confirmedUpload
let requestController

function resetPhoto() {
  selectionNumber += 1
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = ''
  imageFile.value = null
  imageError.value = ''
  validatingImage.value = false
  confirmedUpload = undefined
}

function removePhoto() {
  resetPhoto()
  if (imageInput.value) imageInput.value.value = ''
}

async function selectPhoto(event) {
  const file = event.target.files?.[0]
  if (!file) return
  resetPhoto()
  imageFile.value = file
  if (!Object.hasOwn(imageExtensions, file.type)) {
    imageError.value = 'Choose a JPEG, PNG or WebP photo.'
    return
  }
  if (!file.size || file.size > 5000000) {
    imageError.value = 'Choose a photo larger than 0 bytes and no bigger than 5 MB.'
    return
  }
  const selection = selectionNumber
  imagePreview.value = URL.createObjectURL(file)
  validatingImage.value = true
  try {
    const image = new Image()
    image.src = imagePreview.value
    await image.decode()
  } catch {
    if (selection !== selectionNumber) return
    URL.revokeObjectURL(imagePreview.value)
    imagePreview.value = ''
    imageError.value = "This photo couldn't be opened. Choose another image."
  } finally {
    if (selection === selectionNumber) validatingImage.value = false
  }
}

watch(
  () => user.value?.id,
  () => {
    operationNumber += 1
    requestController?.abort()
    submissionId = crypto.randomUUID()
    attemptedInsert = false
    confirmedUpload = undefined
    submitted.value = false
    recoveredSubmission.value = false
    errorMessage.value = ''
  },
  { flush: 'sync' },
)
onUnmounted(() => {
  disposed = true
  operationNumber += 1
  requestController?.abort()
  removePhoto()
})
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
const form = reactive({
  name: '',
  category: '',
  price: '',
  duration: '',
  address: '',
  postal_code: '',
  google_place_id: null,
  area: '',
  indoor: '',
  description: '',
  website: '',
})
watch(
  () => form.google_place_id,
  (id) => {
    if (id) manualLocation.value = false
  },
)

watch([() => form.google_place_id, manualLocation], () => {
  locationError.value = ''
})

function submissionDetails(submittedBy) {
  if (!form.google_place_id && !manualLocation.value) {
    locationError.value =
      'Choose a location from the search results, or select manual address entry for review.'
    return
  }
  const price = form.price
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

  const website = form.website.trim()
  if (website) {
    try {
      if (!['http:', 'https:'].includes(new URL(website).protocol)) throw new Error('Invalid URL')
    } catch {
      errorMessage.value = 'Enter a website starting with https:// or http://.'
      return
    }
  }

  return {
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
    opening_hours: {},
    description: form.description.trim() || null,
    website: website || null,
    status: 'pending',
    image_url: null,
  }
}

async function requestWithTimeout(request) {
  const controller = new AbortController()
  requestController = controller
  try {
    return await timedRequest(request, controller)
  } finally {
    if (requestController === controller) requestController = undefined
  }
}

async function savedSubmission(submittedBy) {
  const { data, error } = await requestWithTimeout((signal) =>
    supabase
      .from('submissions')
      .select('id')
      .eq('id', submissionId)
      .eq('submitted_by', submittedBy)
      .abortSignal(signal)
      .maybeSingle(),
  )
  if (error) throw error
  return data
}

async function uploadPhoto(file, submittedBy) {
  if (confirmedUpload?.file === file && confirmedUpload.owner === submittedBy) {
    return confirmedUpload.url
  }
  const path = `${submittedBy}/${submissionId}/${crypto.randomUUID()}.${imageExtensions[file.type]}`
  return requestWithTimeout(async (signal) => {
    const { data, error } = await supabase.auth.getSession()
    if (error || data.session?.user.id !== submittedBy || signal.aborted) {
      throw error || new Error('Session changed')
    }
    // SDK upload has no AbortSignal option; fetch allows a timeout and cancellation on leaving.
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/activity-images/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': file.type,
          'Cache-Control': 'max-age=3600',
          'x-upsert': 'false',
        },
        body: file,
        signal,
      },
    )
    if (!response.ok || signal.aborted) throw new Error('Photo upload failed')
    const { data: publicImage } = supabase.storage.from('activity-images').getPublicUrl(path)
    confirmedUpload = { file, owner: submittedBy, url: publicImage.publicUrl }
    return publicImage.publicUrl
  })
}

async function submitActivity() {
  if (submitting.value || submitted.value || validatingImage.value) return
  errorMessage.value = ''
  locationError.value = ''
  if (!user.value) {
    errorMessage.value = 'Please log in before submitting an activity.'
    return
  }
  const submittedBy = user.value.id
  const operation = operationNumber
  const current = () => !disposed && operation === operationNumber && user.value?.id === submittedBy
  submitting.value = true
  try {
    if (attemptedInsert && (await savedSubmission(submittedBy))) {
      if (!current()) return
      recoveredSubmission.value = true
      submitted.value = true
      removePhoto()
      return
    }
    if (!current() || imageError.value) return
    const details = submissionDetails(submittedBy)
    if (!details) return
    const file = imageFile.value
    if (file) {
      uploading.value = true
      details.image_url = await uploadPhoto(file, submittedBy)
      uploading.value = false
    }
    if (!current()) return
    attemptedInsert = true
    const { error } = await requestWithTimeout((signal) =>
      supabase.from('submissions').insert(details).abortSignal(signal),
    )
    if (!current()) return
    if (error?.code === '23505') {
      if (!(await savedSubmission(submittedBy))) throw error
      if (!current()) return
      recoveredSubmission.value = true
    } else if (error) throw error
    if (!current()) return
    submitted.value = true
    removePhoto()
  } catch {
    if (current()) {
      errorMessage.value = uploading.value
        ? "Couldn't upload your photo. Your entries are still here. Please try again."
        : "Couldn't submit your activity. Your entries are still here. Please try again."
    }
    // shortcut: unused uploads are retained for manual cleanup; add trusted reconciliation when storage usage warrants it.
  } finally {
    uploading.value = false
    submitting.value = false
  }
}
</script>

<template>
  <div class="container submission-page py-4 py-md-5" data-testid="submit-activity-page">
    <RouterLink to="/activities" class="text-body">← Back to Activities</RouterLink>
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
              step="1"
              required
              class="form-control"
              aria-describedby="submission-price-help"
              data-testid="submission-price"
            />
            <p id="submission-price-help" class="form-text mt-2" aria-live="polite">
              {{ form.price === 0 ? 'This activity is free.' : 'Enter 0 for a free activity.' }}
            </p>
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
              >Venue name or street address *</label
            >
            <input
              id="submission-address"
              v-model="form.address"
              class="form-control"
              required
              data-testid="submission-address"
              maxlength="500"
              placeholder="e.g. Funan, 107 North Bridge Road"
              aria-describedby="submission-location-help submission-location-error"
              :aria-invalid="!!locationError"
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

        <p id="submission-location-help" class="form-text mt-2">
          Search for the venue, not the activity title. Choose a specific place rather than an area.
        </p>
        <GooglePlacePicker
          single-query
          v-model="form.google_place_id"
          v-model:postal-code="form.postal_code"
          :name="form.name"
          :address="form.address"
          :area="form.area"
        />

        <p
          v-if="locationError"
          id="submission-location-error"
          role="alert"
          class="text-danger small mt-2"
          data-testid="submission-location-error"
        >
          {{ locationError }}
        </p>
        <div class="form-check mt-3">
          <input
            id="manual-location"
            v-model="manualLocation"
            type="checkbox"
            class="form-check-input"
            data-testid="submission-manual-location"
            @change="form.google_place_id = null"
          />
          <label for="manual-location" class="form-check-label"
            >I can't find this place — use a manual address for review</label
          >
        </div>
        <p v-if="manualLocation" class="text-warning-emphasis small mt-2" role="status">
          Enter the full street address above, including the building number. This location is
          unverified; our team must check it before publishing.
        </p>

        <p class="text-secondary small mt-3" data-testid="submission-hours-note">
          Our team will verify and add opening hours before publishing your activity.
        </p>

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
          <label for="submission-image" class="form-label">Photo (optional)</label>
          <input
            id="submission-image"
            ref="imageInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="form-control"
            aria-describedby="submission-image-help submission-image-error"
            :aria-invalid="!!imageError"
            data-testid="submission-image"
            @change="selectPhoto"
          />
          <p id="submission-image-help" class="text-secondary small mt-1">
            JPEG, PNG or WebP. Maximum 5 MB. Photos are public by link once uploaded. Upload a photo
            you have permission to share.
          </p>
          <p v-if="imageFile" class="text-break small mb-2">{{ imageFile.name }}</p>
          <p v-if="validatingImage" role="status">Checking photo…</p>
          <img
            v-if="imagePreview && !validatingImage"
            :src="imagePreview"
            alt="Selected activity photo preview"
            class="submission-image-preview d-block rounded-3 mb-2"
            data-testid="submission-image-preview"
          />
          <p
            id="submission-image-error"
            :role="imageError ? 'alert' : undefined"
            class="text-danger small"
            data-testid="submission-image-error"
          >
            {{ imageError }}
          </p>
          <button
            v-if="imageFile"
            type="button"
            class="btn btn-outline-dark"
            data-testid="submission-image-remove"
            @click="removePhoto"
          >
            Remove photo
          </button>
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
        <p v-if="submitting" role="status" data-testid="submission-upload-status">
          {{ uploading ? 'Uploading photo…' : 'Submitting…' }}
        </p>
        <button
          type="submit"
          :disabled="validatingImage"
          class="btn btn-dark rounded-pill px-4"
          data-testid="submission-submit"
        >
          <span
            v-if="submitting"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          ></span>
          {{ uploading ? 'Uploading photo…' : submitting ? 'Submitting…' : 'Submit for review' }}
        </button>
      </fieldset>
    </form>
  </div>
</template>

<style scoped>
.submission-page {
  max-width: 860px;
}

.submission-image-preview {
  max-width: 100%;
  width: 320px;
  max-height: 240px;
  object-fit: contain;
}

.form-control,
.form-select {
  min-height: 44px;
}
</style>
