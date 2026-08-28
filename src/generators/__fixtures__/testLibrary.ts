import type {
  BodyRegion,
  Equipment,
  Exercise,
  ExerciseContraindication,
  ExerciseEquipment,
  MovementPattern,
  ProgressionEdge,
} from '@/types/domain'

/**
 * A small, deliberately synthetic movement library for unit tests — NOT a
 * copy of supabase/seed/001_movement_library.sql. Three short ladders
 * (4/3/2 rungs) chosen to exercise every real branch in the generator
 * logic in as few exercises as possible:
 *
 *   test_push  — reps only, an equipment-gated rung, a wrist contraindication
 *   test_pull  — starts on a HOLD (time_seconds), an equipment-gated rung,
 *                a shoulder contraindication at 'caution' (not 'avoid') —
 *                proves caution excludes too, see library.ts
 *   test_core  — ends on an alternative-group equipment requirement
 *                (bench OR bar), proving the "any one of" path
 *
 * For a test that needs confidence against the REAL 60-exercise seed data,
 * see generatePlan.integration.spec.ts instead — this fixture is for fast,
 * exact-value unit tests, not a stand-in for the real content.
 */

export const testPatterns: MovementPattern[] = [
  { id: 1, slug: 'test_push', name: 'Test Push', category: 'push', sortOrder: 1 },
  { id: 2, slug: 'test_pull', name: 'Test Pull', category: 'pull', sortOrder: 2 },
  { id: 3, slug: 'test_core', name: 'Test Core', category: 'core', sortOrder: 3 },
  { id: 4, slug: 'test_skill', name: 'Test Skill', category: 'skill', sortOrder: 4 },
]

export const testEquipment: Equipment[] = [
  { id: 1, slug: 'bench', name: 'Bench' },
  { id: 2, slug: 'bar', name: 'Bar' },
]

export const testBodyRegions: BodyRegion[] = [
  { id: 1, slug: 'wrist', name: 'Wrist' },
  { id: 2, slug: 'shoulder', name: 'Shoulder' },
]

function ex(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'slug' | 'name' | 'patternId' | 'level' | 'metricType'>): Exercise {
  return {
    repMin: null,
    repMax: null,
    holdMinS: null,
    holdMaxS: null,
    distanceMinM: null,
    distanceMaxM: null,
    isUnilateral: false,
    demoUrl: null,
    cues: null,
    isActive: true,
    ...partial,
  }
}

export const testExercises: Exercise[] = [
  ex({ id: 1, slug: 'test_push_1', name: 'Push L1', patternId: 1, level: 1, metricType: 'reps', repMin: 8, repMax: 15 }),
  ex({ id: 2, slug: 'test_push_2', name: 'Push L2', patternId: 1, level: 2, metricType: 'reps', repMin: 6, repMax: 12 }),
  ex({ id: 3, slug: 'test_push_3', name: 'Push L3', patternId: 1, level: 3, metricType: 'reps', repMin: 6, repMax: 12 }),
  ex({ id: 4, slug: 'test_push_4', name: 'Push L4', patternId: 1, level: 4, metricType: 'reps', repMin: 4, repMax: 8 }),

  ex({ id: 5, slug: 'test_pull_1', name: 'Pull L1', patternId: 2, level: 1, metricType: 'time_seconds', holdMinS: 15, holdMaxS: 30 }),
  ex({ id: 6, slug: 'test_pull_2', name: 'Pull L2', patternId: 2, level: 2, metricType: 'reps', repMin: 6, repMax: 12 }),
  ex({ id: 7, slug: 'test_pull_3', name: 'Pull L3', patternId: 2, level: 3, metricType: 'reps', repMin: 4, repMax: 8 }),

  ex({ id: 8, slug: 'test_core_1', name: 'Core L1', patternId: 3, level: 1, metricType: 'reps', repMin: 8, repMax: 15 }),
  ex({ id: 9, slug: 'test_core_2', name: 'Core L2', patternId: 3, level: 2, metricType: 'time_seconds', holdMinS: 20, holdMaxS: 40 }),

  ex({ id: 10, slug: 'test_skill_1', name: 'Skill L1', patternId: 4, level: 1, metricType: 'time_seconds', holdMinS: 10, holdMaxS: 20 }),
]

export const testEdges: ProgressionEdge[] = [
  { fromExerciseId: 1, toExerciseId: 2, kind: 'progression' },
  { fromExerciseId: 2, toExerciseId: 3, kind: 'progression' },
  { fromExerciseId: 3, toExerciseId: 4, kind: 'progression' },
  { fromExerciseId: 5, toExerciseId: 6, kind: 'progression' },
  { fromExerciseId: 6, toExerciseId: 7, kind: 'progression' },
  { fromExerciseId: 8, toExerciseId: 9, kind: 'progression' },
]

export const testExerciseEquipment: ExerciseEquipment[] = [
  { exerciseId: 3, equipmentId: 1, alternativeGroup: 0 }, // push L3 needs bench
  { exerciseId: 4, equipmentId: 1, alternativeGroup: 0 }, // push L4 needs bench
  { exerciseId: 6, equipmentId: 2, alternativeGroup: 0 }, // pull L2 needs bar
  { exerciseId: 7, equipmentId: 2, alternativeGroup: 0 }, // pull L3 needs bar
  { exerciseId: 9, equipmentId: 1, alternativeGroup: 1 }, // core L2 needs bench OR bar
  { exerciseId: 9, equipmentId: 2, alternativeGroup: 1 },
]

export const testContraindications: ExerciseContraindication[] = [
  { exerciseId: 4, regionId: 1, severity: 'avoid' }, // push L4 vs wrist
  { exerciseId: 7, regionId: 2, severity: 'caution' }, // pull L3 vs shoulder (caution, not avoid)
]
