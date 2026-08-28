<script setup lang="ts">
import { reactive, watch } from 'vue'

import { useIntakeStore } from '@/stores/intake'

const store = useIntakeStore()

// Local branch state — which sub-question is showing for each test. Kept
// separate from the store's numeric answers so re-toggling a branch
// doesn't have to guess intent back out of a stored number.
const branch = reactive({
  canFullPushup: null as boolean | null,
  hasBar: null as boolean | null,
  hasAnyPullup: null as boolean | null,
})

const local = reactive({
  kneeReps: 0,
  fullReps: 0,
  pullUpReps: 0,
  hangSeconds: 0,
  squatReps: 0,
  plankSeconds: 0,
  cannotHoldHandstand: false,
  handstandSeconds: 0,
})

// Sync local inputs into the store's answer shape as they change, rather
// than only on a final "done" click — so navigating away mid-step and
// back still shows accurate values, and computeTestedLevels() always
// reads current data if someone submits early.
watch(
  local,
  () => {
    if (store.answers.placement.skipped) return
    store.answers.placement.horizontalPush = { kneeReps: local.kneeReps, fullReps: local.fullReps }
    store.answers.placement.verticalPull = { pullUpReps: local.pullUpReps, hangSeconds: local.hangSeconds }
    store.answers.placement.squat = { reps: local.squatReps }
    store.answers.placement.core = { plankSeconds: local.plankSeconds }
    store.answers.placement.verticalPush = { holdSeconds: local.cannotHoldHandstand ? null : local.handstandSeconds }
  },
  { deep: true, immediate: true },
)

function setSkipped(skipped: boolean) {
  store.answers.placement.skipped = skipped
  if (skipped) {
    store.answers.placement.horizontalPush = undefined
    store.answers.placement.verticalPull = undefined
    store.answers.placement.squat = undefined
    store.answers.placement.core = undefined
    store.answers.placement.verticalPush = undefined
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">Where you're starting</h1>
      <p class="mt-1 text-sm text-muted">
        Five quick tests so your first week is neither boring nor brutal. Good form matters more than the number —
        stop each one where form starts to break down.
      </p>
    </div>

    <label class="flex min-h-11 items-center gap-2 rounded-md border border-rule px-3 text-sm text-ink">
      <input type="checkbox" :checked="store.answers.placement.skipped" @change="setSkipped(($event.target as HTMLInputElement).checked)" />
      Skip this — start me at a safe, middle level on everything
    </label>

    <div v-if="!store.answers.placement.skipped" class="space-y-5">
      <!-- Horizontal push -->
      <fieldset class="rounded-md border border-rule p-4">
        <legend class="px-1 text-sm font-medium text-ink">Push-ups</legend>
        <div v-if="branch.canFullPushup === null" class="mt-2 flex gap-2">
          <p class="mb-1 w-full text-sm text-muted">Can you do at least one full push-up, from your toes?</p>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.canFullPushup = true">Yes</button>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.canFullPushup = false">No</button>
        </div>
        <label v-else-if="!branch.canFullPushup" class="mt-2 block text-sm">
          How many knee push-ups can you do with good form before your hips sag?
          <input v-model.number="local.kneeReps" type="number" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3" />
        </label>
        <label v-else class="mt-2 block text-sm">
          How many full push-ups can you do with good form before your hips sag?
          <input v-model.number="local.fullReps" type="number" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3" />
        </label>
      </fieldset>

      <!-- Vertical pull -->
      <fieldset class="rounded-md border border-rule p-4">
        <legend class="px-1 text-sm font-medium text-ink">Pull-ups</legend>
        <div v-if="branch.hasBar === null" class="mt-2 flex gap-2">
          <p class="mb-1 w-full text-sm text-muted">Do you have a pull-up bar (or sturdy overhead bar) to test with?</p>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.hasBar = true">Yes</button>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.hasBar = false">No</button>
        </div>
        <p v-else-if="!branch.hasBar" class="mt-2 text-sm text-muted">
          No problem — we'll start you at the beginning of this ladder and let it correct quickly from there.
        </p>
        <div v-else-if="branch.hasAnyPullup === null" class="mt-2 flex gap-2">
          <p class="mb-1 w-full text-sm text-muted">Can you do a strict pull-up (no kipping)?</p>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.hasAnyPullup = true">Yes</button>
          <button type="button" class="min-h-11 flex-1 rounded-md border border-rule text-sm" @click="branch.hasAnyPullup = false">No</button>
        </div>
        <label v-else-if="branch.hasAnyPullup" class="mt-2 block text-sm">
          How many strict pull-ups can you do?
          <input v-model.number="local.pullUpReps" type="number" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3" />
        </label>
        <label v-else class="mt-2 block text-sm">
          How long can you hang from the bar, or hold yourself at the top?
          <input v-model.number="local.hangSeconds" type="number" inputmode="numeric" placeholder="seconds" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3" />
        </label>
      </fieldset>

      <!-- Squat -->
      <label class="block rounded-md border border-rule p-4 text-sm">
        <span class="font-medium text-ink">Squats</span>
        <span class="mt-1 block text-muted">How many bodyweight squats can you do with full depth?</span>
        <input v-model.number="local.squatReps" type="number" inputmode="numeric" class="mt-2 min-h-11 w-full rounded-md border border-rule px-3" />
      </label>

      <!-- Core -->
      <label class="block rounded-md border border-rule p-4 text-sm">
        <span class="font-medium text-ink">Plank</span>
        <span class="mt-1 block text-muted">How long can you hold a full plank with a straight line, hips level?</span>
        <input v-model.number="local.plankSeconds" type="number" inputmode="numeric" placeholder="seconds" class="mt-2 min-h-11 w-full rounded-md border border-rule px-3" />
      </label>

      <!-- Vertical push -->
      <fieldset class="rounded-md border border-rule p-4">
        <legend class="px-1 text-sm font-medium text-ink">Handstand hold</legend>
        <label class="mt-2 flex items-center gap-2 text-sm">
          <input v-model="local.cannotHoldHandstand" type="checkbox" />
          I can't hold a wall handstand at all right now
        </label>
        <label v-if="!local.cannotHoldHandstand" class="mt-2 block text-sm">
          How long can you hold a wall handstand (chest or back to the wall)?
          <input v-model.number="local.handstandSeconds" type="number" inputmode="numeric" placeholder="seconds" class="mt-1 min-h-11 w-full rounded-md border border-rule px-3" />
        </label>
      </fieldset>
    </div>
  </div>
</template>
