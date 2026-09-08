<script setup lang="ts">
import { Eye, EyeOff, Lock, Mail, MailCheck } from '@lucide/vue'
import { computed, ref } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import { useSessionStore } from '@/stores/session'

// Shared by ProfileView (account settings) and IntakeView (the sign-up
// gate just before generating a plan) — extracted rather than duplicated
// since both need the exact same sign in / sign up / forgot-password
// flow, styling included. Otherwise no props: it owns its own local form
// state and talks to the session store directly, same as it did inline in
// ProfileView before this split. A caller that needs to react to a
// successful auth (IntakeView does) watches `session.session` itself
// rather than this component emitting an event — that's already the one
// shared source of truth, and duplicating it into an event risks the two
// going out of sync.
const session = useSessionStore()

type Mode = 'sign_in' | 'sign_up' | 'reset'
const props = withDefaults(defineProps<{ initialMode?: Mode }>(), { initialMode: 'sign_in' })
const mode = ref<Mode>(props.initialMode)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
// Which flow just succeeded and is waiting on an email link — kept
// separate from session.authError since both a stale error AND a fresh
// confirmation message should never show at once, and switching mode
// should drop whichever of the two is showing.
const confirmationSent = ref<'sign_up' | 'reset' | null>(null)

const passwordsMismatch = computed(() => mode.value === 'sign_up' && confirmPassword.value.length > 0 && password.value !== confirmPassword.value)

function switchMode(next: Mode): void {
  mode.value = next
  session.authError = null
  confirmationSent.value = null
  password.value = ''
  confirmPassword.value = ''
}

async function handleSubmit(): Promise<void> {
  if (mode.value === 'reset') {
    if (await session.resetPasswordForEmail(email.value)) confirmationSent.value = 'reset'
    return
  }

  if (mode.value === 'sign_up') {
    if (passwordsMismatch.value) return
    const result = await session.signUp(email.value, password.value)
    if (result === 'confirm_email') {
      confirmationSent.value = 'sign_up'
      password.value = ''
      confirmPassword.value = ''
    } else if (result === 'signed_in') {
      email.value = ''
      password.value = ''
      confirmPassword.value = ''
    }
    return
  }

  if (await session.signInWithPassword(email.value, password.value)) {
    email.value = ''
    password.value = ''
  }
}
</script>

<template>
  <div>
    <div v-if="mode !== 'reset'" class="flex gap-2">
      <button
        type="button"
        class="min-h-11 flex-1 rounded-full border px-3 text-sm font-medium transition-colors"
        :class="mode === 'sign_in' ? 'border-train bg-train-wash text-train' : 'border-rule text-muted hover:border-ink-soft hover:text-ink'"
        @click="switchMode('sign_in')"
      >
        Sign in
      </button>
      <button
        type="button"
        class="min-h-11 flex-1 rounded-full border px-3 text-sm font-medium transition-colors"
        :class="mode === 'sign_up' ? 'border-train bg-train-wash text-train' : 'border-rule text-muted hover:border-ink-soft hover:text-ink'"
        @click="switchMode('sign_up')"
      >
        Sign up
      </button>
    </div>

    <Alert v-if="confirmationSent" variant="info" :icon="MailCheck" class="mt-4">
      <span v-if="confirmationSent === 'sign_up'">Account created: check {{ email || 'your email' }} for a confirmation link before signing in.</span>
      <span v-else>If an account exists for that email, a password reset link is on its way.</span>
    </Alert>

    <form v-else class="mt-4 space-y-3" @submit.prevent="handleSubmit">
      <label class="block">
        <span class="text-sm font-medium text-ink">Email</span>
        <span class="mt-1 flex items-center gap-2 rounded-xl border border-rule px-3">
          <Mail :size="16" :stroke-width="1.75" class="shrink-0 text-muted" aria-hidden="true" />
          <input v-model="email" type="email" autocomplete="email" required placeholder="you@example.com" class="min-h-11 w-full text-ink outline-none" />
        </span>
      </label>

      <label v-if="mode !== 'reset'" class="block">
        <span class="text-sm font-medium text-ink">Password</span>
        <span class="mt-1 flex items-center gap-2 rounded-xl border border-rule px-3">
          <Lock :size="16" :stroke-width="1.75" class="shrink-0 text-muted" aria-hidden="true" />
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :autocomplete="mode === 'sign_up' ? 'new-password' : 'current-password'"
            required
            minlength="6"
            placeholder="At least 6 characters"
            class="min-h-11 w-full text-ink outline-none"
          />
          <button type="button" class="flex shrink-0 items-center text-muted transition-colors hover:text-ink" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="16" :stroke-width="1.75" aria-hidden="true" />
            <Eye v-else :size="16" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </span>
      </label>

      <label v-if="mode === 'sign_up'" class="block">
        <span class="text-sm font-medium text-ink">Confirm password</span>
        <span class="mt-1 flex items-center gap-2 rounded-xl border px-3" :class="passwordsMismatch ? 'border-warn' : 'border-rule'">
          <Lock :size="16" :stroke-width="1.75" class="shrink-0 text-muted" aria-hidden="true" />
          <input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            class="min-h-11 w-full text-ink outline-none"
          />
        </span>
        <span v-if="passwordsMismatch" class="mt-1 block text-xs text-warn">Passwords don't match.</span>
      </label>

      <button
        v-if="mode === 'sign_in'"
        type="button"
        class="text-sm font-medium text-muted underline decoration-dotted transition-colors hover:text-ink"
        @click="switchMode('reset')"
      >
        Forgot password?
      </button>

      <Alert v-if="session.authError" variant="error">{{ session.authError }}</Alert>

      <button
        type="submit"
        class="min-h-11 w-full rounded-full bg-train px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        :disabled="session.authPending || passwordsMismatch"
      >
        {{ session.authPending ? 'Working…' : mode === 'sign_up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in' }}
      </button>

      <button
        v-if="mode === 'reset'"
        type="button"
        class="w-full text-sm font-medium text-muted underline decoration-dotted transition-colors hover:text-ink"
        @click="switchMode('sign_in')"
      >
        Back to sign in
      </button>
    </form>
  </div>
</template>
