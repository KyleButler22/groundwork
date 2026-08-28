<script setup lang="ts">
import BottomNav from '@/components/nav/BottomNav.vue'
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-md flex-col bg-ground pt-safe">
    <main class="flex-1 overflow-y-auto pb-24">
      <RouterView />
    </main>
    <BottomNav />
  </div>
</template>
