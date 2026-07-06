import { describe, it, expect } from 'vitest'
import { tyreDelta, tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import { loadGameData } from '@data/validators'
import type { CarState, CompoundSpec, DriverSpec } from '@engine/types'

const soft: CompoundSpec = { name: 'Soft', type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10, colorToken: '--tyre-soft' }
const medium: CompoundSpec = { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' }
const hard: CompoundSpec = { name: 'Hard', type: 'dry', offset: 0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' }

describe('tyreDelta', () => {
  it('fresh soft is faster than fresh medium (negative delta)', () => {
    expect(tyreDelta(soft, 0)).toBeLessThan(tyreDelta(medium, 0))
  })

  it('fresh hard is slower than fresh medium (positive delta)', () => {
    expect(tyreDelta(hard, 0)).toBeGreaterThan(tyreDelta(medium, 0))
  })

  it('increases linearly before cliff', () => {
    const d5 = tyreDelta(soft, 5)
    const d10 = tyreDelta(soft, 10)
    const gap = d10 - d5
    expect(gap).toBeCloseTo(5 * soft.lin, 3)
  })

  it('soft past cliff (age 20) is worse than at age 12', () => {
    expect(tyreDelta(soft, 20)).toBeGreaterThan(tyreDelta(soft, 12))
  })

  it('cliff penalty grows superlinearly after cliff (quadratic component)', () => {
    const atCliff = tyreDelta(soft, soft.cliff)
    const twoLapsOver = tyreDelta(soft, soft.cliff + 2)
    const fourLapsOver = tyreDelta(soft, soft.cliff + 4)
    const gap2 = twoLapsOver - atCliff
    const gap4 = fourLapsOver - atCliff
    // gap4/gap2 > 3 confirms superlinear (quadratic) growth past the cliff
    expect(gap4 / gap2).toBeGreaterThan(3)
  })
})

describe('tyreCliffFraction', () => {
  it('returns 0 for age 0', () => {
    expect(tyreCliffFraction(soft, 0)).toBe(0)
  })

  it('returns 1.0 at cliff lap', () => {
    expect(tyreCliffFraction(soft, soft.cliff)).toBeCloseTo(1.0, 5)
  })

  it('returns > 1 past cliff', () => {
    expect(tyreCliffFraction(soft, soft.cliff + 5)).toBeGreaterThan(1)
  })
})

describe('effectiveTyreAge', () => {
  const data = loadGameData()
  const tuning = data.tuning
  const driver: DriverSpec = {
    id: 'd1', name: 'D1', code: 'D1X', teamId: 't1',
    facets: { pace: 80, racecraft: 80, tyreManagement: 80, consistency: 80, wetWeather: 80, experience: 80 },
  }
  const noManagementDriver: DriverSpec = { ...driver, facets: { ...driver.facets, tyreManagement: 0 } }

  function makeCar(overrides: Partial<CarState> = {}): CarState {
    return {
      driverId: 'd1', teamId: 't1', position: 1, raceTime: 0, lap: 5,
      sector: 0, compound: 'M', tyreAge: 10, paceMode: 'neutral', pitted: false,
      pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
      isPlayer: false,
      ...overrides,
    }
  }

  it('equals raw age on a dry compound in dry weather at neutral pace with no management', () => {
    const car = makeCar({ compound: 'M', tyreAge: 10, paceMode: 'neutral' })
    expect(effectiveTyreAge(car, noManagementDriver, 'DRY', tuning)).toBeCloseTo(10, 5)
  })

  it('good tyre management defers the cliff (lower effective age)', () => {
    const car = makeCar({ compound: 'M', tyreAge: 10, paceMode: 'neutral' })
    const managed = effectiveTyreAge(car, driver, 'DRY', tuning)
    const unmanaged = effectiveTyreAge(car, noManagementDriver, 'DRY', tuning)
    expect(managed).toBeLessThan(unmanaged)
  })

  it('PUSH accelerates wear, CONSERVE defers it, relative to NEUTRAL', () => {
    const neutral = effectiveTyreAge(makeCar({ paceMode: 'neutral' }), noManagementDriver, 'DRY', tuning)
    const push = effectiveTyreAge(makeCar({ paceMode: 'push' }), noManagementDriver, 'DRY', tuning)
    const conserve = effectiveTyreAge(makeCar({ paceMode: 'conserve' }), noManagementDriver, 'DRY', tuning)
    expect(push).toBeGreaterThan(neutral)
    expect(conserve).toBeLessThan(neutral)
  })

  // Regression: wet-weather compounds run in the wrong conditions must "feel" the
  // cliff much sooner than their raw cliff spec suggests — this was the bug where
  // the HUD/AI showed a full wet tyre as barely worn deep into a dry stint.
  it('a full wet tyre in DRY conditions reaches the cliff far sooner than its raw spec implies', () => {
    const wetSpec = data.compounds['W']!
    const car = makeCar({ compound: 'W', tyreAge: 20, paceMode: 'neutral' })
    const effAge = effectiveTyreAge(car, noManagementDriver, 'DRY', tuning)
    const rawFraction = tyreCliffFraction(wetSpec, car.tyreAge)
    const effFraction = tyreCliffFraction(wetSpec, effAge)
    expect(effAge).toBeGreaterThan(car.tyreAge)
    expect(effFraction).toBeGreaterThan(rawFraction)
    // at raw age 20 on a cliff=40 wet tyre, the naive (bugged) reading looked half-worn
    expect(rawFraction).toBeCloseTo(0.5, 1)
    // the real, weather-adjusted reading should already be at or past the cliff
    expect(effFraction).toBeGreaterThanOrEqual(1.0)
  })

  it('an inter in DRY conditions also wears meaningfully faster than raw age suggests', () => {
    const interSpec = data.compounds['I']!
    const car = makeCar({ compound: 'I', tyreAge: 20, paceMode: 'neutral' })
    const effAge = effectiveTyreAge(car, noManagementDriver, 'DRY', tuning)
    expect(tyreCliffFraction(interSpec, effAge)).toBeGreaterThan(tyreCliffFraction(interSpec, car.tyreAge))
  })

  it('a dry compound is unaffected by weather-mismatch multipliers', () => {
    const car = makeCar({ compound: 'M', tyreAge: 10, paceMode: 'neutral' })
    const dry = effectiveTyreAge(car, noManagementDriver, 'DRY', tuning)
    const wet = effectiveTyreAge(car, noManagementDriver, 'WET', tuning)
    expect(dry).toBeCloseTo(wet, 5)
  })
})
