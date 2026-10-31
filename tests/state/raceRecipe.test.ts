import { describe, it, expect, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
import { buildRaceConfig } from '@state/buildRaceConfig'
import { buildConfigFromRecipe, weatherCircuit, type RaceRecipe } from '@state/raceRecipe'
import { useRaceStore } from '@state/raceStore'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const BASE: RaceRecipe = {
  seed: 5042, playerDriverId: 'd_rossi', circuitId: 'aurora', difficulty: 'pro',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 22, compound: 'H' }], wing: 3 },
  overlay: { purchasedTiers: { power: 2 }, rivalDevelopment: { apex: 1.44 }, teamTiers: { zenith: -1 } },
  gridOrder: DATA.drivers.drivers.map(d => d.id).reverse(), dryStart: false, sprint: false, allDry: false,
  lapsPercent: 100, weather: 'circuit',
}

describe('race recipes', () => {
  it('a 100% / circuit recipe builds EXACTLY the config the career builds', () => {
    const r = BASE
    const career = buildRaceConfig(r.seed, r.playerDriverId, r.circuitId, r.difficulty, r.strategy, r.overlay, r.gridOrder ?? undefined, r.dryStart, r.sprint, r.allDry)
    expect(JSON.stringify(buildConfigFromRecipe(r))).toBe(JSON.stringify(career))
    expect('lapsOverride' in buildConfigFromRecipe(r)).toBe(false)
  })
  it('distance sets lapsOverride and scales AI planned stops into the raced laps (R28)', () => {
    const c = buildConfigFromRecipe({ ...BASE, lapsPercent: 50 })
    expect(c.lapsOverride).toBe(25)
    for (const s of c.strategies) for (const p of s.plannedStops) expect(p.lap).toBeLessThan(25)
    expect(buildConfigFromRecipe({ ...BASE, circuitId: 'veloce', lapsPercent: 25 }).lapsOverride).toBe(9)
  })
  it('weather mixes clone the circuit and never mutate game data', () => {
    const before = JSON.stringify(DATA.circuits['aurora'])
    expect(buildConfigFromRecipe({ ...BASE, weather: 'dry' }).allDry).toBe(true)
    const wet = buildConfigFromRecipe({ ...BASE, weather: 'wet' }).circuit
    expect(wet.rainProbability).toBe(0.85); expect(wet.weatherBias).toBe('wet')
    const ch = weatherCircuit(DATA.circuits['aurora']!, 'changeable', DATA.tuning)
    expect(ch.rainProbability).toBeCloseTo(Math.min(0.7, Math.max(0.25, 0.45 * 1.6)), 12)
    expect(ch.weatherBias).toBe('variable')
    expect(JSON.stringify(loadGameData().circuits['aurora'])).toBe(before)
  })
  it('the race store records the recipe of every season race, and it rebuilds that race', () => {
    const r = BASE
    useRaceStore.getState().startSeasonRace(r.playerDriverId, r.seed, r.circuitId, r.difficulty, r.strategy, r.overlay, r.gridOrder ?? undefined, r.dryStart)
    const { recipe, config } = useRaceStore.getState()
    expect(recipe).toEqual(BASE)
    expect(JSON.stringify(buildConfigFromRecipe(recipe!))).toBe(JSON.stringify(config))
  })
})
