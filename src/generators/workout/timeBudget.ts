/**
 * docs/generator.md §3 — reserve, then distribute.
 *
 * Deliberately narrow: this module knows nothing about goals, exercises,
 * or rep ranges — just a per-set cost and a flexible set count. The
 * caller (generatePlan.ts) resolves "cost of one set" from the actual
 * prescription (reps×3s, or an isometric's target seconds) before
 * handing it here. That split keeps this file pure arithmetic and easy
 * to test exhaustively without dragging in the whole prescription model.
 */

export interface BudgetItem {
  slotId: string
  required: boolean
  /** Lower number = higher priority = upgraded/added first. Matches the
   *  doc's convention (skill=1 is highest priority) — not sort-by-value-
   *  descending, ascending. */
  priority: number
  /** Cost in seconds of ONE set's work — reps × 3s, or an isometric's
   *  target_seconds directly. Fixed per item; only the set COUNT flexes. */
  costPerSetSeconds: number
  restSeconds: number
  minSets: number
  maxSets: number
}

export interface BudgetedItem extends BudgetItem {
  sets: number
  costSeconds: number
}

export interface AllocationResult {
  usableSeconds: number
  /** In the SAME order as the input array (performance order) — priority
   *  only controls upgrade/add order internally, never output order. */
  included: BudgetedItem[]
  /** Optional items that didn't fit at all, even at their minimum. */
  dropped: BudgetItem[]
  totalSeconds: number
  /** Negative means even required-slot minimums exceeded the budget —
   *  callers (validate.ts) should treat that as a hard failure, not
   *  something this module silently absorbs by dropping a required slot. */
  remainingSeconds: number
}

const WARMUP_SECONDS = 360
const BUFFER_SECONDS = 180
const TRANSITION_SECONDS = 30

export function usableSeconds(sessionMinutes: number): number {
  return sessionMinutes * 60 - WARMUP_SECONDS - BUFFER_SECONDS
}

export function costSeconds(item: Pick<BudgetItem, 'costPerSetSeconds' | 'restSeconds'>, sets: number): number {
  if (sets <= 0) return 0
  return sets * item.costPerSetSeconds + (sets - 1) * item.restSeconds + TRANSITION_SECONDS
}

/** Priority ascending, stable for ties (preserves input relative order —
 *  Array.prototype.sort is stable since ES2019, so this is safe). */
function byPriorityAscending<T extends { priority: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.priority - b.priority)
}

/** Greedily adds sets one at a time while the marginal cost fits in what's
 *  left, stopping at the item's own maxSets or the first set that doesn't
 *  fit — never overspends, never skips ahead to see if a later set would
 *  somehow fit cheaper (it can't; cost is monotonic in sets). */
function upgrade(
  item: BudgetItem,
  currentSets: number,
  remaining: number,
): { sets: number; spent: number } {
  let sets = currentSets
  let spent = 0
  while (sets < item.maxSets) {
    const marginal = costSeconds(item, sets + 1) - costSeconds(item, sets)
    if (marginal > remaining - spent) break
    sets += 1
    spent += marginal
  }
  return { sets, spent }
}

export function allocateBudget(items: BudgetItem[], sessionMinutes: number): AllocationResult {
  const usable = usableSeconds(sessionMinutes)
  const required = byPriorityAscending(items.filter((i) => i.required))
  const optional = byPriorityAscending(items.filter((i) => !i.required))

  const sets = new Map<string, number>()
  let remaining = usable

  // Pass 1: reserve every required slot at its minimum — non-negotiable,
  // even if this pushes remaining negative. A required slot is never
  // dropped by this module; that call belongs to validate.ts / the
  // caller's fallback behaviour (docs/generator.md §9), not silently here.
  for (const item of required) {
    sets.set(item.slotId, item.minSets)
    remaining -= costSeconds(item, item.minSets)
  }

  // Pass 2: spend what's left upgrading required slots toward their full
  // prescription, in priority order — this is the fix for the "why greedy
  // filling is wrong" failure mode: required slots get first claim on any
  // leftover budget before a single optional slot is even considered.
  for (const item of required) {
    const current = sets.get(item.slotId)!
    const { sets: upgraded, spent } = upgrade(item, current, remaining)
    sets.set(item.slotId, upgraded)
    remaining -= spent
  }

  // Pass 3: add optional slots in priority order, upgrading each
  // immediately after adding it (rather than adding all first) so a
  // high-priority optional slot can claim more of the remaining budget
  // than one after it, matching the same priority-first spirit as pass 2.
  const dropped: BudgetItem[] = []
  for (const item of optional) {
    const baseCost = costSeconds(item, item.minSets)
    if (baseCost > remaining) {
      dropped.push(item)
      continue
    }
    sets.set(item.slotId, item.minSets)
    remaining -= baseCost
    const { sets: upgraded, spent } = upgrade(item, item.minSets, remaining)
    sets.set(item.slotId, upgraded)
    remaining -= spent
  }

  const included: BudgetedItem[] = items
    .filter((i) => sets.has(i.slotId))
    .map((i) => ({ ...i, sets: sets.get(i.slotId)!, costSeconds: costSeconds(i, sets.get(i.slotId)!) }))

  const totalSeconds = included.reduce((sum, i) => sum + i.costSeconds, 0)

  return { usableSeconds: usable, included, dropped, totalSeconds, remainingSeconds: usable - totalSeconds }
}
