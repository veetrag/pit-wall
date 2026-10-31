import { describe, it, expect, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
import { useRaceStore } from '@state/raceStore'
import { makeCustomStart, rederive, startChallenge } from '@state/customStart'
import { handoverFromCalls } from '@engine/customStart'
import { buildConfigFromRecipe, type RaceRecipe } from '@state/raceRecipe'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 21, compound: 'H' }], wing: 3 },
  overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}

describe('playing a custom start', () => {
  it('starts racing at the handover, from the recipe, with the live rng', () => {
    const lap = [10, 15, 20, 25, 30].find(l => makeCustomStart(RECIPE, [], l).ok)!
    const made = makeCustomStart(RECIPE, [], lap)
    if (!made.ok) throw new Error('premise')
    const spec = startChallenge('00000001', made.payload, rederive(made.payload)!)
    useRaceStore.getState().startCustomStartRace(spec)
    const s = useRaceStore.getState()
    expect(s.phase).toBe('racing')
    expect(s.stepCount).toBe(0)
    const expected = handoverFromCalls(buildConfigFromRecipe(RECIPE), [], lap).state
    expect(JSON.stringify(s.raceState)).toBe(JSON.stringify(expected))
    expect(s.recipe).toBeNull()   // a start is not itself a recipe race (R20)
  }, 60_000)
})
