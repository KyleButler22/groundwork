<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { MealSlot, PlanItem } from '@/types/domain'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
const mealStore = useMealPlanStore()
const session = useSessionStore()
onMounted(() => {
  planStore.loadActivePlan()
  mealStore.loadActivePlan()
})

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue/MealsView.vue use.
const userId = computed(() => session.session?.user.id ?? 'local-dev-user')

function onToggleItem(item: PlanItem): void {
  if (!planStore.nextSession) return
  planStore.toggleItemChecked(userId.value, planStore.nextSession, item)
}

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

    <template v-else-if="planStore.nextSession">
      <div class="mt-1 flex items-center justify-between gap-3">
        <p class="text-sm text-muted">{{ planStore.plan?.name }} — {{ planStore.nextSession.name }}</p>
        <p class="shrink-0 font-mono text-xs tabular-nums text-muted">
          {{ planStore.sessionProgress(planStore.nextSession.id).done }}/{{ planStore.sessionProgress(planStore.nextSession.id).total }} done
        </p>
      </div>

      <div v-if="planStore.promotionMessages.length" class="mt-3 flex items-start justify-between gap-2 rounded-md border border-train bg-train-wash px-3 py-2 text-xs text-train">
        <ul class="space-y-1">
          <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
        </ul>
        <button type="button" class="min-h-11 min-w-11 shrink-0 text-sm" aria-label="Dismiss" @click="planStore.dismissPromotionMessages()">✕</button>
      </div>

      <ul class="mt-4 space-y-2">
        <li
          v-for="item in planStore.itemsForSession(planStore.nextSession.id)"
          :key="item.id"
          class="rounded-md border border-rule bg-surface px-4 py-3"
        >
          <label class="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" class="h-5 w-5 shrink-0 accent-train" :checked="planStore.isItemChecked(item.id)" @change="onToggleItem(item)" />
            <span class="min-w-0 flex-1 text-sm font-medium" :class="planStore.isItemChecked(item.id) ? 'text-muted line-through' : 'text-ink'">
              {{ planStore.exerciseName(item.exerciseId) }}
            </span>
            <span class="shrink-0 font-mono text-sm tabular-nums text-muted">
              {{ item.sets }} ×
              {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
            </span>
          </label>
        </li>
      </ul>

      <RouterLink to="/workouts" class="mt-4 inline-block text-sm font-medium text-train">
        See the full plan →
      </RouterLink>
    </template>

    <template v-else>
      <p class="mt-2 text-sm text-muted">🎉 You've completed every session in this training block — {{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }} done.</p>
      <RouterLink to="/workouts" class="mt-4 inline-block text-sm font-medium text-train"> Review the full plan → </RouterLink>
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
