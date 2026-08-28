<script setup lang="ts">
import { computed } from 'vue'

import { useIntakeStore, TOTAL_STEPS } from '@/stores/intake'

const store = useIntakeStore()
const percent = computed(() => Math.round((store.step / TOTAL_STEPS) * 100))
</script>

<template>
  <div class="border-b border-rule bg-surface px-4 pt-safe">
    <div class="flex items-center justify-between py-3">
      <button
        v-for="n in TOTAL_STEPS"
        :key="n"
        type="button"
        class="flex h-2 flex-1 items-center"
        :aria-label="`Go to step ${n}`"
        :disabled="n > store.furthestUnlockedStep + 1"
        @click="store.goToStep(n)"
      >
        <span
          class="h-1.5 w-full rounded-full transition-colors"
          :class="n <= store.step ? 'bg-train' : n <= store.furthestUnlockedStep ? 'bg-train/40' : 'bg-rule'"
        />
      </button>
    </div>
    <p class="pb-2 text-xs text-muted">{{ percent }}% through the questionnaire</p>
  </div>
</template>
