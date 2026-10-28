<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import {
  formatPrice,
  formatDuration,
  getWeeklyHours,
  getWebsiteUrl,
  getRating,
  getSetting,
  getLocation,
  getMapEmbedUrl,
} from '@/lib/activityDisplay'
import { useActivityActions } from '@/composables/useActivityActions'

const route = useRoute()
const router = useRouter()
const activity = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const imageFailed = ref(false)
const shareDialog = ref(null)
const googleDetails = ref(null)
const googleLoading = ref(false)
const googleError = ref('')
let requestNumber = 0

const price = computed(() => formatPrice(activity.value?.price_per_person))
const duration = computed(() => formatDuration(activity.value?.duration_min))
const googleHours = computed(() => {
  const current = getWeeklyHours(googleDetails.value?.currentOpeningHours?.weekdayDescriptions)
  return current.available
    ? current
    : getWeeklyHours(googleDetails.value?.regularOpeningHours?.weekdayDescriptions)
})
const hours = computed(() =>
  googleHours.value.available ? googleHours.value : getWeeklyHours(activity.value?.opening_hours),
)
const websiteUrl = computed(() => getWebsiteUrl(activity.value))
const rating = computed(() =>
  getRating(
    activity.value?.google_place_id || activity.value?.source === 'google'
      ? googleDetails.value
      : activity.value,
  ),
)
const reviewCount = computed(() => {
  const count = googleDetails.value?.userRatingCount
  return Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString('en-SG') : null
})
const googleAttributions = computed(() =>
  (Array.isArray(googleDetails.value?.attributions) ? googleDetails.value.attributions : [])
    .filter((item) => typeof item?.provider === 'string' && item.provider.trim())
    .map((item) => ({ name: item.provider, url: getWebsiteUrl({ website: item.providerUri }) })),
)
const setting = computed(() => getSetting(activity.value?.indoor))
const location = computed(() => getLocation(activity.value))
const mapEmbedUrl = computed(() => getMapEmbedUrl(activity.value))

// A category such as Outdoor already describes the setting, so show one tag.
const showSettingTag = computed(
  () => activity.value?.category?.trim().toLowerCase() !== setting.value.toLowerCase(),
)

const {
  saved,
  saving,
  sharing,
  actionError,
  needsLogin,
  message,
  showShareDialog,
  groups,
  groupsLoading,
  groupsError,
  selectedGroupId,
  toggleSaved,
  openShare,
  closeShare,
  shareActivity,
} = useActivityActions(activity)

// A native dialog supplies keyboard focus management and Escape handling.
watch(
  showShareDialog,
  (open) => {
    if (open && shareDialog.value && !shareDialog.value.open) shareDialog.value.showModal()
    if (!open && shareDialog.value?.open) shareDialog.value.close()
  },
  { flush: 'post' },
)

async function loadActivity() {
  const request = ++requestNumber
  const id = route.params.id
  loading.value = true
  errorMessage.value = ''
  activity.value = null
  imageFailed.value = false
  googleDetails.value = null
  googleLoading.value = false
  googleError.value = ''

  try {
    const { data, error } = await supabase.from('activities').select('*').eq('id', id).maybeSingle()

    // A malformed UUID is an invalid link, rather than a retryable outage.
    if (error && error.code !== '22P02') throw error
    if (request === requestNumber) {
      activity.value = error ? null : data
      if (activity.value?.google_place_id) void loadGoogleDetails()
    }
  } catch {
    if (request === requestNumber) {
      errorMessage.value = "Couldn't load this activity. Please try again."
    }
  } finally {
    if (request === requestNumber) loading.value = false
  }
}

async function loadGoogleDetails() {
  const request = requestNumber
  const activityId = activity.value?.id
  if (!activity.value?.google_place_id || googleLoading.value) return
  googleLoading.value = true
  googleError.value = ''
  let failureCode

  try {
    const { data, error } = await requestWithTimeout(
      async (signal) => {
        const result = await supabase.functions.invoke('google-place-details', {
          body: { activityId },
          signal,
        })
        if (result.error?.context instanceof Response) {
          failureCode = (await result.error.context.json().catch(() => null))?.error
        }
        return result
      },
      new AbortController(),
      15000,
    )
    if (error || !data || typeof data !== 'object' || Array.isArray(data) || data.error) {
      throw error || new Error('Invalid Google details response')
    }
    if (request === requestNumber) googleDetails.value = data
  } catch {
    if (request === requestNumber) {
      googleError.value =
        {
          user_limit:
            'You have reached the hourly Google lookup limit. Try again later. Saved activity hours are shown when available.',
          app_limit:
            'The app has reached its monthly Google lookup allowance. Saved activity hours are shown when available.',
          lookup_disabled:
            'Live Google details are currently disabled. Saved activity hours are shown when available.',
        }[failureCode] || "Couldn't load Google ratings and opening hours. Please try again."
    }
  } finally {
    if (request === requestNumber) googleLoading.value = false
  }
}

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/activities')
}

