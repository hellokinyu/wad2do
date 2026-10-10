<template>
  <nav class="navbar navbar-expand-md bg-body-tertiary border-bottom">
    <div class="container">
      <RouterLink class="navbar-brand fw-bold" to="/">WAD2Do</RouterLink>

      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav"
        aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/activities" data-testid="nav-activities">Activities</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/groups" data-testid="nav-groups">Groups</RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/profile" data-testid="nav-profile">Profile</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>