import { beforeEach, describe, expect, it } from 'vitest'

import { storage } from './storage'

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips a JSON value', () => {
    storage.set('goal', { kcalTarget: 1930, days: ['mon', 'wed', 'fri'] })
    expect(storage.get('goal')).toEqual({ kcalTarget: 1930, days: ['mon', 'wed', 'fri'] })
  })

  it('returns null for a key that was never set', () => {
    expect(storage.get('nope')).toBeNull()
  })

  it('returns null (not a throw) for corrupted JSON already in storage', () => {
    window.localStorage.setItem('corrupt', '{not valid json')
    expect(storage.get('corrupt')).toBeNull()
  })

  it('remove() clears the key', () => {
    storage.set('temp', 1)
    storage.remove('temp')
    expect(storage.get('temp')).toBeNull()
  })
})
