<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useMealPlanStore } from '@/stores/mealPlan'

// Full recipe detail: scaled ingredient list + numbered method. Reached by
// tapping a meal in MealsView or DashboardView's "today's meals" — this
// view only renders a Recipe/RecipeIngredient/RecipeStep already cached by
// mealPlan.ts's loadActivePlan, it never reads Dexie directly. Also a
// valid standalone deep link (recipeId alone, no ?servings=) — e.g. from a
// bookmark or a future "browse the whole corpus" screen.
const route = useRoute()
const router = useRouter()
const store = useMealPlanStore()
onMounted(() => store.loadActivePlan()) // covers a direct link / page refresh landing here first

const recipeId = computed(() => {
  const raw = route.params.recipeId
  return Array.isArray(raw) ? raw[0] : raw
})
const recipe = computed(() => store.recipe(recipeId.value))

// The linking view passes ?servings= for "how many servings does THIS
// meal-plan entry actually eat" (see MealsView's recipeLink) — same
// number entryMacros() already scales by, so opening a leftover's recipe
// correctly shows the smaller portion, no special-casing needed. Falls
// back to the recipe's own base yield for a link/bookmark with no query
// (e.g. servings=4 for "serves 4"), and only THEN to 1 as a last resort
// before the recipe itself has loaded.
const requestedServings = (() => {
  const n = Number(route.query.servings)
  return Number.isFinite(n) && n > 0 ? n : null
})()

// null until the visitor actually touches the stepper — see displayServings.
const servingsOverride = ref<number | null>(null)

const displayServings = computed(() => servingsOverride.value ?? requestedServings ?? recipe.value?.servings ?? 1)

const scale = computed(() => {
  const r = recipe.value
  return r && r.servings > 0 ? displayServings.value / r.servings : 1
})

function adjustServings(delta: number): void {
  servingsOverride.value = Math.max(0.5, Math.round((displayServings.value + delta) * 2) / 2)
}

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

function roundQty(n: number): number {
  return Math.round(n * 100) / 100
}

const ingredients = computed(() => {
  const r = recipe.value
  if (!r) return []
  return store.recipeIngredientsFor(r.id).map((ri) => ({ ...ri, scaledQuantity: roundQty(ri.quantity * scale.value) }))
})

const steps = computed(() => (recipe.value ? store.recipeStepsFor(recipe.value.id) : []))

const macros = computed(() => {
  const r = recipe.value
  if (!r) return null
  const s = displayServings.value
  return { kcal: r.kcalPerServing * s, proteinG: r.proteinPerServing * s, carbG: r.carbPerServing * s, fatG: r.fatPerServing * s }
})

function recipeStepKey(step: { recipeId: string; stepNumber: number }): string {
  return `${step.recipeId}:${step.stepNumber}`
}
</script>

<template>
  <div class="p-4 pb-8">
    <button type="button" class="min-h-11 text-sm font-medium text-muted" @click="router.back()">← Back</button>

    <p v-if="store.loading" class="mt-4 text-sm text-muted">Loading…</p>
    <p v-else-if="!recipe" class="mt-4 text-sm text-muted">Recipe not found.</p>

    <template v-else>
      <h1 class="mt-2 text-2xl font-semibold text-ink">{{ recipe.title }}</h1>
      <p v-if="recipe.summary" class="mt-1 text-sm text-muted">{{ recipe.summary }}</p>

      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-muted">
        <span v-if="recipe.prepMinutes">Prep {{ recipe.prepMinutes }} min</span>
        <span v-if="recipe.cookMinutes">Cook {{ recipe.cookMinutes }} min</span>
        <span>{{ DIFFICULTY_LABEL[recipe.difficulty] }}</span>
        <span v-if="recipe.cuisine">{{ recipe.cuisine }}</span>
      </div>

      <div class="mt-4 flex items-center justify-between rounded-md border border-rule bg-surface px-4 py-3">
        <span class="text-sm font-medium text-ink">Servings</span>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-rule text-lg text-ink"
            aria-label="Fewer servings"
            @click="adjustServings(-0.5)"
          >
            −
          </button>
          <span class="min-w-8 text-center font-mono text-sm tabular-nums text-ink">{{ displayServings }}</span>
          <button
            type="button"
            class="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-rule text-lg text-ink"
            aria-label="More servings"
            @click="adjustServings(0.5)"
          >
            +
          </button>
        </div>
      </div>

      <p v-if="macros" class="mt-2 font-mono text-xs tabular-nums text-muted">
        {{ Math.round(macros.kcal) }} kcal · {{ Math.round(macros.proteinG) }}g protein · {{ Math.round(macros.carbG) }}g carb · {{ Math.round(macros.fatG) }}g fat
      </p>

      <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Ingredients</h2>
      <ul v-if="ingredients.length" class="mt-2 space-y-1">
        <li v-for="ri in ingredients" :key="ri.id" class="flex items-baseline justify-between gap-3 rounded-md border border-rule bg-surface px-4 py-2 text-sm">
          <span class="text-ink">
            {{ store.ingredientName(ri.ingredientId) }}
            <span v-if="ri.isOptional" class="text-xs font-normal text-muted">(optional)</span>
            <span v-if="ri.prepNote" class="block text-xs text-muted">{{ ri.prepNote }}</span>
          </span>
          <span class="shrink-0 font-mono text-sm tabular-nums text-muted">{{ ri.scaledQuantity }} {{ store.unitLabel(ri.unitId) }}</span>
        </li>
      </ul>
      <p v-else class="mt-2 text-sm text-muted">No ingredient list recorded for this recipe.</p>

      <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Method</h2>
      <ol v-if="steps.length" class="mt-2 space-y-3">
        <li v-for="step in steps" :key="recipeStepKey(step)" class="flex gap-3 text-sm text-ink">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nutri-wash font-mono text-xs font-medium text-nutri">{{
            step.stepNumber
          }}</span>
          <span class="pt-0.5">{{ step.instruction }}</span>
        </li>
      </ol>
      <p v-else class="mt-2 text-sm text-muted">No steps recorded for this recipe.</p>
    </template>
  </div>
</template>
