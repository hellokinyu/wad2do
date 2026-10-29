<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AdminSubmissionCard from '@/components/AdminSubmissionCard.vue'

const statuses = ['pending', 'approved', 'rejected']
const selectedStatus = ref('pending')
const submissions = ref([])
const pendingCount = ref(0)
const totalCount = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
let requestNumber = 0
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

async function loadSubmissions() {
  // An older response must not replace the results of a newer tab or page.
  const request = ++requestNumber
  loading.value = true
  errorMessage.value = ''
  try {
    const pending = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (pending.error) throw pending.error

    const firstRow = (page.value - 1) * pageSize
    const { data, count, error } = await supabase
      .from('submissions')
      .select('*, submitter:profiles!submissions_submitted_by_fkey(display_name)', {
        count: 'exact',
      })
      .eq('status', selectedStatus.value)
      .order('created_at', { ascending: false })
      .order('id')
      .range(firstRow, firstRow + pageSize - 1)
    if (error) throw error
    if (request !== requestNumber) return

    submissions.value = data ?? []
    totalCount.value = count ?? 0
    pendingCount.value = pending.count ?? 0
    // If the last card on a page was reviewed, return to an existing page.
    if (page.value > totalPages.value) page.value = totalPages.value
  } catch {
    if (request === requestNumber)
      errorMessage.value = "Couldn't load submissions. Please try again."
  } finally {
    if (request === requestNumber) loading.value = false
  }
}

function selectStatus(status) {
  selectedStatus.value = status
  page.value = 1
  successMessage.value = ''
}

function onSaved(updated) {
  const submission = submissions.value.find((row) => row.id === updated.id)
  if (submission) Object.assign(submission, updated)
}

async function onReviewed(submission) {
  successMessage.value =
    submission.status === 'approved'
      ? `${submission.name} approved and published.`
      : `${submission.name} rejected. The submitter can see the reason in Profile.`
  await loadSubmissions()
}

async function onDeleted(submission) {
  successMessage.value =
    submission.status === 'approved'
      ? `${submission.name} and its published activity deleted.`
      : `${submission.name} deleted.`
  await loadSubmissions()
}

watch([selectedStatus, page], loadSubmissions)
onMounted(loadSubmissions)
</script>

<template>
  <div class="container admin-page py-4 py-md-5" data-testid="admin-review-page">
    <header class="mb-4">
      <h1 class="fw-bold">Review submissions</h1>
      <p class="text-secondary">Review, edit and manage community activities.</p>
    </header>
    <div class="d-flex flex-wrap gap-2 mb-4" role="group" aria-label="Submission status">
      <button
        v-for="status in statuses"
        :key="status"
        type="button"
        class="btn rounded-pill px-4"
        :class="selectedStatus === status ? 'btn-dark' : 'btn-outline-dark'"
        :aria-pressed="selectedStatus === status"
        :data-testid="`admin-tab-${status}`"
        @click="selectStatus(status)"
      >
        {{ status.charAt(0).toUpperCase() + status.slice(1)
        }}<span v-if="status === 'pending'"> ({{ pendingCount }})</span>
      </button>
    </div>
    <p v-if="successMessage" class="alert alert-success" role="status">{{ successMessage }}</p>
    <div v-if="loading" class="py-5 text-center" role="status">Loading submissions...</div>
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      <p>{{ errorMessage }}</p>
      <button class="btn btn-outline-dark" @click="loadSubmissions">Try again</button>
    </div>
    <template v-else>
      <div
        v-if="!submissions.length"
        class="border rounded-4 p-4"
        role="status"
        data-testid="admin-empty"
      >
        {{
          selectedStatus === 'pending'
            ? 'All caught up. No submissions to review.'
            : `No ${selectedStatus} submissions yet.`
        }}
      </div>
      <div v-else class="d-grid gap-4">
        <AdminSubmissionCard
          v-for="submission in submissions"
          :key="submission.id"
          :submission="submission"
          @saved="onSaved"
          @reviewed="onReviewed"
          @deleted="onDeleted"
        />
      </div>
      <nav
        v-if="totalPages > 1"
        class="d-flex align-items-center justify-content-center gap-3 mt-4"
        aria-label="Submission pages"
      >
        <button class="btn btn-outline-dark" :disabled="page === 1" @click="page--">
          Previous
        </button>
        <span>Page {{ page }} of {{ totalPages }}</span>
        <button class="btn btn-outline-dark" :disabled="page === totalPages" @click="page++">
          Next
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 1000px;
}
</style>
