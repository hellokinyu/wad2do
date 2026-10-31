<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LandingActionLink from '@/components/LandingActionLink.vue'
import LandingFeatureCard from '@/components/LandingFeatureCard.vue'
import LandingSkyline from '@/components/LandingSkyline.vue'
import brandLogo from '@/assets/wad2do-logo.png'
import { useAuth } from '@/composables/useAuth'

const { user } = useAuth()

// Build the image URL from its Unsplash photo ID.
const picture = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=850&q=85`

const slides = [
  {
    phrase: 'great plans',
    photos: [
      {
        label: 'Marina Bay',
        alt: 'Singapore skyline and Marina Bay Sands at sunset',
        src: picture('photo-1525625293386-3f8f99389edd'),
      },
      {
        label: 'Coffee dates',
        alt: 'Coffee served in a cosy cafe',
        src: picture('photo-1501339847302-ac426a4a7cbb'),
      },
      {
        label: 'City evenings',
        alt: 'Singapore streets lit up after dark',
        src: picture('photo-1496939376851-89342e90adcd'),
      },
    ],
  },
  {
    phrase: 'date ideas',
    photos: [
      {
        label: 'Gardens by the Bay',
        alt: 'Supertrees at Gardens by the Bay in Singapore',
        src: picture('photo-1508964942454-1a56651d54ac'),
      },
      {
        label: 'Cafe catch-ups',
        alt: 'Fresh coffee for a relaxed cafe date',
        src: picture('photo-1442512595331-e89e73853f31'),
      },
      {
        label: 'Dinner together',
        alt: 'A warmly lit restaurant ready for dinner',
        src: picture('photo-1517248135467-4c7edcad34c4'),
      },
    ],
  },
  {
    phrase: 'new experiences',
    photos: [
      {
        label: 'Explore Singapore',
        alt: 'Singapore architecture and city views',
        src: picture('photo-1565967511849-76a60a516170'),
      },
      {
        label: 'Creative afternoons',
        alt: 'Hands shaping clay on a pottery wheel',
        src: picture('photo-1607556671927-78a6605e290b'),
      },
      {
        label: 'Try something new',
        alt: 'A spread of food to share with friends',
        src: picture('photo-1414235077428-338989a2e8c0'),
      },
    ],
  },
]
const features = [
  {
    icon: 'search',
    title: 'Discover Activities',
    description:
      'Find curated activities in Singapore based on your interests, budget, location and more.',
  },
  {
    icon: 'friends',
    title: 'Plan With Friends',
    description:
      'Create a group, suggest activities, vote, find a common time and build your itinerary.',
  },
  {
    icon: 'calendar',
    title: 'Make It Happen',
    description:
      'Turn ideas into a plan with times, locations, estimated costs and even weather alternatives.',
  },
]
const activeSlide = ref(0)

// Week 5: computed properties derive display state from reactive refs.
const currentSlide = computed(() => slides[activeSlide.value])

let timer
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function pause() {
  clearInterval(timer)
  timer = undefined
}

function resume() {
  pause()
  if (!reducedMotion) {
    timer = setInterval(() => {
      activeSlide.value = (activeSlide.value + 1) % slides.length
    }, 3500)
  }
}

function selectSlide(index) {
  activeSlide.value = index
}

function onFocusOut(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) resume()
}

// Week 5: start the carousel after mounting and clean up its timer on unmount.
onMounted(resume)
onUnmounted(pause)
</script>

<template>
  <div class="landing w-100" data-testid="landing-page">
    <header class="landing-nav d-flex align-items-center">
      <RouterLink to="/" class="wordmark" aria-label="WAD2Do home">
        <img :src="brandLogo" alt="WAD2Do" class="brand-logo" width="180" height="60" />
      </RouterLink>
    </header>

    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">FOR FRIENDS · DATES · GOOD TIMES</p>
        <h1 id="hero-title">
          Turn free time<br />into
          <Transition name="phrase" mode="out-in"
            ><span :key="activeSlide" class="highlight"
              >{{ currentSlide.phrase }}.</span
            ></Transition
          >
        </h1>
        <p class="intro">
          Discover things to do in Singapore, plan with friends,<br class="desktop-break" />
          and make the most of your weekends (and weekdays).
        </p>
        <!-- Each reusable link handles its own hover microinteraction. -->
        <div class="hero-actions d-flex flex-wrap">
          <template v-if="user">
            <LandingActionLink to="/activities" primary>Explore activities</LandingActionLink>
            <LandingActionLink to="/groups">Your groups</LandingActionLink>
          </template>
          <template v-else>
            <LandingActionLink to="/signup" primary>Sign up</LandingActionLink>
            <LandingActionLink to="/login">Log in</LandingActionLink>
          </template>
        </div>
      </div>

      <div
        class="carousel"
        role="region"
        aria-label="Things to do in Singapore"
        @mouseenter="pause"
        @mouseleave="resume"
        @focusin="pause"
        @focusout="onFocusOut"
      >
        <div class="photo-grid">
          <Transition name="photos" mode="out-in">
            <div :key="activeSlide" class="photo-set">
              <figure
                v-for="(photo, index) in currentSlide.photos"
                :key="photo.label"
                :class="['photo', { tall: index === 0 }]"
              >
                <img
                  class="w-100 h-100"
                  :src="photo.src"
                  :alt="photo.alt"
                  :loading="activeSlide === 0 ? 'eager' : 'lazy'"
                />
                <figcaption>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z" />
                    <circle cx="12" cy="9" r="2" /></svg
                  >{{ photo.label }}
                </figcaption>
              </figure>
            </div>
          </Transition>
        </div>
        <div class="carousel-dots" aria-label="Choose a slide">
          <button
            v-for="(slide, index) in slides"
            :key="slide.phrase"
            type="button"
            :class="{ selected: index === activeSlide }"
            :aria-label="`Show ${slide.phrase}`"
            :aria-pressed="index === activeSlide"
            @click="selectSlide(index)"
          ></button>
        </div>
      </div>
    </section>

    <section class="features" aria-label="How WAD2Do works">
      <LandingFeatureCard v-for="feature in features" :key="feature.title" :feature="feature" />
    </section>

    <LandingSkyline />
  </div>
</template>

<style scoped>
/* Weeks 2–3: Bootstrap handles common utilities; scoped CSS defines this page's design. */
.landing {
  --page-gutter: clamp(24px, 5vw, 100px);
  --landing-skyline-height: clamp(100px, 15svh, 160px);
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  background: linear-gradient(135deg, var(--surface), var(--surface-2));
  color: var(--ink);
}
.landing-nav {
  padding: clamp(12px, 2svh, 24px) var(--page-gutter) 8px;
}
.wordmark {
  display: inline-flex;
}
.brand-logo {
  display: block;
  width: 180px;
  height: 60px;
  object-fit: contain;
}
/* The logo PNG is black, so flip it to light in dark mode */
:root[data-bs-theme='dark'] .brand-logo {
  filter: invert(1) brightness(0.95);
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: clamp(28px, 4vw, 88px);
  padding: clamp(16px, 2svh, 28px) var(--page-gutter);
  align-items: center;
}
.hero-copy,
.carousel {
  min-width: 0;
}
.eyebrow {
  font-size: clamp(10px, 0.75vw, 13px);
  letter-spacing: 2.5px;
  color: var(--muted);
  margin-bottom: 22px;
}
h1 {
  font-size: clamp(36px, 3.4vw, 64px);
  line-height: 1.12;
  font-weight: 750;
  letter-spacing: -1.8px;
  margin: 0 0 24px;
}
.highlight {
  display: inline-block;
  position: relative;
  z-index: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.highlight::before {
  content: '';
  position: absolute;
  inset: 5px -5px 0;
  background: var(--surface-3);
  border-radius: var(--radius-sm);
  transform: rotate(-1deg);
  z-index: -1;
}
.intro {
  color: var(--muted);
  font-size: clamp(14px, 1vw, 18px);
  line-height: 1.6;
  margin-bottom: clamp(20px, 3svh, 32px);
}
.hero-actions {
  gap: 18px;
  position: relative;
  width: fit-content;
}
.photo-set {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: repeat(2, clamp(130px, 20svh, 240px));
  gap: clamp(10px, 1vw, 18px);
}
.photo {
  min-width: 0;
  min-height: 0;
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin: 0;
  background: var(--surface-3);
}
.photo.tall {
  grid-row: span 2;
}
.photo img {
  object-fit: cover;
  transition: transform 0.4s;
}
.photo:hover img {
  transform: scale(1.02);
}
.photo figcaption {
  position: absolute;
  bottom: 10px;
  left: 9px;
  max-width: calc(100% - 18px);
  display: flex;
  align-items: center;
  gap: 3px;
  /* A white label on the photo in both modes, so its text stays dark */
  background: #fffffff2;
  color: #111219;
  border-radius: var(--radius-pill);
  padding: 6px 9px;
  font-size: clamp(10px, 0.8vw, 14px);
  font-weight: 600;
}
.photo figcaption svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  flex-shrink: 0;
}
.carousel-dots {
  display: flex;
  justify-content: flex-end;
  gap: 3px;
  padding: 7px 16px 0;
}
.carousel-dots button {
  width: 22px;
  height: 26px;
  border: 0;
  background: transparent;
  display: grid;
  place-items: center;
  padding: 0;
}
.carousel-dots button::after {
  content: '';
  width: 7px;
  height: 7px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}
.carousel-dots button.selected::after {
  background: var(--ink);
  border-color: var(--ink);
}
.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: clamp(16px, 2svh, 24px) var(--page-gutter) 0;
}
.phrase-enter-active,
.phrase-leave-active,
.photos-enter-active,
.photos-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.phrase-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.phrase-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.photos-enter-from,
.photos-leave-to {
  opacity: 0;
}
/* Give desktop sections a shared viewport budget, including the complete skyline. */
@media (min-width: 1100px) and (min-height: 650px) {
  .landing {
    height: 100svh;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
  }
  .hero {
    min-height: 0;
  }
  .carousel {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: min(46svh, 500px);
    min-height: 0;
  }
  .photo-grid {
    flex: 1;
    min-height: 0;
  }
  .photo-set {
    height: 100%;
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }
  .carousel-dots {
    flex-shrink: 0;
  }
  .eyebrow {
    margin-bottom: clamp(12px, 2svh, 20px);
  }
  h1 {
    margin-bottom: clamp(16px, 2svh, 24px);
  }
  .desktop-break {
    display: none;
  }
}
/* Balance taller screens between the hero, feature row and waterfront artwork. */
@media (min-width: 1100px) and (min-height: 800px) {
  .landing {
    --landing-skyline-height: clamp(140px, 19svh, 200px);
  }
}
/* Short landscape windows keep their natural scroll instead of squeezing content. */
@media (min-width: 901px) and (max-height: 649px) {
  .photo-set {
    grid-template-rows: repeat(2, clamp(110px, 23svh, 160px));
  }
}
@media (max-width: 900px) {
  .landing {
    --page-gutter: clamp(24px, 5vw, 40px);
    --landing-skyline-height: clamp(100px, 25vw, 150px);
    grid-template-rows: repeat(4, auto);
  }
  .landing-nav {
    padding: 24px var(--page-gutter) 12px;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 28px var(--page-gutter);
    gap: 40px;
  }
  h1 {
    font-size: clamp(30px, 5.5vw, 48px);
  }
  .intro {
    margin-bottom: 28px;
  }
  .desktop-break {
    display: none;
  }
  .photo-set {
    grid-template-rows: repeat(2, clamp(130px, 24vw, 200px));
  }
  .features {
    grid-template-columns: 1fr;
    padding: 8px var(--page-gutter) 0;
    gap: 24px;
  }
}
@media (max-width: 600px) {
  .landing {
    --landing-skyline-height: clamp(70px, 12svh, 100px);
    grid-template-rows: auto 1fr auto;
  }
  .intro,
  .features {
    display: none;
  }
  .landing-nav {
    padding-top: 16px;
    padding-bottom: 8px;
  }
  .hero {
    grid-template-areas:
      'eyebrow'
      'headline'
      'photos'
      'actions';
    padding-top: 16px;
    padding-bottom: 8px;
    gap: 20px;
    align-content: center;
  }
  .hero-copy {
    display: contents;
  }
  .eyebrow {
    grid-area: eyebrow;
    margin-bottom: 0;
  }
  h1 {
    grid-area: headline;
    font-size: clamp(35px, 9.5vw, 44px);
    /* Reserve three lines so the rotating phrases do not move the photos. */
    min-height: 3.36em;
    margin-bottom: 0;
    letter-spacing: -1.3px;
  }
  .carousel {
    grid-area: photos;
  }
  .hero-actions {
    grid-area: actions;
  }
  .photo-set {
    grid-template-rows: repeat(2, clamp(110px, 18svh, 160px));
  }
}
@media (max-width: 600px) and (min-height: 740px) {
  .hero {
    /* Balance the taller photos with a little less space above the heading. */
    padding-top: 32px;
    padding-bottom: 0;
  }
}
@media (max-width: 480px) {
  .brand-logo {
    width: 150px;
    height: 50px;
  }
  .hero-actions {
    width: 100%;
    gap: 12px;
  }
  .hero-actions :deep(.pill) {
    flex: 1;
    min-width: 0;
    padding-inline: 16px;
  }
  .photo figcaption {
    font-size: 10px;
    padding: 5px 7px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
  }
}
</style>
