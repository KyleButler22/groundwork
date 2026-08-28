import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import type { Exercise, PlanItem, PlanSession, WorkoutPlan } from '@/types/domain'

/**
 * Reads the locally-cached active plan (written by the intake flow's
 * submit(), or by a future regenerate action) — Dexie only for now, since
 * there's no Supabase → Dexie sync yet (see TASKS.md). Once that sync
 * exists this store's read side doesn't need to change, only where the
 * data first lands.
 */
export const usePlanStore = defineStore('plan', () => {
  const plan = ref<WorkoutPlan | null>(null)
  const sessions = ref<PlanSession[]>([])
  const items = ref<PlanItem[]>([])
  const exercisesById = ref<Map<number, Exercise>>(new Map())
  const loading = ref(true)

  const hasPlan = computed(() => plan.value !== null)

  const sessionsByWeek = computed(() => {
    const map = new Map<number, PlanSession[]>()
    for (const s of sessions.value) {
      const list = map.get(s.weekNumber)
      if (list) list.push(s)
      else map.set(s.weekNumber, [s])
    }
    for (const list of map.values()) list.sort((a, b) => a.dayIndex - b.dayIndex)
    return map
  })

  function itemsForSession(sessionId: string): PlanItem[] {
    return items.value.filter((i) => i.sessionId === sessionId).sort((a, b) => a.orderIndex - b.orderIndex)
  }

  function exerciseName(exerciseId: number): string {
    return exercisesById.value.get(exerciseId)?.name ?? `Exercise ${exerciseId}`
  }

  /** "Today's session" until real scheduling/logging exists to know which
   *  session is actually next — the sliding-block design (see
   *  domain.ts's PlanSession note) means that's derived from
   *  workout_logs later, not from a calendar date now. */
  const firstSession = computed(() => sessionsByWeek.value.get(1)?.[0] ?? null)

  async function loadActivePlan() {
    loading.value = true
    const active = await db.workoutPlans.where('status').equals('active').first()
    plan.value = active ?? null

    if (active) {
      sessions.value = await db.planSessions.where('planId').equals(active.id).toArray()
      const sessionIds = new Set(sessions.value.map((s) => s.id))
      items.value = (await db.planItems.toArray()).filter((i) => sessionIds.has(i.sessionId))
      const allExercises = await db.exercises.toArray()
      exercisesById.value = new Map(allExercises.map((e) => [e.id, e]))
    } else {
      sessions.value = []
      items.value = []
    }
    loading.value = false
  }

  return { plan, sessions, items, loading, hasPlan, sessionsByWeek, firstSession, itemsForSession, exerciseName, loadActivePlan }
})
