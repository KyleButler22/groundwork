<script setup lang="ts">
import { CircleUser, Eye, EyeOff, ListChecks, Lock, LogOut, Mail, MailCheck, Monitor, Moon, Sun } from '@lucide/vue'
import { computed, ref } from 'vue'

import Spinner from '@/components/shared/Spinner.vue'
import { useSessionStore } from '@/stores/session'
import { type ThemeChoice, useThemeStore } from '@/stores/theme'

// Account, targets, equipment, dietary preferences, and auth (sign in / out).
// Only auth is built so far — the rest is still TASKS.md territory.
const session = useSessionStore()
const theme = useThemeStore()

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

type Mode = 'sign_in' | 'sign_up' | 'reset'
const mode = ref<Mode>('sign_in')
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

async function handleSignOut(): Promise<void> {
  await session.signOut()
  switchMode('sign_in')
}
</script>

<template>
  <div class="p-4 lg:p-0">
    <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Profile</h1>

    <div class="mt-4 lg:max-w-sm">
      <span class="text-sm font-medium text-ink">Theme</span>
      <div class="mt-1.5 flex gap-2">
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          type="button"
          class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors"
          :class="theme.choice === option.value ? 'border-train bg-train-wash text-train' : 'border-rule text-muted hover:border-ink-soft hover:text-ink'"
          @click="theme.setChoice(option.value)"
        >
          <component :is="option.icon" :size="16" :stroke-width="1.75" aria-hidden="true" />
          {{ option.label }}
        </button>
      </div>
    </div>

    <Spinner v-if="!session.isReady" class="mt-2" />

    <template v-else-if="session.session">
      <div class="mt-4 flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 shadow-card lg:max-w-sm">
        <CircleUser :size="36" :stroke-width="1.5" class="shrink-0 text-train" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{{ session.session.user.email }}</span>
        <button
          type="button"
          class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 text-sm font-medium text-muted transition-colors hover:border-ink-soft hover:text-ink"
          @click="handleSignOut"
        >
          <LogOut :size="16" :stroke-width="1.75" aria-hidden="true" />
          Sign out
        </button>
      </div>

      <RouterLink
        to="/intake"
        class="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-rule bg-surface px-4 py-3 text-sm font-medium text-ink shadow-card transition-shadow hover:shadow-none lg:max-w-sm"
      >
        <ListChecks :size="18" :stroke-width="1.75" class="shrink-0 text-train" aria-hidden="true" />
        Retake the intake questionnaire
      </RouterLink>
      <p class="mt-2 text-xs text-muted lg:max-w-sm">
        No dedicated settings screen yet for editing targets, equipment, or dietary preferences one at a time — going through the
        full questionnaire again is how to update any of them for now. It replaces your current plan, archiving the old one rather
        than deleting it.
      </p>
    </template>

    <template v-else>
      <div class="mt-4 lg:max-w-sm">
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

        <p v-if="confirmationSent" class="mt-4 flex items-start gap-2 rounded-xl border border-nutri bg-nutri-wash px-3 py-2 text-sm text-nutri">
          <MailCheck :size="18" :stroke-width="1.75" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span v-if="confirmationSent === 'sign_up'">Account created — check {{ email || 'your email' }} for a confirmation link before signing in.</span>
          <span v-else>If an account exists for that email, a password reset link is on its way.</span>
        </p>

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

          <p v-if="session.authError" class="rounded-xl border border-warn bg-warn-wash px-3 py-2 text-sm text-warn">{{ session.authError }}</p>

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
  </div>
</template>
