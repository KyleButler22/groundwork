<script setup lang="ts">
// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-semibold text-ink">Today</h1>
    <p class="mt-2 text-sm text-muted">
      No plan yet — complete the intake questionnaire to generate your first week.
    </p>
    <RouterLink
      to="/intake"
      class="mt-4 inline-flex min-h-11 items-center rounded-md bg-train px-4 text-sm font-medium text-white"
    >
      Start intake
    </RouterLink>
  </div>
</template>
