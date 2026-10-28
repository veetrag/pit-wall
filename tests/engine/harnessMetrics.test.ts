import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'

describe('harness metrics added for circuit authoring', () => {
  it('reports stops per classified car and tyre DNFs per car-race', () => {
    const m = runRaces({ races: 6, circuitIds: ['veloce'] })
    expect(m.meanStopsPerClassifiedCar).toBeGreaterThan(0.5)
    expect(m.meanStopsPerClassifiedCar).toBeLessThan(5)
    expect(m.tyreDnfPerCarRace).toBeGreaterThanOrEqual(0)
    expect(m.tyreDnfPerCarRace).toBeLessThan(0.2)
  }, 60_000)
})
