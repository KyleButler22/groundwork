<script setup lang="ts">
import { useRoute } from 'vue-router'

import BottomNav from '@/components/nav/BottomNav.vue'
import SidebarNav from '@/components/nav/SidebarNav.vue'

const route = useRoute()
</script>

<template>
  <!-- A route.meta.fullscreen view (currently just /intake) renders on
       its own, bypassing the sidebar/bottom-nav/content-wrapper shell
       entirely — it builds its own complete layout and centers correctly
       against the real viewport, not a width already narrowed by the
       sidebar's real estate. See that route's own comment in router/index.ts. -->
  <RouterView v-if="route.meta.fullscreen" />
  <div v-else class="mx-auto flex min-h-full max-w-md flex-col bg-ground pt-safe lg:max-w-none lg:flex-row">
    <SidebarNav />
    <main class="flex-1 overflow-y-auto pb-24 lg:pb-8">
      <div class="lg:mx-auto lg:max-w-4xl lg:px-10 lg:py-8">
        <RouterView />
      </div>
    </main>
    <BottomNav />
  </div>
</template>
