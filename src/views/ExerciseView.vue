<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Skeleton from '@/components/shared/Skeleton.vue'
import PatternIcon from '@/components/workout/PatternIcon.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'

// How to do one exercise: pattern + a generic movement icon, the real
// per-exercise coaching cue authored with the movement library, its
// target reps/hold/distance, and any equipment it needs. Reached by
// tapping an exercise in WorkoutsView or Dashboard's today's-session list
// — mirrors RecipeView.vue's shape exactly (same "reads store, never
// touches Dexie directly" rule). Also a valid standalone deep link.
const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback every other write path uses.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => store.loadActivePlan(userId.value)) // covers a direct link / page refresh landing here first

const exerciseId = computed(() => {
  const raw = route.params.exerciseId
  const s = Array.isArray(raw) ? raw[0] : raw
  return Number(s)
})
const exercise = computed(() => store.exercise(exerciseId.value))

const targetLabel = computed(() => {
  const e = exercise.value
  if (!e) return null
  if (e.metricType === 'time_seconds' && e.holdMinS !== null && e.holdMaxS !== null) return `${e.holdMinS}–${e.holdMaxS} s hold`
  if (e.metricType === 'distance_m' && e.distanceMinM !== null && e.distanceMaxM !== null) return `${e.distanceMinM}–${e.distanceMaxM} m`
  if (e.repMin !== null && e.repMax !== null) return `${e.repMin}–${e.repMax} reps`
  return null
})

// Same OR (same alternativeGroup) / AND (default group 0, or a group of
// its own) semantics as ExerciseEquipment's own doc comment — grouped
// here so the view can join each OR-group with "or" but keep separate
// requirements as separate list items.
const equipmentGroups = computed(() => {
  const rows = store.equipmentForExercise(exerciseId.value)
  const groups = new Map<number, number[]>() // group -> equipmentIds; group 0 entries each get their own key below
  let nextSoloKey = -1
  for (const row of rows) {
    const key = row.alternativeGroup === 0 ? nextSoloKey-- : row.alternativeGroup
    const list = groups.get(key)
    if (list) list.push(row.equipmentId)
    else groups.set(key, [row.equipmentId])
  }
  return [...groups.values()].map((ids) => ids.map((id) => store.equipmentName(id)).join(' or '))
})
</script>

<template>
  <div class="p-4 pb-8 lg:p-0">
    <button
      type="button"
      class="flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      @click="router.back()"
    >
      <ArrowLeft :size="18" :stroke-width="1.75" aria-hidden="true" />
      Back
    </button>

    <div v-if="store.loading" class="mt-4 space-y-3">
      <Skeleton class="rounded-md" height="1.75rem" width="60%" />
      <Skeleton class="rounded-2xl" height="9rem" />
      <Skeleton class="rounded-md" height="1rem" width="80%" />
      <Skeleton class="rounded-md" height="1rem" width="70%" />
    </div>
    <p v-else-if="!exercise" class="mt-4 text-sm text-muted">Exercise not found.</p>

    <template v-else>
      <h1 class="mt-3 text-2xl font-semibold tracking-tight text-ink lg:text-3xl">{{ exercise.name }}</h1>
      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
        <span>{{ store.patternName(exercise.patternId) }}</span>
        <span>·</span>
        <span>Level {{ exercise.level }}</span>
        <span v-if="exercise.isUnilateral">· one side at a time</span>
      </div>

      <div class="mt-4 flex h-36 items-center justify-center rounded-2xl border border-rule bg-train-wash text-train shadow-card">
        <PatternIcon :pattern-slug="store.patternSlug(exercise.patternId)" />
      </div>
      <p class="mt-1.5 text-center text-xs text-muted">A generic {{ store.patternName(exercise.patternId).toLowerCase() }} icon, not this specific exercise.</p>

      <p v-if="targetLabel" class="mt-4 font-mono text-sm tabular-nums text-ink">{{ targetLabel }}</p>

      <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">How to do it</h2>
      <p v-if="exercise.cues" class="mt-2 text-sm leading-relaxed text-ink">{{ exercise.cues }}</p>
      <p v-else class="mt-2 text-sm text-muted">No cues recorded for this exercise.</p>

      <template v-if="equipmentGroups.length">
        <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Equipment needed</h2>
        <ul class="mt-2 space-y-1.5">
          <li v-for="(group, i) in equipmentGroups" :key="i" class="rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm text-ink shadow-card">
            {{ group }}
          </li>
        </ul>
      </template>
      <p v-else class="mt-6 text-sm text-muted">No equipment needed.</p>
    </template>
  </div>
</template>
