<script setup lang="ts">
/**
 * Bottom tab bar, not a top nav — ports directly to a native tab bar under
 * Capacitor later (see AGENTS.md / calisthenics-app-stack memory). Respects
 * the safe-area inset so the iOS home indicator never overlaps a tap target.
 * Hidden at `lg` and up, where SidebarNav.vue (same NAV_ITEMS) takes over —
 * a phone-width tab bar stretched across a desktop window doesn't fit.
 */
import { NAV_ITEMS } from './navItems'
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-rule bg-surface pb-safe lg:hidden"
    aria-label="Primary"
  >
    <RouterLink
      v-for="item in NAV_ITEMS"
      :key="item.to"
      :to="item.to"
      class="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-train"
      active-class="text-train"
    >
      <component :is="item.icon" :size="22" :stroke-width="1.75" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
