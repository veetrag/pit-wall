import { describe, it, expect } from 'vitest'
import { initRace, stepSector, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('RaceConfig.gridOrder', () => {
  it('ABSENT gridOrder produces a byte-identical race to today', () => {
    /*
     * This is the assertion that protects byteIdentity.test.ts, the
     * Monte-Carlo bands in MODEL_SPEC.md 10.1, and all three scenarios in
     * src/data/scenarios.json -- every one of which is pinned to the fixed
     * drivers.json grid. If the fallback in initRace is ever removed, this
     * fails before any of those do, and with a clearer message.
     */
    const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    expect(config.gridOrder, 'buildRaceConfig must not set gridOrder by default').toBeUndefined()

    const run = () => {
      const rng = createRng(4242)
      let state = initRace(config)
      for (let i = 0; i < 30; i++) state = stepSector(config, state, rng)
      return state.cars.map(c => `${c.driverId}:${c.position}:${c.raceTime.toFixed(6)}`)
    }
    expect(run()).toEqual(run())

    // Grid order with no gridOrder is exactly drivers.json order.
    const fresh = initRace(config)
    expect(fresh.cars.map(c => c.driverId)).toEqual(config.drivers.map(d => d.id))
    expect(fresh.cars.map(c => c.position)).toEqual(config.drivers.map((_, i) => i + 1))
  })

  it('PRESENT gridOrder sets starting positions', () => {
    const base = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    const reversed = [...base.drivers.map(d => d.id)].reverse()
    const config = { ...base, gridOrder: reversed }
    const state = initRace(config)
    for (const [i, driverId] of reversed.entries()) {
      const car = state.cars.find(c => c.driverId === driverId)!
      expect(car.position, `${driverId} should start P${i + 1}`).toBe(i + 1)
    }
  })

  it('THROWS on a gridOrder that is not a permutation of the field', () => {
    /*
     * A bad gridOrder is a programming error, not a game state. Failing loudly
     * at the boundary beats producing a silently wrong grid that only shows up
     * as an inexplicable race result.
     */
    const base = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    const ids = base.drivers.map(d => d.id)

    expect(() => initRace({ ...base, gridOrder: ids.slice(0, -1) }), 'missing driver')
      .toThrow(/gridOrder/)
    expect(() => initRace({ ...base, gridOrder: [ids[0]!, ...ids] }), 'duplicate driver')
      .toThrow(/gridOrder/)
    expect(() => initRace({ ...base, gridOrder: [...ids.slice(1), 'd_nobody'] }), 'unknown driver')
      .toThrow(/gridOrder/)
  })
})
