<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import type { MealSlot } from '@/types/domain'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
const mealStore = useMealPlanStore()
onMounted(() => {
  planStore.loadActivePlan()
  mealStore.loadActivePlan()
})

// No "advance to next week" yet (see TASKS.md) — once a plan's week is
// more than a few days old, today may simply not be one of its 7 days.
// todayMeals is empty in that case, same as "no plan yet"; this section
// just doesn't render rather than showing a stale or empty-looking card.
const todayIso = new Date().toISOString().slice(0, 10)
const todayMeals = computed(() => mealStore.entriesByDay.get(todayIso) ?? [])
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
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

    <template v-if="!mealStore.loading && todayMeals.length > 0">
      <h2 class="mt-8 text-lg font-semibold text-ink">Today's meals</h2>

      <ul class="mt-2 space-y-2">
        <li
          v-for="entry in todayMeals"
          :key="entry.id"
          class="rounded-md border border-rule bg-surface px-4 py-3"
        >
          <RouterLink
            :to="{ name: 'recipe', params: { recipeId: entry.recipeId }, query: { servings: String(entry.servings) } }"
            class="flex items-center justify-between gap-3"
          >
            <span class="min-w-0">
              <span class="block text-xs font-medium uppercase tracking-wide text-muted">{{ SLOT_LABEL[entry.slot] }}</span>
              <span class="truncate text-sm font-medium text-ink">{{ mealStore.recipeTitle(entry.recipeId) }}</span>
            </span>
            <span v-if="mealStore.entryMacros(entry)" class="shrink-0 font-mono text-sm tabular-nums text-muted">
              {{ Math.round(mealStore.entryMacros(entry)!.kcal) }} kcal
            </span>
          </RouterLink>
        </li>
      </ul>

      <RouterLink to="/meals" class="mt-4 inline-block text-sm font-medium text-nutri"> See the full week → </RouterLink>
    </template>
  </div>
</template>
