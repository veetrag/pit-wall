import { describe, it, expect } from 'vitest'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { SeasonSnapshotSchema } from '@state/seasonPersistence'

describe('buildRaceConfig setups', () => {
  it('no wing in the strategy means no setups (quick race, scenarios, old saves)', () => {
    expect(buildRaceConfig(3, 'd_voss', 'veloce', 'rookie', { startCompound: 'M', plannedStops: [{ lap: 20, compound: 'H' }] }, null).setups).toBeUndefined()
    expect(buildRaceConfig(3, 'd_voss', 'veloce', 'rookie', null, null).setups).toBeUndefined()
    expect('setups' in buildRaceConfig(3, 'd_voss', 'veloce', 'rookie', null, null)).toBe(false)
  })
  it('a wing gives the player that level and every rival one', () => {
    const c = buildRaceConfig(3, 'd_voss', 'veloce', 'rookie', { startCompound: 'M', plannedStops: [], wing: 2 }, null)
    expect(c.setups?.['d_voss']).toBe(2)
    expect(Object.keys(c.setups ?? {})).toHaveLength(c.drivers.length)
  })
  it('a saved strategy without wing still parses', () => {
    // Only the playerStrategy sub-schema matters here; reuse it through the snapshot's shape.
    const shape = SeasonSnapshotSchema.shape.playerStrategy
    expect(shape.parse({ startCompound: 'M', plannedStops: [] })).toEqual({ startCompound: 'M', plannedStops: [] })
    expect(shape.parse({ startCompound: 'M', plannedStops: [], wing: 4 })?.wing).toBe(4)
  })
})
