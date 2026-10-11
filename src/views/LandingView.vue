<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const picture = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=850&q=85`

// arrow function that creates the picture's src 

const slides = [
  { phrase: 'great plans', photos: [
    { label: 'Marina Bay', alt: 'Singapore skyline and Marina Bay Sands at sunset', src: picture('photo-1525625293386-3f8f99389edd') },
    { label: 'Coffee dates', alt: 'Coffee served in a cosy cafe', src: picture('photo-1501339847302-ac426a4a7cbb') },
    { label: 'City evenings', alt: 'Singapore streets lit up after dark', src: picture('photo-1496939376851-89342e90adcd') },
  ] },
  { phrase: 'date ideas', photos: [
    { label: 'Gardens by the Bay', alt: 'Supertrees at Gardens by the Bay in Singapore', src: picture('photo-1508964942454-1a56651d54ac') },
    { label: 'Cafe catch-ups', alt: 'Fresh coffee for a relaxed cafe date', src: picture('photo-1442512595331-e89e73853f31') },
    { label: 'Dinner together', alt: 'A warmly lit restaurant ready for dinner', src: picture('photo-1517248135467-4c7edcad34c4') },
  ] },
  { phrase: 'new experiences', photos: [
    { label: 'Explore Singapore', alt: 'Singapore architecture and city views', src: picture('photo-1565967511849-76a60a516170') },
    { label: 'Creative afternoons', alt: 'Hands shaping clay on a pottery wheel', src: picture('photo-1607556671927-78a6605e290b') },
    { label: 'Try something new', alt: 'A spread of food to share with friends', src: picture('photo-1414235077428-338989a2e8c0') },
  ] },
]
const features = [
  { icon: 'search', title: 'Discover Activities', description: 'Find curated activities in Singapore based on your interests, budget, location and more.' },
  { icon: 'friends', title: 'Plan With Friends', description: 'Create a group, suggest activities, vote, find a common time and build your itinerary.' },
  { icon: 'calendar', title: 'Make It Happen', description: 'Turn ideas into a plan with times, locations, estimated costs and even weather alternatives.' },
]
const activeSlide = ref(0)
let timer
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
function pause() { clearInterval(timer); timer = undefined }
function resume() { pause(); if (!reducedMotion) timer = setInterval(() => { activeSlide.value = (activeSlide.value + 1) % slides.length }, 5000) }
function selectSlide(index) { activeSlide.value = index }
function onFocusOut(event) { if (!event.currentTarget.contains(event.relatedTarget)) resume() }
onMounted(resume)
onUnmounted(pause)
</script>




<template>
  <div class="landing" data-testid="landing-page">
    <div class="landing-frame">
      <header class="landing-nav">
        <RouterLink to="/" class="wordmark" aria-label="WAD2Do home">WAD2Do</RouterLink>
        <nav aria-label="Account navigation">
          <RouterLink to="/login" class="pill small">Log in</RouterLink>
          <RouterLink to="/signup" class="pill small primary">Sign up <span aria-hidden="true">→</span></RouterLink>
          <!-- aria-hidden is to add decorative element, screen readers wont read it aloud -->
        </nav>
      </header>

      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">FOR FRIENDS · DATES · GOOD TIMES</p>
          <h1 id="hero-title">Turn free time<br />into <Transition name="phrase" mode="out-in"><span :key="activeSlide" class="highlight">{{ slides[activeSlide].phrase }}.</span></Transition></h1>
          <p class="intro">Discover things to do in Singapore, plan with friends,<br class="desktop-break" /> and make the most of your weekends (and weekdays).</p>
          <div class="hero-actions">
            <span class="action-spark" aria-hidden="true"><i></i><i></i><i></i></span>
            <!-- creates the 3 lines on top left of sign up button -->
            <RouterLink to="/signup" class="pill primary">Sign up <span aria-hidden="true">→</span></RouterLink>
            <RouterLink to="/login" class="pill">Log in <span aria-hidden="true">→</span></RouterLink>
          </div>
        </div>

        <div class="carousel" role="region" aria-label="Things to do in Singapore" @mouseenter="pause" @mouseleave="resume" @focusin="pause" @focusout="onFocusOut">
          <div class="photo-grid">
            <Transition name="photos" mode="out-in">
              <div :key="activeSlide" class="photo-set">
                <figure v-for="(photo, index) in slides[activeSlide].photos" :key="photo.label" :class="['photo', { tall: index === 0 }]">
                  <img :src="photo.src" :alt="photo.alt" :loading="activeSlide === 0 ? 'eager' : 'lazy'" />
                  <figcaption><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></svg>{{ photo.label }}</figcaption>
                </figure>
              </div>
            </Transition>
          </div>
          <div class="carousel-dots" aria-label="Choose a slide">
            <button v-for="(slide, index) in slides" :key="slide.phrase" type="button" :class="{ selected: index === activeSlide }" :aria-label="`Show ${slide.phrase}`" :aria-pressed="index === activeSlide" @click="selectSlide(index)"></button>
          </div>
        </div>
      </section>

      <section class="features" aria-label="How WAD2Do works">
        <article v-for="feature in features" :key="feature.title" class="feature">
          <div class="feature-icon"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><template v-if="feature.icon === 'search'"><circle cx="13" cy="13" r="8"/><path d="m19 19 8 8"/></template><template v-else-if="feature.icon === 'friends'"><circle cx="12" cy="10" r="4"/><path d="M3 27v-3a8 8 0 0 1 16 0v3H3Zm19-21a4 4 0 0 1 0 8m1 5a7 7 0 0 1 6 7v1h-6"/></template><template v-else><rect x="5" y="7" width="22" height="22" rx="3"/><path d="M10 3v8M22 3v8M5 15h22"/></template></svg></div>
          <div><h2>{{ feature.title }}</h2><p>{{ feature.description }}</p></div>
        </article>
      </section>

      <footer class="skyline" aria-hidden="true">
        <svg viewBox="0 0 1000 110" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M0 65C65 110 125 20 205 55S310 95 370 74s82-10 128 5 84 25 113-4 82-7 124 7 75 7 113-15 102-31 152-14"/>
          <g transform="translate(640 0)"><path d="M0 93h292M16 91l6-45h10l-3 45m14 0 2-48h11l4 48m11 0-3-48h10l10 48M12 43l70-9 10 5-71 10Z M24 48l-5 42m30-44 1 45m23-46 9 46"/><path d="M94 91V72h8v19m5 0V61h8v30m5 0V68h9v23m5 0V55h9v36m5 0V66h9v25m-21-36v-7m-3 17h3m-26 9h3m18 4h3"/><circle cx="189" cy="65" r="27"/><path d="m189 65-8 27m8-27 8 27m-37-1h59m-30-53v-3m0 60v-3m-29-27h-3m64 0h-3m-49-20-2-2m43 44-2-2m-39 0-2 2m43-44-2 2M234 91l8-24-15-10h35l-15 10 8 24m-13-24h5m-20-10c10 9 25 9 35 0M266 91l6-18-10-7h25l-11 7 6 18m-10-18h4"/></g>
        </svg>
        <!-- this draws out singapore skyline using cooordinates and shapes  -->
      </footer>
    </div>
  </div>
</template>


<style scoped>
.landing { min-height: 100vh; padding: clamp(16px, 3vh, 32px) 28px; display: flex; align-items: center; background: #fafaf9; color: #111; font-family: Arial, Helvetica, sans-serif; }
.landing-frame { width: 100%; max-width: 1120px; margin: auto; border: 1px solid #91918e; border-radius: 15px; overflow: hidden; background: linear-gradient(135deg, #fff, #f9f9f8); }
.landing-nav { display: flex; align-items: center; justify-content: space-between; padding: 26px 38px 12px; }
.wordmark { color: #111; text-decoration: none; font-weight: 800; font-size: 28px; letter-spacing: -1.8px; }
.landing-nav nav { display: flex; gap: 14px; }
.pill { display: inline-flex; align-items: center; justify-content: center; gap: 20px; min-width: 150px; padding: 12px 25px; border: 1px solid #222; border-radius: 100px; color: #111; font-size: 15px; font-weight: 600; text-decoration: none; transition: background .2s, transform .2s; }
.pill.small { min-width: 105px; font-size: 12px; padding: 8px 20px; gap: 12px; }
.pill.primary { color: #fff; background: #111; box-shadow: 0 6px 16px #00000018; }
.pill:hover { color: #111; background: #ececeb; }
.pill.primary:hover { color: #fff; background: #363636; }
.pill span { transition: transform .2s; }
.pill:hover span { transform: translateX(4px); }
.pill:focus-visible, .carousel-dots button:focus-visible { outline: 3px solid #8b7151; outline-offset: 5px; }
.hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 35px; padding: 18px 38px 0 64px; align-items: center; }
.eyebrow { font-size: 10px; letter-spacing: 2.5px; color: #777; margin-bottom: 22px; }
h1 { font-size: clamp(32px, 3.2vw, 44px); line-height: 1.05; font-weight: 750; letter-spacing: -1.8px; margin: 0 0 24px; }
.highlight { display: inline-block; position: relative; z-index: 0; white-space: nowrap; }
.highlight::before { content: ''; position: absolute; inset: 5px -5px 0; background: #e8e8e5; border-radius: 8px; transform: rotate(-1deg); z-index: -1; }
.intro { color: #777; font-size: 14px; line-height: 1.5; margin-bottom: 36px; }
.hero-actions { display: flex; gap: 18px; position: relative; }
.action-spark { position: absolute; top: -18px; left: -17px; width: 22px; height: 22px; }
.action-spark i { position: absolute; height: 2px; width: 10px; background: #111; transform: rotate(20deg); top: 17px; }
.action-spark i:nth-child(2) { transform: rotate(50deg); top: 8px; left: 5px; }
.action-spark i:nth-child(3) { transform: rotate(75deg); top: 2px; left: 14px; }
.photo-set { display: grid; grid-template-columns: 1.2fr 1fr; grid-template-rows: repeat(2, clamp(120px, 22vh, 168px)); gap: 10px; }
.photo { min-width: 0; min-height: 0; position: relative; border-radius: 20px; overflow: hidden; margin: 0; background: #e7e5e0; }
.photo.tall { grid-row: span 2; }
.photo img { width: 100%; height: 100%; object-fit: cover; transition: transform .4s; }
.photo:hover img { transform: scale(1.02); }
.photo figcaption { position: absolute; bottom: 10px; left: 9px; max-width: calc(100% - 18px); display: flex; align-items: center; gap: 3px; background: #fffffff2; border-radius: 30px; padding: 6px 9px; font-size: 10px; font-weight: 600; }
.photo figcaption svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; flex-shrink: 0; }
.carousel-dots { display: flex; justify-content: flex-end; gap: 3px; padding: 7px 16px 0; }
.carousel-dots button { width: 22px; height: 26px; border: 0; background: transparent; display: grid; place-items: center; padding: 0; }
.carousel-dots button::after { content: ''; width: 7px; height: 7px; border: 1px solid #999; border-radius: 50%; }
.carousel-dots button.selected::after { background: #111; border-color: #111; }
.features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 40px 38px 0 58px; }
.feature { display: flex; gap: 20px; padding: 0 22px; }
.feature:first-child { padding-left: 0; }
.feature + .feature { border-left: 1px solid #ddd; }
.feature-icon { flex: 0 0 58px; width: 58px; height: 58px; border-radius: 50%; background: #efefed; display: grid; place-items: center; transition: transform .2s, background .2s; }
.feature:hover .feature-icon { transform: translateY(-4px); background: #e4e4df; }
.feature-icon svg { width: 30px; height: 30px; }
.feature h2 { font-size: 15px; font-weight: 700; margin: 9px 0 8px; }
.feature p { color: #777; font-size: 12px; line-height: 1.4; margin: 0; }
.skyline { margin-top: 38px; color: #898985; }
.skyline svg { width: 100%; height: clamp(65px, 12vh, 110px); display: block; }
.phrase-enter-active, .phrase-leave-active, .photos-enter-active, .photos-leave-active { transition: opacity .25s ease, transform .25s ease; }
.phrase-enter-from { opacity: 0; transform: translateY(8px); }
.phrase-leave-to { opacity: 0; transform: translateY(-8px); }
.photos-enter-from, .photos-leave-to { opacity: 0; }
/* Short laptop viewports: keep the complete layout visible below browser chrome. */
@media (min-width: 761px) and (max-height: 800px) {
  .landing-nav { padding-top: 20px; padding-bottom: 8px; }
  .hero { padding-top: 12px; }
  .eyebrow { margin-bottom: 16px; }
  h1 { margin-bottom: 18px; }
  .intro { margin-bottom: 26px; }
  .features { margin-top: 24px; }
  .skyline { margin-top: 20px; }
}
@media (min-width: 761px) and (max-height: 650px) {
  .landing { padding-top: 12px; padding-bottom: 12px; }
  .photo-set { grid-template-rows: repeat(2, 110px); }
  .skyline svg { height: 60px; }
}
@media (max-width: 1000px) { .hero { padding-left: 38px; gap: 24px; } .features { margin-left: 38px; } .feature { gap: 12px; padding: 0 14px; } .feature-icon { flex-basis: 46px; width: 46px; height: 46px; } .pill { min-width: 125px; } h1 { font-size: 38px; } }
@media (max-width: 760px) { .landing { padding: 18px 14px; } .landing-nav { padding: 22px; } .wordmark { font-size: 25px; } .landing-nav nav { gap: 8px; } .pill.small { min-width: auto; padding: 8px 14px; } .hero { grid-template-columns: 1fr; padding: 30px 24px 0; gap: 36px; } h1 { font-size: clamp(32px, 7.5vw, 48px); } .eyebrow { font-size: 9px; } .intro { margin-bottom: 28px; } .desktop-break { display: none; } .photo-set { grid-template-rows: 150px 150px; } .features { grid-template-columns: 1fr; margin: 26px 24px 0; gap: 24px; } .feature, .feature:first-child { padding: 0; gap: 18px; } .feature + .feature { border-left: 0; border-top: 1px solid #ddd; padding-top: 24px; } .feature h2 { margin-top: 2px; } .feature p { max-width: 300px; } .skyline { margin-top: 26px; } .skyline svg { min-height: 65px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>

