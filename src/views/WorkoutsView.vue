<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { usePlanStore } from '@/stores/plan'

// Current plan's sessions. Generation itself lives in src/generators/workout —
// this view only renders a WorkoutPlan and logs sets, it never computes one.
const planStore = usePlanStore()
onMounted(() => planStore.loadActivePlan())

const openWeek = ref(1)
</script>

<template>
  <div class="p-4">
    <h1 class="text-2xl font-semibold text-ink">Training</h1>

    <p v-if="planStore.loading" class="mt-2 text-sm text-muted">Loading…</p>
    <p v-else-if="!planStore.hasPlan" class="mt-2 text-sm text-muted">Your plan will appear here once generated.</p>

    <template v-else>
      <p class="mt-1 text-sm text-muted">
        {{ planStore.plan?.name }} — {{ planStore.plan?.daysPerWeek }} days/week, {{ planStore.plan?.splitType.replace('_', ' ') }}
      </p>

      <div class="mt-4 flex gap-2">
        <button
          v-for="week in planStore.plan?.weeks ?? 4"
          :key="week"
          type="button"
          class="min-h-11 flex-1 rounded-md border text-sm font-medium"
          :class="openWeek === week ? 'border-train bg-train text-white' : 'border-rule text-ink'"
          @click="openWeek = week"
        >
          Week {{ week }}
        </button>
      </div>

      <div class="mt-4 space-y-4">
        <section v-for="session in planStore.sessionsByWeek.get(openWeek) ?? []" :key="session.id">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-ink">
            {{ session.name }}
            <span
              v-if="session.weekType !== 'build'"
              class="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
              :class="session.weekType === 'deload' ? 'bg-nutri-wash text-nutri' : 'bg-train-wash text-train'"
            >
              {{ session.weekType }}
            </span>
          </h2>
          <ul class="mt-2 space-y-2">
            <li
              v-for="item in planStore.itemsForSession(session.id)"
              :key="item.id"
              class="flex items-center justify-between rounded-md border border-rule bg-surface px-4 py-3"
            >
              <span class="text-sm font-medium text-ink">
                {{ planStore.exerciseName(item.exerciseId) }}
                <span v-if="item.supersetGroup !== null" class="text-xs font-normal text-muted"> · superset</span>
              </span>
              <span class="font-mono text-sm tabular-nums text-muted">
                {{ item.sets }} ×
                {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
