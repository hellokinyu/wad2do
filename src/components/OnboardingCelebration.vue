<template>
  <Teleport to="body">
    <div v-if="active" class="celebration" aria-hidden="true" data-testid="onboarding-celebration">
      <canvas ref="canvas" class="confetti-canvas"></canvas>
      <div
        v-for="side in ['left', 'right']"
        :key="side"
        class="mascot-stage"
        :class="'mascot-stage--' + side"
        :data-animal="animal"
      >
        <div class="mascot-performer">
          <svg class="mascot-body" viewBox="0 0 140 190" fill="none">
            <ellipse cx="70" cy="181" rx="40" ry="5" fill="#222" opacity=".1" />
            <g class="mascot-leg mascot-leg--left">
              <path d="M57 146v25" :stroke="limbColor" stroke-width="14" stroke-linecap="round" />
              <ellipse cx="54" cy="173" rx="13" ry="7" :fill="limbColor" />
            </g>
            <g class="mascot-leg mascot-leg--right">
              <path d="M83 146v25" :stroke="limbColor" stroke-width="14" stroke-linecap="round" />
              <ellipse cx="86" cy="173" rx="13" ry="7" :fill="limbColor" />
            </g>
            <ellipse cx="70" cy="126" rx="29" ry="32" :fill="bodyColor" />
            <ellipse cx="70" cy="130" rx="17" ry="21" fill="#fff" opacity=".65" />
            <path
              class="mascot-free-arm"
              d="M46 112q-14 15-20 3"
              :stroke="limbColor"
              stroke-width="13"
              stroke-linecap="round"
            />
            <g class="mascot-cord">
              <path d="M115 75 111 114" stroke="#8264bc" stroke-width="3" stroke-linecap="round" />
              <circle cx="111" cy="114" r="5" stroke="#8264bc" stroke-width="3" />
            </g>
            <g class="mascot-pulling-arm">
              <path
                d="M92 110q15-4 24 4"
                :stroke="limbColor"
                stroke-width="13"
                stroke-linecap="round"
              />
              <circle cx="116" cy="114" r="8" :fill="limbColor" />
            </g>
          </svg>
          <AnimalAvatar :animal="animal" class="mascot-avatar" decorative />
          <span class="mascot-popper">🎉</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import { findProfileAnimal } from '@/data/profileAnimals'

const props = defineProps({ animal: { type: String, required: true } })
const bodyColor = computed(() => findProfileAnimal(props.animal)?.background || '#e6eedf')
const limbColor = computed(
  () =>
    ({
      dog: '#d9a363',
      cat: '#e8a36f',
      duck: '#f2c84b',
      goldfish: '#ef9b4c',
      panda: '#353535',
    })[props.animal] || '#929987',
)

