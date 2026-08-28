// Public surface of the workout generator. UI code (and the eventual
// Supabase-write step in TASKS.md) should import from here, not reach into
// individual files — that keeps the internal module boundaries free to
// shift without hunting down call sites.

export { generatePlan } from './generatePlan'
export type { GeneratePlanInput, GeneratePlanResult } from './generatePlan'

export { buildLibrary, canPerform, contraindicated } from './library'
export type { MovementLibrary } from './library'

export { applyWorkoutLog } from './promotion'
export type { PromotionEvent, PromotionInput, PromotionOutcome } from './promotion'

export { validatePlan } from './validate'
export type { ValidationInput, Violation } from './validate'

export type { SessionTemplate, SlotTemplate, SplitChoice } from './splits'
