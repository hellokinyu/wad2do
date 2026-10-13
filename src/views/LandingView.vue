<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LandingActionLink from '@/components/LandingActionLink.vue'
import LandingFeatureCard from '@/components/LandingFeatureCard.vue'

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
    }, 5000)
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
  <div class="landing d-flex align-items-center" data-testid="landing-page">
    <div class="landing-frame w-100 mx-auto">
      <header class="landing-nav d-flex align-items-center">
        <RouterLink to="/" class="wordmark" aria-label="WAD2Do home">WAD2Do</RouterLink>
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
            <LandingActionLink to="/signup" primary>Sign up</LandingActionLink>
            <LandingActionLink to="/login">Log in</LandingActionLink>
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

      <footer class="skyline" aria-hidden="true">
        <svg
          viewBox="0 0 1000 110"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M0 65C65 110 125 20 205 55S310 95 370 74s82-10 128 5 84 25 113-4 82-7 124 7 75 7 113-15 102-31 152-14"
          />
          <g transform="translate(640 0)">
            <path
              d="M0 93h292M16 91l6-45h10l-3 45m14 0 2-48h11l4 48m11 0-3-48h10l10 48M12 43l70-9 10 5-71 10Z M24 48l-5 42m30-44 1 45m23-46 9 46"
            />
            <path
              d="M94 91V72h8v19m5 0V61h8v30m5 0V68h9v23m5 0V55h9v36m5 0V66h9v25m-21-36v-7m-3 17h3m-26 9h3m18 4h3"
            />
            <circle cx="189" cy="65" r="27" />
            <path
              d="m189 65-8 27m8-27 8 27m-37-1h59m-30-53v-3m0 60v-3m-29-27h-3m64 0h-3m-49-20-2-2m43 44-2-2m-39 0-2 2m43-44-2 2M234 91l8-24-15-10h35l-15 10 8 24m-13-24h5m-20-10c10 9 25 9 35 0M266 91l6-18-10-7h25l-11 7 6 18m-10-18h4"
            />
          </g>
        </svg>
        <!-- Draw the Singapore skyline using SVG paths and shapes. -->
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Weeks 2–3: Bootstrap handles common utilities; scoped CSS defines this page's design. */
.landing {
  min-height: 100vh;
  padding: clamp(16px, 3vh, 32px) 28px;
  background: #fafaf9;
  color: #111;
  font-family: Arial, Helvetica, sans-serif;
}
.landing-frame {
  max-width: 1120px;
  margin-top: auto;
  margin-bottom: auto;
  border: 1px solid #91918e;
  border-radius: 15px;
  overflow: hidden;
  background: linear-gradient(135deg, #fff, #f9f9f8);
}
.landing-nav {
  padding: 26px 38px 12px;
}
.wordmark {
  color: #111;
  text-decoration: none;
  font-weight: 800;
  font-size: 28px;
  letter-spacing: -1.8px;
}
.carousel-dots button:focus-visible {
  outline: 3px solid #8b7151;
  outline-offset: 5px;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 35px;
  padding: 18px 38px 0 64px;
  align-items: center;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 2.5px;
  color: #777;
  margin-bottom: 22px;
}
h1 {
  font-size: clamp(32px, 3.2vw, 44px);
  line-height: 1.05;
  font-weight: 750;
  letter-spacing: -1.8px;
  margin: 0 0 24px;
}
.highlight {
  display: inline-block;
  position: relative;
  z-index: 0;
  white-space: nowrap;
}
.highlight::before {
  content: '';
  position: absolute;
  inset: 5px -5px 0;
  background: #e8e8e5;
  border-radius: 8px;
  transform: rotate(-1deg);
  z-index: -1;
}
.intro {
  color: #777;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 36px;
}
.hero-actions {
  gap: 18px;
  position: relative;
  width: fit-content;
}
.photo-set {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: repeat(2, clamp(120px, 22vh, 168px));
  gap: 10px;
}
.photo {
  min-width: 0;
  min-height: 0;
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  margin: 0;
  background: #e7e5e0;
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
  background: #fffffff2;
  border-radius: 30px;
  padding: 6px 9px;
  font-size: 10px;
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
  border: 1px solid #999;
  border-radius: 50%;
}
.carousel-dots button.selected::after {
  background: #111;
  border-color: #111;
}
.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 40px 38px 0 58px;
}
.skyline {
  margin-top: 38px;
  color: #898985;
}
.skyline svg {
  width: 100%;
  height: clamp(65px, 12vh, 110px);
  display: block;
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
/* Short laptop viewports: keep the complete layout visible below browser chrome. */
@media (min-width: 761px) and (max-height: 800px) {
  .landing-nav {
    padding-top: 20px;
    padding-bottom: 8px;
  }
  .hero {
    padding-top: 12px;
  }
  .eyebrow {
    margin-bottom: 16px;
  }
  h1 {
    margin-bottom: 18px;
  }
  .intro {
    margin-bottom: 26px;
  }
  .features {
    margin-top: 24px;
  }
  .skyline {
    margin-top: 20px;
  }
}
@media (min-width: 761px) and (max-height: 650px) {
  .landing {
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .photo-set {
    grid-template-rows: repeat(2, 110px);
  }
  .skyline svg {
    height: 60px;
  }
}
@media (max-width: 1000px) {
  .hero {
    padding-left: 38px;
    gap: 24px;
  }
  .features {
    margin-left: 38px;
  }
  h1 {
    font-size: 38px;
  }
}
@media (max-width: 760px) {
  .landing {
    padding: 18px 14px;
  }
  .landing-nav {
    padding: 22px;
  }
  .wordmark {
    font-size: 25px;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 30px 24px 0;
    gap: 36px;
  }
  h1 {
    font-size: clamp(32px, 7.5vw, 48px);
  }
  .eyebrow {
    font-size: 9px;
  }
  .intro {
    margin-bottom: 28px;
  }
  .desktop-break {
    display: none;
  }
  .photo-set {
    grid-template-rows: 150px 150px;
  }
  .features {
    grid-template-columns: 1fr;
    margin: 26px 24px 0;
    gap: 24px;
  }
  .skyline {
    margin-top: 26px;
  }
  .skyline svg {
    min-height: 65px;
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
