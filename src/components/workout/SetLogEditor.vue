<script setup lang="ts">
import { usePlanStore } from '@/stores/plan'
import type { PlanItem } from '@/types/domain'

/**
 * Per-set actual reps/seconds + added weight for one already-checked
 * exercise — checking the box itself defaults every set to the
 * prescribed target (src/lib/workoutLogging.ts's buildSetLogsForItem);
 * this is what lets that default be corrected to what actually happened.
 * Shared between DashboardView and WorkoutsView, which both gate showing
 * this behind their own expand/collapse state — nothing here decides
 * whether it's visible, only what it does once it is.
 */
const props = defineProps<{ item: PlanItem }>()
const store = usePlanStore()

function parseOptionalNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function onRepsOrSecondsChange(setLogId: string, event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  const value = parseOptionalNumber(raw)
  if (props.item.targetSeconds !== null) store.updateSetLog(setLogId, { seconds: value })
  else store.updateSetLog(setLogId, { reps: value })
}

function onWeightChange(setLogId: string, event: Event): void {
  const value = parseOptionalNumber((event.target as HTMLInputElement).value)
  store.updateSetLog(setLogId, { addedWeightKg: value })
}
</script>

<template>
  <div class="mt-2 space-y-1.5 border-t border-rule pt-2">
    <div v-for="log in store.setLogsForItem(item.id)" :key="log.id" class="flex items-center gap-2">
      <span class="w-11 shrink-0 text-xs text-muted">Set {{ log.setNumber }}</span>
      <input
        type="number"
        inputmode="numeric"
        class="min-h-11 w-16 rounded-md border border-rule px-2 text-sm text-ink"
        :value="item.targetSeconds !== null ? log.seconds : log.reps"
        @change="onRepsOrSecondsChange(log.id, $event)"
      />
      <span class="shrink-0 text-xs text-muted">{{ item.targetSeconds !== null ? 's' : 'reps' }}</span>
      <input
        type="number"
        inputmode="decimal"
        step="0.5"
        min="0"
        placeholder="0"
        class="min-h-11 w-16 rounded-md border border-rule px-2 text-sm text-ink"
        :value="log.addedWeightKg"
        @change="onWeightChange(log.id, $event)"
      />
      <span class="shrink-0 text-xs text-muted">kg added</span>
    </div>
  </div>
</template>
