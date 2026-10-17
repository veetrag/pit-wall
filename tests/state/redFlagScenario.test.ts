import { describe, it, expect, vi } from 'vitest'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { useRaceStore } from '@state/raceStore'
import { neutralisationKind } from '@engine/incidents'
import { loadGameData } from '@data/validators'

describe('Red Flag Restart (spec 1.6 §8)', () => {
  it('opens racing under a standing red flag, and reaches the RED FLAG card within the lap', () => {
    const spec = loadGameData().scenarios.find(s => s.id === 'red_flag_restart')!
    useRaceStore.getState().startScenarioRace(spec)
    expect(useRaceStore.getState().phase).toBe('racing')
    expect(neutralisationKind(useRaceStore.getState().raceState!.safetyCar)).toBe('red')
    for (let i = 0; i < 3 && useRaceStore.getState().phase === 'racing'; i++) useRaceStore.getState().step()
    expect(useRaceStore.getState().phase, 'the restart tyre is the player\'s call').toBe('red_flag')
  })
})
