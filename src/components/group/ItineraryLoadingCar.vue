<script setup>
import AnimalAvatar from '@/components/AnimalAvatar.vue'

// The friends in the car, from the back seat to the driver's seat
const passengers = ['panda', 'cat', 'dog']
</script>

<template>
  <!-- Shown while the itinerary loads: the animals driving along in a car -->
  <div class="loading-car" role="status" data-testid="itinerary-loading">
    <div class="stage" aria-hidden="true">
      <div class="road">
        <span class="dashes"></span>
      </div>

      <div class="car">
        <span class="speed-lines"><i></i><i></i><i></i></span>
        <span class="puff puff-1"></span>
        <span class="puff puff-2"></span>

        <div class="car-bounce">
          <!-- Roof and windows: behind the passengers -->
          <svg class="car-cabin" viewBox="0 0 200 90">
            <path d="M38 50 52 15q3-7 10-7h78q7 0 11 7l19 35z" fill="var(--accent)" />
            <path d="M52 48 61 19q2-4 6-4h70q4 0 6 4l13 29z" fill="#dff2f5" />
            <path d="M101 15v33" stroke="var(--accent)" stroke-width="5" />
          </svg>

          <span
            v-for="(animal, index) in passengers"
            :key="animal"
            class="passenger"
            :class="'seat-' + index"
          >
            <AnimalAvatar :animal="animal" :size="30" decorative />
          </span>

          <!-- Lower body and wheels: in front of the passengers -->
          <svg class="car-body" viewBox="0 0 200 90">
            <rect x="6" y="44" width="188" height="30" rx="13" fill="var(--accent)" />
            <path d="M100 48v22" stroke="var(--accent-active)" stroke-width="2" />
            <rect x="110" y="54" width="12" height="3" rx="1.5" fill="var(--accent-active)" />
            <circle cx="186" cy="54" r="5" fill="#fff8e6" />
            <rect x="6" y="51" width="6" height="7" rx="2" fill="#e5484d" />
            <g v-for="x in [50, 150]" :key="x" class="wheel">
              <circle :cx="x" cy="76" r="13" fill="#2a2d3a" />
              <circle :cx="x" cy="76" r="6" fill="#d8d9e0" />
              <path :d="`M${x - 6} 76h12M${x} 70v12`" stroke="#2a2d3a" stroke-width="2" />
            </g>
          </svg>
        </div>
      </div>
    </div>
    <p class="loading-text">Loading plan...</p>
  </div>
</template>

<style scoped>
.loading-car {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 0 1.5rem;
}

/* 250 x 110 scene: room on the left for the speed lines and puffs */
.stage {
  position: relative;
  width: 250px;
  max-width: 100%;
  height: 110px;
  overflow: hidden;
}

.road {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.dashes {
  position: absolute;
  top: 3px;
  left: 0;
  width: calc(100% + 40px);
  height: 2px;
  background: repeating-linear-gradient(90deg, var(--line) 0 20px, transparent 20px 40px);
}

.car {
  position: absolute;
  right: 10px;
  bottom: 6px;
  width: 200px;
  height: 90px;
}

.car-bounce,
.car-cabin,
.car-body {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.car-body .wheel {
  transform-box: fill-box;
  transform-origin: center;
}

/* Each animal sits with its head in the window */
.passenger {
  position: absolute;
  top: 18px;
  line-height: 0;
}

.seat-0 {
  left: 58px;
}

.seat-1 {
  left: 88px;
}

.seat-2 {
  left: 118px;
}

.car-bounce {
  animation: bounce 0.4s ease-in-out infinite;
}

.car-body .wheel {
  animation: spin 0.5s linear infinite;
}

.dashes {
  animation: road 0.45s linear infinite;
}

.speed-lines {
  position: absolute;
  top: 30px;
  left: -34px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.speed-lines i {
  display: block;
  width: 26px;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--line);
  animation: streak 0.6s linear infinite;
}

.speed-lines i:nth-child(2) {
  margin-left: 10px;
  animation-delay: 0.2s;
}

.speed-lines i:nth-child(3) {
  animation-delay: 0.4s;
}

.puff {
  position: absolute;
  bottom: 18px;
  left: -6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--line);
  opacity: 0;
  animation: puff 0.8s ease-out infinite;
}

.puff-2 {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes road {
  to {
    transform: translateX(-40px);
  }
}

@keyframes streak {
  from {
    transform: translateX(10px);
    opacity: 1;
  }
  to {
    transform: translateX(-20px);
    opacity: 0;
  }
}

@keyframes puff {
  from {
    transform: translateX(0) scale(0.5);
    opacity: 0.9;
  }
  to {
    transform: translateX(-28px) scale(1.4);
    opacity: 0;
  }
}

.loading-text {
  margin: 1rem 0 0;
  color: var(--bs-secondary-color);
}

/* Reduced motion: the car stays still */
@media (prefers-reduced-motion: reduce) {
  .car-bounce,
  .car-body .wheel,
  .dashes,
  .speed-lines i,
  .puff {
    animation: none;
  }
}
</style>
