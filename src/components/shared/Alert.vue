<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from '@lucide/vue'
import { computed, type Component } from 'vue'

const props = withDefaults(
  defineProps<{
    variant: 'success' | 'error' | 'info'
    dismissible?: boolean
    icon?: Component
  }>(),
  { dismissible: false, icon: undefined },
)

defineEmits<{ dismiss: [] }>()

// One default icon per variant so every alert reads as one consistent
// family at a glance; a call site overrides it via the `icon` prop only
// when the message itself is more specific than its variant (e.g. a
// "confirmation email sent" success uses MailCheck, not a generic check).
const DEFAULT_ICON: Record<'success' | 'error' | 'info', Component> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const resolvedIcon = computed(() => props.icon ?? DEFAULT_ICON[props.variant])
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-xl px-4 py-3.5"
    :class="{
      'bg-train-wash': variant === 'success',
      'bg-warn-wash': variant === 'error',
      'bg-panel': variant === 'info',
    }"
  >
    <div
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      :class="{
        'bg-train/20 text-train': variant === 'success',
        'bg-warn/20 text-warn': variant === 'error',
        'bg-ink-soft/20 text-ink-soft': variant === 'info',
      }"
    >
      <component :is="resolvedIcon" :size="16" :stroke-width="2" aria-hidden="true" />
    </div>
    <div class="flex-1 pt-0.5 text-sm text-ink">
      <slot />
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      <X :size="16" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>
