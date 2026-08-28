<script setup lang="ts">
import { onMounted } from 'vue'

import { usePlanStore } from '@/stores/plan'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
onMounted(() => planStore.loadActivePlan())
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-semibold text-ink">Today</h1>

    <p v-if="planStore.loading" class="mt-2 text-sm text-muted">Loading…</p>

    <template v-else-if="!planStore.hasPlan">
      <p class="mt-2 text-sm text-muted">
        No plan yet — complete the intake questionnaire to generate your first week.
      </p>
      <RouterLink
        to="/intake"
        class="mt-4 inline-flex min-h-11 items-center rounded-md bg-train px-4 text-sm font-medium text-white"
      >
        Start intake
      </RouterLink>
    </template>

    <template v-else-if="planStore.firstSession">
      <p class="mt-1 text-sm text-muted">{{ planStore.plan?.name }} — {{ planStore.firstSession.name }}</p>

      <ul class="mt-4 space-y-2">
        <li
          v-for="item in planStore.itemsForSession(planStore.firstSession.id)"
          :key="item.id"
          class="flex items-center justify-between rounded-md border border-rule bg-surface px-4 py-3"
        >
          <span class="text-sm font-medium text-ink">{{ planStore.exerciseName(item.exerciseId) }}</span>
          <span class="font-mono text-sm tabular-nums text-muted">
            {{ item.sets }} ×
            {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
          </span>
        </li>
      </ul>

      <RouterLink to="/workouts" class="mt-4 inline-block text-sm font-medium text-train">
        See the full plan →
      </RouterLink>
    </template>
  </div>
</template>