watch(() => route.params.id, loadActivity, { immediate: true })
onUnmounted(() => {
  requestNumber += 1
})
</script>

<template>
  <div class="container detail-page py-4 py-md-5" data-testid="activity-detail-page">
    <button
      type="button"
      class="btn btn-outline-dark rounded-pill back-button mb-4"
      data-testid="activity-back"
      @click="goBack"
    >
      <span aria-hidden="true">←</span> Back
    </button>

    <div v-if="loading" class="py-5 text-center" role="status" data-testid="detail-loading">
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Loading activity…
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-danger"
      role="alert"
      data-testid="detail-error"
    >
      <p>{{ errorMessage }}</p>
      <button
        type="button"
        class="btn btn-outline-danger"
        data-testid="detail-retry"
        @click="loadActivity"
      >
        Try again
      </button>
    </div>

    <section
      v-else-if="!activity"
      class="detail-section text-center py-5"
      data-testid="detail-not-found"
    >
      <h1 class="h3">We couldn't find that activity</h1>
      <p class="text-secondary">
        The link may be wrong, or the activity may no longer be available.
      </p>
      <RouterLink to="/activities" class="btn btn-dark rounded-pill">Back to Activities</RouterLink>
    </section>

    <article v-else>
      <div class="detail-photo-container mb-4">
        <img
          v-if="activity.image_url && !imageFailed"
          :src="activity.image_url"
          :alt="activity.name"
          class="detail-photo"
          data-testid="detail-photo"
          @error="imageFailed = true"
        />
        <div v-else class="detail-placeholder" data-testid="detail-photo-placeholder">
          <span>{{ activity.category || 'Activity' }}</span>
        </div>
      </div>

      <header class="mb-4">
        <div class="d-flex flex-wrap gap-2 mb-3" data-testid="detail-tags">
          <span class="detail-badge">{{ activity.category || 'Activity' }}</span>
          <span v-if="showSettingTag" class="detail-badge">{{ setting }}</span>
          <span v-if="activity.source === 'community'" class="detail-badge community-badge"
            >Community</span
          >
        </div>
        <div class="d-flex flex-wrap align-items-start gap-3">
          <h1 class="detail-title mb-2" data-testid="activity-detail-name">{{ activity.name }}</h1>
          <span v-if="rating" class="rating-badge" data-testid="detail-rating">
            <span aria-hidden="true">★</span> {{ rating }}
            <span v-if="googleDetails" class="google-attribution" translate="no">Google Maps</span>
          </span>
        </div>
        <p class="text-secondary mb-0">{{ activity.area || 'Area unavailable' }}</p>
      </header>

      <p v-if="googleLoading" role="status" data-testid="detail-google-loading">
        Loading Google ratings and opening hours…
      </p>
      <div
        v-else-if="googleError"
        class="alert alert-warning"
        role="alert"
        data-testid="detail-google-error"
      >
        <p>{{ googleError }}</p>
        <button
          type="button"
          class="btn btn-outline-dark"
          data-testid="detail-google-retry"
          @click="loadGoogleDetails()"
        >
          Try again
        </button>
      </div>

      <div class="row g-4">
        <aside class="col-12 col-lg-4 order-lg-last">
          <section class="facts-card" aria-labelledby="facts-title">
            <h2 id="facts-title" class="h5 fw-bold mb-4">At a glance</h2>
            <p class="text-secondary small mb-1">Price per person</p>
            <p class="price-label mb-4" data-testid="detail-price">{{ price }}</p>
            <p
              v-if="activity.price_note"
              class="text-secondary small"
              data-testid="detail-price-note"
            >
              {{ activity.price_note }}
            </p>
            <dl class="facts-list">
              <div>
                <dt>Typical duration</dt>
                <dd data-testid="detail-duration">{{ duration }}</dd>
              </div>
              <div>
                <dt>Setting</dt>
                <dd>{{ setting }}</dd>
              </div>
              <div>
                <dt>Rating</dt>
                <dd>
                  {{ rating ? rating + ' / 5' : 'Not available yet' }}
                  <span
                    v-if="googleDetails && (rating || reviewCount !== null)"
                    class="google-attribution"
                    translate="no"
                    data-testid="detail-rating-source"
                  >
                    Google Maps
                  </span>
                  <span
                    v-if="reviewCount !== null"
                    class="d-block text-secondary small"
                    data-testid="detail-review-count"
                  >
                    {{ reviewCount }} reviews
                  </span>
                </dd>
              </div>
            </dl>

            <div class="d-grid gap-2 mt-4">
              <button
                type="button"
                class="btn btn-dark rounded-pill action-button"
                data-testid="detail-share"
                :disabled="sharing"
                @click="openShare"
              >
                Share to group
              </button>
              <button
                type="button"
                class="btn btn-outline-dark rounded-pill action-button"
                :class="{ 'is-saved': saved }"
                :aria-pressed="saved"
                data-testid="detail-save"
                :disabled="saving"
                @click="toggleSaved"
              >
                <span aria-hidden="true">{{ saved ? '♥' : '♡' }}</span>
                {{ saving ? 'Saving…' : saved ? 'Saved' : 'Save activity' }}
              </button>
              <a
                v-if="websiteUrl"
                :href="websiteUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-outline-dark rounded-pill action-button"
                data-testid="detail-website"
              >
                Official website <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p v-if="!websiteUrl" class="text-secondary small mt-3 mb-0">
              Official website not available yet.
            </p>

            <div
              v-if="actionError"
              class="alert alert-danger mt-3 mb-0"
              role="alert"
              data-testid="detail-action-error"
            >
              {{ actionError }}
              <RouterLink v-if="needsLogin" to="/login" class="d-block mt-2">Log in</RouterLink>
            </div>
          </section>
        </aside>
        <div class="col-12 col-lg-8">
          <section class="detail-section mb-4" aria-labelledby="description-title">
            <h2 id="description-title" class="h5 fw-bold mb-3">About this activity</h2>
            <p class="description mb-0" data-testid="detail-description">
              {{ activity.description || "A description hasn't been added for this activity yet." }}
            </p>
          </section>

          <section class="detail-section mb-4" aria-labelledby="hours-title">
            <h2 id="hours-title" class="h5 fw-bold mb-3">Opening hours</h2>
            <p
              v-if="googleHours.available"
              class="google-attribution"
              translate="no"
              data-testid="detail-hours-source"
            >
              Google Maps
            </p>
            <p v-else-if="hours.available && activity.google_place_id" class="text-secondary small">
              Showing saved activity hours.
            </p>
            <p
              v-if="!hours.available"
              class="text-secondary small"
              data-testid="detail-hours-unavailable"
            >
              Opening hours haven't been added yet.
            </p>
            <ul class="hours-list list-unstyled mb-0">
              <li
                v-for="row in hours.rows"
                :key="row.day"
                class="hours-row"
                :class="{ 'is-today': row.isToday }"
                :aria-current="row.isToday ? 'date' : undefined"
                data-testid="detail-hours-row"
              >
                <span>
                  {{ row.day }}
                  <span v-if="row.isToday" class="today-label">Today</span>
                </span>
                <span>{{ row.hours }}</span>
              </li>
            </ul>
            <p
              v-for="(provider, index) in googleAttributions"
              :key="index"
              class="small mt-2 mb-0"
              data-testid="detail-google-attribution"
            >
              <a v-if="provider.url" :href="provider.url" target="_blank" rel="noopener noreferrer">
                {{ provider.name }}
              </a>
              <span v-else>{{ provider.name }}</span>
            </p>
          </section>

          <section
            class="detail-section"
            aria-labelledby="location-title"
            data-testid="detail-location"
          >
            <h2 id="location-title" class="h5 fw-bold mb-3">Location</h2>
            <p class="mb-1" data-testid="detail-address">
              {{ location.address || 'Location unavailable' }}
            </p>
            <p v-if="location.area" class="text-secondary">{{ location.area }}</p>
            <iframe
              v-if="mapEmbedUrl"
              :src="mapEmbedUrl"
              :title="`Map showing ${activity.name}`"
              data-testid="detail-map"
              width="100%"
              height="320"
              style="border: 0; border-radius: 12px"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            ></iframe>
          </section>
        </div>
      </div>

      <dialog
        ref="shareDialog"
        class="share-dialog"
        aria-labelledby="share-dialog-title"
        data-testid="detail-share-dialog"
        @cancel.prevent="closeShare"
        @close="closeShare"
      >
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
          <div>
            <h2 id="share-dialog-title" class="h4 fw-bold mb-2">Share to group</h2>
            <p class="text-secondary mb-0">{{ activity.name }}</p>
          </div>
          <button
            type="button"
            class="btn-close"
            aria-label="Close share menu"
            :disabled="sharing"
            @click="closeShare"
          ></button>
        </div>

        <p v-if="groupsLoading" role="status">Loading your groups…</p>
        <div v-else-if="groupsError" class="alert alert-danger" role="alert">
          {{ groupsError }}
          <button
            v-if="!groups.length"
            type="button"
            class="btn btn-outline-danger mt-2"
            @click="openShare"
          >
            Try again
          </button>
        </div>
        <p v-else-if="groups.length === 0" data-testid="detail-no-groups">
          You're not in any groups yet.
        </p>

        <form v-if="!groupsLoading && groups.length" @submit.prevent="shareActivity">
          <label for="detail-share-group" class="form-label">Choose a group</label>
          <select
            id="detail-share-group"
            v-model="selectedGroupId"
            class="form-select mb-3"
            data-testid="detail-share-group"
            :disabled="sharing"
            required
          >
            <option value="">Choose a group</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
          <button
            type="submit"
            class="btn btn-dark rounded-pill w-100"
            :disabled="!selectedGroupId || sharing"
            data-testid="detail-confirm-share"
          >
            {{ sharing ? 'Sharing…' : 'Share activity' }}
          </button>
        </form>
        <RouterLink v-if="!sharing" to="/groups" class="d-inline-block mt-3" @click="closeShare">
          Create a new group
        </RouterLink>
      </dialog>
    </article>

    <div v-if="message" class="action-toast" role="status" data-testid="detail-toast">
      {{ message }}
    </div>
  </div>
