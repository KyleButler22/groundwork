<script setup lang="ts">
import BottomNav from '@/components/nav/BottomNav.vue'
import SidebarNav from '@/components/nav/SidebarNav.vue'
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-md flex-col bg-ground pt-safe lg:max-w-none lg:flex-row">
    <SidebarNav />
    <main class="flex-1 overflow-y-auto pb-24 lg:pb-8">
      <div class="lg:mx-auto lg:max-w-4xl lg:px-10 lg:py-8">
        <RouterView />
      </div>
    </main>
    <BottomNav />
  </div>
</template>
