<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  formatPrice,
  formatDuration,
  getSetting,
  getRating,
  getWeeklyHours,
} from '@/lib/activityDisplay'

// Information supplied by ActivitiesView.
const props = defineProps({
  activity: {
    type: Object,
    required: true,
  },
  saved: {
    type: Boolean,
    default: false,
  },
  rating: {
    type: Number,
    default: null,
  },
  hoursToday: {
    type: String,
    default: null,
  },
  showActions: {
    type: Boolean,
    default: true,
  },
})

// Events that ActivitiesView can listen for.
const emit = defineEmits(['save', 'share'])

// The card and detail page use the same display rules.
const priceLabel = computed(() => formatPrice(props.activity.price_per_person))
const duration = computed(() => formatDuration(props.activity.duration_min))
const setting = computed(() => getSetting(props.activity.indoor))
const ratingLabel = computed(() => getRating({ rating: props.rating ?? props.activity.rating }))
const todayHours = computed(
  () =>
    props.hoursToday ??
    getWeeklyHours(props.activity.opening_hours).rows.find((row) => row.isToday).hours,
)
const showSetting = computed(
  () => props.activity.category?.trim().toLowerCase() !== setting.value.toLowerCase(),
)
const imageFailed = ref(false)
watch(
  () => props.activity.image_url,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <article class="activity-card card h-100" data-testid="activity-card">
    <div class="photo-container">
      <RouterLink
        :to="`/activities/${activity.id}`"
        :aria-label="`View ${activity.name}`"
        data-testid="activity-photo-link"
      >
        <img
          v-if="activity.image_url && !imageFailed"
          :src="activity.image_url"
          :alt="activity.name"
          class="activity-photo"
          loading="lazy"
          @error="imageFailed = true"
        />

        <div v-else class="photo-placeholder">
          {{ activity.category || 'Activity' }}
        </div>
      </RouterLink>

      <div class="photo-badges">
        <span class="badge rounded-pill bg-white text-dark">
          {{ activity.category || 'Activity' }}
        </span>

        <span v-if="activity.source === 'community'" class="badge rounded-pill text-bg-dark">
          Community
        </span>
      </div>

      <button
        v-if="showActions"
        type="button"
        class="save-button"
        :class="{ saved: saved }"
        :aria-pressed="saved"
        :aria-label="saved ? 'Remove from saved activities' : 'Save activity'"
        data-testid="activity-save"
        @click="emit('save', activity.id)"
      >
        {{ saved ? '♥' : '♡' }}
      </button>
    </div>

    <div class="card-body d-flex flex-column">
      <div class="d-flex align-items-start gap-2">
        <h2 class="activity-name">
          <RouterLink :to="`/activities/${activity.id}`" data-testid="activity-name-link">
            {{ activity.name }}
          </RouterLink>
        </h2>

        <span v-if="ratingLabel" class="activity-rating">
          <span aria-hidden="true">★</span> {{ ratingLabel }}
        </span>
      </div>

      <p class="fw-semibold mb-2">
        {{ priceLabel }}<span v-if="priceLabel.startsWith('S$')"> / person</span>
      </p>
      <p
        v-if="activity.description?.trim()"
        class="text-secondary small mb-2"
        data-testid="activity-description"
      >
        {{ activity.description }}
      </p>

      <p class="text-secondary small mb-1">
        {{ activity.area || 'Area unavailable' }}
      </p>

      <p class="text-secondary small mb-1">Today: {{ todayHours }}</p>

      <p class="text-secondary small mb-3">
        <span v-if="showSetting">
          <span
            v-if="activity.indoor !== null && activity.indoor !== undefined"
            aria-hidden="true"
            >{{ activity.indoor ? '⌂' : '☀' }}</span
          >
          {{ setting }} ·
        </span>
        {{ duration }}
      </p>

      <button
        v-if="showActions"
        type="button"
        class="btn btn-outline-dark rounded-pill mt-auto"
        data-testid="activity-share"
        @click="emit('share', activity.id)"
      >
        Share to group
      </button>
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  overflow: hidden;
  border: 1px solid #eee;
  border-radius: 18px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 4%);
}

.card-body {
  padding: 16px;
}

.photo-container {
  position: relative;
  overflow: hidden;
}

.photo-badges {
  position: absolute;
  left: 12px;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none;
}

.photo-badges .badge {
  padding: 6px 10px;
  font-weight: 500;
}

.activity-photo,
.photo-placeholder {
  width: 100%;
  height: 200px;
}

.activity-photo {
  display: block;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.photo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f3f3;
  color: #666;
}

.activity-card:hover .activity-photo {
  transform: scale(1.03);
}

.activity-name {
  flex: 1;
  margin-bottom: 8px;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}

.activity-name a {
  color: #111;
  text-decoration: none;
}

.activity-name a:hover {
  text-decoration: underline;
}

.activity-rating {
  white-space: nowrap;
  color: #946200;
  font-size: 0.875rem;
}

.save-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: white;
  font-size: 1.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.activity-card:hover .save-button,
.activity-card:focus-within .save-button,
.save-button.saved {
  opacity: 1;
}

.save-button.saved {
  color: #dc3545;
}

/* Phones cannot rely on hovering to reveal the button. */
@media (hover: none) {
  .save-button {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-photo,
  .save-button {
    transition: none;
  }

  .activity-card:hover .activity-photo {
    transform: none;
  }
}
</style>
