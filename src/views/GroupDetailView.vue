<template>
  <div class="container py-4" data-testid="group-page">
    <!-- Owner: Member 6 (header + tab bar). Group name, members and invite code go here. -->
    <h1>Group {{ route.params.id }}</h1>

    <ul class="nav nav-tabs my-3">
      <li class="nav-item">
        <RouterLink class="nav-link" active-class="active" :to="{ name: 'group-activities' }" data-testid="tab-activities">Activities</RouterLink>
      </li>
      <li class="nav-item">
        <RouterLink class="nav-link" active-class="active" :to="{ name: 'group-availability' }" data-testid="tab-availability">Availability</RouterLink>
      </li>
      <li class="nav-item">
        <RouterLink class="nav-link" active-class="active" :to="{ name: 'group-itinerary' }" data-testid="tab-itinerary">Itinerary</RouterLink>
      </li>
    </ul>

    <RouterView />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>
