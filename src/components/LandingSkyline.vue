<script setup>
// Layered silhouettes and perspective edges give the drawing depth without a bitmap.
const towers = [
  { x: 244, y: 179, width: 18 },
  { x: 268, y: 166, width: 20 },
  { x: 294, y: 180, width: 16 },
  { x: 316, y: 153, width: 27 },
  { x: 350, y: 147, width: 25 },
  { x: 382, y: 163, width: 19 },
  { x: 408, y: 183, width: 23 },
  { x: 438, y: 171, width: 23 },
  { x: 468, y: 148, width: 26 },
  { x: 501, y: 138, width: 25 },
  { x: 534, y: 185, width: 22 },
  { x: 563, y: 173, width: 25 },
  { x: 596, y: 130, width: 22 },
  { x: 626, y: 172, width: 24 },
  { x: 657, y: 196, width: 21 },
]
const cabins = Array.from({ length: 24 }, (_, index) => index * 15)

function towerShape({ x, y, width }) {
  const edge = x + width * 0.65
  return (
    'M' +
    x +
    ' 245V' +
    y +
    'l' +
    width * 0.65 +
    '-5 ' +
    width * 0.35 +
    ' 5V245Z M' +
    edge +
    ' ' +
    (y - 5) +
    'V245'
  )
}

function towerGlazing({ x, y, width }) {
  return 'M' + (x + 5) + ' ' + (y + 5) + 'V241m' + (width * 0.65 - 9) + ' 0V' + (y + 3)
}
</script>

