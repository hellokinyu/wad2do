<script setup>
import { ref, computed, onUnmounted } from 'vue'
import QRCode from 'qrcode'

// The two ways into a group: scan the QR code, or type the 6-character code.
const props = defineProps({
  groupId: { type: String, required: true },
  groupName: { type: String, default: '' },
  inviteCode: { type: String, required: true },
})

// Scanning opens the group page with the code filled in, so it joins in one tap
const inviteLink = computed(
  () =>
    window.location.origin +
    '/groups/' +
    props.groupId +
    '?invite=' +
    encodeURIComponent(props.inviteCode),
)

// Draw the QR code as one SVG path: a 1x1 square for every dark module
const qr = computed(() => {
  const { size, data } = QRCode.create(inviteLink.value, { errorCorrectionLevel: 'M' }).modules
  let path = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (data[row * size + col]) path += `M${col} ${row}h1v1h-1z`
    }
  }
  return { size, path }
})

// ----- Getting the code to friends who aren't in the same room -----

const copyMessage = ref('')
let copyTimer

async function copyCode() {
  clearTimeout(copyTimer)
  try {
    await navigator.clipboard.writeText(props.inviteCode)
    copyMessage.value = 'Code copied'
  } catch {
    // Some browsers block clipboard access
    copyMessage.value = "Couldn't copy it. Type it out instead."
  }
  copyTimer = setTimeout(() => (copyMessage.value = ''), 2500)
}

onUnmounted(() => clearTimeout(copyTimer))

// Phones (and some desktops) have a share sheet; only show the button where it exists.
// It shares the code as text, not a link: joining is by QR code or code only.
const canShare = typeof navigator.share === 'function'

async function shareCode() {
  const group = props.groupName ? `"${props.groupName}"` : 'my group'
  try {
    await navigator.share({
      text: `Join ${group} on WAD2Do! Go to Groups → Join and enter the code ${props.inviteCode}`,
    })
  } catch {
    // Closing the share sheet also lands here, so there's nothing to report
  }
}
</script>

<template>
  <div class="invite-options">
    <figure class="invite-option invite-option-qr">
      <svg
        class="qr"
        :viewBox="`-2 -2 ${qr.size + 4} ${qr.size + 4}`"
        role="img"
        aria-label="QR code to join this group"
        shape-rendering="crispEdges"
        :data-invite-link="inviteLink"
        data-testid="invite-qr"
      >
        <rect x="-2" y="-2" :width="qr.size + 4" :height="qr.size + 4" fill="white" />
        <path :d="qr.path" fill="#111" />
      </svg>
      <figcaption>Friends nearby can scan this with their phone camera</figcaption>
    </figure>

    <span class="invite-or" aria-hidden="true">or</span>

    <div class="invite-option invite-option-code">
      <button
        type="button"
        class="invite-code"
        :aria-label="'Copy group code ' + inviteCode"
        data-testid="invite-code"
        @click="copyCode"
      >
        {{ inviteCode }}
      </button>
      <p class="invite-caption" role="status">
        <span v-if="copyMessage" class="copied">{{ copyMessage }}</span>
        <template v-else>Tap the code to copy it</template>
      </p>
      <button
        v-if="canShare"
        type="button"
        class="btn btn-outline-dark rounded-pill share-button"
        data-testid="share-invite-code"
        @click="shareCode"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"
          />
        </svg>
        Share code
      </button>
    </div>
  </div>
</template>

<style scoped>
.invite-options {
  display: flex;
  align-items: center;
  gap: 20px 28px;
}

.invite-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.qr {
  display: block;
  width: 168px;
  height: 168px;
  padding: 8px;
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: white;
}

figcaption,
.invite-caption {
  max-width: 15rem;
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
  text-align: center;
  text-wrap: balance;
}

.copied {
  color: #111;
  font-weight: 600;
}

.invite-or {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}

.invite-or::before,
.invite-or::after {
  content: '';
  width: 1px;
  height: 44px;
  background: #e5e5e5;
}

/* The 6-character code, spaced out so it's easy to read aloud or type */
.invite-code {
  padding: 8px 10px 8px 20px;
  border: 1px dashed #bbb;
  border-radius: 12px;
  background: #fafafa;
  color: #111;
  font-size: 1.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3em;
  line-height: 1.3;
  cursor: copy;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.invite-code:hover {
  border-color: #111;
  background: white;
}

.invite-code:focus-visible,
.share-button:focus-visible {
  outline: 2px solid #111;
  outline-offset: 3px;
  box-shadow: none;
}

.share-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding-inline: 20px;
  font-weight: 600;
}

.share-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Phones: the code (and Share) comes first, since friends are usually in a chat, not nearby */
@media (max-width: 575.98px) {
  .invite-options {
    flex-direction: column;
  }

  .invite-option-code {
    order: -1;
  }

  .invite-or {
    flex-direction: row;
  }

  .invite-or::before,
  .invite-or::after {
    width: 56px;
    height: 1px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite-code {
    transition: none;
  }
}
</style>
