<script setup lang="ts">
import { CircleUser, ListChecks, LogOut, Monitor, Moon, Sun } from '@lucide/vue'

import AuthForm from '@/components/auth/AuthForm.vue'
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

async function handleSignOut(): Promise<void> {
  await session.signOut()
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
        No dedicated settings screen yet for editing targets, equipment, or dietary preferences one at a time: going through the
        full questionnaire again is how to update any of them for now. It replaces your current plan, archiving the old one rather
        than deleting it.
      </p>
    </template>

    <template v-else>
      <div class="mt-4 lg:max-w-sm">
        <AuthForm />
      </div>
    </template>
  </div>
</template>
