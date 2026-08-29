import { describe, expect, it } from 'vitest'

import type { Ingredient, IngredientUnit, Unit } from '@/types/domain'

import { buildUnitResolutionIndex, resolveGrams } from './unitResolution'

const GRAM: Unit = { id: 1, slug: 'g', name: 'gram', dimension: 'mass', baseFactor: 1 }
const KG: Unit = { id: 2, slug: 'kg', name: 'kilogram', dimension: 'mass', baseFactor: 1000 }
const CUP: Unit = { id: 3, slug: 'cup', name: 'cup', dimension: 'volume', baseFactor: 236.588 }
const CLOVE: Unit = { id: 4, slug: 'clove', name: 'clove', dimension: 'count', baseFactor: 1 }
const EACH: Unit = { id: 5, slug: 'each', name: 'each', dimension: 'count', baseFactor: 1 }
const UNITS = [GRAM, KG, CUP, CLOVE, EACH]

function ingredient(overrides: Partial<Ingredient> & Pick<Ingredient, 'id'>): Ingredient {
  return {
    slug: overrides.id,
    name: overrides.id,
    aisleId: 1,
    densityGPerMl: null,
    gramsPerEach: null,
    kcalPer100g: 0,
    proteinPer100g: 0,
    carbPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: null,
    fdcId: null,
    isPantryStaple: false,
    isActive: true,
    ...overrides,
  }
}

describe('resolveGrams', () => {
  it('resolves a mass unit via baseFactor alone', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const chicken = ingredient({ id: 'chicken' })
    expect(resolveGrams(index, chicken, GRAM.id, 300)).toBe(300)
    expect(resolveGrams(index, chicken, KG.id, 0.3)).toBe(300)
  })

  it('resolves a volume unit via density_g_per_ml', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const oliveOil = ingredient({ id: 'olive_oil', densityGPerMl: 0.916 })
    // 2 tbsp-equivalent via cup's baseFactor for a round check: 1 cup * 0.916 g/ml
    expect(resolveGrams(index, oliveOil, CUP.id, 1)).toBeCloseTo(236.588 * 0.916, 6)
  })

  it('throws for a volume unit with no density and no override', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const mystery = ingredient({ id: 'mystery' })
    expect(() => resolveGrams(index, mystery, CUP.id, 1)).toThrow(/density_g_per_ml/)
  })

  it('resolves a count unit via grams_per_each', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const egg = ingredient({ id: 'egg', gramsPerEach: 50 })
    expect(resolveGrams(index, egg, EACH.id, 2)).toBe(100)
  })

  it('throws for a count unit with no grams_per_each and no override', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const mystery = ingredient({ id: 'mystery' })
    expect(() => resolveGrams(index, mystery, EACH.id, 1)).toThrow(/grams_per_each/)
  })

  it('an ingredient_units override beats density/grams_per_each', () => {
    const garlic = ingredient({ id: 'garlic' }) // no density, no gramsPerEach at all
    const overrides: IngredientUnit[] = [{ ingredientId: 'garlic', unitId: CLOVE.id, grams: 3 }]
    const index = buildUnitResolutionIndex(UNITS, overrides)
    expect(resolveGrams(index, garlic, CLOVE.id, 2)).toBe(6)
  })

  it('an override is scoped to its specific ingredient, not applied globally', () => {
    const overrides: IngredientUnit[] = [{ ingredientId: 'garlic', unitId: CLOVE.id, grams: 3 }]
    const index = buildUnitResolutionIndex(UNITS, overrides)
    const ginger = ingredient({ id: 'ginger' }) // no override of its own for 'clove'
    expect(() => resolveGrams(index, ginger, CLOVE.id, 1)).toThrow()
  })

  it('throws for a completely unknown unit id', () => {
    const index = buildUnitResolutionIndex(UNITS, [])
    const chicken = ingredient({ id: 'chicken' })
    expect(() => resolveGrams(index, chicken, 9999, 1)).toThrow(/unknown unit/)
  })
})
