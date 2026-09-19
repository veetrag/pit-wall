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

describe('the grid is a time deficit, not a label', () => {
  it('STARTING LAST IS NOT THE SAME RACE AS STARTING ON POLE', () => {
    /*
     * stepSector re-derives position from raceTime on every tick, and every car
     * starts at raceTime 0. So assigning `position` in initRace does NOTHING on
     * its own -- the grid evaporates on the first sector.
     *
     * Measured before the fix: d_voss starting pole and d_voss starting last
     * both finished P17 on 2530.682s, identical to the millisecond. The whole
     * qualifying feature was cosmetic and every test still passed, because
     * nothing asserted that the grid REACHED the race.
     *
     * initRace now seeds raceTime with (slot - 1) * gridSlotGapSec.
     */
    const base = buildRaceConfig(1, '__none__', 'bengaluru', 'rookie', null, null)
    const ids = base.drivers.map(d => d.id)
    const SUBJECT = ids[0]!
    const run = (gridOrder: string[]) => {
      const config = { ...base, gridOrder }
      const rng = createRng(1)
      let state = initRace(config)
      for (let i = 0; i < config.circuit.laps * 3; i++) state = stepSector(config, state, rng)
      return state.cars.find(c => c.driverId === SUBJECT)!.raceTime
    }
    const pole = run([SUBJECT, ...ids.filter(i => i !== SUBJECT)])
    const last = run([...ids.filter(i => i !== SUBJECT), SUBJECT])
    expect(pole, 'starting last must not produce the same race as starting on pole').not.toBe(last)
  }, 60_000)

  it('THE DEFICIT IS EXACTLY THE SLOT GAP, AND ZERO WITHOUT A GRID', () => {
    const base = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    const gap = base.tuning.qualifying.gridSlotGapSec
    const ids = base.drivers.map(d => d.id)

    // No grid: every car starts level, which is what keeps byteIdentity, the
    // Monte-Carlo bands and all three scenarios valid.
    for (const car of initRace(base).cars) expect(car.raceTime).toBe(0)

    const reversed = [...ids].reverse()
    const state = initRace({ ...base, gridOrder: reversed })
    for (const [i, driverId] of reversed.entries()) {
      const car = state.cars.find(c => c.driverId === driverId)!
      expect(car.raceTime, `${driverId} starting P${i + 1}`).toBeCloseTo(i * gap, 10)
    }
  })
})
