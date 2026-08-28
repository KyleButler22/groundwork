<script setup lang="ts">
import { computed } from 'vue'

import { useIntakeStore } from '@/stores/intake'

const store = useIntakeStore()

const visibleRateOptions = computed(() => {
  // "quietly withhold the aggressive rate options" when the wellbeing
  // screen raised a concern — only the gentlest option remains, and it's
  // never framed as a restriction.
  const options = store.softenGoalScreen ? [0.25] : store.FAT_LOSS_RATE_OPTIONS_KG_PER_WEEK
  return options.filter((r) => r <= store.maxFatLossRateKgPerWeek)
})

function selectGoal(goal: typeof store.answers.goal) {
  if (goal === 'fat_loss' && store.fatLossBlocked) return
  store.answers.goal = goal
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">What you want</h1>
      <p class="mt-1 text-sm text-muted">Based on everything so far — pick what you're actually after.</p>
    </div>

    <p v-if="store.goalCards.length === 0" class="text-sm text-warn">
      Missing an earlier answer — go back and fill in your details first.
    </p>

    <div v-else class="space-y-2">
      <button
        v-for="card in store.goalCards"
        :key="card.goal"
        type="button"
        class="w-full rounded-md border p-4 text-left"
        :class="[
          store.answers.goal === card.goal ? 'border-train bg-train-wash' : 'border-rule',
          card.goal === 'fat_loss' && store.fatLossBlocked ? 'opacity-50' : '',
        ]"
        :disabled="card.goal === 'fat_loss' && store.fatLossBlocked"
        @click="selectGoal(card.goal)"
      >
        <div class="flex items-baseline justify-between">
          <span class="text-sm font-medium text-ink">{{ card.label }}</span>
          <span v-if="!store.softenGoalScreen" class="font-mono text-lg tabular-nums text-ink">{{ card.kcalTarget }}<span class="text-xs text-muted"> kcal/day</span></span>
        </div>
        <p v-if="card.goal === 'fat_loss' && store.isUnderage" class="mt-1 text-xs text-warn">
          Not available under 16 — try Maintain instead, or check with a doctor.
        </p>
        <p v-else-if="card.goal === 'fat_loss' && store.isUnderweightForFatLoss" class="mt-1 text-xs text-warn">
          Your current weight is already below a healthy range for a deficit — Maintain or Build muscle are safer choices.
        </p>
      </button>
    </div>

    <div v-if="store.answers.goal === 'fat_loss' && !store.fatLossBlocked" class="rounded-md border border-rule p-4">
      <p class="text-sm font-medium text-ink">Rate of loss</p>
      <div class="mt-2 flex gap-2">
        <button
          v-for="rate in visibleRateOptions"
          :key="rate"
          type="button"
          class="min-h-11 flex-1 rounded-md border text-sm tabular-nums"
          :class="store.answers.fatLossRateKgPerWeek === rate ? 'border-train bg-train text-white' : 'border-rule text-ink'"
          @click="store.answers.fatLossRateKgPerWeek = rate"
        >
          {{ rate }} kg/wk
        </button>
      </div>
    </div>

    <div v-if="store.macros && store.answers.goal" class="rounded-md border border-rule bg-surface p-4">
      <p class="text-sm font-medium text-ink">What that looks like</p>
      <dl class="mt-2 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt class="text-xs text-muted">Protein</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(store.macros.proteinG) }}g</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Fat</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(store.macros.fatG) }}g</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Carbs</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(store.macros.carbG) }}g</dd>
        </div>
      </dl>
    </div>

    <p class="text-xs leading-relaxed text-muted">
      These numbers are estimates — real data from the first couple of weeks will refine them automatically as you log
      workouts and weigh-ins.
    </p>
  </div>
</template>
