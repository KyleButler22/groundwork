<script setup lang="ts">
// One reusable pulsing placeholder block, composed per-view into shapes
// roughly matching the content about to appear (see Tasks 3-8) — 2026
// UX research is explicit that content-heavy list/dashboard loads read
// as more premium with a skeleton than a spinner, since the layout is
// already implied before content arrives (spinners stay reserved for
// short blocking actions — Spinner.vue, untouched, still covers those).
// aria-hidden: this has no semantic content of its own; the real
// content that replaces it is what gets announced once loaded.
withDefaults(defineProps<{ width?: string; height?: string }>(), { width: '100%', height: '1rem' })
</script>

<template>
  <div class="animate-pulse bg-rule/60" :style="{ width, height }" aria-hidden="true" />
</template>
