<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

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
    default: 'Hours unavailable',
  },
  showActions: {
    type: Boolean,
    default: true,
  },
  linkToDetails: {
    type: Boolean,
    default: true,
  },
})

// Events that ActivitiesView can listen for.
const emit = defineEmits(['save', 'share'])

// Convert the price into readable text.
const priceLabel = computed(() => {
  const price = props.activity.price_per_person

  if (price == null) return 'Price unavailable'
  if (Number(price) === 0) return 'Free'

  return `S$${Number(price).toFixed(2)} / person`
})
</script>

<template>
  <article class="activity-card card h-100" data-testid="activity-card">
    <div class="photo-container">
      <component
        :is="linkToDetails ? RouterLink : 'div'"
        :to="linkToDetails ? `/activities/${activity.id}` : undefined"
        :aria-label="linkToDetails ? `View ${activity.name}` : undefined"
        data-testid="activity-photo-link"
      >
        <img
          v-if="activity.image_url"
          :src="activity.image_url"
          :alt="activity.name"
          class="activity-photo"
          loading="lazy"
        />

        <div v-else class="photo-placeholder">
          {{ activity.category }}
        </div>
      </component>

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
      <div class="d-flex flex-wrap gap-2 mb-2">
        <span class="badge rounded-pill text-bg-light">
          {{ activity.category }}
        </span>

        <span v-if="activity.source === 'community'" class="badge rounded-pill text-bg-dark">
          Community
        </span>
      </div>

      <div class="d-flex align-items-start gap-2">
        <h2 class="activity-name">
          <component
            :is="linkToDetails ? RouterLink : 'span'"
            :to="linkToDetails ? `/activities/${activity.id}` : undefined"
            data-testid="activity-name-link"
          >
            {{ activity.name }}
          </component>
        </h2>

        <span v-if="rating !== null" class="activity-rating">
          <span aria-hidden="true">★</span> {{ rating }}
        </span>
      </div>

      <p class="fw-semibold mb-2">{{ priceLabel }}</p>

      <p class="text-secondary small mb-1">
        {{ activity.area }}
      </p>

      <p class="text-secondary small mb-1">Today: {{ hoursToday }}</p>

      <p class="text-secondary small mb-3">
        <span aria-hidden="true">{{ activity.indoor ? '⌂' : '☀' }}</span>
        {{ activity.indoor ? 'Indoor' : 'Outdoor' }}
        · {{ activity.duration_min }} min
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
  border: 1px solid #e5e5e5;
  border-radius: 18px;
}

.photo-container {
  position: relative;
  overflow: hidden;
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
