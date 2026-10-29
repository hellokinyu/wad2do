<template>
  <!-- Dev-only "Theme" dropdown, rendered by <NavBarTheme picker /> inside the navbar links.
       import.meta.env.DEV is false in production builds, so it never shows on the live site.
       Opens on hover with a mouse, or on tap/click/keyboard otherwise. -->
  <li
    v-if="picker && isDev"
    ref="pickerEl"
    class="nav-item dropdown nt-picker"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <button
      class="nav-link nt-picker-toggle"
      aria-label="Theme"
      title="Theme"
      type="button"
      :aria-expanded="open"
      data-testid="nav-theme-picker"
      @click="onToggleClick"
    >
      <svg
        class="nt-picker-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"
        />
        <circle cx="7.5" cy="11" r="1.2" />
        <circle cx="10.5" cy="7" r="1.2" />
        <circle cx="15.5" cy="7.5" r="1.2" />
      </svg>
    </button>
    <ul v-if="open" class="dropdown-menu dropdown-menu-end show">
      <li v-for="option in PICKER_OPTIONS" :key="option.value">
        <button
          class="dropdown-item"
          :class="{ active: preview === option.value }"
          type="button"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </li>
    </ul>
  </li>

  <!-- Seasonal background + small animated cartoons behind the navbar content.
       Purely decorative: it sits under the links and ignores clicks. -->
  <div v-else-if="!picker && theme" class="nav-theme" :data-nav-theme="theme" aria-hidden="true">
    <!-- Shared gradients: light comes from the top-left so every cartoon looks rounded. -->
    <svg class="nt-defs" width="0" height="0">
      <defs>
        <radialGradient id="nt-g-pumpkin" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#ffb066" />
          <stop offset="0.45" stop-color="#ff7518" />
          <stop offset="1" stop-color="#b84600" />
        </radialGradient>
        <radialGradient id="nt-g-pumpkin-side" cx="35%" cy="30%" r="80%">
          <stop offset="0" stop-color="#f59a4f" />
          <stop offset="0.5" stop-color="#e8620c" />
          <stop offset="1" stop-color="#963800" />
        </radialGradient>
        <linearGradient id="nt-g-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8fd16a" />
          <stop offset="1" stop-color="#2f5a1f" />
        </linearGradient>
        <radialGradient id="nt-g-dark" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#6a5190" />
          <stop offset="0.5" stop-color="#231533" />
          <stop offset="1" stop-color="#0b0612" />
        </radialGradient>
        <linearGradient id="nt-g-tree" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#95d5b2" />
          <stop offset="0.45" stop-color="#40916c" />
          <stop offset="1" stop-color="#1b5e3f" />
        </linearGradient>
        <linearGradient id="nt-g-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#c08a52" />
          <stop offset="1" stop-color="#5e3a1a" />
        </linearGradient>
        <radialGradient id="nt-g-red" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#ff7a8c" />
          <stop offset="0.5" stop-color="#c8102e" />
          <stop offset="1" stop-color="#6e0015" />
        </radialGradient>
        <radialGradient id="nt-g-gold" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#fff4c2" />
          <stop offset="0.5" stop-color="#f5c542" />
          <stop offset="1" stop-color="#a87b00" />
        </radialGradient>
        <radialGradient id="nt-g-white" cx="35%" cy="30%" r="80%">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.6" stop-color="#eef0f3" />
          <stop offset="1" stop-color="#b9c0ca" />
        </radialGradient>
        <radialGradient id="nt-g-skin" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#ffeadb" />
          <stop offset="0.6" stop-color="#f6d0b1" />
          <stop offset="1" stop-color="#d49a76" />
        </radialGradient>
        <radialGradient id="nt-g-fur" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#d39a62" />
          <stop offset="0.55" stop-color="#9c6b3c" />
          <stop offset="1" stop-color="#5a3617" />
        </radialGradient>
        <radialGradient id="nt-g-muzzle" cx="40%" cy="30%" r="75%">
          <stop offset="0" stop-color="#f7e6d2" />
          <stop offset="0.6" stop-color="#d9b48f" />
          <stop offset="1" stop-color="#a87e55" />
        </radialGradient>
        <linearGradient id="nt-g-antler" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e2c29c" />
          <stop offset="1" stop-color="#9c6b3c" />
        </linearGradient>
      </defs>
    </svg>

    <!-- Snowfall across the whole bar at Christmas -->
    <template v-if="theme === 'christmas'">
      <span
        v-for="(flake, i) in SNOWFLAKES"
        :key="i"
        class="nt-snow"
        :style="{
          left: flake.x,
          width: flake.size,
          height: flake.size,
          animationDuration: flake.duration,
          animationDelay: flake.delay,
        }"
      ></span>
    </template>

    <div class="container nt-inner">
      <!-- Halloween: pumpkin, spiderweb with dangling spider, flying bat -->
      <template v-if="theme === 'halloween'">
        <svg class="nt-item nt-item--1 nt-pumpkin" viewBox="0 0 44 40">
          <path
            d="M22 11c-1-3 0-6 3-8"
            stroke="#2f5a1f"
            stroke-width="3.4"
            fill="none"
            stroke-linecap="round"
          />
          <path
            d="M22 11c-1-3 0-6 3-8"
            stroke="#6aa84f"
            stroke-width="1.4"
            fill="none"
            stroke-linecap="round"
          />
          <path d="M24 7q6-5 10 0q-5 3-10 0z" fill="url(#nt-g-leaf)" />
          <ellipse cx="14" cy="24" rx="10" ry="12" fill="url(#nt-g-pumpkin-side)" />
          <ellipse cx="30" cy="24" rx="10" ry="12" fill="url(#nt-g-pumpkin-side)" />
          <ellipse cx="22" cy="24" rx="10" ry="13" fill="url(#nt-g-pumpkin)" />
          <path
            d="M17 12.5q-3 11.5 0 23M27 12.5q3 11.5 0 23"
            stroke="#a63f00"
            stroke-width="0.7"
            fill="none"
            opacity="0.5"
          />
          <path d="M14 22l3-5 3 5zM24 22l3-5 3 5z" fill="#2B1B3D" />
          <path
            d="M15 27q7 6 14 0"
            stroke="#2B1B3D"
            stroke-width="2.2"
            fill="none"
            stroke-linecap="round"
          />
          <circle cx="10.5" cy="27" r="1.8" fill="#ffc196" opacity="0.8" />
          <circle cx="33.5" cy="27" r="1.8" fill="#ffc196" opacity="0.8" />
          <ellipse
            cx="18"
            cy="16.5"
            rx="3.6"
            ry="1.8"
            transform="rotate(-30 18 16.5)"
            fill="#fff"
            opacity="0.55"
          />
        </svg>

        <svg class="nt-item nt-item--2 nt-web" viewBox="0 0 56 70">
          <g stroke="rgba(255,255,255,0.55)" stroke-width="0.8" fill="none">
            <path d="M28 0L0 0M28 0L4 16M28 0L16 27M28 0L28 30M28 0L40 27M28 0L52 16M28 0L56 0" />
            <polyline points="18.8,0 20.1,5.3 24,8.9 28,9.9 32,8.9 35.9,5.3 37.2,0" />
            <polyline points="9.5,0 12.2,10.6 20.1,17.8 28,19.8 35.9,17.8 43.8,10.6 46.5,0" />
            <polyline points="0,0 4,16 16,27 28,30 40,27 52,16 56,0" />
          </g>
          <g class="nt-spider">
            <line
              x1="28"
              y1="-30"
              x2="28"
              y2="38"
              stroke="rgba(255,255,255,0.7)"
              stroke-width="0.8"
            />
            <g stroke="#3b2a52" stroke-width="1.7" stroke-linecap="round" fill="none">
              <path
                d="M23 41l-6-3-1 2M23 44h-7l-1 2M23 47l-6 3v2M33 41l6-3 1 2M33 44h7l1 2M33 47l6 3v2"
              />
            </g>
            <circle cx="28" cy="44" r="6.8" fill="url(#nt-g-dark)" />
            <ellipse
              cx="25.5"
              cy="40.5"
              rx="2"
              ry="1"
              transform="rotate(-25 25.5 40.5)"
              fill="#fff"
              opacity="0.35"
            />
            <circle cx="25.6" cy="43.5" r="1.9" fill="#fff" />
            <circle cx="30.4" cy="43.5" r="1.9" fill="#fff" />
            <circle cx="25.9" cy="43.9" r="0.9" fill="#120a1c" />
            <circle cx="30.7" cy="43.9" r="0.9" fill="#120a1c" />
            <circle cx="25.4" cy="43.2" r="0.35" fill="#fff" />
            <circle cx="30.2" cy="43.2" r="0.35" fill="#fff" />
          </g>
        </svg>

        <div class="nt-item nt-item--3 nt-bat-path">
          <svg class="nt-bat" viewBox="0 0 50 26">
            <g class="nt-wings" fill="url(#nt-g-dark)" stroke="#7a5ca3" stroke-width="0.6">
              <path d="M25 12C20 4 10 2 2 7c4 1 5 4 5 7 3-3 6-2 8 1 2-3 6-3 10 0z" />
              <path
                d="M25 12C20 4 10 2 2 7c4 1 5 4 5 7 3-3 6-2 8 1 2-3 6-3 10 0z"
                transform="matrix(-1 0 0 1 50 0)"
              />
            </g>
            <path d="M21 8l0-5 3 4zM29 8l0-5-3 4z" fill="#231533" />
            <ellipse cx="25" cy="13" rx="5" ry="6.5" fill="url(#nt-g-dark)" />
            <ellipse
              cx="23.3"
              cy="9.6"
              rx="1.6"
              ry="0.9"
              transform="rotate(-25 23.3 9.6)"
              fill="#fff"
              opacity="0.35"
            />
            <circle cx="23" cy="12.5" r="1.4" fill="#FF7518" />
            <circle cx="27" cy="12.5" r="1.4" fill="#FF7518" />
            <circle cx="22.6" cy="12.1" r="0.4" fill="#fff" />
            <circle cx="26.6" cy="12.1" r="0.4" fill="#fff" />
          </svg>
        </div>
      </template>

      <!-- Christmas: swaying tree with chasing lights, waving Santa, reindeer galloping across -->
      <template v-else-if="theme === 'christmas'">
        <svg class="nt-item nt-item--1 nt-tree" viewBox="0 0 40 48">
          <rect x="17" y="40" width="6" height="6" rx="1" fill="url(#nt-g-trunk)" />
          <path d="M20 23.5L36 41.5H4z" fill="#0f2e20" opacity="0.5" />
          <path d="M20 22L36 40H4z" fill="url(#nt-g-tree)" />
          <path d="M20 15.5L33 32.5H7z" fill="#0f2e20" opacity="0.5" />
          <path d="M20 14L33 31H7z" fill="url(#nt-g-tree)" />
          <path d="M20 8.5L30 22.5H10z" fill="#0f2e20" opacity="0.5" />
          <path d="M20 7L30 21H10z" fill="url(#nt-g-tree)" />
          <path
            d="M9 39q11 -5 22 -9M11 30q8 -4 15 -6"
            stroke="#f5c542"
            stroke-width="0.8"
            fill="none"
            opacity="0.8"
          />
          <path
            class="nt-star-rays"
            d="M20 -1v12M14 5h12M15.8 0.8l8.4 8.4M24.2 0.8l-8.4 8.4"
            stroke="#fff6c9"
            stroke-width="0.7"
            stroke-linecap="round"
          />
          <path
            class="nt-star"
            d="M20 0l1.8 3.7 4 .6-2.9 2.8.7 4L20 9.2l-3.6 1.9.7-4-2.9-2.8 4-.6z"
            fill="url(#nt-g-gold)"
          />
          <g class="nt-light">
            <circle cx="17" cy="17" r="2" fill="url(#nt-g-red)" />
            <circle cx="16.4" cy="16.4" r="0.6" fill="#fff" />
          </g>
          <g class="nt-light">
            <circle cx="23" cy="25" r="2" fill="url(#nt-g-gold)" />
            <circle cx="22.4" cy="24.4" r="0.6" fill="#fff" />
          </g>
          <g class="nt-light">
            <circle cx="14" cy="28" r="2" fill="url(#nt-g-white)" />
            <circle cx="13.4" cy="27.4" r="0.6" fill="#fff" />
          </g>
          <g class="nt-light">
            <circle cx="25" cy="35" r="2" fill="url(#nt-g-red)" />
            <circle cx="24.4" cy="34.4" r="0.6" fill="#fff" />
          </g>
          <g class="nt-light">
            <circle cx="13" cy="37" r="2" fill="url(#nt-g-gold)" />
            <circle cx="12.4" cy="36.4" r="0.6" fill="#fff" />
          </g>
        </svg>

        <svg class="nt-item nt-item--2 nt-santa" viewBox="0 0 44 44">
          <g class="nt-wave">
            <path d="M28 33L37 24" stroke="#c8102e" stroke-width="4.5" stroke-linecap="round" />
            <circle cx="36" cy="25" r="2.6" fill="url(#nt-g-white)" />
            <circle cx="38.5" cy="22" r="2.8" fill="#2b2b2b" />
            <circle cx="37.6" cy="21.1" r="0.8" fill="#fff" opacity="0.5" />
          </g>
          <circle cx="20" cy="26" r="10" fill="url(#nt-g-skin)" />
          <g class="nt-blink">
            <circle cx="16" cy="24" r="1.5" fill="#2b2b2b" />
            <circle cx="24" cy="24" r="1.5" fill="#2b2b2b" />
            <circle cx="15.5" cy="23.5" r="0.5" fill="#fff" />
            <circle cx="23.5" cy="23.5" r="0.5" fill="#fff" />
          </g>
          <circle cx="13.5" cy="27" r="1.9" fill="#f4a3a3" opacity="0.85" />
          <circle cx="26.5" cy="27" r="1.9" fill="#f4a3a3" opacity="0.85" />
          <path d="M9 27q0 14 11 15q11-1 11-15q-3 5-11 5q-8 0-11-5z" fill="url(#nt-g-white)" />
          <path
            d="M20 30q-4-3-8 0q4 2.5 8 .5q4 2 8-.5q-4-3-8 0z"
            fill="url(#nt-g-white)"
            stroke="#d5d9df"
            stroke-width="0.4"
          />
          <circle cx="20" cy="28" r="2" fill="url(#nt-g-red)" opacity="0.6" />
          <path d="M8 18C10 6 22 2 31 8l-1 10z" fill="url(#nt-g-red)" />
          <ellipse
            cx="15"
            cy="11"
            rx="3.5"
            ry="1.4"
            transform="rotate(-25 15 11)"
            fill="#fff"
            opacity="0.4"
          />
          <rect x="6" y="15.5" width="28" height="6" rx="3" fill="url(#nt-g-white)" />
          <g class="nt-pom">
            <path
              d="M30 8.5q3 -1 4 2"
              stroke="#c8102e"
              stroke-width="2.4"
              fill="none"
              stroke-linecap="round"
            />
            <circle cx="34.5" cy="12" r="3.4" fill="url(#nt-g-white)" />
          </g>
        </svg>

        <div class="nt-item nt-item--3 nt-flyer">
          <svg class="nt-reindeer" viewBox="0 0 54 40">
            <g class="nt-leg nt-leg--back">
              <rect x="13" y="27" width="2.6" height="9" rx="1.2" fill="#5a3617" />
            </g>
            <g class="nt-leg nt-leg--front">
              <rect x="30" y="27" width="2.6" height="9" rx="1.2" fill="#5a3617" />
            </g>
            <ellipse cx="9.5" cy="20" rx="2.4" ry="1.8" fill="#f3e2cc" />
            <ellipse cx="22" cy="24" rx="12" ry="7" fill="url(#nt-g-fur)" />
            <ellipse cx="22" cy="27.5" rx="8" ry="3" fill="#d9b48f" opacity="0.8" />
            <ellipse
              cx="18"
              cy="20"
              rx="4"
              ry="1.4"
              transform="rotate(-10 18 20)"
              fill="#fff"
              opacity="0.3"
            />
            <g class="nt-leg nt-leg--back2">
              <rect x="16.5" y="27" width="2.6" height="9" rx="1.2" fill="url(#nt-g-fur)" />
            </g>
            <g class="nt-leg nt-leg--front2">
              <rect x="26.5" y="27" width="2.6" height="9" rx="1.2" fill="url(#nt-g-fur)" />
            </g>
            <ellipse
              cx="33"
              cy="18.5"
              rx="4"
              ry="6.5"
              transform="rotate(35 33 18.5)"
              fill="url(#nt-g-fur)"
            />
            <path
              d="M30 20.5q3.5 -3.5 6.5 -6"
              stroke="#c8102e"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <circle cx="33.6" cy="19.6" r="1.6" fill="url(#nt-g-gold)" />
            <path
              d="M36 8L33 1M34.4 4.4L30 3M39 8l2-7M40.2 4.2L44 2.5"
              stroke="url(#nt-g-antler)"
              stroke-width="1.8"
              stroke-linecap="round"
              fill="none"
            />
            <ellipse
              cx="34"
              cy="10.5"
              rx="3.2"
              ry="1.5"
              transform="rotate(-35 34 10.5)"
              fill="url(#nt-g-fur)"
            />
            <circle cx="38.5" cy="13.5" r="6.2" fill="url(#nt-g-fur)" />
            <ellipse cx="44" cy="16" rx="4.6" ry="3.3" fill="url(#nt-g-muzzle)" />
            <g class="nt-blink">
              <circle cx="40" cy="12" r="1.4" fill="#2b1a0e" />
              <circle cx="39.6" cy="11.6" r="0.45" fill="#fff" />
            </g>
            <circle cx="36" cy="15.5" r="1.3" fill="#f4a3a3" opacity="0.7" />
            <g class="nt-nose">
              <circle cx="48.5" cy="15.2" r="2.4" fill="url(#nt-g-red)" />
              <circle cx="47.9" cy="14.5" r="0.7" fill="#fff" opacity="0.8" />
            </g>
          </svg>
        </div>
      </template>

      <!-- Light & Dark: your profile animal walks back and forth beside its favourite thing
           (panda + bamboo, dog + bone, cat + fish, duck + bread, goldfish + seaweed). -->
      <template v-else-if="theme === 'light' || theme === 'dark'">
        <svg class="nt-item nt-item--2 nt-treat" viewBox="0 0 44 44">
          <g v-if="pet === 'panda'" class="nt-bamboo">
            <rect x="13" y="8" width="5.5" height="35" rx="2.5" fill="#6fb85c" />
            <rect x="14" y="8" width="1.4" height="35" rx="0.7" fill="#a9dc93" opacity="0.8" />
            <path d="M13 17h5.5M13 27h5.5M13 36h5.5" stroke="#3f7f34" stroke-width="1.4" />
            <rect x="23" y="14" width="5" height="29" rx="2.3" fill="#5aa94a" />
            <rect x="23.9" y="14" width="1.3" height="29" rx="0.6" fill="#a9dc93" opacity="0.8" />
            <path d="M23 22h5M23 32h5" stroke="#3f7f34" stroke-width="1.4" />
            <g class="nt-leaves">
              <path d="M18.5 17q8-5 13-3q-6 5-13 3z" fill="#7cc36b" />
              <path d="M13 12q-7-6-11-3q5 5 11 3z" fill="#5aa94a" />
              <path d="M28 22q7-2 10 2q-6 2-10-2z" fill="#7cc36b" />
            </g>
          </g>

          <template v-else-if="pet === 'dog'">
            <g class="nt-bone">
              <g transform="rotate(-20 22 24)">
                <g fill="#fff6e6" stroke="#c9b083" stroke-width="1.6">
                  <circle cx="10" cy="20" r="4.6" />
                  <circle cx="10" cy="28" r="4.6" />
                  <circle cx="34" cy="20" r="4.6" />
                  <circle cx="34" cy="28" r="4.6" />
                  <rect x="10" y="19.5" width="24" height="9" rx="2" />
                </g>
                <!-- same shapes again without a stroke hide the inner outlines -->
                <g fill="#fff6e6">
                  <circle cx="10" cy="20" r="4.6" />
                  <circle cx="10" cy="28" r="4.6" />
                  <circle cx="34" cy="20" r="4.6" />
                  <circle cx="34" cy="28" r="4.6" />
                  <rect x="10" y="19.5" width="24" height="9" rx="2" />
                </g>
                <path
                  d="M12 21.5h20M8.5 18.5l1-1"
                  stroke="#fff"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </g>
            </g>
            <path
              class="nt-sparkle"
              d="M37 4q.7 3 3.5 3.5q-2.8.7-3.5 3.5q-.7-2.8-3.5-3.5q2.8-.5 3.5-3.5z"
              fill="#ffd34d"
            />
          </template>

          <g v-else-if="pet === 'cat'" class="nt-flop">
            <path d="M30 24l9-7v14z" fill="#4f8fcf" />
            <path d="M16 17.5q4-5 8 0" fill="#4f8fcf" />
            <ellipse cx="20" cy="24" rx="11" ry="7" fill="#6fa8dc" />
            <path d="M18.5 19.5q-2 4.5 0 9" stroke="#4f8fcf" stroke-width="0.9" fill="none" />
            <path
              d="M22 20q1.5 1.5 0 3M25 20q1.5 1.5 0 3M22 25q1.5 1.5 0 3M25 25q1.5 1.5 0 3"
              stroke="#4f8fcf"
              stroke-width="0.7"
              fill="none"
            />
            <ellipse cx="17" cy="20.5" rx="4" ry="1.4" fill="#fff" opacity="0.5" />
            <circle cx="13.5" cy="22.5" r="1.7" fill="#1f2d3d" />
            <circle cx="13" cy="22" r="0.5" fill="#fff" />
            <path
              d="M9.6 25.5q1 .8 2 0"
              stroke="#1f2d3d"
              stroke-width="0.8"
              fill="none"
              stroke-linecap="round"
            />
          </g>

          <template v-else-if="pet === 'duck'">
            <g class="nt-bread">
              <path
                d="M9 40V22c-4-1.5-5-5-4-8 2-6 9-8 17-8s15 2 17 8c1 3 0 6.5-4 8v18z"
                fill="#c98a3e"
              />
              <path
                d="M12 38V21c-3-1-3.6-3.5-3-5.6 1.6-4.4 7-6.4 13-6.4s11.4 2 13 6.4c.6 2.1 0 4.6-3 5.6v17z"
                fill="#f6dca5"
              />
              <circle cx="17" cy="25" r="0.9" fill="#e2b874" />
              <circle cx="26" cy="29" r="0.9" fill="#e2b874" />
              <circle cx="20" cy="33" r="0.9" fill="#e2b874" />
              <circle cx="28" cy="20" r="0.9" fill="#e2b874" />
              <ellipse
                cx="15"
                cy="14"
                rx="4"
                ry="1.4"
                transform="rotate(-15 15 14)"
                fill="#fff"
                opacity="0.6"
              />
            </g>
            <circle class="nt-crumb" cx="5" cy="41.5" r="1.1" fill="#c98a3e" />
            <circle class="nt-crumb" cx="39" cy="41" r="1.3" fill="#e2b874" />
            <circle class="nt-crumb" cx="42" cy="42" r="0.9" fill="#c98a3e" />
          </template>

          <template v-else>
            <ellipse cx="12" cy="42.5" rx="4" ry="1.8" fill="#b7a99a" />
            <ellipse cx="28" cy="43" rx="5" ry="1.6" fill="#9e8f80" />
            <path
              class="nt-weed"
              d="M14 43q-5-7 0-14t0-15"
              stroke="#3f9a54"
              stroke-width="3.5"
              fill="none"
              stroke-linecap="round"
            />
            <path
              class="nt-weed"
              d="M22 43q5-6 0-12t0-12q-3-4 0-9"
              stroke="#5cb86f"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"
            />
            <path
              class="nt-weed"
              d="M30 43q-4-5 0-10t0-9"
              stroke="#2f7f44"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"
            />
            <circle
              class="nt-rise"
              cx="18"
              cy="12"
              r="1.6"
              fill="rgba(255,255,255,0.5)"
              stroke="#7fc3e6"
              stroke-width="0.6"
            />
            <circle
              class="nt-rise"
              cx="27"
              cy="18"
              r="1.2"
              fill="rgba(255,255,255,0.5)"
              stroke="#7fc3e6"
              stroke-width="0.6"
            />
          </template>
        </svg>

        <div class="nt-walker" :class="`nt-walker--${pet}`">
          <svg class="nt-pet" viewBox="0 0 48 40">
            <template v-if="pet === 'dog'">
              <path
                class="nt-wag"
                d="M10 21q-5-5-3-11"
                stroke="#e8b779"
                stroke-width="3.2"
                stroke-linecap="round"
                fill="none"
              />
              <g class="nt-step nt-step--b">
                <rect x="13" y="27" width="3.4" height="10" rx="1.6" fill="#cf9a5e" />
              </g>
              <g class="nt-step nt-step--a">
                <rect x="26" y="27" width="3.4" height="10" rx="1.6" fill="#cf9a5e" />
              </g>
              <ellipse cx="20" cy="24" rx="12" ry="7.5" fill="#e8b779" />
              <ellipse cx="21" cy="27.5" rx="8" ry="3.2" fill="#fff3df" />
              <ellipse cx="15" cy="20.5" rx="3.6" ry="2.6" fill="#9b643f" />
              <g class="nt-step nt-step--a">
                <rect x="16.5" y="27" width="3.4" height="10" rx="1.6" fill="#e8b779" />
              </g>
              <g class="nt-step nt-step--b">
                <rect x="29.5" y="27" width="3.4" height="10" rx="1.6" fill="#e8b779" />
              </g>
              <circle cx="34" cy="16" r="8" fill="#e8b779" />
              <ellipse cx="40" cy="19" rx="5" ry="3.8" fill="#fff3df" />
              <ellipse cx="44.3" cy="17.6" rx="1.8" ry="1.4" fill="#352b2b" />
              <path
                d="M40.5 21.6q1.6 1.3 3.2 0"
                stroke="#352b2b"
                stroke-width="1"
                fill="none"
                stroke-linecap="round"
              />
              <g class="nt-blink">
                <circle cx="36.5" cy="13.8" r="1.5" fill="#352b2b" />
                <circle cx="36.1" cy="13.3" r="0.5" fill="#fff" />
              </g>
              <ellipse cx="35" cy="19.2" rx="2" ry="1.2" fill="#ec9c95" opacity="0.65" />
              <path d="M30.5 9.5q-6 1-5 10q3.5 1.5 6-3.5z" fill="#9b643f" />
            </template>

            <template v-else-if="pet === 'cat'">
              <path
                class="nt-tail-sway"
                d="M10 23q-7-3-5-12q1-3 3-1"
                stroke="#e8a36f"
                stroke-width="2.8"
                fill="none"
                stroke-linecap="round"
              />
              <g class="nt-step nt-step--b">
                <rect x="13" y="28" width="3.2" height="9" rx="1.5" fill="#d99a66" />
              </g>
              <g class="nt-step nt-step--a">
                <rect x="25.5" y="28" width="3.2" height="9" rx="1.5" fill="#d99a66" />
              </g>
              <ellipse cx="20" cy="25" rx="11.5" ry="7" fill="#f1bd8d" />
              <ellipse cx="21" cy="28" rx="7" ry="2.6" fill="#f8d6b4" />
              <path
                d="M15 18.6l1 4M20 18v4.2M25 18.6l-1 4"
                stroke="#ce8b57"
                stroke-width="1.6"
                stroke-linecap="round"
              />
              <g class="nt-step nt-step--a">
                <rect x="16.5" y="28" width="3.2" height="9" rx="1.5" fill="#f1bd8d" />
              </g>
              <g class="nt-step nt-step--b">
                <rect x="29" y="28" width="3.2" height="9" rx="1.5" fill="#f1bd8d" />
              </g>
              <path d="M28.5 12.5l.5-8.5 6.5 5.5zM35.5 9.5l4.5-6.5 2.5 8.5z" fill="#e8a36f" />
              <path d="M30 11l.4-4.5 3.5 3zM37 9.3l2.6-3.6 1.4 4.6z" fill="#edb3ae" />
              <circle cx="34.5" cy="17" r="8" fill="#f1bd8d" />
              <g class="nt-blink">
                <circle cx="38" cy="15.8" r="1.5" fill="#352b2b" />
                <circle cx="37.6" cy="15.3" r="0.5" fill="#fff" />
              </g>
              <path d="M41.6 18.3h1.8l-.9 1.2z" fill="#b96e72" />
              <path
                d="M41 20.5l5.5-1M41 21.8l5.5 1M41.2 20.6q1.3 1 2.6 0"
                stroke="#624737"
                stroke-width="0.6"
                fill="none"
                stroke-linecap="round"
              />
              <ellipse cx="37" cy="20.3" rx="1.8" ry="1.1" fill="#ec9c95" opacity="0.65" />
            </template>

            <template v-else-if="pet === 'panda'">
              <circle cx="8.5" cy="21" r="2.2" fill="#353535" />
              <g class="nt-step nt-step--b">
                <rect x="13" y="27" width="3.6" height="10" rx="1.7" fill="#2a2a2a" />
              </g>
              <g class="nt-step nt-step--a">
                <rect x="26" y="27" width="3.6" height="10" rx="1.7" fill="#2a2a2a" />
              </g>
              <ellipse
                cx="20"
                cy="24"
                rx="12.5"
                ry="8"
                fill="#fffdf8"
                stroke="#d9d4c7"
                stroke-width="0.7"
              />
              <path d="M24 16.3q6.5 0 7 7.7q-.5 7.7-7 7.7q2.6-7.7 0-15.4z" fill="#353535" />
              <g class="nt-step nt-step--a">
                <rect x="16.5" y="27" width="3.6" height="10" rx="1.7" fill="#353535" />
              </g>
              <g class="nt-step nt-step--b">
                <rect x="29.5" y="27" width="3.6" height="10" rx="1.7" fill="#353535" />
              </g>
              <circle cx="29.5" cy="8.5" r="3.2" fill="#353535" />
              <circle cx="38" cy="7.8" r="3.2" fill="#353535" />
              <circle
                cx="34"
                cy="15.5"
                r="8.5"
                fill="#fffdf8"
                stroke="#d9d4c7"
                stroke-width="0.7"
              />
              <ellipse
                cx="37.5"
                cy="15"
                rx="2.8"
                ry="3.4"
                transform="rotate(-20 37.5 15)"
                fill="#353535"
              />
              <g class="nt-blink">
                <circle cx="37.8" cy="14.6" r="1.1" fill="#fff" />
                <circle cx="38" cy="14.8" r="0.5" fill="#353535" />
              </g>
              <ellipse cx="42.3" cy="18" rx="1.6" ry="1.1" fill="#353535" />
              <path
                d="M41.2 19.8q1.2 1 2.4 0"
                stroke="#353535"
                stroke-width="0.9"
                fill="none"
                stroke-linecap="round"
              />
              <ellipse cx="36.5" cy="19.8" rx="1.8" ry="1.1" fill="#ec9c95" opacity="0.65" />
            </template>

            <template v-else-if="pet === 'duck'">
              <g class="nt-step nt-step--a">
                <path
                  d="M18 31v5.5M15.6 37h5"
                  stroke="#ed9443"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </g>
              <g class="nt-step nt-step--b">
                <path
                  d="M24 31v5.5M21.6 37h5"
                  stroke="#ed9443"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </g>
              <path d="M9.5 22.5l-5-4 6.5.5z" fill="#f2c84b" />
              <ellipse cx="21" cy="25" rx="12" ry="8.5" fill="#ffdc65" />
              <g class="nt-wing">
                <ellipse
                  cx="18.5"
                  cy="23.5"
                  rx="7"
                  ry="4.2"
                  transform="rotate(-12 18.5 23.5)"
                  fill="#f2c84b"
                />
              </g>
              <circle cx="33" cy="13.5" r="7.5" fill="#ffdc65" />
              <path d="M31.5 6.3q-.5-4 2.5-3.3q-1.2 1.8 0 3.2z" fill="#f2c84b" />
              <path d="M39.5 13.2q6-.6 6.6 2q-.6 2.7-6.6 1.8z" fill="#ed9443" />
              <path d="M40 15.4h5" stroke="#bd6a2b" stroke-width="0.6" />
              <g class="nt-blink">
                <circle cx="35.5" cy="11.8" r="1.4" fill="#352b2b" />
                <circle cx="35.1" cy="11.3" r="0.45" fill="#fff" />
              </g>
              <ellipse cx="35" cy="16.2" rx="1.8" ry="1.1" fill="#ec9c95" opacity="0.65" />
            </template>

            <template v-else>
              <g class="nt-fin-wiggle">
                <path d="M12 20q-9-10-10-4l2 4-2 4q1 6 10-4z" fill="#ef9b4c" />
              </g>
              <path d="M18 12q4-9 11-3l-1 4zM20 28q2 6 7 3l-1-3z" fill="#ef9b4c" />
              <ellipse cx="24" cy="20" rx="13" ry="9.5" fill="#ffb45d" />
              <path
                d="M20 15q2 2 0 4M24 15q2 2 0 4M20 21q2 2 0 4M24 21q2 2 0 4"
                stroke="#f08b43"
                stroke-width="0.7"
                fill="none"
                opacity="0.6"
              />
              <g class="nt-side-fin"><path d="M24 21q6-4 7 1-3 4-7-1z" fill="#f08b43" /></g>
              <ellipse cx="21" cy="14.5" rx="5" ry="1.6" fill="#fff" opacity="0.45" />
              <g class="nt-blink">
                <circle cx="32" cy="18" r="1.7" fill="#352b2b" />
                <circle cx="31.5" cy="17.4" r="0.55" fill="#fff" />
              </g>
              <ellipse cx="31.5" cy="22.5" rx="1.8" ry="1.1" fill="#ec9c95" opacity="0.65" />
              <path
                d="M36.4 21q1 .8 1.8 0"
                stroke="#76482c"
                stroke-width="0.9"
                fill="none"
                stroke-linecap="round"
              />
              <circle
                class="nt-rise"
                cx="40"
                cy="14"
                r="1.2"
                fill="rgba(255,255,255,0.5)"
                stroke="#7fc3e6"
                stroke-width="0.5"
              />
              <circle
                class="nt-rise"
                cx="42"
                cy="9"
                r="0.9"
                fill="rgba(255,255,255,0.5)"
                stroke="#7fc3e6"
                stroke-width="0.5"
              />
            </template>
          </svg>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'

