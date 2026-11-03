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
  // Why Best match ranked this card, from matchReasons(). Empty when it isn't ranked.
  reasons: {
    type: Array,
    default: () => [],
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
// Cards leave out missing details instead of printing "unavailable"; the detail page still says so
const duration = computed(() => {
  const text = formatDuration(props.activity.duration_min)
  return text === 'Duration unavailable' ? '' : text
})
const hasSetting = computed(
  () => props.activity.indoor !== null && props.activity.indoor !== undefined,
)
const setting = computed(() => getSetting(props.activity.indoor))
// "Outdoor · Outdoor" says nothing, so skip the setting when the category already is one
const showSetting = computed(
  () =>
    hasSetting.value &&
    props.activity.category?.trim().toLowerCase() !== setting.value.toLowerCase(),
)
const area = computed(() => props.activity.area?.trim() || '')
const imageFailed = ref(false)
watch(
  () => props.activity.image_url,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <article class="activity-card surface-card card h-100" data-testid="activity-card">
    <div class="photo-container">
      <!-- Same page as the name link, so Tab skips it and goes straight to the name -->
      <RouterLink
        :to="`/activities/${activity.id}`"
        :aria-label="`View ${activity.name}`"
        tabindex="-1"
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
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m21 15-4.5-4.5L8 19" />
          </svg>
        </div>
      </RouterLink>

      <div class="photo-badges">
        <span class="badge rounded-pill bg-white text-dark">
          {{ activity.category || 'Activity' }}
        </span>

        <span
          v-if="activity.source === 'community'"
          class="badge rounded-pill text-bg-dark community-badge"
        >
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
          <span class="save-burst" aria-hidden="true">
            <span class="save-particle">♥</span>
            <span class="save-particle">♥</span>
            <span class="save-particle">♥</span>
          </span>
          <svg
            class="save-icon"
            viewBox="0 0 24 24"
            width="26"
            height="26"
            aria-hidden="true"
            focusable="false"
          >
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
          <RouterLink
            :to="`/activities/${activity.id}`"
            :title="activity.name"
            data-testid="activity-name-link"
          >
            {{ activity.name }}
          </RouterLink>
        </h2>
      </div>

      <p class="fw-semibold mb-2">
        {{ priceLabel }}<span v-if="priceLabel.startsWith('S$')"> / person</span>
      </p>
      <p v-if="reasons.length" class="match-reasons" data-testid="activity-match-reasons">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9Z" />
        </svg>
        <span><strong>For you:</strong> {{ reasons.join(' · ') }}</span>
      </p>
      <p
        v-if="activity.description?.trim()"
        class="activity-description text-secondary small mb-2"
        data-testid="activity-description"
      >
        {{ activity.description }}
      </p>

      <div class="activity-metadata mt-auto pt-2">
        <p v-if="area" class="text-secondary small mb-1">{{ area }}</p>

        <p v-if="showSetting || duration" class="meta-line text-secondary small mb-0">
          <span v-if="showSetting" class="meta-setting">
            <svg v-if="activity.indoor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
              />
            </svg>
            {{ setting }}
          </span>
          <span v-if="showSetting && duration" aria-hidden="true">·</span>
          <span v-if="duration">{{ duration }}</span>
        </p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  overflow: hidden;
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

/* text-bg-dark disappears on a dark placeholder in Supper Club; the hairline keeps its edge */
.community-badge {
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 40%);
}

.activity-photo,
.photo-placeholder {
  width: 100%;
  height: 200px;
}

/* A shorter photo on phones, so the name and price of the first card show on the first screen */
@media (max-width: 575.98px) {
  .activity-photo,
  .photo-placeholder {
    height: 168px;
  }
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
  background: var(--surface-2);
}

.photo-placeholder svg {
  width: 40px;
  height: 40px;
  fill: none;
  stroke: var(--subtle);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.activity-card:hover .activity-photo {
  transform: scale(1.03);
}

.activity-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-wrap: pretty;
}

.match-reasons {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.match-reasons strong {
  color: var(--ink);
  font-weight: 700;
}

.match-reasons svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  fill: var(--ink);
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 6px;
}

.meta-setting {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-setting svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.activity-name {
  height: 2.6em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  flex: 1;
  margin-bottom: 8px;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}

.activity-name a {
  color: var(--ink);
  text-decoration: none;
}

.activity-name a:hover {
  text-decoration: underline;
}

/* The two-line title height only lines prices up across a row; one card per row doesn't need it */
@media (max-width: 767.98px) {
  .activity-name {
    height: auto;
  }
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
  background: var(--photo-scrim);
  color: white;
  transition: background-color 180ms ease;
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
  background: var(--photo-scrim-strong);
}

.save-button {
  position: relative;
  isolation: isolate;
}

/* Hover only grows the heart; the pop and the floating hearts are kept for actually saving it */
.save-icon {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    fill 180ms ease;
  transform-origin: center;
}

.save-button.saved {
  color: var(--accent);
}

.save-button.saved .save-icon {
  fill: currentColor;
  stroke: white;
  animation: heart-pop 450ms ease;
}

.save-burst {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.save-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  color: #ffd27a;
  font-size: 12px;
  line-height: 1;
  opacity: 0;
  text-shadow: 0 1px 3px rgb(0 0 0 / 35%);
}

.save-particle:nth-child(1) {
  --float-x: -23px;
  --float-y: -21px;
  --float-rotate: -25deg;
}

.save-particle:nth-child(2) {
  --float-x: 0px;
  --float-y: -28px;
  --float-rotate: 12deg;
  animation-delay: 70ms;
  color: white;
  font-size: 9px;
}

.save-particle:nth-child(3) {
  --float-x: 23px;
  --float-y: -17px;
  --float-rotate: 25deg;
  animation-delay: 140ms;
}

.save-button.saved .save-particle {
  animation-name: love-float;
  animation-duration: 750ms;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}

.save-button:focus-visible:not(:disabled) .save-icon {
  transform: scale(1.12);
}

@media (hover: hover) {
  .save-button:hover:not(:disabled) .save-icon {
    transform: scale(1.12);
  }
}

@keyframes heart-pop {
  0%,
  100% {
    scale: 1;
  }
  35% {
    scale: 1.22;
  }
  60% {
    scale: 0.92;
  }
  80% {
    scale: 1.08;
  }
}

@keyframes love-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--float-x)), calc(-50% + var(--float-y)))
      rotate(var(--float-rotate)) scale(0.7);
  }
}

.photo-action:focus-visible {
  outline: 2px solid white; /* on a photo, so white in both modes */
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgb(0 0 0 / 60%);
}

.save-button:disabled {
  cursor: wait;
}

@media (prefers-reduced-motion: reduce) {
  .save-button,
  .save-button .save-icon {
    transition: none;
  }

  .save-button .save-icon,
  .save-button .save-particle {
    animation: none !important;
  }

  .photo-action {
    transition: none;
  }

  .activity-photo {
    transition: none;
  }

  .activity-card:hover .activity-photo {
    transform: none;
  }
}
</style>
