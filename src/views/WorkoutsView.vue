<script setup lang="ts">
import { ChevronRight, X } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import Skeleton from '@/components/shared/Skeleton.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { PlanItem, PlanSession } from '@/types/domain'

// Current plan's sessions. Generation itself lives in src/generators/workout —
// this view only renders a WorkoutPlan and logs sets, it never computes one.
const planStore = usePlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue/MealsView.vue use.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

const openWeek = ref(1)
onMounted(async () => {
  await planStore.loadActivePlan(userId.value)
  // Land on whatever week is actually next, not always week 1 — the
  // whole point of tracking completion is that "today" moves forward.
  if (planStore.nextSession) openWeek.value = planStore.nextSession.weekNumber
})

const weekNumbers = computed(() => Array.from({ length: planStore.plan?.weeks ?? 0 }, (_, i) => i + 1))

function weekPercent(week: number): number {
  const p = planStore.weekProgress.get(week)
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

function blockPercent(): number {
  const p = planStore.blockProgress
  return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

function onToggleItem(planSession: PlanSession, item: PlanItem): void {
  const wasChecked = planStore.isItemChecked(item.id)
  planStore.toggleItemChecked(userId.value, planSession, item)
  if (!wasChecked) {
    justCheckedId.value = item.id
    setTimeout(() => {
      if (justCheckedId.value === item.id) justCheckedId.value = null
    }, 500)
  }
}

// Collapsed by default, one at a time, across the whole page — same
// convention as DashboardView.vue's own expandedItemId.
const expandedItemId = ref<string | null>(null)

// Same brief check-off flash as DashboardView.vue — see that file's
// own comment on this same pattern for why.
const justCheckedId = ref<string | null>(null)
function toggleExpanded(itemId: string): void {
  expandedItemId.value = expandedItemId.value === itemId ? null : itemId
}
</script>

<template>
  <div class="p-4 pb-8 lg:p-0">
    <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Training</h1>

    <div v-if="planStore.loading" class="mt-4 space-y-4">
      <Skeleton class="rounded-2xl" height="9rem" />
      <Skeleton class="rounded-xl" height="4rem" />
      <Skeleton class="rounded-xl" height="4rem" />
      <Skeleton class="rounded-xl" height="4rem" />
    </div>
    <p v-else-if="!planStore.hasPlan" class="mt-2 text-sm text-muted">Your plan will appear here once generated.</p>

    <template v-else>
      <p class="mt-1 flex items-center gap-2 text-sm text-muted">
        <span class="inline-flex shrink-0 items-center rounded-full bg-train-wash px-2.5 py-0.5 text-xs font-medium text-train capitalize">{{ planStore.plan?.name }}</span>
        {{ planStore.plan?.daysPerWeek }} days/week, {{ planStore.plan?.splitType.replace('_', ' ') }}
      </p>

      <div class="mt-4 rounded-2xl border border-rule bg-surface p-4 shadow-card lg:mt-6">
        <div class="flex items-end justify-between">
          <span class="text-xs text-muted">Block progress</span>
          <span class="text-right">
            <span class="block font-mono text-xl font-bold tabular-nums text-ink">{{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }}</span>
            <span class="block text-[11px] text-muted">sessions</span>
          </span>
        </div>
        <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rule">
          <div class="h-full rounded-full bg-train transition-[width] duration-500" :style="{ width: blockPercent() + '%' }"></div>
        </div>

        <div class="mt-4 flex items-end gap-2" aria-label="Weekly progress">
          <div v-for="week in weekNumbers" :key="week" class="flex flex-1 flex-col items-center gap-1">
            <div class="flex h-14 w-full items-end overflow-hidden rounded-lg bg-rule">
              <div class="w-full rounded-lg bg-train transition-[height] duration-500" :style="{ height: weekPercent(week) + '%' }"></div>
            </div>
            <span class="font-mono text-[11px] tabular-nums text-muted">{{ planStore.weekProgress.get(week)?.done ?? 0 }}/{{ planStore.weekProgress.get(week)?.total ?? 0 }}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          v-for="week in weekNumbers"
          :key="week"
          type="button"
          class="min-h-11 flex-1 rounded-full border text-sm font-medium transition-colors"
          :class="openWeek === week ? 'border-train bg-train text-white' : 'border-rule text-ink hover:border-ink-soft'"
          @click="openWeek = week"
        >
          Week {{ week }}
        </button>
      </div>

      <Transition name="promo">
        <div v-if="planStore.promotionMessages.length" class="mt-4 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train">
          <ul class="space-y-1">
            <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
          </ul>
          <button
            type="button"
            class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
            aria-label="Dismiss"
            @click="planStore.dismissPromotionMessages()"
          >
            <X :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </Transition>

      <div class="mt-4 space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <section v-for="s in planStore.sessionsByWeek.get(openWeek) ?? []" :key="s.id">
          <div class="flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-ink">
              {{ s.name }}
              <span
                v-if="s.weekType !== 'build'"
                class="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                :class="s.weekType === 'deload' ? 'bg-nutri-wash text-nutri' : 'bg-train-wash text-train'"
              >
                {{ s.weekType }}
              </span>
            </h2>
            <span class="shrink-0 font-mono text-xs tabular-nums text-muted">
              {{ planStore.sessionProgress(s.id).done }}/{{ planStore.sessionProgress(s.id).total }}
            </span>
          </div>
          <ul class="mt-2 space-y-2">
            <li
              v-for="item in planStore.itemsForSession(s.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[background-color,box-shadow] duration-300 lg:hover:shadow-none lg:hover:bg-ground/60"
              :class="{ '!bg-train-wash': justCheckedId === item.id }"
            >
              <div class="flex items-center gap-3">
                <label class="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input type="checkbox" class="h-5 w-5 accent-train" :checked="planStore.isItemChecked(item.id)" @change="onToggleItem(s, item)" />
                </label>
                <RouterLink :to="{ name: 'exercise', params: { exerciseId: item.exerciseId } }" class="flex min-w-0 flex-1 items-center gap-1">
                  <span class="min-w-0 flex-1 text-sm font-medium" :class="planStore.isItemChecked(item.id) ? 'text-muted line-through' : 'text-ink'">
                    {{ planStore.exerciseName(item.exerciseId) }}
                    <span v-if="item.supersetGroup !== null" class="text-xs font-normal text-muted"> · superset</span>
                  </span>
                  <ChevronRight :size="16" class="shrink-0 text-muted" aria-hidden="true" />
                </RouterLink>
                <button
                  v-if="planStore.isItemChecked(item.id)"
                  type="button"
                  class="shrink-0 font-mono text-sm tabular-nums text-muted underline decoration-dotted"
                  @click="toggleExpanded(item.id)"
                >
                  {{ item.sets }} × {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
                </button>
                <span v-else class="shrink-0 font-mono text-sm tabular-nums text-muted">
                  {{ item.sets }} ×
                  {{ item.targetSeconds !== null ? `${item.targetSeconds}s` : `${item.targetRepMin}-${item.targetRepMax}` }}
                </span>
              </div>
              <SetLogEditor v-if="expandedItemId === item.id" :item="item" :user-id="userId" />
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
