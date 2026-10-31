<script setup>
// Week 6: the parent supplies each card's content through a prop.
defineProps({
  feature: { type: Object, required: true },
})
</script>

<template>
  <article class="feature d-flex">
    <div class="feature-icon d-flex align-items-center justify-content-center">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <template v-if="feature.icon === 'search'">
          <circle cx="13" cy="13" r="8" />
          <path d="m19 19 8 8" />
        </template>
        <template v-else-if="feature.icon === 'friends'">
          <circle cx="12" cy="10" r="4" />
          <path d="M3 27v-3a8 8 0 0 1 16 0v3H3Zm19-21a4 4 0 0 1 0 8m1 5a7 7 0 0 1 6 7v1h-6" />
        </template>
        <template v-else>
          <rect x="5" y="7" width="22" height="22" rx="3" />
          <path d="M10 3v8M22 3v8M5 15h22" />
        </template>
      </svg>
    </div>
    <div>
      <h2>{{ feature.title }}</h2>
      <p>{{ feature.description }}</p>
    </div>
  </article>
</template>

<style scoped>
.feature {
  min-width: 0;
  gap: clamp(14px, 1.5vw, 24px);
  padding: 0 clamp(16px, 2vw, 36px);
}
.feature > div:last-child {
  min-width: 0;
}
.feature:first-child {
  padding-left: 0;
}
.feature + .feature {
  border-left: 1px solid var(--line);
}
.feature-icon {
  flex: 0 0 58px;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--surface-2);
  transition:
    transform 0.2s,
    background 0.2s;
}
.feature:hover .feature-icon {
  transform: translateY(-4px);
  background: var(--surface-3);
}
.feature-icon svg {
  width: 30px;
  height: 30px;
}
.feature h2 {
  font-size: clamp(16px, 1.1vw, 20px);
  font-weight: 700;
  margin: 9px 0 8px;
}
.feature p {
  color: var(--muted);
  font-size: clamp(14px, 0.9vw, 16px);
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 1000px) {
  .feature {
    gap: 12px;
    padding: 0 14px;
  }
  .feature-icon {
    flex-basis: 46px;
    width: 46px;
    height: 46px;
  }
}

@media (max-width: 900px) {
  .feature,
  .feature:first-child {
    padding: 0;
    gap: 18px;
  }
  .feature + .feature {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding-top: 24px;
  }
  .feature h2 {
    margin-top: 2px;
  }
  .feature p {
    max-width: 60ch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-icon {
    transition: none;
  }
}
</style>
