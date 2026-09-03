<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import Alert from '@/components/shared/Alert.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { useIntakeStore, TOTAL_STEPS } from '@/stores/intake'
import { useSessionStore } from '@/stores/session'
import IntakeProgress from '@/components/intake/IntakeProgress.vue'
import StepAboutYou from '@/components/intake/StepAboutYou.vue'
import StepActivity from '@/components/intake/StepActivity.vue'
import StepSchedule from '@/components/intake/StepSchedule.vue'
import StepEquipment from '@/components/intake/StepEquipment.vue'
import StepPlacement from '@/components/intake/StepPlacement.vue'
import StepLimitations from '@/components/intake/StepLimitations.vue'
import StepKitchen from '@/components/intake/StepKitchen.vue'
import StepGoal from '@/components/intake/StepGoal.vue'

const store = useIntakeStore()
const session = useSessionStore()
const router = useRouter()

const stepComponents = [
  StepAboutYou,
  StepActivity,
  StepSchedule,
  StepEquipment,
  StepPlacement,
  StepLimitations,
  StepKitchen,
  StepGoal,
]
const currentComponent = computed(() => stepComponents[store.step - 1])
const isLastStep = computed(() => store.step === TOTAL_STEPS)

async function handlePrimaryAction() {
  if (!isLastStep.value) {
    store.goNext()
    return
  }
  // No real auth yet (see TASKS.md) — a stable local id keeps the plan
  // usable end to end without blocking on sign-in being built.
  const userId = session.session?.user.id ?? LOCAL_DEV_USER_ID
  const result = await store.submit(userId)
  if (result) router.push('/')
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <IntakeProgress />

    <div class="flex-1 p-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-10">
      <KeepAlive>
        <component :is="currentComponent" />
      </KeepAlive>

      <Alert v-if="store.submitError" variant="error" class="mt-4">
        {{ store.submitError }}
      </Alert>
      <ul v-if="store.submitWarnings.length" class="mt-4 space-y-1 rounded-xl border border-rule bg-surface px-3 py-2 text-xs text-muted">
        <li v-for="(warning, i) in store.submitWarnings" :key="i">{{ warning }}</li>
      </ul>
    </div>

    <footer class="border-t border-rule bg-surface p-4 pb-safe-4">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <button
          type="button"
          class="min-h-11 min-w-11 rounded-full px-4 text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
          :disabled="store.step === 1"
          @click="store.goBack()"
        >
          Back
        </button>
        <span class="text-xs text-muted">Step {{ store.step }} of {{ TOTAL_STEPS }}</span>
        <button
          type="button"
          class="min-h-11 min-w-11 rounded-full bg-train px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          :disabled="!store.canProceed || store.submitting"
          @click="handlePrimaryAction"
        >
          {{ store.submitting ? 'Generating…' : isLastStep ? 'Generate my plan' : 'Next' }}
        </button>
      </div>
    </footer>
  </div>
</template>
