<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import AuthForm from '@/components/auth/AuthForm.vue'
import Alert from '@/components/shared/Alert.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { isConfigured } from '@/lib/supabase'
import { clearIntakeSnapshot, saveIntakeSnapshot, useIntakeStore, TOTAL_STEPS } from '@/stores/intake'
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

// Anonymous intake works end to end now (see devContentSeed.ts), but both
// generators need REAL content to run together — the food/recipe corpus
// has no anonymous fallback, so a signed-out submit would silently defer
// the meal plan even though intake just asked about diet/allergies/meals
// same as everything else (see intake.ts's submit()). Requiring a real
// account at the LAST step, rather than the first, keeps intake fully
// browsable before asking anyone to commit to one. Dev mode is exempt —
// it already has everything locally and this would only add friction to
// the local test loop; so is a deployment with no Supabase project
// configured at all, where a sign-up wall couldn't work regardless.
const needsAuthGate = computed(() => isLastStep.value && !session.session && !import.meta.env.DEV && isConfigured)

// Saved the moment the gate first shows — this Supabase project requires
// email confirmation by default, so a fresh sign-up navigates to the
// user's inbox, and its confirmation link's redirect is a real page load
// that would otherwise wipe everything just answered (see intake.ts's
// saveIntakeSnapshot for the full reasoning and the restore half of this).
watch(needsAuthGate, (gated) => {
  if (gated) saveIntakeSnapshot(store.answers, store.step)
})

// The moment sign-in actually succeeds in THIS same tab — an existing
// account signing in, or a sign-up that didn't need confirmation — no
// reload happened, the live store state is already correct, and the
// snapshot above is stale the instant it's written. Clearing it here too
// (not just on restore) keeps a snapshot from ever surviving to wrongly
// restore into some unrelated later sign-in.
watch(
  () => session.session,
  (s) => {
    if (s) clearIntakeSnapshot()
  },
)

async function handlePrimaryAction() {
  if (!isLastStep.value) {
    store.goNext()
    return
  }
  if (needsAuthGate.value) return // footer button is hidden in this state; AuthForm above is the real CTA

  // No real auth yet in dev / no project configured (see TASKS.md) — a
  // stable local id keeps the plan usable end to end either way.
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

      <div v-if="needsAuthGate" class="mt-6 rounded-2xl border border-rule bg-surface p-4 shadow-card">
        <p class="mb-3 text-sm text-ink">One last step — create a free account to generate your workout and meal plan.</p>
        <AuthForm initial-mode="sign_up" />
      </div>

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
          v-if="!needsAuthGate"
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
