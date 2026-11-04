<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AdminSubmissionCard from '@/components/AdminSubmissionCard.vue'
import AdminNav from '@/components/AdminNav.vue'

const statuses = ['pending', 'approved', 'rejected']
const selectedStatus = ref('pending')
const searchInput = ref('')
const searchTerm = ref('')
const submissions = ref([])
const statusCounts = ref({ pending: 0, approved: 0, rejected: 0 })
const totalCount = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
let requestNumber = 0
let searchTimer
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

async function loadSubmissions() {
  // An older response must not replace the results of a newer tab or page.
  const request = ++requestNumber
  const status = selectedStatus.value
  const term = searchTerm.value
  const firstRow = (page.value - 1) * pageSize
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  const filterSearch = (query) => (term ? query.ilike('name', pattern) : query)
  loading.value = true
  errorMessage.value = ''
  try {
    const counts = await Promise.all(
      statuses.map((status) =>
        filterSearch(
          supabase
            .from('submissions')
            .select('id', { count: 'exact', head: true })
            .eq('status', status),
        ),
      ),
    )
    const failedCount = counts.find((result) => result.error)
    if (failedCount) throw failedCount.error

    const { data, count, error } = await filterSearch(
      supabase
        .from('submissions')
        .select('*, submitter:profiles!submissions_submitted_by_fkey(display_name)', {
          count: 'exact',
        })
        .eq('status', status),
    )
      .order('created_at', { ascending: false })
      .order('id')
      .range(firstRow, firstRow + pageSize - 1)
    if (error) throw error
    if (request !== requestNumber) return

    submissions.value = data ?? []
    totalCount.value = count ?? 0
    statusCounts.value = Object.fromEntries(
      statuses.map((status, index) => [status, counts[index].count ?? 0]),
    )
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

async function onSaved(updated) {
  const submission = submissions.value.find((row) => row.id === updated.id)
  if (submission) Object.assign(submission, updated)
  if (searchTerm.value) {
    successMessage.value = `${updated.name} updated.`
    await loadSubmissions()
  }
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

watch(searchInput, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTerm.value = searchInput.value.trim()
    page.value = 1
    successMessage.value = ''
  }, 250)
})
watch([selectedStatus, page, searchTerm], loadSubmissions)
onMounted(loadSubmissions)
onUnmounted(() => {
  clearTimeout(searchTimer)
  requestNumber += 1
})
</script>

<template>
  <div class="container admin-page py-4 py-md-5" data-testid="admin-review-page">
    <AdminNav />
    <header class="mb-4">
      <h1 class="fw-bold">Review submissions</h1>
      <p class="text-secondary">Review, edit and manage community activities.</p>
    </header>
    <div role="search" aria-label="Search submissions" class="mb-4">
      <label for="admin-search" class="form-label">Search activity names</label>
      <div class="d-flex gap-2">
        <input
          id="admin-search"
          v-model="searchInput"
          type="search"
          class="form-control"
          placeholder="Search by part of an activity name"
          aria-describedby="admin-search-help"
          data-testid="admin-search"
        />
        <button
          v-if="searchInput"
          type="button"
          class="btn btn-outline-dark"
          @click="searchInput = ''"
        >
          Clear
        </button>
      </div>
      <p id="admin-search-help" class="form-text">
        Search all status tabs. Counts show matching activities.
      </p>
    </div>
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
        }}<span> ({{ statusCounts[status] }})</span>
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
          searchTerm
            ? `No ${selectedStatus} activities match “${searchTerm}”.`
            : selectedStatus === 'pending'
              ? 'All caught up. No submissions to review.'
              : `No ${selectedStatus} submissions yet.`
        }}
      </div>
      <div v-else class="submission-grid">
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
.submission-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}
@media (max-width: 991.98px) {
  .submission-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 575.98px) {
  .submission-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
