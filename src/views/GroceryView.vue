<script setup lang="ts">
import { computed, onMounted } from 'vue'

import Skeleton from '@/components/shared/Skeleton.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { useMealPlanStore } from '@/stores/mealPlan'
import { useSessionStore } from '@/stores/session'
import type { GroceryItem } from '@/types/domain'

// Derived from the current meal plan (docs/mealgen.md §8) — this view only
// renders and checks off a GroceryList, it never computes one. The list
// is kept in sync automatically: generating, regenerating, or swapping a
// meal all rebuild it as part of the same store action.
const store = useMealPlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback every other write path uses.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => store.loadActivePlan(userId.value))

// store.groceryList.title is frozen at "Week of {ISO date}" the first time
// a list is generated (mealPlan.ts only fills in a title when there isn't
// one yet) and never reformatted on regeneration, so it can't be fixed up
// at the source without a data migration. Reading the date straight from
// the always-current MealPlan.weekStartsOn instead sidesteps that — same
// UTC-noon-safe parsing MealsView.vue's dayLabel already uses, so a date
// like 2026-09-01 can't shift a day off in a non-UTC timezone.
const weekLabel = computed(() => {
  const weekStartsOn = store.plan?.weekStartsOn
  if (!weekStartsOn) return ''
  return new Date(`${weekStartsOn}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
})

function itemLabel(item: GroceryItem): string {
  return item.manualLabel ?? store.ingredientName(item.ingredientId)
}

// Count-based items ("each") read better as "x 3" than "3 each" — every
// other unit keeps the plain "quantity unit" order (e.g. "17 g").
function itemQuantity(item: GroceryItem): string {
  const unit = store.unitLabel(item.displayUnitId)
  if (unit === 'each') return `x ${item.displayQuantity}`
  return `${item.displayQuantity} ${unit}`
}
</script>

<template>
  <div class="p-4 pb-8 lg:p-0">
    <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Grocery</h1>

    <div v-if="store.loading" class="mt-4 space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
      <section v-for="n in 3" :key="n" class="space-y-1">
        <Skeleton class="rounded-md" height="0.75rem" width="35%" />
        <Skeleton class="rounded-xl" height="2.75rem" />
        <Skeleton class="rounded-xl" height="2.75rem" />
      </section>
    </div>

    <template v-else-if="!store.hasPlan">
      <p class="mt-2 text-sm text-muted">Generate a meal plan first — your grocery list is built from it.</p>
      <RouterLink
        to="/meals"
        class="mt-4 inline-flex min-h-11 items-center rounded-full bg-nutri px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Go to Meals
      </RouterLink>
    </template>

    <template v-else-if="store.sortedGroceryItems.length === 0">
      <p class="mt-2 text-sm text-muted">Nothing to buy — every ingredient this week is either a pantry staple or already in your pantry.</p>
    </template>

    <template v-else>
      <p class="mt-1 text-sm text-muted">Week of {{ weekLabel }}</p>

      <div class="mt-4 space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
        <section v-for="group in store.groceryGroups" :key="group.aisleId ?? 'other'">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ group.aisleName }}</h2>
          <ul class="mt-2 space-y-1">
            <li v-for="item in group.items" :key="item.id">
              <label
                class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-rule bg-surface px-4 py-2 shadow-card transition-shadow lg:hover:shadow-none lg:hover:bg-ground/60"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 shrink-0 accent-nutri"
                  :checked="item.isChecked"
                  @change="store.toggleGroceryItemChecked(item.id, userId)"
                />
                <span class="flex-1 text-sm text-ink" :class="{ 'text-muted line-through': item.isChecked }">{{ itemLabel(item) }}</span>
                <span class="shrink-0 font-mono text-sm tabular-nums text-muted">{{ itemQuantity(item) }}</span>
              </label>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
