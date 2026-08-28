import type { SplitType } from '@/types/domain'

/**
 * docs/generator.md §1-2. Slot templates name a real movement_patterns
 * slug (from supabase/seed/001_movement_library.sql) — not the doc's
 * illustrative 'skill'/'accessory' placeholders, which predate the seed
 * data being finalized. There is no 'accessory' pattern in the seed, so
 * it's dropped rather than left dangling; 'skill' means the one skill
 * pattern that exists, skill_handstand.
 */

export interface SlotTemplate {
  patternSlug: string
  required: boolean
  /** Lower = higher priority = filled/upgraded first when the time budget
   *  is tight (docs/generator.md §3). Independent of list position, which
   *  is performance order. */
  priority: number
  /** Only include this slot when the plan's goal is 'skill' — currently
   *  the only conditional slot in any template. */
  onlyIfSkillGoal?: true
}

export interface SessionTemplate {
  name: string
  slots: SlotTemplate[]
}

const skillSlot: SlotTemplate = { patternSlug: 'skill_handstand', required: false, priority: 1, onlyIfSkillGoal: true }

const fullBody: SessionTemplate = {
  name: 'Full Body',
  slots: [
    skillSlot,
    { patternSlug: 'squat', required: true, priority: 2 },
    { patternSlug: 'horizontal_push', required: true, priority: 3 },
    { patternSlug: 'vertical_pull', required: true, priority: 3 },
    { patternSlug: 'core', required: true, priority: 4 },
    { patternSlug: 'hinge', required: false, priority: 5 },
    { patternSlug: 'horizontal_pull', required: false, priority: 6 },
    { patternSlug: 'vertical_push', required: false, priority: 7 },
  ],
}

const upper: SessionTemplate = {
  name: 'Upper',
  slots: [
    skillSlot,
    { patternSlug: 'vertical_pull', required: true, priority: 2 },
    { patternSlug: 'horizontal_push', required: true, priority: 3 },
    { patternSlug: 'core', required: true, priority: 4 },
    { patternSlug: 'horizontal_pull', required: false, priority: 5 },
    { patternSlug: 'vertical_push', required: false, priority: 6 },
  ],
}

const lower: SessionTemplate = {
  name: 'Lower',
  slots: [
    { patternSlug: 'squat', required: true, priority: 1 },
    { patternSlug: 'hinge', required: true, priority: 2 },
    { patternSlug: 'core', required: false, priority: 3 },
  ],
}

const push: SessionTemplate = {
  name: 'Push',
  slots: [
    skillSlot,
    { patternSlug: 'horizontal_push', required: true, priority: 2 },
    { patternSlug: 'vertical_push', required: true, priority: 3 },
    { patternSlug: 'core', required: false, priority: 4 },
  ],
}

const pull: SessionTemplate = {
  name: 'Pull',
  slots: [
    { patternSlug: 'vertical_pull', required: true, priority: 1 },
    { patternSlug: 'horizontal_pull', required: true, priority: 2 },
    { patternSlug: 'core', required: false, priority: 3 },
  ],
}

const legs: SessionTemplate = {
  name: 'Legs',
  slots: [
    { patternSlug: 'squat', required: true, priority: 1 },
    { patternSlug: 'hinge', required: true, priority: 2 },
  ],
}

export interface SplitChoice {
  splitType: SplitType
  /** One SessionTemplate per training day, in order — day_index (see
   *  domain.ts's PlanSession note) indexes into this. */
  cycle: SessionTemplate[]
}

/**
 * docs/generator.md §1. `days_per_week` decides the split outright.
 * Clamped to 1-6 here as the generator-level backstop for "no 7-day
 * option, ever" — the doc frames that as a product rule, and safety
 * gates belong in the generator, not just wherever the UI happens to
 * enforce them (see docs/intake.md's own framing of the equivalent
 * calorie-floor rule).
 */
export function chooseSplit(daysPerWeek: number): SplitChoice {
  const days = Math.min(Math.max(Math.round(daysPerWeek), 1), 6)

  if (days <= 3) return { splitType: 'full_body', cycle: Array(days).fill(fullBody) }
  if (days === 4) return { splitType: 'upper_lower', cycle: [upper, lower, upper, lower] }
  if (days === 5) {
    // docs/generator.md §1 originally sketched day 5 as a five-template
    // Upper/Lower/Push/Pull/Legs hybrid — but split_type only has three
    // values (0004_training.sql: full_body/upper_lower/push_pull_legs),
    // and that hybrid doesn't cleanly fit any of them. Reusing
    // upper_lower with a fifth Upper day is a deliberate simplification
    // made during implementation; see docs/generator.md §1 for the note
    // and the updated day-count table.
    return { splitType: 'upper_lower', cycle: [upper, lower, upper, lower, upper] }
  }
  return { splitType: 'push_pull_legs', cycle: [push, pull, legs, push, pull, legs] }
}

/**
 * docs/generator.md §9's fallback: "the plainest full-body template that
 * satisfies the constraints". Deliberately NOT chooseSplit(min(days,3)) —
 * that would still pick upper_lower/push_pull_legs once days exceeds 3.
 * This ignores the day-count split logic entirely and repeats the single
 * simplest template regardless of how many days are requested, because
 * the point of a fallback is "give me anything valid", not "give me the
 * next-simplest sophisticated split".
 */
export function plainestFallback(daysPerWeek: number): SplitChoice {
  const days = Math.min(Math.max(Math.round(daysPerWeek), 1), 6)
  return { splitType: 'full_body', cycle: Array(days).fill(fullBody) }
}
