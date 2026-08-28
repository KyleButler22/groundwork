<script setup lang="ts">
/**
 * Bottom tab bar, not a top nav — ports directly to a native tab bar under
 * Capacitor later (see AGENTS.md / calisthenics-app-stack memory). Respects
 * the safe-area inset so the iOS home indicator never overlaps a tap target.
 */
interface Tab {
  to: string
  label: string
  icon: string
}

const tabs: Tab[] = [
  { to: '/', label: 'Today', icon: '🏠' },
  { to: '/workouts', label: 'Train', icon: '💪' },
  { to: '/meals', label: 'Meals', icon: '🍽️' },
  { to: '/grocery', label: 'Grocery', icon: '🛒' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-rule bg-surface pb-safe"
    aria-label="Primary"
  >
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-train"
      active-class="text-train"
    >
      <span class="text-lg leading-none" aria-hidden="true">{{ tab.icon }}</span>
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>
