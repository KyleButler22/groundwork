<script setup lang="ts">
import { useIntakeStore } from '@/stores/intake'

const store = useIntakeStore()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold text-ink">Your day</h1>
      <p class="mt-1 text-sm text-muted">
        How active is a typical day OUTSIDE of exercise? Training itself is the next question — this is just getting to
        and from places, being on your feet, that kind of thing.
      </p>
    </div>

    <div class="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
      <button
        v-for="opt in store.NEAT_FACTORS"
        :key="opt.value"
        type="button"
        class="flex min-h-11 w-full items-center justify-between rounded-xl border px-4 py-3 text-left shadow-card transition-colors lg:hover:shadow-none"
        :class="store.answers.neatFactor === opt.value ? 'border-train bg-train-wash' : 'border-rule hover:border-ink-soft lg:hover:bg-ground/60'"
        @click="store.answers.neatFactor = opt.value"
      >
        <span>
          <span class="block text-sm font-medium text-ink">{{ opt.label }}</span>
          <span class="block text-xs text-muted">{{ opt.hint }}</span>
        </span>
        <span
          class="h-4 w-4 flex-none rounded-full border-2"
          :class="store.answers.neatFactor === opt.value ? 'border-train bg-train' : 'border-rule'"
        />
      </button>
    </div>
  </div>
</template>
