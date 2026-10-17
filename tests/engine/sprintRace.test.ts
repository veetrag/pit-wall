import { describe, it, expect } from 'vitest'
import { initRace } from '@engine/index'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { runRace } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
function config(extra: Partial<RaceConfig>): RaceConfig {
  return {
    circuit: DATA.circuits['sol_desert']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults.map(s => ({ ...s, plannedStops: [] })),
    playerDriverId: '__none__', seed: 11, ...extra,
  }
}
function run(c: RaceConfig): RaceState {
  return runRace(c, c.seed)
}

describe('the laps override', () => {
  it('sets the race distance and the weather timeline length', () => {
    const s = initRace(config({ lapsOverride: 13 }))
    expect(s.totalLaps).toBe(13)
    expect(s.weatherTimeline).toHaveLength(13)
  })

  it('absent means the circuit distance', () => {
    expect(initRace(config({})).totalLaps).toBe(40)
  })

  it('a sprint finishes after 13 x 3 steps', () => {
    const final = run(config({ lapsOverride: 13 }))
    expect(final.lap).toBe(13)
  })
})

describe('no mandatory stop in a sprint', () => {
  it('a one-compound finisher takes no 30s penalty when mandatoryTwoCompound is off', () => {
    // The penalty draws no rng, so the two races are identical except for it.
    const off = run(config({ lapsOverride: 13, mandatoryTwoCompound: false }))
    const on = run(config({ lapsOverride: 13, mandatoryTwoCompound: true }))
    const penalty = DATA.tuning.tyreRules.twoCompoundPenaltySec
    let oneCompound = 0
    for (const car of off.cars) {
      const twin = on.cars.find(c => c.driverId === car.driverId)!
      if (car.retired || new Set(car.compoundsUsed).size >= 2) continue
      oneCompound++
      expect(twin.raceTime - car.raceTime, car.driverId).toBeCloseTo(penalty, 6)
    }
    expect(oneCompound, 'premise: cars ran the sprint on one compound').toBeGreaterThan(0)
  })
})
