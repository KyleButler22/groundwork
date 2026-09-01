<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'

// Replaces every bare "Loading…" text label with a real spinner —
// visually icon-only (a spinning ring reads as "in progress" without
// needing a word next to it, same convention as virtually every modern
// app's loading state), with the label kept for assistive tech via
// role="status" + sr-only text rather than dropped entirely.
withDefaults(defineProps<{ label?: string; size?: number }>(), { label: 'Loading…', size: 20 })
</script>

<template>
  <span class="inline-flex items-center" role="status">
    <LoaderCircle :size="size" :stroke-width="2.25" class="animate-spin text-train" aria-hidden="true" />
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
