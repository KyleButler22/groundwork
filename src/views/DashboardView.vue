<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import SetLogEditor from '@/components/workout/SetLogEditor.vue'
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

// planStore.nextSession is LIVE — it recomputes the instant the session
// being shown becomes fully checked off, immediately swapping to whatever
// comes next. Rendered directly, that makes a just-completed session (and
// its checkmarks) vanish mid-tap, which is exactly the bug report this
// fixes: "completed exercises shouldn't disappear, they should stay there
// checked off." displayedSessionId latches ONCE — the first moment
// loadActivePlan() finishes — and never follows nextSession after that,
// so the session on screen stays put, fully checked, for the rest of
// this visit. A fresh visit (reload, or navigating away and back)
// remounts this component and correctly picks up whatever's genuinely
// next by then; nothing here fights the sliding-block design, it just
// stops the view from moving out from under an in-progress tap.
//
// Keyed off `loading` going false, NOT off nextSession's first non-null
// value — loadActivePlan() assigns sessions.value well before
// workoutLogs.value (a later, separate Promise.all), so there's a real
// moment where sessions are loaded but no session shows as completed
// yet. nextSession recomputes reactively at THAT moment too, and its
// value there is wrong (every session including already-finished ones
// reads as "next"). Latching on "first non-null" caught exactly that
// wrong transient value and got stuck on it, permanently, even across a
// hard reload. `loading` only flips to false once loadActivePlan() has
// fully finished every assignment, so reading nextSession then is safe.
const displayedSessionId = ref<string | null>(null)
watch(
  () => planStore.loading,
  (loading) => {
    if (!loading && displayedSessionId.value === null) displayedSessionId.value = planStore.nextSession?.id ?? null
  },
  { immediate: true },
)
const displayedSession = computed(() => planStore.sessions.find((s) => s.id === displayedSessionId.value) ?? null)

function onToggleItem(item: PlanItem): void {
  if (!displayedSession.value) return
  planStore.toggleItemChecked(userId.value, displayedSession.value, item)
}

// Collapsed by default, one at a time — this view is "scanned, not read"
// (see the header comment above), so a full reps/weight input grid for
// every checked exercise all the time would fight that directly.
const expandedItemId = ref<string | null>(null)
function toggleExpanded(itemId: string): void {
  expandedItemId.value = expandedItemId.value === itemId ? null : itemId
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

    <template v-else-if="displayedSession">
      <div class="mt-1 flex items-center justify-between gap-3">
        <p class="text-sm text-muted">{{ planStore.plan?.name }} — {{ displayedSession.name }}</p>
        <p class="shrink-0 font-mono text-xs tabular-nums text-muted">
          {{ planStore.sessionProgress(displayedSession.id).done }}/{{ planStore.sessionProgress(displayedSession.id).total }} done
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
          v-for="item in planStore.itemsForSession(displayedSession.id)"
          :key="item.id"
          class="rounded-md border border-rule bg-surface px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <label class="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
              <input type="checkbox" class="h-5 w-5 accent-train" :checked="planStore.isItemChecked(item.id)" @change="onToggleItem(item)" />
            </label>
            <RouterLink :to="{ name: 'exercise', params: { exerciseId: item.exerciseId } }" class="flex min-w-0 flex-1 items-center gap-1">
              <span class="min-w-0 flex-1 text-sm font-medium" :class="planStore.isItemChecked(item.id) ? 'text-muted line-through' : 'text-ink'">
                {{ planStore.exerciseName(item.exerciseId) }}
              </span>
              <span class="shrink-0 text-muted" aria-hidden="true">›</span>
            </RouterLink>
            <button
              v-if="planStore.isItemChecked(item.id)"
              type="button"
              class="shrink-0 font-mono text-sm tabular-nums text-muted underline decoration-dotted"
              @click="toggleExpanded(item.id)"
            >
              {{ item.sets }} × {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
            </button>
            <span v-else class="shrink-0 font-mono text-sm tabular-nums text-muted">
              {{ item.sets }} ×
              {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
            </span>
          </div>
          <SetLogEditor v-if="expandedItemId === item.id" :item="item" />
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
