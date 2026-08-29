import { describe, expect, it } from 'vitest'

import type { GroceryItem, GroceryList, MealPlan, MealPlanEntry } from '@/types/domain'

import { materializeGroceryList, materializeMealPlan } from './materializeMealPlan'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function draftPlan(): MealPlan {
  return {
    id: 'draft-plan',
    userId: 'u1',
    weekStartsOn: '2026-08-31',
    kcalTarget: 1930,
    proteinTargetG: 180,
    carbTargetG: 190,
    fatTargetG: 60,
    generatorVersion: 'test',
    seed: 1,
    regenCount: 0,
    status: 'active',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  }
}

function draftEntry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    mealPlanId: 'draft-plan',
    serveOn: '2026-08-31',
    slot: 'dinner',
    recipeId: 'chicken-stir-fry',
    servings: 2,
    isLocked: false,
    leftoverOfId: null,
    ...overrides,
  }
}

describe('materializeMealPlan', () => {
  it('replaces every synthetic id with a real UUID', () => {
    const result = materializeMealPlan({ plan: draftPlan(), entries: [draftEntry({ id: 'draft-meal-d0-dinner' })] })
    expect(result.plan.id).toMatch(UUID_RE)
    expect(result.entries[0].id).toMatch(UUID_RE)
    expect(result.entries[0].mealPlanId).toBe(result.plan.id)
  })

  it('remaps leftoverOfId to the parent\'s REMAPPED id, not the old draft id', () => {
    const result = materializeMealPlan({
      plan: draftPlan(),
      entries: [
        draftEntry({ id: 'draft-meal-d0-dinner' }),
        draftEntry({ id: 'draft-meal-d2-dinner', serveOn: '2026-09-02', leftoverOfId: 'draft-meal-d0-dinner' }),
      ],
    })
    const parent = result.entries.find((e) => e.serveOn === '2026-08-31')!
    const leftover = result.entries.find((e) => e.serveOn === '2026-09-02')!
    expect(leftover.leftoverOfId).toBe(parent.id)
    expect(leftover.leftoverOfId).not.toBe('draft-meal-d0-dinner')
  })

  it('reuses an existing plan id when given one, for a regenerate/swap in place', () => {
    const result = materializeMealPlan({ plan: draftPlan(), entries: [draftEntry({ id: 'draft-meal-d0-dinner' })] }, { existingPlanId: 'real-plan-1' })
    expect(result.plan.id).toBe('real-plan-1')
    expect(result.entries[0].mealPlanId).toBe('real-plan-1')
  })

  it('passes an already-real entry id through unchanged (a kept/locked entry from regenerateWeek/swapOneMeal)', () => {
    const result = materializeMealPlan({
      plan: draftPlan(),
      entries: [draftEntry({ id: 'already-real-uuid', isLocked: true }), draftEntry({ id: 'draft-meal-d1-dinner', serveOn: '2026-09-01' })],
    })
    expect(result.entries.find((e) => e.isLocked)!.id).toBe('already-real-uuid')
    expect(result.entries.find((e) => !e.isLocked)!.id).toMatch(UUID_RE)
  })

  it('a leftover pointing at an already-real (kept) parent resolves correctly too', () => {
    const result = materializeMealPlan({
      plan: draftPlan(),
      entries: [
        draftEntry({ id: 'already-real-parent', isLocked: true }),
        draftEntry({ id: 'draft-meal-d2-dinner', serveOn: '2026-09-02', leftoverOfId: 'already-real-parent' }),
      ],
    })
    const leftover = result.entries.find((e) => e.serveOn === '2026-09-02')!
    expect(leftover.leftoverOfId).toBe('already-real-parent')
  })

  it('throws rather than silently dropping a leftover whose parent is missing from the draft', () => {
    expect(() =>
      materializeMealPlan({ plan: draftPlan(), entries: [draftEntry({ id: 'draft-meal-d2-dinner', leftoverOfId: 'draft-meal-d9-dinner' })] }),
    ).toThrow(/leftoverOfId draft-meal-d9-dinner/)
  })
})

function draftGroceryList(): GroceryList {
  return {
    id: 'draft-grocery-list',
    userId: 'u1',
    mealPlanId: 'plan-1',
    title: 'This week',
    status: 'active',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
  }
}

function draftGroceryItem(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id'>): GroceryItem {
  return {
    listId: 'draft-grocery-list',
    ingredientId: 'chicken',
    manualLabel: null,
    totalGrams: 200,
    displayQuantity: 200,
    displayUnitId: 1,
    aisleId: 1,
    isChecked: false,
    checkedAt: null,
    sourceEntryIds: [],
    sortIndex: 0,
    updatedAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('materializeGroceryList', () => {
  it('replaces every synthetic id with a real UUID', () => {
    const result = materializeGroceryList({ list: draftGroceryList(), items: [draftGroceryItem({ id: 'draft-grocery-item-chicken' })] })
    expect(result.list.id).toMatch(UUID_RE)
    expect(result.items[0].id).toMatch(UUID_RE)
    expect(result.items[0].listId).toBe(result.list.id)
  })

  it('reuses an existing list id when given one', () => {
    const result = materializeGroceryList({ list: draftGroceryList(), items: [] }, { existingListId: 'real-list-1' })
    expect(result.list.id).toBe('real-list-1')
  })

  it('gives every item a DISTINCT id, never reusing one by accident', () => {
    const result = materializeGroceryList({
      list: draftGroceryList(),
      items: [draftGroceryItem({ id: 'draft-grocery-item-chicken' }), draftGroceryItem({ id: 'draft-grocery-item-broccoli', ingredientId: 'broccoli' })],
    })
    expect(result.items[0].id).not.toBe(result.items[1].id)
  })
})
