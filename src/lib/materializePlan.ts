import type { PlanItem, PlanSession, WorkoutPlan } from '@/types/domain'
import type { GeneratePlanResult } from '@/generators/workout'

/**
 * generatePlan()'s output carries synthetic "draft-..." ids (see its own
 * header comment for why: minting real ids is a persistence concern the
 * generator has no business owning). This is that persistence boundary —
 * called once, right before writing to Dexie/Supabase, to swap every
 * synthetic id and foreign key for a real `crypto.randomUUID()`.
 *
 * Never insert a GeneratePlanResult's ids directly. A `uuid` Postgres
 * column would reject a "draft-w1-d0" string outright, which is the
 * point — this function existing at all is what makes that safe rather
 * than a trap someone eventually hits in production.
 */
export function materializePlan(
  draft: Pick<GeneratePlanResult, 'plan' | 'sessions' | 'items'>,
): { plan: WorkoutPlan; sessions: PlanSession[]; items: PlanItem[] } {
  const planId = crypto.randomUUID()
  const sessionIdMap = new Map<string, string>()

  const sessions: PlanSession[] = draft.sessions.map((s) => {
    const newId = crypto.randomUUID()
    sessionIdMap.set(s.id, newId)
    return { ...s, id: newId, planId }
  })

  const items: PlanItem[] = draft.items.map((item) => {
    const newSessionId = sessionIdMap.get(item.sessionId)
    if (!newSessionId) {
      throw new Error(`materializePlan: item ${item.id} references session ${item.sessionId}, which is not in draft.sessions`)
    }
    return { ...item, id: crypto.randomUUID(), sessionId: newSessionId }
  })

  return { plan: { ...draft.plan, id: planId }, sessions, items }
}
