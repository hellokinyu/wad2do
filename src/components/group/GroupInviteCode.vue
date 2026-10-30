<script setup>
import { computed } from 'vue'
import QRCode from 'qrcode'

// The two ways into a group: scan the QR code, or type the 6-character code.
const props = defineProps({
  groupId: { type: String, required: true },
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
</script>

<template>
  <div class="invite-options">
    <figure class="invite-option">
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
      <figcaption>Scan with a phone camera</figcaption>
    </figure>

    <span class="invite-or" aria-hidden="true">or</span>

    <div class="invite-option">
      <strong class="invite-code" data-testid="invite-code">{{ inviteCode }}</strong>
      <p class="invite-caption">Type this code under Groups → Join</p>
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
  margin: 0;
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
  text-align: center;
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
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3em;
  line-height: 1.3;
}

/* Narrow screens: stack the QR code above the code */
@media (max-width: 575.98px) {
  .invite-options {
    flex-direction: column;
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
</style>
