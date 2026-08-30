import { describe, expect, it } from 'vitest'

import { fromRow, mergeByUpdatedAt, toRow } from './sync'

describe('toRow / fromRow', () => {
  it('converts camelCase keys to snake_case and back', () => {
    const obj = { userId: 'u1', mealPlanId: 'm1', servings: 2 }
    const row = toRow(obj)
    expect(row).toEqual({ user_id: 'u1', meal_plan_id: 'm1', servings: 2 })
    expect(fromRow(row)).toEqual(obj)
  })

  it('leaves array values untouched, only renaming the key', () => {
    const row = toRow({ sourceEntryIds: ['a', 'b', 'c'] })
    expect(row).toEqual({ source_entry_ids: ['a', 'b', 'c'] })
    expect(fromRow(row)).toEqual({ sourceEntryIds: ['a', 'b', 'c'] })
  })

  it('preserves null and false rather than dropping them', () => {
    const obj = { leftoverOfId: null, isLocked: false }
    expect(toRow(obj)).toEqual({ leftover_of_id: null, is_locked: false })
  })

  it('handles a digit right after the underscore (ingredients.kcal_per_100g)', () => {
    expect(fromRow({ kcal_per_100g: 165, fiber_per_100g: null })).toEqual({ kcalPer100g: 165, fiberPer100g: null })
  })
})

describe('mergeByUpdatedAt', () => {
  function row(id: string, updatedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { id, updatedAt, ...extra }
  }

  it('keeps the remote row when it is newer than the local one', () => {
    const local = [row('1', '2026-01-01T00:00:00Z', { value: 'old' })]
    const remote = [row('1', '2026-01-02T00:00:00Z', { value: 'new' })]
    const merged = mergeByUpdatedAt(local, remote, 'id', 'updatedAt')
    expect(merged).toEqual([row('1', '2026-01-02T00:00:00Z', { value: 'new' })])
  })

  it('keeps the local row when it is newer than the remote one', () => {
    const local = [row('1', '2026-01-02T00:00:00Z', { value: 'new' })]
    const remote = [row('1', '2026-01-01T00:00:00Z', { value: 'old' })]
    const merged = mergeByUpdatedAt(local, remote, 'id', 'updatedAt')
    expect(merged).toEqual([row('1', '2026-01-02T00:00:00Z', { value: 'new' })])
  })

  it('prefers the remote row on an exact tie', () => {
    const local = [row('1', '2026-01-01T00:00:00Z', { value: 'local' })]
    const remote = [row('1', '2026-01-01T00:00:00Z', { value: 'remote' })]
    const merged = mergeByUpdatedAt(local, remote, 'id', 'updatedAt')
    expect(merged[0].value).toBe('remote')
  })

  it('keeps a local-only row that the remote set has never seen', () => {
    const local = [row('1', '2026-01-01T00:00:00Z')]
    const remote: ReturnType<typeof row>[] = []
    expect(mergeByUpdatedAt(local, remote, 'id', 'updatedAt')).toEqual(local)
  })

  it('adds a remote-only row the local cache has never seen', () => {
    const local: ReturnType<typeof row>[] = []
    const remote = [row('1', '2026-01-01T00:00:00Z')]
    expect(mergeByUpdatedAt(local, remote, 'id', 'updatedAt')).toEqual(remote)
  })

  it('merges a mix of local-only, remote-only, and conflicting ids independently', () => {
    const local = [row('local-only', '2026-01-01T00:00:00Z'), row('conflict', '2026-01-01T00:00:00Z', { v: 'local' })]
    const remote = [row('remote-only', '2026-01-01T00:00:00Z'), row('conflict', '2026-01-03T00:00:00Z', { v: 'remote' })]
    const merged = mergeByUpdatedAt(local, remote, 'id', 'updatedAt')
    expect(merged).toHaveLength(3)
    expect(merged.find((r) => r.id === 'conflict')?.v).toBe('remote')
    expect(merged.some((r) => r.id === 'local-only')).toBe(true)
    expect(merged.some((r) => r.id === 'remote-only')).toBe(true)
  })
})
