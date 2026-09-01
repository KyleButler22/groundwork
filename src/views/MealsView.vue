<script setup lang="ts">
import { ChevronRight, Lock, LockOpen } from '@lucide/vue'
import { computed, onMounted } from 'vue'

import Spinner from '@/components/shared/Spinner.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { useMealPlanStore } from '@/stores/mealPlan'
import { useSessionStore } from '@/stores/session'
import type { MealPlanEntry } from '@/types/domain'

// Current week's meal plan, with per-slot swap and the week-level
// "regenerate week" action. Generation logic lives in src/generators/meal —
// this view only renders a MealPlan and triggers the store's actions, it
// never computes one itself.
const store = useMealPlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue uses, so
// a plan generated here lands under the same id intake's submit() wrote.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => store.loadActivePlan(userId.value))

const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

function dayLabel(serveOn: string): string {
  return new Date(`${serveOn}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function canSwap(entry: MealPlanEntry): boolean {
  return !entry.leftoverOfId // swapping a leftover is refused by the generator — see swapOneMeal's own note
}

// ?servings= carries "how many servings does THIS entry actually eat" into
// RecipeView, so a leftover's smaller portion scales the ingredient list
// correctly too — see that view's own note on why no special-casing is
// needed for leftovers here.
function recipeLink(entry: MealPlanEntry) {
  return { name: 'recipe', params: { recipeId: entry.recipeId }, query: { servings: String(entry.servings) } }
}
</script>

<template>
  <div class="p-4 pb-8 lg:p-0">
    <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Meals</h1>

    <Spinner v-if="store.loading" class="mt-2" />

    <template v-else-if="!store.hasPlan">
      <p class="mt-2 text-sm text-muted">Your weekly meal plan will appear here once generated.</p>
      <p v-if="store.error" class="mt-3 rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">{{ store.error }}</p>
      <button
        type="button"
        class="mt-4 min-h-11 rounded-full bg-nutri px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        :disabled="store.generating"
        @click="store.generateFreshPlan(userId)"
      >
        {{ store.generating ? 'Generating…' : 'Generate my meal plan' }}
      </button>
    </template>

    <template v-else>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Week of {{ dayLabel(store.plan!.weekStartsOn) }} — {{ store.plan!.kcalTarget }} kcal / {{ store.plan!.proteinTargetG }}g protein target
        </p>
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-full border border-nutri px-4 text-sm font-medium text-nutri transition-colors hover:bg-nutri-wash disabled:opacity-40"
          :disabled="store.generating"
          @click="store.regenerate(userId)"
        >
          {{ store.generating ? 'Regenerating…' : 'Regenerate week' }}
        </button>
      </div>

      <button
        type="button"
        class="mt-2 min-h-11 text-sm font-medium text-muted underline decoration-dotted transition-colors hover:text-ink disabled:opacity-40"
        :disabled="store.generating"
        @click="store.advanceToNextWeek(userId)"
      >
        {{ store.generating ? 'Working…' : 'Done with this week — plan the next one' }}
      </button>

      <p v-if="store.error" class="mt-3 rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">{{ store.error }}</p>
      <ul v-if="store.warnings.length" class="mt-3 space-y-1 rounded-xl border border-rule bg-surface px-3 py-2 text-xs text-muted">
        <li v-for="(warning, i) in store.warnings" :key="i">{{ warning }}</li>
      </ul>

      <div class="mt-4 space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
        <section v-for="day in store.sortedDays" :key="day">
          <h2 class="text-sm font-semibold text-ink">{{ dayLabel(day) }}</h2>
          <ul class="mt-2 space-y-2">
            <li
              v-for="entry in store.entriesByDay.get(day)"
              :key="entry.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-shadow lg:hover:shadow-none lg:hover:bg-ground/60"
            >
              <div class="flex items-start justify-between gap-3">
                <RouterLink :to="recipeLink(entry)" class="flex min-w-0 flex-1 items-start gap-1">
                  <span class="min-w-0 flex-1">
                    <span class="block text-xs font-medium uppercase tracking-wide text-muted">{{ SLOT_LABEL[entry.slot] }}</span>
                    <span class="block truncate text-sm font-medium text-ink">
                      {{ store.recipeTitle(entry.recipeId) }}
                      <span v-if="store.ratingFor(entry.recipeId) === 'loved'" aria-label="Loved">❤️</span>
                      <span v-if="entry.leftoverOfId" class="ml-1 rounded-full bg-nutri-wash px-2 py-0.5 text-xs font-normal text-nutri">leftover</span>
                    </span>
                    <span class="block font-mono text-xs tabular-nums text-muted">
                      {{ entry.servings }} serving{{ entry.servings === 1 ? '' : 's' }}
                      <template v-if="store.entryMacros(entry)"> · {{ Math.round(store.entryMacros(entry)!.kcal) }} kcal · {{ Math.round(store.entryMacros(entry)!.proteinG) }}g protein </template>
                    </span>
                  </span>
                  <ChevronRight :size="16" class="mt-4 shrink-0 text-muted" aria-hidden="true" />
                </RouterLink>
                <div class="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    class="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors disabled:opacity-30"
                    :class="entry.isLocked ? 'text-nutri' : 'text-muted hover:text-ink'"
                    :aria-label="entry.isLocked ? 'Unlock this meal' : 'Lock this meal so regenerating leaves it alone'"
                    :disabled="store.generating"
                    @click="store.toggleLock(entry.id, userId)"
                  >
                    <Lock v-if="entry.isLocked" :size="18" :stroke-width="1.75" aria-hidden="true" />
                    <LockOpen v-else :size="18" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="min-h-11 rounded-full border border-rule px-3 text-xs font-medium text-ink transition-colors hover:border-ink-soft disabled:opacity-30"
                    :disabled="!canSwap(entry) || entry.isLocked || store.generating"
                    :title="!canSwap(entry) ? 'Swap the day this was leftover from instead' : undefined"
                    @click="store.swapMeal(userId, entry.serveOn, entry.slot)"
                  >
                    Swap
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
