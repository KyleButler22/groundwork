<script setup lang="ts">
import { useIntakeStore } from '@/stores/intake'

const store = useIntakeStore()
const dayOptions = [1, 2, 3, 4, 5, 6]
const minuteOptions = [20, 30, 45, 60, 75, 90]
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">Your week</h1>
      <p class="mt-1 text-sm text-muted">
        Answer for a normal week, not your best week — the plan is built around what you'll actually keep doing.
      </p>
    </div>

    <fieldset>
      <legend class="text-sm font-medium text-ink">Days per week you can realistically train</legend>
      <div class="mt-2 grid grid-cols-6 gap-2">
        <button
          v-for="d in dayOptions"
          :key="d"
          type="button"
          class="min-h-11 rounded-full border text-sm font-medium transition-colors"
          :class="store.answers.daysPerWeek === d ? 'border-train bg-train text-white' : 'border-rule text-ink hover:border-ink-soft'"
          @click="store.answers.daysPerWeek = d"
        >
          {{ d }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend class="text-sm font-medium text-ink">Minutes per session</legend>
      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          v-for="m in minuteOptions"
          :key="m"
          type="button"
          class="min-h-11 rounded-full border text-sm font-medium transition-colors"
          :class="store.answers.sessionMinutes === m ? 'border-train bg-train text-white' : 'border-rule text-ink hover:border-ink-soft'"
          @click="store.answers.sessionMinutes = m"
        >
          {{ m }}
        </button>
      </div>
    </fieldset>

    <p v-if="store.answers.daysPerWeek === 6" class="text-xs text-muted">
      Six days is a lot — worth it only if your sessions are short. Four or five days usually sticks better long-term.
    </p>
  </div>
</template>
