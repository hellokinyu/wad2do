<script setup>
import { computed, onUnmounted, ref, useId, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import { useAuth } from '@/composables/useAuth'
import { getMapEmbedUrl, getWebsiteUrl } from '@/lib/activityDisplay'

const props = defineProps({
  singleQuery: { type: Boolean, default: false },
  name: { type: String, required: true },
  address: { type: String, required: true },
  area: { type: String, default: '' },
})
const placeId = defineModel({ default: null })
const postalCode = defineModel('postalCode', { default: '' })
const inputId = useId()
const { user } = useAuth()
const candidates = ref([])
const selected = ref(null)
const loading = ref(false)
const searched = ref(false)
const errorMessage = ref('')
let requestNumber = 0
let controller
const messages = {
  invalid_input: 'Enter a venue name or street address. Any postal code must have six digits.',
  unauthenticated: 'Please log in again to find a location.',
  lookup_disabled: 'Location lookup is not enabled yet. Manual locations need admin review.',
  user_limit:
    'You have reached the hourly lookup limit. Try later or choose manual address entry for review.',
  app_limit:
    'The app has reached its monthly lookup allowance. Manual locations need admin review.',
  unavailable: "Couldn't find locations right now. Try again. Your entries are still here.",
}
const suggestedUrl = computed(() => {
  const query = new URLSearchParams({
    api: '1',
    query: selected.value?.name || props.address || props.name,
    query_place_id: placeId.value,
  })
  return `https://www.google.com/maps/search/?${query}`
})

function invalidate() {
  requestNumber += 1
  controller?.abort()
  candidates.value = []
  selected.value = null
  loading.value = false
  searched.value = false
  errorMessage.value = ''
}

function clearLocation() {
  invalidate()
  placeId.value = null
}

watch(
  [() => (props.singleQuery ? '' : props.name), () => props.address, () => props.area, postalCode],
  clearLocation,
  {
    flush: 'sync',
  },
)
watch(
  placeId,
  (id) => {
    if (!id) invalidate()
  },
  { flush: 'sync' },
)
watch(() => user.value?.id, clearLocation, { flush: 'sync' })
onUnmounted(invalidate)

async function findLocation() {
  invalidate()
  if (
    (!props.singleQuery && !props.name.trim()) ||
    !props.address.trim() ||
    (!props.singleQuery && props.name.trim().length > 200) ||
    props.address.trim().length > 500 ||
    (postalCode.value && !/^\d{6}$/.test(postalCode.value))
  ) {
    errorMessage.value = messages.invalid_input
    return
  }
  const request = requestNumber
  controller = new AbortController()
  loading.value = true
  try {
    const { data, error } = await requestWithTimeout(
      async (signal) => {
        const result = await supabase.functions.invoke('google-place-search', {
          body: props.singleQuery
            ? { query: props.address.trim() }
            : {
                name: props.name.trim(),
                address: props.address.trim(),
                postalCode: postalCode.value,
              },
          signal,
        })
        if (result.error) {
          try {
            const code = (await result.error.context?.json())?.error
            if (request === requestNumber && !signal.aborted)
              errorMessage.value = messages[code] || messages.unavailable
          } catch {
            /* Use safe fallback. */
          }
        }
        return result
      },
      controller,
      12000,
    )
    if (request !== requestNumber) return
    if (error) {
      errorMessage.value ||= messages.unavailable
      return
    }
    if (!Array.isArray(data?.candidates)) throw new Error('Invalid lookup response')
    candidates.value = data.candidates
    searched.value = true
  } catch {
    if (request === requestNumber) errorMessage.value = messages.unavailable
  } finally {
    if (request === requestNumber) loading.value = false
  }
}

function selectLocation(candidate) {
  selected.value = candidate
  placeId.value = candidate.id
  candidates.value = []
  searched.value = false
}
</script>

<template>
  <fieldset class="border rounded-3 p-3 mt-3" data-testid="place-picker">
    <legend class="float-none w-auto h6 px-1">
      {{ singleQuery ? 'Choose a location' : 'Google location link (optional)' }}
    </legend>
    <p class="small text-secondary">
      {{
        singleQuery
          ? 'Choose the correct result, then check its address and map pin.'
          : 'Find the venue using the activity name and address, then choose a match. Your typed details stay unchanged.'
      }}
    </p>
    <template v-if="!singleQuery">
      <label :for="inputId" class="form-label">Postal code (optional)</label>
      <input
        :id="inputId"
        v-model="postalCode"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{6}"
        maxlength="6"
        class="form-control mb-2"
        data-testid="place-postal-code"
        :aria-describedby="`${inputId}-help`"
      />
      <p :id="`${inputId}-help`" class="small text-secondary">
        Six digits if supplied. This checks the format, not whether the address exists.
      </p>
    </template>
    <button
      type="button"
      class="btn btn-outline-dark"
      :disabled="loading"
      data-testid="place-find"
      @click="findLocation"
    >
      {{ loading ? 'Finding location…' : 'Find location' }}
    </button>
    <p v-if="loading" role="status" class="mt-2 mb-0">Finding Singapore locations…</p>
    <p v-if="errorMessage" role="alert" class="text-danger mt-2 mb-0" data-testid="place-error">
      {{ errorMessage }}
    </p>
    <p v-if="searched && !candidates.length" role="status" class="mt-2 mb-0">
      No precise Singapore locations found. Try the venue name and street, or use a manual address
      for review.
    </p>
    <div v-if="candidates.length || selected" class="border rounded-3 p-3 mt-3">
      <p class="google-attribution mb-2" translate="no">Google Maps</p>
      <p v-if="candidates.length" class="small">
        {{
          placeId
            ? 'Choose a match to replace your current venue link.'
            : 'Choose the correct venue. No match is selected yet.'
        }}
      </p>
      <div v-for="candidate in selected ? [selected] : candidates" :key="candidate.id" class="mb-2">
        <button
          v-if="!selected"
          type="button"
          class="btn btn-outline-dark text-start w-100"
          data-testid="place-candidate"
          @click="selectLocation(candidate)"
        >
          <strong class="d-block">{{ candidate.name }}</strong>
          <span>{{ candidate.address }}</span>
        </button>
        <p v-else class="mb-1" data-testid="place-selected">
          Selected: <strong>{{ candidate.name }}</strong
          ><br />{{ candidate.address }}
        </p>
        <p v-for="(provider, index) in candidate.attributions" :key="index" class="small mb-1">
          <a
            v-if="getWebsiteUrl({ website: provider.providerUri })"
            :href="getWebsiteUrl({ website: provider.providerUri })"
            target="_blank"
            rel="noopener noreferrer"
            >{{ provider.provider }}</a
          >
          <span v-else>{{ provider.provider }}</span>
        </p>
      </div>
    </div>
    <iframe
      v-if="selected && getMapEmbedUrl(null, selected.location)"
      :src="getMapEmbedUrl(null, selected.location)"
      title="Selected venue map"
      class="place-map w-100 border rounded-3 mt-3"
      referrerpolicy="no-referrer-when-downgrade"
      data-testid="place-map"
    ></iframe>
    <div v-if="placeId" class="mt-3" data-testid="place-link">
      <p v-if="!singleQuery" class="small">
        Suggested venue link for admin review; this does not verify the activity.
      </p>
      <p v-if="!singleQuery" class="small">
        Your current link stays until you select another venue, edit location details or clear it.
      </p>
      <a :href="suggestedUrl" target="_blank" rel="noopener noreferrer">Inspect suggested venue</a>
      <button
        type="button"
        class="btn btn-outline-dark ms-2"
        data-testid="place-clear"
        @click="clearLocation"
      >
        Clear location
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.place-map {
  height: 280px;
}
.google-attribution {
  color: #5e5e5e;
  font: normal 400 14px sans-serif;
  letter-spacing: normal;
  white-space: nowrap;
}
button,
input {
  min-height: 44px;
}
</style>
