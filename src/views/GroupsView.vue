<script setup>
// TODO: replace this placeholder with the user's groups from Supabase.
const groups = [
  { id: 1, name: 'Placeholder Group', memberCount: 4 },
]
</script>

<template>
  <div class="container py-4" data-testid="groups-page">
    <h1>Groups</h1>
    <!-- Owner: Natasha, Kinyu -->

    <div class="row g-3 mt-2">
      <div v-for="group in groups" :key="group.id" class="col-12 col-md-6 col-lg-4">
        <RouterLink
          :to="{ name: 'group-activities', params: { id: group.id } }"
          class="card h-100 text-decoration-none text-reset"
          data-testid="group-card"
        >
          <div class="card-body">
            <h5 class="card-title">{{ group.name }}</h5>
            <p class="card-text text-muted mb-0">{{ group.memberCount }} members</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