const THEMES = ['halloween', 'christmas', 'light', 'dark']
const PREVIEW_KEY = 'wad2do-nav-theme'
const PICKER_OPTIONS = [
  { value: 'auto', label: 'Auto (by date)' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'christmas', label: 'Christmas' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Snowflakes spread across the bar with varied size and speed (negative delays = already falling).
const SNOWFLAKES = Array.from({ length: 18 }, (_, i) => ({
  x: `${(i * 37 + 3) % 100}%`,
  size: `${2 + (i % 3)}px`,
  duration: `${6 + (i % 5)}s`,
  delay: `-${(i * 0.9).toFixed(1)}s`,
}))

// Picks the theme from today's date:
// Halloween all of October, Christmas 1–26 Dec, otherwise the light theme.
function seasonalTheme(date = new Date()) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 10) return 'halloween'
  if (month === 12 && day <= 26) return 'christmas'
  return 'light'
}

function readPreview() {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) ?? 'auto'
  } catch {
    return 'auto'
  }
}

// Shared by the background layer and the picker.
// "auto" follows the date; anything else is a preview remembered for the rest of the browser tab.
const preview = ref(readPreview())

function setPreview(value) {
  preview.value = value
  try {
    if (value === 'auto') sessionStorage.removeItem(PREVIEW_KEY)
    else sessionStorage.setItem(PREVIEW_KEY, value)
  } catch {
    // Storage blocked (e.g. private window): the preview just won't survive a reload.
  }
}
</script>