</template>

<style scoped>
.google-attribution {
  color: #5e5e5e;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  letter-spacing: normal;
  white-space: nowrap;
}

.back-button {
  padding: 8px 18px;
}
.detail-photo-container {
  overflow: hidden;
  border-radius: 24px;
}
.detail-photo,
.detail-placeholder {
  width: 100%;
  height: 420px;
}
.detail-photo {
  display: block;
  object-fit: cover;
}
.detail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f3f3;
  color: #666;
  font-size: 1.75rem;
}
.detail-title {
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 750;
  line-height: 1.15;
}
.detail-badge {
  display: inline-block;
  padding: 6px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: #fafafa;
  font-size: 0.875rem;
}
.community-badge {
  background: #111;
  color: white;
  border-color: #111;
}
.rating-badge {
  color: #946200;
  font-weight: 600;
  white-space: nowrap;
  padding-top: 8px;
}
.detail-section,
.facts-card {
  padding: 24px;
  border: 1px solid #e5e5e5;
  border-radius: 20px;
}
.description {
  white-space: pre-line;
  line-height: 1.7;
}
.hours-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.9rem;
}
.hours-row > span:last-child {
  text-align: right;
}
.hours-row.is-today {
  background: #f3f3f3;
  font-weight: 600;
}
.today-label {
  margin-left: 6px;
  font-size: 0.7rem;
  color: #666;
}
.facts-card {
  background: #fafafa;
}
.price-label {
  font-size: 2rem;
  font-weight: 700;
}
.facts-list > div {
  padding: 12px 0;
  border-bottom: 1px solid #e5e5e5;
}
.facts-list dt {
  color: #666;
  font-size: 0.875rem;
  font-weight: 400;
}
.facts-list dd {
  margin: 4px 0 0;
  font-weight: 600;
}
.action-button {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.is-saved {
  color: #dc3545;
}
.share-dialog {
  width: min(460px, calc(100% - 32px));
  max-height: calc(100vh - 48px);
  padding: 28px;
  border: 1px solid #e5e5e5;
  border-radius: 20px;
  box-shadow: 0 16px 48px rgb(0 0 0 / 15%);
}
.share-dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.action-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1100;
  max-width: min(360px, calc(100% - 32px));
  padding: 14px 20px;
  border-radius: 14px;
  background: #111;
  color: white;
}
@media (min-width: 992px) {
  .facts-card {
    position: sticky;
    top: 24px;
  }
}
@media (max-width: 575.98px) {
  .detail-photo,
  .detail-placeholder {
    height: 240px;
  }
  .detail-photo-container {
    border-radius: 18px;
  }
  .detail-section,
  .facts-card {
    padding: 20px;
  }
  .hours-row {
    padding: 10px 6px;
    gap: 8px;
  }
  .action-toast {
    left: 16px;
    right: 16px;
    bottom: 16px;
    max-width: none;
  }
}
</style>
