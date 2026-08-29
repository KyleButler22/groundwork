<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { db } from '@/lib/db'
import { useIntakeStore } from '@/stores/intake'
import type { Allergen, DietTag } from '@/types/domain'

// diet_tags/allergens are real seeded content now (see calisthenics-
// recipe-corpus memory) — loaded from Dexie the same way StepEquipment.vue
// loads equipment and StepLimitations.vue loads body regions, replacing
// the placeholder list src/lib/intake/referenceData.ts used to be the
// only option for (that file is now unused; see TASKS.md if it should be
// deleted outright once nothing else references it).
const store = useIntakeStore()
const dietTags = ref<DietTag[]>([])
const allergens = ref<Allergen[]>([])
const loading = ref(true)

onMounted(async () => {
  ;[dietTags.value, allergens.value] = await Promise.all([db.dietTags.toArray(), db.allergens.toArray()])
  loading.value = false
})

function toggleDiet(slug: string) {
  const i = store.answers.dietTagSlugs.indexOf(slug)
  if (i === -1) store.answers.dietTagSlugs.push(slug)
  else store.answers.dietTagSlugs.splice(i, 1)
}
function toggleAllergen(slug: string) {
  const i = store.answers.allergenSlugs.indexOf(slug)
  if (i === -1) store.answers.allergenSlugs.push(slug)
  else store.answers.allergenSlugs.splice(i, 1)
}
// "No restrictions" isn't a real diet_tags row — an empty selection
// already means exactly that to the meal generator (docs/mealgen.md §1).
// This is a UI convenience to clear the selection, not a stored tag; the
// placeholder list used to store a fake 'omnivore' slug here instead,
// which never matched anything real and was silently dropped.
function clearDietTags() {
  store.answers.dietTagSlugs = []
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">Your kitchen</h1>
      <p class="mt-1 text-sm text-muted">This shapes your meal plans once those are built — safe to answer honestly even before that's ready.</p>
    </div>

    <p v-if="loading" class="text-sm text-muted">Loading…</p>

    <template v-else>
      <fieldset>
        <legend class="text-sm font-medium text-ink">Diet pattern</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="min-h-11 rounded-md border px-3 text-sm"
            :class="store.answers.dietTagSlugs.length === 0 ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="clearDietTags"
          >
            No restrictions
          </button>
          <button
            v-for="tag in dietTags"
            :key="tag.slug"
            type="button"
            class="min-h-11 rounded-md border px-3 text-sm"
            :class="store.answers.dietTagSlugs.includes(tag.slug) ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="toggleDiet(tag.slug)"
          >
            {{ tag.name }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-sm font-medium text-ink">Allergies</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            v-for="allergen in allergens"
            :key="allergen.slug"
            type="button"
            class="min-h-11 rounded-md border px-3 text-sm"
            :class="store.answers.allergenSlugs.includes(allergen.slug) ? 'border-warn bg-warn-wash text-warn' : 'border-rule text-ink'"
            @click="toggleAllergen(allergen.slug)"
          >
            {{ allergen.name }}
          </button>
        </div>
      </fieldset>
    </template>

    <label class="block">
      <span class="text-sm font-medium text-ink">Weeknight cook-time ceiling</span>
      <span class="mt-0.5 block text-xs text-muted">A busier Sunday roast can still take longer — this is just for a normal Tuesday.</span>
      <select v-model.number="store.answers.cookTimeCeilingMinutes" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3 text-ink">
        <option :value="15">15 minutes</option>
        <option :value="25">25 minutes</option>
        <option :value="40">40 minutes</option>
        <option :value="60">No real limit</option>
      </select>
    </label>

    <div class="flex gap-3">
      <label class="block flex-1">
        <span class="text-sm font-medium text-ink">Cooking for how many people?</span>
        <input v-model.number="store.answers.householdSize" type="number" min="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3 text-ink" />
      </label>
      <label class="block flex-1">
        <span class="text-sm font-medium text-ink">Meals per day</span>
        <input v-model.number="store.answers.mealsPerDay" type="number" min="1" max="6" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3 text-ink" />
      </label>
    </div>
  </div>
</template>