<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const props = defineProps({
  // true renders the "Theme" dropdown (dev only) instead of the background layer.
  picker: { type: Boolean, default: false },
})

const route = useRoute()
const { avatarAnimal } = useAuth()
// Logged-out visitors (or anyone without an avatar yet) get the dog.
const pet = computed(() => avatarAnimal.value || 'dog')
const isDev = import.meta.env.DEV
const open = ref(false)
const pickerEl = ref(null)

let closeTimer

function choose(value) {
  setPreview(value)
  open.value = false
}

// Hover only applies to a real mouse; touch taps go through the click handler instead.
function onPointerEnter(event) {
  if (event.pointerType !== 'mouse') return
  clearTimeout(closeTimer)
  open.value = true
}
function onPointerLeave(event) {
  if (event.pointerType !== 'mouse') return
  // Short delay so moving the mouse across the small gap into the menu doesn't close it.
  closeTimer = setTimeout(() => (open.value = false), 200)
}
function onToggleClick(event) {
  // A mouse click while hovering keeps it open; taps and keyboard toggle it.
  open.value = event.pointerType === 'mouse' ? true : !open.value
}

// You can also preview with ?navTheme=halloween|christmas|light|dark|auto in the URL.
watch(
  () => route.query.navTheme,
  (requested) => {
    if (props.picker) return
    if (requested === 'auto' || THEMES.includes(requested)) {
      setPreview(requested)
    }
  },
  { immediate: true },
)

