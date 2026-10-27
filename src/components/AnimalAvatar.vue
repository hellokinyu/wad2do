<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 96 96"
    class="animal-avatar"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : choice ? choice.label + ' avatar' : 'Choose an avatar'"
    :aria-hidden="decorative ? 'true' : undefined"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="48" cy="48" r="47" :fill="choice?.background || '#efefed'" />
    <g v-if="animal === 'dog'">
      <path
        d="M28 26C10 17 9 42 15 58c4 8 12 2 17-9m36-23c18-9 19 16 13 32-4 8-12 2-17-9"
        fill="#9b643f"
      />
      <path
        d="M48 20c-22 0-29 19-27 36 2 20 15 26 27 26s25-6 27-26c2-17-5-36-27-36"
        fill="#e8b779"
      />
      <ellipse cx="48" cy="63" rx="20" ry="14" fill="#fff3df" />
      <path d="M43 56q5-4 10 0l-5 6z" fill="#352b2b" />
      <path
        d="M48 62v4m-7 0q7 8 14 0"
        fill="none"
        stroke="#352b2b"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="animal === 'cat'">
      <path d="M21 44 22 17q1-4 6 0l15 13h10l15-13q5-4 6 0l1 27" fill="#e8a36f" />
      <path d="m26 33 1-10 11 11m20 0 11-11 1 10" fill="#edb3ae" />
      <ellipse cx="48" cy="54" rx="30" ry="26" fill="#f1bd8d" />
      <path d="m43 56 5 5 5-5" fill="#b96e72" />
      <path
        d="M48 61v4m-7 0q7 7 14 0m-30-8-10-2m10 8-10 2m56-8 10-2m-10 8 10 2"
        fill="none"
        stroke="#624737"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="m41 30 3 8m7-8-1 8m9-6-4 7"
        stroke="#ce8b57"
        stroke-width="3"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="animal === 'duck'">
      <path d="M33 27q-3-11 6-8-1-10 7-5 6-6 8 4" fill="#f2c84b" />
      <path
        d="M48 21c-20 0-28 15-28 31 0 20 12 29 28 29s28-9 28-29c0-16-8-31-28-31"
        fill="#ffdc65"
      />
      <ellipse cx="48" cy="61" rx="17" ry="10" fill="#ed9443" />
      <path
        d="M36 60q12 5 24 0"
        fill="none"
        stroke="#bd6a2b"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="animal === 'goldfish'">
      <path d="M69 46q15-19 17-9l-2 13 2 13q-2 10-17-9" fill="#ef9b4c" />
      <path d="M38 28q6-16 16-10l4 14m-20 39q8 13 17 6l3-10" fill="#ef9b4c" />
      <ellipse cx="45" cy="50" rx="30" ry="25" fill="#ffb45d" />
      <path d="M52 56q13-12 14 0-7 10-14 0" fill="#f08b43" />
      <circle cx="80" cy="23" r="5" fill="#fff" opacity=".8" />
      <circle cx="69" cy="12" r="3" fill="#fff" opacity=".8" />
      <path
        d="M32 60q4 4 8 0"
        fill="none"
        stroke="#76482c"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </g>
    <g v-else-if="animal === 'panda'">
      <circle cx="25" cy="26" r="13" fill="#353535" />
      <circle cx="71" cy="26" r="13" fill="#353535" />
      <ellipse cx="48" cy="51" rx="32" ry="30" fill="#fffdf8" />
      <ellipse cx="34" cy="46" rx="10" ry="13" transform="rotate(25 34 46)" fill="#353535" />
      <ellipse cx="62" cy="46" rx="10" ry="13" transform="rotate(-25 62 46)" fill="#353535" />
      <path d="M43 59q5-4 10 0l-5 5z" fill="#353535" />
      <path
        d="M42 68q6 5 12 0"
        fill="none"
        stroke="#353535"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </g>
    <g v-if="choice">
      <circle
        :cx="animal === 'goldfish' ? 30 : 35"
        cy="47"
        r="3.5"
        :fill="animal === 'panda' ? '#fff' : '#352b2b'"
      />
      <circle
        v-if="animal !== 'goldfish'"
        cx="61"
        cy="47"
        r="3.5"
        :fill="animal === 'panda' ? '#fff' : '#352b2b'"
      />
      <circle
        :cx="animal === 'goldfish' ? 29 : 34"
        cy="46"
        r="1"
        :fill="animal === 'panda' ? '#353535' : '#fff'"
      />
      <circle
        v-if="animal !== 'goldfish'"
        cx="60"
        cy="46"
        r="1"
        :fill="animal === 'panda' ? '#353535' : '#fff'"
      />
      <ellipse
        :cx="animal === 'goldfish' ? 24 : 27"
        cy="57"
        rx="5"
        ry="3"
        fill="#ec9c95"
        opacity=".65"
      />
      <ellipse
        v-if="animal !== 'goldfish'"
        cx="69"
        cy="57"
        rx="5"
        ry="3"
        fill="#ec9c95"
        opacity=".65"
      />
    </g>
    <g v-else fill="#aaa">
      <circle cx="48" cy="35" r="13" />
      <path d="M23 77c0-28 50-28 50 0" />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { findProfileAnimal } from '@/data/profileAnimals'

const props = defineProps({
  animal: { type: String, default: '' },
  size: { type: [Number, String], default: 48 },
  decorative: { type: Boolean, default: false },
})
const choice = computed(() => findProfileAnimal(props.animal))
</script>

<style scoped>
.animal-avatar {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
