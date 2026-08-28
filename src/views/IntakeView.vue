<script setup lang="ts">
// The 8-step questionnaire from the "Questionnaire to Plan" spec.
// Goal is asked LAST — see docs/intake.md — so this view will eventually
// own a step index in local state, not a route per step.
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-semibold text-ink">Intake</h1>
    <p class="mt-2 text-sm text-muted">Questionnaire steps go here — see docs/intake.md.</p>
  </div>
</template>
