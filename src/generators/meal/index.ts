// Public surface of the meal generator. UI code (and the eventual
// Supabase-write step, mirroring src/lib/materializePlan.ts) should import
// from here, not reach into individual files — see ../workout/index.ts
// for the same convention.

export { generateMealPlan, regenerateWeek, swapOneMeal } from './generateMealPlan'
export type { GenerateMealPlanInput, GenerateMealPlanResult } from './generateMealPlan'

export { buildMealLibrary, hasAllergen, hasDislikedIngredient, satisfiesDiet } from './library'
export type { MealLibrary } from './library'

export { planActiveSlots, planDinnerLeftovers, BREAKFAST_ROTATION_SIZE, DAYS_PER_WEEK, DEFAULT_LEFTOVER_RATIO } from './grid'
export type { ActiveSlotsResult, DinnerDayPlan } from './grid'

export { allocateSlotTargets } from './allocate'
export type { DailyTargets, SlotTarget } from './allocate'

export { filterCandidates, filterWithRelaxation } from './filter'
export type { FilterConstraints, RelaxationResult } from './filter'

export { DEFAULT_WEIGHTS, VARIETY_FLOOR } from './scoring'
export type { ScoringWeights } from './scoring'

export { validateMealPlan } from './validate'
export type { ValidationInput, Violation } from './validate'

export { buildGroceryList, friendliestDisplay } from './groceryList'
export type { BuildGroceryListInput, BuildGroceryListResult } from './groceryList'

export { buildUnitResolutionIndex, resolveGrams } from './unitResolution'
export type { UnitResolutionIndex } from './unitResolution'
