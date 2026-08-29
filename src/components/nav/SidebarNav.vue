<script setup lang="ts">
/**
 * Desktop counterpart to BottomNav.vue (`lg` and up — see App.vue, which
 * renders this instead of the bottom tab bar at that breakpoint). Same 5
 * destinations, same NAV_ITEMS source of truth, just a vertical list
 * instead of a row: a phone doesn't have room for a persistent sidebar,
 * a desktop window does.
 */
import { NAV_ITEMS } from './navItems'
</script>

<template>
  <nav class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-rule bg-panel px-4 py-8 lg:flex" aria-label="Primary">
    <div class="mb-6 px-3 text-lg font-semibold tracking-tight text-ink">Groundwork</div>
    <RouterLink
      v-for="item in NAV_ITEMS"
      :key="item.to"
      :to="item.to"
      class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
      active-class="bg-surface text-train shadow-card"
    >
      <component :is="item.icon" :size="20" :stroke-width="1.75" aria-hidden="true" />
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
