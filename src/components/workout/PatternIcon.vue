<script setup lang="ts">
import { Activity, Anchor, ArrowDownToLine, ArrowUpFromLine, Dumbbell, Footprints, PersonStanding, Weight } from '@lucide/vue'
import { computed } from 'vue'

/**
 * One consistent icon per movement pattern (the 8 rows of
 * movement_patterns, supabase/seed/001_movement_library.sql) — replaces
 * this session's earlier hand-drawn per-pattern pose diagrams, which
 * needed real illustration craft this environment couldn't visually
 * proof. Per Kyle's own call: drop literal pose art in favor of a clean,
 * zero-licensing-risk icon from the same set used everywhere else in the
 * app, rather than sourcing exercise imagery online (every free option
 * found had a real rights question attached — see TASKS.md). All 60
 * exercises share these 8; a per-exercise illustration is separate,
 * larger content work, not attempted here.
 */
const props = defineProps<{ patternSlug: string | undefined }>()

const ICON_BY_PATTERN: Record<string, unknown> = {
  horizontal_push: Dumbbell,
  vertical_push: ArrowUpFromLine,
  vertical_pull: ArrowDownToLine,
  horizontal_pull: Weight,
  squat: Footprints,
  hinge: Activity,
  core: Anchor,
  skill_handstand: PersonStanding,
}

const icon = computed(() => (props.patternSlug ? ICON_BY_PATTERN[props.patternSlug] : undefined) ?? Dumbbell)
</script>

<template>
  <component :is="icon" :size="40" :stroke-width="1.5" aria-hidden="true" />
</template>