<template>
  <footer class="skyline" aria-hidden="true">
    <svg class="skyline-water" viewBox="0 0 1000 280" preserveAspectRatio="none" fill="none">
      <path class="skyline-line" pathLength="1" d="M0 250h1000" />
      <path
        class="skyline-line skyline-detail skyline-reflections"
        pathLength="1"
        d="M0 260h109m24 0h90m39 8h150m24-8h95m31 8h135m26-8h152m30 8h95M68 275h98m72 0h104m162 0h116m138 0h142"
      />
    </svg>

    <svg
      class="skyline-landmarks"
      viewBox="0 0 900 280"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      preserveAspectRatio="xMidYMax meet"
    >
      <!-- A lower, layered city silhouette sits between the two main landmarks. -->
      <g class="skyline-buildings">
        <path
          class="skyline-line skyline-paper"
          pathLength="1"
          d="M214 245V180h15v-22h11v37h14v-22h16v72m23 0V167h16v-12h15v90m26 0V179h15v-18h17v84m29 0V194h14v-16h16v67m25 0V181h14v-24h16v88m28 0V169h15v-16h13v92m26 0V197h16v-13h13v61m18 0V172h14v-13h16v86m26 0V200h18v-14h17v59m18 0V218h20v-14h16v41"
        />
        <g v-for="(tower, index) in towers" :key="tower.x">
          <path class="skyline-line skyline-paper" pathLength="1" :d="towerShape(tower)" />
          <path class="skyline-line skyline-detail" pathLength="1" :d="towerGlazing(tower)" />
          <path
            v-if="index === 9"
            class="skyline-line skyline-detail"
            pathLength="1"
            d="M505 136v-8h16v8m-18 5h22m-19-12h14"
          />
          <path
            v-if="index === 12"
            class="skyline-line"
            pathLength="1"
            d="M600 127v-8h14v8m-11-8v-8h8v8m-9 17v31m6-31v31"
          />
        </g>
      </g>

      <!-- Curved hotel towers and the long, upturned SkyPark. -->
      <g class="skyline-buildings">
        <path
          class="skyline-line skyline-paper"
          pathLength="1"
          d="M72 244c28-44 34-93 31-143l25-7c5 50-1 107-21 152Z M124 246c18-47 24-101 20-153l26-7c6 52 6 111-3 160Z M183 246c11-49 10-104 4-160l28-6c6 50 6 110 12 166Z"
        />
        <path
          class="skyline-line"
          pathLength="1"
          d="M81 246c27-47 34-99 30-147m21 147c18-48 24-100 20-155m40 155c10-50 7-104 2-162M103 106l26-7m15-1 27-7m17 0 28-6"
        />
        <path
          class="skyline-line skyline-detail"
          pathLength="1"
          d="M95 241c24-49 29-94 25-143m35 146c13-50 14-98 9-155m45 155c-2-52-4-102-8-161M73 238l35 4m19-9 41 3m17-4 40 4"
        />
        <path
          class="skyline-line skyline-paper"
          pathLength="1"
          d="M94 96c31-22 89-32 157-31l16 1c-5 10-27 18-58 22l-84 20c-13 0-23-5-31-12Z"
        />
        <path
          class="skyline-line"
          pathLength="1"
          d="M99 95c40-21 90-28 155-27M109 99l93-23 55-7M122 105l88-21m-105 14-1-7 15-11 8 1m-4-4 16-7 8 2"
        />
        <path
          class="skyline-line skyline-detail"
          pathLength="1"
          d="M145 73v-5l4-2 4 1 3-3 4 2 4-3 5 1 4-3 4 2 5-2 5 2 4-2 4 2 5-1v4m9-1v-7l12-2v7m-5-6v6"
        />
      </g>

      <!-- The low, sweeping roofs of the waterfront exhibition halls. -->
      <g class="skyline-buildings">
        <path
          class="skyline-line skyline-paper"
          pathLength="1"
          d="M205 244c19-25 44-31 72-14l17 14Z M265 244c25-28 55-31 83-8l10 8Z M333 246c19-20 46-21 69-4l7 4Z M386 247c16-18 38-20 59-3l6 3Z"
        />
        <path
          class="skyline-line skyline-detail"
          pathLength="1"
          d="M213 239q29-23 64-6m-57 9q25-19 60-6m-50 7q25-14 53-4M275 238q33-24 68-5m-58 9q27-21 61-6m-48 7q23-14 50-4M342 243q26-16 55-4m-44 5q22-11 47-2M396 244q21-13 43-2"
        />
        <path
          class="skyline-line skyline-paper"
          pathLength="1"
          d="M446 239c-15-4-25-17-29-30l18 6-2-19 16 15 5-24 10 22 16-22-1 25 18-14c-1 22-14 36-33 41l-2 9h-13Z"
        />
        <path
          class="skyline-line skyline-detail"
          pathLength="1"
          d="m435 215 14 21m-16-40 20 39m1-48 4 49m22-49-17 48m16-23-13 23"
        />
        <!-- Elevated promenade, railing posts and angled supporting piles. -->
        <path class="skyline-line skyline-paper" pathLength="1" d="M294 244l349-8v10l-349 9Z" />
        <path
          class="skyline-line"
          pathLength="1"
          d="m296 250 346-8M304 255v7l331-7v-9m-325 9 7 6 6-6 8 6 7-7 8 7 6-7 8 7 7-7 8 7 6-8 8 8 7-8 8 7 6-7 8 7 7-7 8 7 6-7 8 7 7-8 8 8 6-8 8 8 7-8 8 7 6-7 8 7 7-7 8 7 6-7 8 7 7-8 8 8 6-8 8 7 7-7 8 7 6-7 8 7 7-7 8 7"
        />
        <path
          v-for="post in 26"
          :key="post"
          class="skyline-line skyline-detail"
          pathLength="1"
          :d="'M' + (297 + post * 13) + ' ' + (244 - post * 0.3) + 'v-10'"
        />
      </g>

      <!-- A fixed perspective projection gives the Flyer its tall, angled profile.
           Rotation happens inside that projection so the axle never moves. -->
      <g transform="translate(763 132)">
        <g transform="matrix(0.62 0.06 -0.08 1 0 0)">
          <g class="skyline-flyer-wheel">
            <circle class="skyline-line skyline-wheel-line" pathLength="1" r="106" />
            <circle class="skyline-line skyline-wheel-line" pathLength="1" r="102" />
            <g v-for="angle in cabins" :key="angle" :transform="'rotate(' + angle + ')'">
              <path
                v-if="angle % 45 === 0"
                class="skyline-line skyline-wheel-line skyline-cable"
                pathLength="1"
                d="M0-5V-101"
              />
              <rect
                class="skyline-line skyline-wheel-line skyline-paper"
                pathLength="1"
                x="-5"
                y="-112"
                width="10"
                height="6"
                rx="1.7"
              />
            </g>
          </g>
        </g>
      </g>
      <path
        class="skyline-line skyline-buildings skyline-paper"
        pathLength="1"
        d="m755 135-58 112h7l56-106 4 109h7l-2-109 80 109h8l-83-115Z"
      />
      <path
        class="skyline-line skyline-buildings skyline-paper"
        pathLength="1"
        d="M752 132h24v8h-24Z M748 131h5v11h-5Z M776 132h5v11h-5Z M815 242h48v8h-48Z M803 250h68v8h-68Z"
      />

      <!-- Uneven planting and a continuous shoreline soften the architectural edges. -->
      <path
        class="skyline-line skyline-buildings skyline-paper"
        pathLength="1"
        d="M14 252v-6q3-7 9-5 2-9 9-6 5-10 12-4 6-8 13-3 6-7 12 0 8-4 12 3 9-2 12 5 9-5 16 3 8-3 14 3 7-3 12 4 9-5 16 0 9-6 17 0 8-5 16 1h37l19 5Z M635 254v-9q4-9 11-5 2-12 11-8 4-12 13-6 7-8 14 0 10-5 14 4 8-4 15 4 8-5 15 2 8-6 16 1 8-6 17 0 8-5 14 2 10-7 17 1 9-3 15 5l5 11Z M857 258v-8q2-8 8-5 4-8 10-3 6-6 12 0 7-3 9 6v10Z"
      />
      <path
        class="skyline-line"
        pathLength="1"
        d="M10 253h284m348 3h158m-5 3h104M19 258h211m-7 4h68"
      />
      <path
        class="skyline-line skyline-detail skyline-reflections"
        pathLength="1"
        d="M46 267h65m19 0h61m37 5h80m48-5h97m25 6h106m35-6h65m28 6h96m31-6h72M100 276h61m45 0h45m126 0h70m181 0h55"
      />
    </svg>
  </footer>
