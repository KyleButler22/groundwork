<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import { findClosestToPromotion } from '@/lib/progressionMap'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { MealSlot, PlanItem } from '@/types/domain'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
const mealStore = useMealPlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue/MealsView.vue use.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => {
  planStore.loadActivePlan(userId.value)
  mealStore.loadActivePlan(userId.value)
})

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
  const wasChecked = planStore.isItemChecked(item.id)
  planStore.toggleItemChecked(userId.value, displayedSession.value, item)
  if (!wasChecked) {
    justCheckedId.value = item.id
    setTimeout(() => {
      if (justCheckedId.value === item.id) justCheckedId.value = null
    }, 500)
  }
}

// Collapsed by default, one at a time — this view is "scanned, not read"
// (see the header comment above), so a full reps/weight input grid for
// every checked exercise all the time would fight that directly.
const expandedItemId = ref<string | null>(null)
function toggleExpanded(itemId: string): void {
  expandedItemId.value = expandedItemId.value === itemId ? null : itemId
}

// Brief background flash on check-off — a purposeful, short-lived
// micro-interaction on the one moment per exercise that matters most,
// not decoration on every hover. Cleared after 500ms; the flash color
// itself fades back out over the row's own `transition-[background-
// color]` (see the template change), so this only needs to control
// WHEN the flash class is removed, not animate anything imperatively.
const justCheckedId = ref<string | null>(null)

// No "advance to next week" yet (see TASKS.md) — once a plan's week is
// more than a few days old, today may simply not be one of its 7 days.
// todayMeals is empty in that case, same as "no plan yet"; this section
// just doesn't render rather than showing a stale or empty-looking card.
const todayIso = new Date().toISOString().slice(0, 10)
const todayMeals = computed(() => mealStore.entriesByDay.get(todayIso) ?? [])
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

const closestToPromotion = computed(() => {
  if (!planStore.library) return null
  return findClosestToPromotion([...planStore.library.patternById.values()], planStore.levels, planStore.library)
})
</script>

<template>
  <div class="p-4 lg:p-0">
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>
    <Alert v-if="closestToPromotion" variant="success" class="mt-1">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>

    <div v-if="planStore.loading" class="mt-1 space-y-2 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 lg:space-y-0">
      <section class="space-y-2">
        <Skeleton class="rounded-md" height="1.25rem" width="60%" />
        <Skeleton class="rounded-xl" height="4rem" />
        <Skeleton class="rounded-xl" height="4rem" />
        <Skeleton class="rounded-xl" height="4rem" />
      </section>
      <section class="space-y-2">
        <Skeleton class="rounded-md" height="1.25rem" width="40%" />
        <Skeleton class="rounded-xl" height="3.5rem" />
        <Skeleton class="rounded-xl" height="3.5rem" />
      </section>
    </div>

    <template v-else-if="!planStore.hasPlan">
      <p class="mt-2 text-sm text-muted">No plan yet: complete the intake questionnaire to generate your first week.</p>
      <RouterLink to="/intake" class="mt-4 inline-flex min-h-11 items-center rounded-full bg-train px-5 text-sm font-medium text-white transition-opacity hover:opacity-90">
        Start intake
      </RouterLink>
    </template>

    <div v-else class="mt-1 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <section>
        <template v-if="displayedSession">
          <div class="flex items-center justify-between gap-3">
            <p class="flex items-center gap-2 text-sm text-muted">
              <span class="inline-flex shrink-0 items-center rounded-full bg-train-wash px-2.5 py-0.5 text-xs font-medium text-train capitalize">{{ planStore.plan?.name }}</span>
              {{ displayedSession.name }}
            </p>
            <p class="shrink-0 text-right">
              <span class="block font-mono text-2xl font-bold tabular-nums text-ink">{{ planStore.sessionProgress(displayedSession.id).done }}/{{ planStore.sessionProgress(displayedSession.id).total }}</span>
              <span class="block text-xs text-muted">done</span>
            </p>
          </div>

          <Transition name="promo">
            <Alert
              v-if="planStore.promotionMessages.length"
              variant="success"
              dismissible
              class="mt-3"
              @dismiss="planStore.dismissPromotionMessages()"
            >
              <ul class="space-y-1">
                <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
              </ul>
            </Alert>
          </Transition>

          <ul class="mt-4 space-y-2">
            <li
              v-for="item in planStore.itemsForSession(displayedSession.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[background-color,box-shadow] duration-300 lg:hover:shadow-none lg:hover:bg-ground/60"
              :class="{ '!bg-train-wash': justCheckedId === item.id }"
            >
              <div class="flex items-center gap-3">
                <label class="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input type="checkbox" class="h-5 w-5 accent-train" :checked="planStore.isItemChecked(item.id)" @change="onToggleItem(item)" />
                </label>
                <RouterLink :to="{ name: 'exercise', params: { exerciseId: item.exerciseId } }" class="flex min-w-0 flex-1 items-center gap-1">
                  <span class="min-w-0 flex-1 text-sm font-medium" :class="planStore.isItemChecked(item.id) ? 'text-muted line-through' : 'text-ink'">
                    {{ planStore.exerciseName(item.exerciseId) }}
                  </span>
                  <ChevronRight :size="16" class="shrink-0 text-muted" aria-hidden="true" />
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
              <SetLogEditor v-if="expandedItemId === item.id" :item="item" :user-id="userId" />
            </li>
          </ul>

          <RouterLink to="/workouts" class="mt-4 inline-block text-sm font-medium text-train hover:underline"> See the full plan → </RouterLink>
        </template>

        <template v-else>
          <p class="mt-2 text-sm text-muted">🎉 You've completed every session in this training block · {{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }} done.</p>
          <RouterLink to="/workouts" class="mt-4 inline-block text-sm font-medium text-train hover:underline"> Review the full plan → </RouterLink>
        </template>
      </section>

      <section v-if="!mealStore.loading && todayMeals.length > 0" class="mt-8 lg:mt-0">
        <h2 class="text-lg font-semibold text-ink">Today's meals</h2>

        <ul class="mt-2 space-y-2">
          <li
            v-for="entry in todayMeals"
            :key="entry.id"
            class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-shadow lg:hover:shadow-none lg:hover:bg-ground/60"
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

        <RouterLink to="/meals" class="mt-4 inline-block text-sm font-medium text-nutri hover:underline"> See the full week → </RouterLink>
      </section>
    </div>
  </div>
</template>
