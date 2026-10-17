import { describe, it, expect } from 'vitest'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { isSprintRound, sprintLaps, sprintPointsFor } from '@state/sprint'

describe('sprint rules', () => {
  it('rounds 4, 8 and 12 are sprint weekends (raceIndex is 0-based)', () => {
    expect([...Array(12).keys()].filter(isSprintRound)).toEqual([3, 7, 11])
  })
  it('a third of the distance, rounded', () => {
    expect(sprintLaps(40)).toBe(13)
    expect(sprintLaps(38)).toBe(13)
    expect(sprintLaps(60)).toBe(20)
  })
  it('8-7-6-5-4-3-2-1 to the top eight', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(sprintPointsFor)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0, 0])
  })
})

describe('buildRaceConfig for a sprint', () => {
  const plan = { startCompound: 'M' as const, plannedStops: [], wing: 3 as const }
  it('shortens the race, drops the two-compound rule even on pro, and clears the AI plans', () => {
    const c = buildRaceConfig(3042, 'd_voss', 'sol_desert', 'pro', plan, null, undefined, false, true)
    expect(c.lapsOverride).toBe(13)
    expect(c.mandatoryTwoCompound).toBe(false)
    expect(c.strategies.every(s => s.plannedStops.length === 0)).toBe(true)
    expect(c.playerStrategyOverride).toEqual({ teamId: 'apex', startCompound: 'M', plannedStops: [] })
  })
  it('a Grand Prix config is unchanged: no lapsOverride key at all', () => {
    const c = buildRaceConfig(3042, 'd_voss', 'sol_desert', 'pro', plan, null, undefined, false)
    expect('lapsOverride' in c).toBe(false)
    expect(c.mandatoryTwoCompound).toBe(true)
    expect(c.strategies.some(s => s.plannedStops.length > 0)).toBe(true)
  })
})