const theme = computed(() => {
  if (THEMES.includes(preview.value)) return preview.value
  return seasonalTheme()
})

// Close the dropdown on an outside click or Escape.
function onDocumentClick(event) {
  if (open.value && !pickerEl.value?.contains(event.target)) open.value = false
}
function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}
onMounted(() => {
  if (!props.picker) return
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  clearTimeout(closeTimer)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style>
/* ---------- Layer behind the navbar content ---------- */
/* z-index -1 keeps it under the links: the sticky navbar is its own stacking context. */
.nav-theme {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.nt-inner {
  position: relative;
  height: 100%;
}
.nt-defs {
  position: absolute;
}
.nt-item {
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4));
  position: absolute;
  top: 16px;
  width: 44px;
  height: 44px;
}
.nt-item--1 {
  left: 215px;
}
.nt-item--2 {
  left: 295px;
}
.nt-item--3 {
  left: 375px;
}

/* Only one cartoon fits between the logo and the links on smaller screens. */
@media (max-width: 991.98px) {
  .nt-item--2,
  .nt-item--3 {
    display: none;
  }
}
@media (max-width: 359.98px) {
  .nt-item--1 {
    display: none;
  }
}

/* ---------- Shared navbar colours ---------- */
.navbar:has(> .nav-theme) {
  background-color: transparent !important;
}
/* The logo is drawn in the theme's accent colour: the PNG's shape becomes a mask over a
   solid background, and object-position pushes the original black pixels out of view. */
.navbar:has(> .nav-theme) .navbar-brand {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}
.navbar:has(> .nav-theme) .brand-logo {
  object-position: -99999px 0;
  background-color: var(--nt-logo-color);
  -webkit-mask: url('@/assets/wad2do-logo.png') center / contain no-repeat;
  mask: url('@/assets/wad2do-logo.png') center / contain no-repeat;
}
.navbar:has(> .nav-theme) .nav-link {
  border-radius: 999px;
  padding-inline: 0.85rem;
  transition:
    background-color 0.2s,
    color 0.2s;
}
.navbar:has(> .nav-theme[data-nav-theme='halloween']),
.navbar:has(> .nav-theme[data-nav-theme='christmas']),
.navbar:has(> .nav-theme[data-nav-theme='dark']) {
  --bs-navbar-toggler-border-color: rgba(255, 255, 255, 0.35);
  --bs-navbar-toggler-icon-bg: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28255, 255, 255, 0.9%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}

/* ---------- Halloween: deep purple + pumpkin orange ---------- */
.nav-theme[data-nav-theme='halloween'] {
  background: linear-gradient(180deg, #2b1b3d 0%, #3a2452 100%);
}
.navbar:has(> .nav-theme[data-nav-theme='halloween']) {
  --nt-logo-color: #ff7518;
  --bs-border-color: #ff7518;
  --bs-navbar-color: #f3e9ff;
  --bs-navbar-hover-color: #ff7518;
  --bs-navbar-active-color: #2b1b3d;
}
.navbar:has(> .nav-theme[data-nav-theme='halloween']) .nav-link.active {
  background: #ff7518;
}

/* ---------- Christmas: forest green + Christmas red ---------- */
.nav-theme[data-nav-theme='christmas'] {
  background: linear-gradient(180deg, #1b4332 0%, #24573f 100%);
}
.navbar:has(> .nav-theme[data-nav-theme='christmas']) {
  --nt-logo-color: #c8102e;
  --bs-border-color: #c8102e;
  --bs-navbar-color: #ffffff;
  --bs-navbar-hover-color: #ffd6dc;
  --bs-navbar-active-color: #ffffff;
}
.navbar:has(> .nav-theme[data-nav-theme='christmas']) .nav-link.active {
  background: #c8102e;
}

/* ---------- Light: the original white bar with a black logo ---------- */
.nav-theme[data-nav-theme='light'] {
  background: #fff;
}
.navbar:has(> .nav-theme[data-nav-theme='light']) {
  --nt-logo-color: #111;
}
.navbar:has(> .nav-theme[data-nav-theme='light']) .navbar-brand {
  filter: none;
}
.navbar:has(> .nav-theme[data-nav-theme='light']) .nav-link.active {
  background: #f1f1ef;
}
.nav-theme[data-nav-theme='light'] .nt-item,
.nav-theme[data-nav-theme='light'] .nt-walker {
  filter: drop-shadow(0 2px 1.5px rgba(0, 0, 0, 0.2));
}

/* ---------- Dark: charcoal with soft light text ---------- */
.nav-theme[data-nav-theme='dark'] {
  background: linear-gradient(180deg, #111827 0%, #1f2937 100%);
}
.navbar:has(> .nav-theme[data-nav-theme='dark']) {
  --nt-logo-color: #f3f4f6;
  --bs-border-color: #374151;
  --bs-navbar-color: #d1d5db;
  --bs-navbar-hover-color: #ffffff;
  --bs-navbar-active-color: #ffffff;
}
.navbar:has(> .nav-theme[data-nav-theme='dark']) .nav-link.active {
  background: #374151;
}

/* ---------- Light & Dark: walking profile animal + its favourite thing ---------- */
.nt-treat {
  left: 215px;
}
.nt-walker {
  --nt-walk: 170px;
  position: absolute;
  left: 270px;
  top: 22px;
  width: 48px;
  height: 40px;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4));
  animation: nt-walk 12s linear infinite;
}
/* Less room on smaller screens: shorter walk, and the treat is hidden (it's an item--2). */
@media (max-width: 991.98px) {
  .nt-walker {
    --nt-walk: 40px;
    left: 215px;
  }
}
@media (max-width: 399.98px) {
  .nt-walker {
    --nt-walk: 0px;
  }
}
@media (max-width: 359.98px) {
  .nt-walker {
    display: none;
  }
}
.nt-pet {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: nt-trot 0.32s ease-in-out infinite alternate;
}
.nt-walker--duck .nt-pet {
  transform-origin: 50% 100%;
  animation: nt-waddle 0.4s ease-in-out infinite alternate;
}
.nt-walker--goldfish .nt-pet {
  animation: nt-bob 1.2s ease-in-out infinite alternate;
}
.nt-step {
  transform-box: fill-box;
  transform-origin: 50% 0;
  animation: nt-step 0.32s ease-in-out infinite alternate;
}
.nt-step--b {
  animation-direction: alternate-reverse;
}
.nt-wag {
  transform-origin: 10px 21px;
  animation: nt-wag 0.25s ease-in-out infinite alternate;
}
.nt-tail-sway {
  transform-origin: 10px 23px;
  animation: nt-wag 0.9s ease-in-out infinite alternate;
}
.nt-wing {
  transform-origin: 24px 22px;
  animation: nt-wing 2.4s ease-in-out infinite;
}
.nt-fin-wiggle {
  transform-origin: 12px 20px;
  animation: nt-wag 0.3s ease-in-out infinite alternate;
}
.nt-side-fin {
  transform-box: fill-box;
  transform-origin: 0 50%;
  animation: nt-wag 0.5s ease-in-out infinite alternate;
}
.nt-rise {
  animation: nt-rise 2s ease-in infinite;
}
.nt-rise:nth-of-type(2n) {
  animation-delay: 1s;
}
.nt-bamboo {
  transform-origin: 20px 43px;
  animation: nt-sway 3.5s ease-in-out infinite;
}
.nt-leaves {
  transform-origin: 18px 15px;
  animation: nt-wag 1.4s ease-in-out infinite alternate;
}
.nt-bone,
.nt-flop {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: nt-hop-tilt 1.6s ease-in-out infinite;
}
.nt-sparkle {
  animation: nt-twinkle 1.4s ease-in-out infinite;
}
.nt-bread {
  transform-origin: 22px 40px;
  animation: nt-wobble 2.6s ease-in-out infinite;
}
.nt-crumb {
  animation: nt-crumb 1.2s ease-in-out infinite;
}
.nt-crumb:nth-of-type(2n) {
  animation-delay: 0.4s;
}
.nt-crumb:nth-of-type(3n) {
  animation-delay: 0.8s;
}
.nt-weed {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: nt-sway 2.6s ease-in-out infinite;
}
.nt-weed:nth-of-type(2n) {
  animation-delay: -0.9s;
}
.nt-weed:nth-of-type(3n) {
  animation-delay: -1.7s;
}

/* ---------- Halloween animations ---------- */
.nt-pumpkin {
  transform-origin: 50% 100%;
  animation: nt-wobble 2.4s ease-in-out infinite;
}
.nt-web {
  top: 0;
  width: 56px;
  height: 70px;
}
.nt-spider {
  animation: nt-dangle 3s ease-in-out infinite;
}
.nt-bat-path {
  width: 50px;
  height: 26px;
  top: 20px;
  animation: nt-fly 6s ease-in-out infinite alternate;
}
.nt-bat {
  width: 100%;
  height: 100%;
}
.nt-wings {
  transform-origin: 25px 12px;
  animation: nt-flap 0.35s ease-in-out infinite alternate;
}

/* ---------- Christmas animations ---------- */
.nt-snow {
  position: absolute;
  top: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 3px rgba(255, 255, 255, 0.8);
  opacity: 0;
  animation: nt-snowfall linear infinite;
}
.nt-tree {
  transform-origin: 50% 100%;
  animation: nt-sway 3.5s ease-in-out infinite;
}
.nt-tree .nt-light {
  animation: nt-twinkle 1.5s ease-in-out infinite;
}
.nt-tree .nt-light:nth-of-type(2) {
  animation-delay: 0.3s;
}
.nt-tree .nt-light:nth-of-type(3) {
  animation-delay: 0.6s;
}
.nt-tree .nt-light:nth-of-type(4) {
  animation-delay: 0.9s;
}
.nt-tree .nt-light:nth-of-type(5) {
  animation-delay: 1.2s;
}
.nt-star {
  transform-origin: 20px 5px;
  animation: nt-pulse 2s ease-in-out infinite;
}
.nt-star-rays {
  transform-origin: 20px 5px;
  animation: nt-spin 4s linear infinite;
}
.nt-santa {
  transform-origin: 50% 100%;
  animation: nt-wobble 3s ease-in-out infinite;
}
.nt-wave {
  transform-origin: 28px 33px;
  animation: nt-wave 0.9s ease-in-out infinite alternate;
}
.nt-pom {
  transform-origin: 30px 8.5px;
  animation: nt-swing 1.4s ease-in-out infinite alternate;
}
.nt-blink {
  transform-box: fill-box;
  transform-origin: center;
  animation: nt-blink 4s infinite;
}
.nt-flyer {
  width: 54px;
  height: 40px;
  top: 16px;
  animation: nt-fly-turn 9s linear infinite;
}
.nt-reindeer {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: nt-bob 0.8s ease-in-out infinite alternate;
}
.nt-leg {
  transform-box: fill-box;
  transform-origin: 50% 0;
  animation: nt-gallop 0.4s ease-in-out infinite alternate;
}
.nt-leg--back,
.nt-leg--front2 {
  animation-direction: alternate-reverse;
}
.nt-nose {
  animation: nt-glow 1.2s ease-in-out infinite alternate;
}

/* ---------- Keyframes ---------- */
@keyframes nt-wobble {
  0%,
  100% {
    transform: rotate(-7deg);
  }
  50% {
    transform: rotate(7deg);
  }
}
@keyframes nt-dangle {
  0%,
  100% {
    transform: translateY(-6px);
  }
  50% {
    transform: translateY(10px);
  }
}
@keyframes nt-fly {
  0% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(20px, -8px);
  }
  50% {
    transform: translate(40px, 4px);
  }
  75% {
    transform: translate(60px, -6px);
  }
  100% {
    transform: translate(80px, 2px);
  }
}
@keyframes nt-flap {
  from {
    transform: scaleY(1);
  }
  to {
    transform: scaleY(0.45);
  }
}
@keyframes nt-twinkle {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
@keyframes nt-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.25);
  }
}
@keyframes nt-glow {
  from {
    filter: drop-shadow(0 0 0 #ff4d6d);
  }
  to {
    filter: drop-shadow(0 0 3px #ff4d6d);
  }
}

/* ---------- Dev-only "Theme" pill, pinned to the far right of the navbar ---------- */
.nt-picker {
  display: flex;
  align-items: center;
}
@media (min-width: 768px) {
  .navbar .nt-picker {
    position: absolute;
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
  }
  /* When the screen margin beside the links is too narrow for the pill, nudge the links left. */
  .navbar {
    --nt-container: 720px;
  }
  .navbar-nav:has(> .nt-picker) {
    margin-right: max(0px, calc(60px - (100vw - var(--nt-container)) / 2));
  }
}
@media (min-width: 992px) {
  .navbar {
    --nt-container: 960px;
  }
}
@media (min-width: 1200px) {
  .navbar {
    --nt-container: 1140px;
  }
}
@media (min-width: 1400px) {
  .navbar {
    --nt-container: 1320px;
  }
}
@media (max-width: 767.98px) {
  .nt-picker {
    flex-direction: column;
    align-items: flex-start;
    margin: 0.5rem 0;
  }
}
/* A small round palette icon, no label. */
.navbar .nt-picker .nt-picker-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 50%;
  opacity: 0.8;
}
.navbar .nt-picker .nt-picker-toggle:hover,
.navbar .nt-picker .nt-picker-toggle[aria-expanded='true'] {
  opacity: 1;
  background: color-mix(in srgb, currentColor 12%, transparent);
}
.nt-picker-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.nt-picker .dropdown-menu {
  top: 100%;
  right: 0;
  left: auto;
  margin-top: 0.25rem;
  --bs-dropdown-min-width: 8.5rem;
  --bs-dropdown-font-size: 0.85rem;
  --bs-dropdown-item-padding-y: 0.3rem;
}
.nt-picker .dropdown-item.active {
  background-color: #2b1b3d;
}

@keyframes nt-snowfall {
  0% {
    transform: translate(0, -6px);
    opacity: 0;
  }
  10% {
    opacity: 0.9;
  }
  50% {
    transform: translate(8px, 40px);
  }
  90% {
    opacity: 0.9;
  }
  100% {
    transform: translate(-4px, 86px);
    opacity: 0;
  }
}
@keyframes nt-sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}
@keyframes nt-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes nt-wave {
  from {
    transform: rotate(-12deg);
  }
  to {
    transform: rotate(22deg);
  }
}
@keyframes nt-swing {
  from {
    transform: rotate(-14deg);
  }
  to {
    transform: rotate(14deg);
  }
}
@keyframes nt-blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}
@keyframes nt-fly-turn {
  0% {
    transform: translateX(0) scaleX(1);
  }
  45% {
    transform: translateX(70px) scaleX(1);
  }
  50% {
    transform: translateX(70px) scaleX(-1);
  }
  95% {
    transform: translateX(0) scaleX(-1);
  }
  100% {
    transform: translateX(0) scaleX(1);
  }
}
@keyframes nt-bob {
  from {
    transform: translateY(-3px);
  }
  to {
    transform: translateY(3px);
  }
}
@keyframes nt-gallop {
  from {
    transform: rotate(30deg);
  }
  to {
    transform: rotate(-25deg);
  }
}

