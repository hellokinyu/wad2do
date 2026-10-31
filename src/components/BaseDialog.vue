<script setup>
// The app's pop-up, built on the browser's own <dialog> element. Every pop-up uses this, so they
// all behave the same: Esc and clicking the dim area close it, Tab stays inside, the page behind
// can't scroll, and focus goes back to the button that opened it.
//
// Usage:
//   <BaseDialog v-model:open="showVoters" title="Who voted">…content…</BaseDialog>
// or, to run your own code when it closes:
//   <BaseDialog :open="Boolean(activity)" title="Share" @close="close">…</BaseDialog>
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { moveDialogFocus } from '@/lib/dialogFocus'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Heading in the top bar. Leave it out to drop the top bar and write your own heading.
  title: { type: String, default: '' },
  closeLabel: { type: String, default: 'Close' },
  closeTestid: { type: String, default: undefined },
  // Set to false while saving, so Esc, the dim area and the × can't close it mid-request
  closable: { type: Boolean, default: true },
  // Wrap the content in a <form>; listen for @submit
  form: { type: Boolean, default: false },
  // Content runs edge to edge (e.g. a photo at the top) instead of having padding
  flush: { type: Boolean, default: false },
  // Where focus goes if the button that opened it has disappeared, e.g. '#results-summary'
  returnFocusTo: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'close', 'submit'])

const dialog = ref(null)
const titleId = useId()
let trigger = null
let previousOverflow
let pressedOnBackdrop = false

// Esc, the dim area and the × all ask the parent to close; the parent decides by changing `open`
function requestClose() {
  if (!props.closable) return
  emit('update:open', false)
  emit('close')
}

function show() {
  if (dialog.value.open) return
  trigger = document.activeElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
}

async function hide() {
  if (dialog.value?.open) dialog.value.close()
  unlockScroll()
  await nextTick()
  // Give focus back, unless the browser or the page has already put it somewhere sensible
  const active = document.activeElement
  const focusLost = !active || active === document.body || dialog.value?.contains(active)
  if (focusLost) {
    const target = trigger?.isConnected
      ? trigger
      : props.returnFocusTo && document.querySelector(props.returnFocusTo)
    target?.focus({ preventScroll: true })
  }
  trigger = null
}

function unlockScroll() {
  if (previousOverflow === undefined) return
  document.body.style.overflow = previousOverflow
  previousOverflow = undefined
}

// The browser can close a dialog by itself (e.g. pressing Esc twice quickly). Keep the parent in
// step, and reopen if the parent says it can't close yet.
async function onNativeClose() {
  if (!props.open) return
  requestClose()
  await nextTick()
  if (props.open && !dialog.value.open) dialog.value.showModal()
}

// A click on the dim area lands on the <dialog> itself. Only count it if the press started there
// too, so dragging out of a text box doesn't close the pop-up.
function onPointerDown(event) {
  pressedOnBackdrop = event.target === dialog.value
}

function onClick(event) {
  if (pressedOnBackdrop && event.target === dialog.value) requestClose()
  pressedOnBackdrop = false
}

// For parents that need to put focus back on the × (e.g. after a button inside was disabled)
function focusClose() {
  dialog.value?.querySelector('.dialog-close')?.focus({ preventScroll: true })
}
defineExpose({ focusClose })

watch(
  () => props.open,
  (open) => (open ? show() : hide()),
  { flush: 'post' },
)
onMounted(() => {
  if (props.open) show()
})
onUnmounted(unlockScroll)
</script>

<template>
  <dialog
    ref="dialog"
    class="base-dialog"
    :class="{ 'is-flush': flush }"
    :aria-labelledby="title ? titleId : undefined"
    @cancel.prevent="requestClose"
    @close="onNativeClose"
    @keydown.tab.prevent="moveDialogFocus"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <component :is="form ? 'form' : 'div'" class="dialog-layout" @submit.prevent="emit('submit')">
      <header v-if="title" class="dialog-header">
        <div class="dialog-heading">
          <h2 :id="titleId" class="h5 fw-bold mb-0">{{ title }}</h2>
          <slot name="subtitle" />
        </div>
        <button
          type="button"
          class="btn-close dialog-close"
          :aria-label="closeLabel"
          :data-testid="closeTestid"
          :disabled="!closable"
          @click="requestClose"
        ></button>
      </header>

      <div class="dialog-body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="dialog-footer">
        <slot name="footer" />
      </footer>
    </component>
  </dialog>
</template>

<style scoped>
/* Width: set --dialog-width on the pop-up's class to make it wider or narrower */
.base-dialog {
  width: min(var(--dialog-width, 460px), calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-dialog);
}

.base-dialog[open] {
  display: flex;
  flex-direction: column;
}

.base-dialog::backdrop {
  background: var(--overlay);
}

/* Top bar and buttons stay put; only the middle scrolls when the content is long */
.dialog-layout {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.dialog-header,
.dialog-footer {
  flex-shrink: 0;
  padding: 20px;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--line);
}

.dialog-heading {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dialog-close {
  flex-shrink: 0;
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 20px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
}

.is-flush .dialog-body {
  padding: 0;
}

.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--line);
}
</style>