const active = ref(true)
const canvas = ref(null)
const colors = ['#ff477e', '#ffd23f', '#3dd6a0', '#47a5ff', '#ac7bff', '#ff914d', '#f66de1']
const duration = 7.2
let animationFrame
let resizeCanvas

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    active.value = false
    return
  }

  const element = canvas.value
  const context = element.getContext('2d')
  if (!context) {
    active.value = false
    return
  }

  let width
  let height
  resizeCanvas = () => {
    const bounds = element.getBoundingClientRect()
    width = bounds.width
    height = bounds.height
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    element.width = Math.round(width * pixelRatio)
    element.height = Math.round(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  const burstCount = width < 768 ? 320 : 540
  const rainCount = width < 768 ? 100 : 180
  const particles = Array.from({ length: burstCount + rainCount }, (_, index) => {
    const fromLeft = index % 2 === 0
    const rain = index >= burstCount
    return {
      fromLeft,
      rain,
      origin: Math.random(),
      velocityX: rain
        ? (Math.random() - 0.5) * 0.16
        : (fromLeft ? 1 : -1) * (0.2 + Math.random() * 0.9),
      velocityY: rain ? 0.08 + Math.random() * 0.15 : -(0.95 + Math.random() * 0.7),
      delay: rain
        ? 2.1 + Math.random()
        : 1.65 + (Math.floor(index / 2) % 3) * 0.32 + (fromLeft ? 0 : 0.12) + Math.random() * 0.1,
      color: colors[index % colors.length],
      size: 5 + Math.random() * 7,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 18,
      flutter: 6 + Math.random() * 8,
      shape:
        index % 11 === 0
          ? 'star'
          : index % 7 === 0
            ? 'ribbon'
            : index % 5 === 0
              ? 'round'
              : 'paper',
    }
  })

  let startedAt
  const animate = (now) => {
    startedAt ??= now
    const elapsed = (now - startedAt) / 1000
    context.clearRect(0, 0, width, height)
    if (elapsed >= duration) {
      active.value = false
      window.removeEventListener('resize', resizeCanvas)
      return
    }

    for (const particle of particles) {
      const age = elapsed - particle.delay
      if (age < 0) continue

      // Match the launch points to the poppers held by the two walking mascots.
      const mascotSize = Math.min(128, Math.max(88, width * 0.1))
      const edge = Math.min(80, Math.max(8, width * 0.05))
      const launchX = edge + mascotSize * 0.86
      const originX = particle.rain
        ? width * particle.origin
        : particle.fromLeft
          ? launchX
          : width - launchX
      const originY = particle.rain ? -height * 0.12 : height * 0.95 - mascotSize * 0.95
      const travel = (1 - Math.exp(-0.8 * age)) / 0.8
      const x =
        originX +
        width * particle.velocityX * travel +
        Math.sin(age * particle.flutter + particle.rotation) * 18
      const y =
        originY + height * (particle.velocityY * age + (particle.rain ? 0.24 : 0.5) * age * age)
      if (y > height + 20) continue

      const bottomFade = Math.min(1, Math.max(0, (height - y) / (height * 0.22)))
      const endingFade = Math.min(1, Math.max(0, (duration - elapsed) / 0.7))
      context.save()
      context.globalAlpha = bottomFade * endingFade * Math.min(1, age / 0.06)
      context.translate(x, y)
      context.rotate(particle.rotation + age * particle.spin)
      context.scale(1, 0.35 + Math.cos(age * particle.flutter) * 0.65)
      context.fillStyle = particle.color
      if (particle.shape === 'round') {
        context.beginPath()
        context.arc(0, 0, particle.size / 2, 0, Math.PI * 2)
        context.fill()
      } else if (particle.shape === 'star') {
        context.beginPath()
        for (let point = 0; point < 10; point++) {
          const angle = (point * Math.PI) / 5 - Math.PI / 2
          const radius = particle.size * (point % 2 === 0 ? 0.8 : 0.35)
          context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
        }
        context.closePath()
        context.fill()
      } else if (particle.shape === 'ribbon') {
        context.beginPath()
        context.moveTo(-particle.size, -particle.size)
        context.bezierCurveTo(
          particle.size,
          -particle.size,
          -particle.size,
          particle.size,
          particle.size,
          particle.size * 2,
        )
        context.strokeStyle = particle.color
        context.lineWidth = 3
        context.stroke()
      } else {
        context.fillRect(
          -particle.size / 2,
          -particle.size / 3,
          particle.size,
          particle.size * 0.65,
        )
      }
      context.restore()
    }
    animationFrame = requestAnimationFrame(animate)
  }
  animationFrame = requestAnimationFrame(animate)
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  if (resizeCanvas) window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.celebration {
  position: fixed;
  inset: 0;
  z-index: 1100;
  overflow: hidden;
  pointer-events: none;
  --mascot-size: clamp(88px, 10vw, 128px);
  --mascot-edge: clamp(8px, 5vw, 80px);
  animation: celebration-fade 700ms ease 6.5s forwards;
}

.celebration * {
  pointer-events: none;
}

.confetti-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
}

.mascot-stage {
  position: absolute;
  bottom: 5%;
  width: var(--mascot-size);
  animation: mascot-enter 1.15s ease-out both;
}

.mascot-stage--left {
  left: var(--mascot-edge);
  --entry-x: calc(-100% - var(--mascot-edge));
}

.mascot-stage--right {
  right: var(--mascot-edge);
  --entry-x: calc(100% + var(--mascot-edge));
  --facing: -1;
}

.mascot-performer {
  position: relative;
  transform: scaleX(var(--facing, 1));
}

.mascot-body {
  display: block;
  width: 100%;
  overflow: visible;
}

.mascot-avatar {
  position: absolute;
  left: 16%;
  top: 3%;
  width: 68%;
  height: auto;
  animation:
    mascot-bob 180ms ease-in-out 6,
    mascot-cheer 500ms ease-in-out 1.8s 4;
}

.mascot-leg {
  animation: mascot-step 190ms ease-in-out 6 alternate;
}

.mascot-leg--left {
  transform-origin: 57px 146px;
}

.mascot-leg--right {
  transform-origin: 83px 146px;
  animation-direction: alternate-reverse;
}

.mascot-free-arm {
  transform-origin: 46px 112px;
  animation: mascot-step 190ms ease-in-out 6 alternate-reverse;
}

.mascot-pulling-arm {
  transform-origin: 92px 110px;
  animation: mascot-pull 550ms ease-in-out 1.1s forwards;
}

.mascot-cord {
  transform-origin: 115px 75px;
  animation: cord-pull 550ms ease-in-out 1.1s forwards;
}

.mascot-popper {
  position: absolute;
  left: 70%;
  top: 29%;
  font-size: calc(var(--mascot-size) * 0.34);
  line-height: 1;
  animation: popper-kick 320ms ease-in-out 1.65s 3;
}

@keyframes mascot-enter {
  from {
    opacity: 0;
    transform: translateX(var(--entry-x));
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes mascot-step {
  from {
    transform: rotate(-20deg);
  }
  to {
    transform: rotate(20deg);
  }
}

@keyframes mascot-bob {
  50% {
    transform: translateY(-5px) rotate(3deg);
  }
}

@keyframes mascot-pull {
  70%,
  100% {
    transform: rotate(28deg);
  }
}

@keyframes cord-pull {
  70%,
  100% {
    transform: scaleY(1.3);
  }
}

@keyframes mascot-cheer {
  50% {
    transform: translateY(-9px) rotate(-7deg);
  }
}

@keyframes popper-kick {
  40% {
    transform: translate(-3px, 5px) rotate(-18deg) scale(1.2);
  }
}

@keyframes celebration-fade {
  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .celebration {
    display: none;
  }
}
</style>
