<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { db } from '@/lib/db'
import { useIntakeStore } from '@/stores/intake'
import type { BodyRegion } from '@/types/domain'

const store = useIntakeStore()
const regions = ref<BodyRegion[]>([])
const loading = ref(true)

onMounted(async () => {
  regions.value = await db.bodyRegions.toArray()
  loading.value = false
})

function toggle(slug: string) {
  const i = store.answers.flaggedRegionSlugs.indexOf(slug)
  if (i === -1) store.answers.flaggedRegionSlugs.push(slug)
  else store.answers.flaggedRegionSlugs.splice(i, 1)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">Anything hurting?</h1>
      <p class="mt-1 text-sm text-muted">
        We'll steer around anything you flag here rather than warn you about it mid-workout.
      </p>
    </div>

    <p v-if="loading" class="text-sm text-muted">Loading…</p>
    <div v-else class="grid grid-cols-2 gap-2">
      <button
        v-for="region in regions"
        :key="region.slug"
        type="button"
        class="min-h-11 rounded-md border px-3 py-2 text-left text-sm capitalize"
        :class="
          store.answers.flaggedRegionSlugs.includes(region.slug) ? 'border-warn bg-warn-wash text-warn' : 'border-rule text-ink'
        "
        @click="toggle(region.slug)"
      >
        {{ region.name }}
      </button>
    </div>

    <label class="flex min-h-11 items-center gap-2 rounded-md border border-rule px-3 text-sm text-ink">
      <input v-model="store.answers.isPregnantOrPostpartum" type="checkbox" />
      Pregnant, or fewer than 12 weeks postpartum
    </label>
    <p v-if="store.answers.isPregnantOrPostpartum" class="rounded-md border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">
      This app's plans aren't built for pregnancy or early postpartum training — please talk to your doctor or a
      pelvic-floor specialist about what's appropriate right now.
    </p>

    <div class="space-y-4 border-t border-rule pt-5">
      <p class="text-sm text-muted">
        Two quick questions before we get to your goal — this just helps us show sensible defaults, nothing else.
      </p>

      <fieldset>
        <legend class="text-sm text-ink">
          A doctor or therapist has raised concerns with me about my relationship with food, eating, or exercise
        </legend>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class="min-h-11 flex-1 rounded-md border text-sm"
            :class="store.answers.clinicianRaisedConcern === true ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="store.answers.clinicianRaisedConcern = true"
          >
            Yes
          </button>
          <button
            type="button"
            class="min-h-11 flex-1 rounded-md border text-sm"
            :class="store.answers.clinicianRaisedConcern === false ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="store.answers.clinicianRaisedConcern = false"
          >
            No
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-sm text-ink">Right now, thoughts about food, weight, or exercise take up a lot of my day</legend>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class="min-h-11 flex-1 rounded-md border text-sm"
            :class="store.answers.thoughtsFeelIntrusive === true ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="store.answers.thoughtsFeelIntrusive = true"
          >
            Yes
          </button>
          <button
            type="button"
            class="min-h-11 flex-1 rounded-md border text-sm"
            :class="store.answers.thoughtsFeelIntrusive === false ? 'border-train bg-train-wash text-train' : 'border-rule text-ink'"
            @click="store.answers.thoughtsFeelIntrusive = false"
          >
            No
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>
