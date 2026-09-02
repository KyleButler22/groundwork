<script setup lang="ts">
import { Check, Lock } from '@lucide/vue'
import { computed } from 'vue'

import type { PatternProgress, ProgressionNode } from '@/lib/progressionMap'

const props = defineProps<{ progress: PatternProgress }>()

// Fixed row length rather than a fluid flex-wrap: a fluid wrap can leave
// a single orphaned node dangling alone on its own row depending on
// container width, exactly the "naive flex-wrap" look the design spec
// rules out. A fixed count makes every row's connector geometry
// (in-row lines, and the row-to-row hook below) fully predictable from
// the node's index alone — no runtime position measurement needed.
const NODES_PER_ROW = 5

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

const rows = computed(() => chunk(props.progress.nodes, NODES_PER_ROW))

// A connector reads as "behind you" only when both ends are already
// climbed (completed, or the final completed-to-current step) — anything
// touching a locked node stays neutral, the same rule the nodes
// themselves already encode.
function bothClimbed(before: ProgressionNode, after: ProgressionNode): boolean {
  return before.status !== 'locked' && after.status !== 'locked'
}
</script>

<template>
  <section class="mt-4">
    <h3 class="text-sm font-semibold text-ink">{{ progress.patternName }}</h3>
    <div class="mt-2 flex flex-col gap-1">
      <template v-for="(row, rowIndex) in rows" :key="rowIndex">
        <div class="flex items-center">
          <template v-for="(node, i) in row" :key="node.exerciseId">
            <RouterLink
              :to="`/exercises/${node.exerciseId}`"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-mono font-bold tabular-nums transition-transform hover:scale-105"
              :class="{
                'bg-train text-white': node.status === 'completed',
                'border-2 border-train bg-surface text-train': node.status === 'current',
                'bg-rule/60 text-muted': node.status === 'locked',
              }"
              :aria-label="`${node.name}, level ${node.level}, ${node.status}`"
            >
              <Check v-if="node.status === 'completed'" :size="16" :stroke-width="2.5" aria-hidden="true" />
              <Lock v-else-if="node.status === 'locked'" :size="14" :stroke-width="2" aria-hidden="true" />
              <span v-else>{{ node.level }}</span>
            </RouterLink>
            <div
              v-if="i < row.length - 1"
              class="h-0.5 flex-1"
              :class="bothClimbed(node, row[i + 1]) ? 'bg-train' : 'bg-rule'"
            />
          </template>
        </div>
        <svg
          v-if="rowIndex < rows.length - 1"
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          class="h-8 w-full"
          :class="bothClimbed(row[row.length - 1], rows[rowIndex + 1][0]) ? 'text-train' : 'text-rule'"
          aria-hidden="true"
        >
          <path d="M 94 0 C 94 16, 6 16, 6 32" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </template>
    </div>
  </section>
</template>
