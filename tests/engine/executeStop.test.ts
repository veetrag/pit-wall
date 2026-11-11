import { describe, it, expect } from 'vitest'
import { initRace } from '@engine/index'
import { executeStop, fitTyres, pitStopTime } from '@engine/pitStop'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()
function cfg(over: Partial<RaceConfig> = {}): RaceConfig {
  return {
    circuit: DATA.circuits['veloce']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams, strategies: DATA.strategies.defaults,
    playerDriverId: 'd_voss', seed: 77,
    allDry: true, playerStrategyOverride: { teamId: 'apex', startCompound: 'H', plannedStops: [] },
    ...over,
  }
}

// Spec 2026-10-24 §0.4, ruling A4. The projection's flag behaviour is pinned in projection.test.ts.
describe('one stop path (spec A4)', () => {
  it('fitTyres keeps key order and adds exactly addSeconds', () => {
    const car = initRace(cfg()).cars[0]!
    const out = fitTyres(cfg(), car, 'H', 21.5)
    expect(Object.keys(out)).toEqual(Object.keys(car))
    expect(out.raceTime).toBe(car.raceTime + 21.5)
    expect(out).toMatchObject({ compound: 'H', tyreAge: 0, pitsDone: car.pitsDone + 1, compoundsUsed: [...car.compoundsUsed, 'H'] })
    expect(out.tyreAllocation.H).toBe(car.tyreAllocation.H - 1)
  })

  it('executeStop draws exactly one gaussianPair and charges exactly pitStopTime().total with 2.0 off', () => {
    const config = cfg()
    const car = initRace(config).cars[0]!
    let calls = 0
    const base = createRng(5)
    const counting = () => { calls++; return base() }
    const out = executeStop(config, { safetyCar: null, lap: 3, sector: 2 }, car, 'H', counting)
    expect(calls).toBe(2)
    const expected = pitStopTime(config, car.teamId, null, createRng(5))
    expect(out.car.raceTime).toBe(car.raceTime + expected.total)
    expect(out.cost).toEqual(expected)
    expect(out).toMatchObject({ queue: 0, served: 0, unsafe: false, events: [] })
    expect(out.boxFree).toBeUndefined()
  })

  it('a slow stop is logged with the context lap and sector', () => {
    const config = cfg({ tuning: makeDeterministicTuning({ pit: { slowStopChance: 1, pitCrewSlowRelief: 0 } }) })
    const car = initRace(config).cars[0]!
    const out = executeStop(config, { safetyCar: null, lap: 9, sector: 1 }, car, 'M', createRng(1))
    expect(out.cost.slow).toBeGreaterThan(0)
    expect(out.events).toEqual([{ lap: 9, sector: 1, kind: 'slow_stop', driverId: car.driverId, timeLoss: out.cost.slow }])
  })
})
