<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { formatPrice, formatDuration, getSetting } from '@/lib/activityDisplay'

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
  saving: {
    type: Boolean,
    default: false,
  },
  saveDisabled: {
    type: Boolean,
    default: false,
  },
  showShare: {
    type: Boolean,
    default: true,
  },
})

// Events that ActivitiesView can listen for.
const emit = defineEmits(['save', 'share'])

function share(event) {
  // Safari does not focus buttons on pointer clicks before opening a dialog.
  event.currentTarget.focus({ preventScroll: true })
  emit('share', props.activity.id)
}

// The card and detail page use the same display rules.
const priceLabel = computed(() => formatPrice(props.activity.price_per_person))
const duration = computed(() => formatDuration(props.activity.duration_min))
const setting = computed(() => getSetting(props.activity.indoor))
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

      <div class="photo-actions">
        <button
          type="button"
          class="photo-action save-button"
          :class="{ saved: saved }"
          :aria-pressed="saved"
          :aria-label="
            saved ? `Remove ${activity.name} from saved activities` : `Save ${activity.name}`
          "
          :aria-busy="saving"
          :disabled="saveDisabled || saving"
          data-testid="activity-save"
          @click="emit('save', activity.id)"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
            <path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
            />
          </svg>
        </button>
        <button
          v-if="showShare"
          type="button"
          class="photo-action share-button"
          :aria-label="`Share ${activity.name} to groups`"
          aria-haspopup="dialog"
          title="Share to groups"
          data-testid="activity-share"
          @click="share"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
          </svg>
        </button>
      </div>
    </div>

    <div class="card-body d-flex flex-column">
      <div class="d-flex align-items-start gap-2">
        <h2 class="activity-name">
          <RouterLink :to="`/activities/${activity.id}`" data-testid="activity-name-link">
            {{ activity.name }}
          </RouterLink>
        </h2>
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

.photo-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-action {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 9px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: white;
}

.photo-action svg {
  fill: none;
  stroke: white;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 80%));
}

.photo-action:hover,
.photo-action:focus-visible {
  background: rgb(0 0 0 / 16%);
}

.save-button.saved {
  color: #dc3545;
}

.save-button.saved svg {
  fill: currentColor;
}

.photo-action:focus-visible {
  outline: 2px solid white;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgb(0 0 0 / 60%);
}

.save-button:disabled {
  cursor: wait;
}

@media (prefers-reduced-motion: reduce) {
  .activity-photo {
    transition: none;
  }

  .activity-card:hover .activity-photo {
    transform: none;
  }
}
</style>