/* Walk right, turn around, walk back, turn again. */
@keyframes nt-walk {
  0% {
    transform: translateX(0) scaleX(1);
  }
  46% {
    transform: translateX(var(--nt-walk)) scaleX(1);
  }
  50% {
    transform: translateX(var(--nt-walk)) scaleX(-1);
  }
  96% {
    transform: translateX(0) scaleX(-1);
  }
  100% {
    transform: translateX(0) scaleX(1);
  }
}
@keyframes nt-trot {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-1.5px);
  }
}
@keyframes nt-waddle {
  from {
    transform: rotate(-5deg);
  }
  to {
    transform: rotate(5deg);
  }
}
@keyframes nt-step {
  from {
    transform: rotate(20deg);
  }
  to {
    transform: rotate(-20deg);
  }
}
@keyframes nt-wag {
  from {
    transform: rotate(-18deg);
  }
  to {
    transform: rotate(18deg);
  }
}
@keyframes nt-wing {
  0%,
  80%,
  90%,
  100% {
    transform: rotate(0);
  }
  85%,
  95% {
    transform: rotate(-25deg);
  }
}
@keyframes nt-rise {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-10px);
    opacity: 0;
  }
}
@keyframes nt-hop-tilt {
  0%,
  60%,
  100% {
    transform: translateY(0) rotate(0);
  }
  20% {
    transform: translateY(-5px) rotate(-8deg);
  }
  40% {
    transform: translateY(0) rotate(6deg);
  }
}
@keyframes nt-crumb {
  0%,
  50%,
  100% {
    transform: translateY(0);
  }
  25% {
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-theme *,
  .nav-theme {
    animation: none !important;
  }
}
</style>