</template>

<style scoped>
.skyline {
  --skyline-paper: #fafaf9;
  position: relative;
  height: var(--landing-skyline-height, clamp(100px, 15svh, 160px));
  margin-top: clamp(12px, 2svh, 24px);
  color: #555651;
  overflow: hidden;
}
.skyline svg {
  display: block;
  height: 100%;
  stroke: currentColor;
  stroke-width: 1.8;
}
.skyline-water {
  width: 100%;
  opacity: 0.35;
}
.skyline-landmarks {
  position: absolute;
  right: clamp(16px, 4vw, 80px);
  bottom: 0;
  width: clamp(340px, 72vw, 1100px);
  max-width: calc(100% - 32px);
}
.skyline-paper {
  fill: var(--skyline-paper);
}
.skyline-detail {
  stroke-width: 1.05;
  opacity: 0.85;
}
.skyline-cable {
  stroke-width: 0.7;
  opacity: 0.4;
}
/* Static, complete artwork is also the reduced-motion presentation. */
@media (prefers-reduced-motion: no-preference) {
  .skyline-line {
    stroke-dasharray: 1;
    animation: skyline-draw 2.8s ease-in-out both;
  }
  .skyline-buildings .skyline-line,
  .skyline-buildings.skyline-line {
    animation-delay: 0.3s;
  }
  .skyline-detail {
    animation-delay: 0.7s;
  }
  .skyline-wheel-line {
    animation-duration: 1.8s;
    animation-delay: 1.1s;
  }
  .skyline-flyer-wheel {
    transform-origin: 0 0;
    animation: skyline-turn 80s linear 2.9s infinite;
  }
  .skyline-reflections {
    animation-delay: 1s;
  }
}
@keyframes skyline-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes skyline-turn {
  to {
    transform: rotate(360deg);
  }
}
</style>
