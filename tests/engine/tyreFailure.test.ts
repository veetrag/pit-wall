import { describe, it, expect } from 'vitest'
import { initRace, stepSector, computeSectorTime } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, CarState, CircuitSpec } from '@engine/types'

// Feedback: wrong-compound-for-weather penalties were too weak, and there
// was no real consequence for running tyres far past the cliff — an
// ever-steeper but always-survivable time-loss curve doesn't make "don't
// wreck your tyres" a real constraint. This adds a puncture/mechanical
// failure risk (tuning.tyreFailure) and substantially raises the flat
// crossover penalty for the wrong compound in the wrong weather.

const REFERENCE_CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 30,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

const DATA = loadGameData()

function makeCar(overrides: Partial<CarState> & { driverId: string; teamId: string }): CarState {
  return {
    position: 1, raceTime: 0, lap: 10, sector: 1, compound: 'M', tyreAge: 5,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: overrides.teamId, startCompound: 'M', plannedStops: [], brain: 'naive' },
    isPlayer: true, // no AI auto-pit — isolates the mechanic under test
    tyreAllocation: { S: 99, M: 99, H: 99, I: 99, W: 99 },
    compoundsUsed: ['M'],
    lapsInDirtyAir: 0, retired: false, retiredLap: null,
    ...overrides,
  }
}

function makeState(cars: CarState[]): RaceState {
  return {
    lap: 10, sector: 1, totalLaps: 30, cars, sectorResults: [], overtakeEvents: [],
    trackEvolutionLaps: 10, rngState: 1,
    weatherTimeline: Array(30).fill('DRY'), weatherState: 'DRY',
  }
}

function makeSingleCarConfig(): RaceConfig {
  const facets = { pace: 70, racecraft: 70, tyreManagement: 50, consistency: 70, wetWeather: 50, experience: 70 }
  const teamFacets = { power: 70, aero: 70, handling: 70, reliability: 99, pitCrew: 70 }
  return {
    circuit: REFERENCE_CIRCUIT,
    tuning: DATA.tuning,
    compounds: DATA.compounds,
    drivers: [{ id: 'lone', name: 'Lone', code: 'LON', teamId: 'lone', facets }],
    teams: [{ id: 'lone', name: 'Lone', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets }],
    strategies: [{ teamId: 'lone', startCompound: 'M', plannedStops: [], brain: 'naive' }],
    playerDriverId: 'none',
    seed: 1,
  }
}

describe('tyre failure: puncture/crash risk from extreme tyre degradation', () => {
  it('a car deliberately run far past the cliff retires in most seeds within a few laps', () => {
    const config = makeSingleCarConfig()
    const SEEDS = 200
    const LAPS = 5
    let retiredCount = 0

    for (let seed = 1; seed <= SEEDS; seed++) {
      // M compound cliff = 16 laps; tyreAge 60 is ~4x the cliff — recklessly
      // degraded, well past any AI would ever tolerate.
      let state = makeState([makeCar({ driverId: 'lone', teamId: 'lone', tyreAge: 60 })])
      const rng = createRng(seed)
      for (let i = 0; i < LAPS * 3; i++) {
        state = stepSector(config, state, rng)
      }
      if (state.cars[0]!.retired) retiredCount++
    }

    expect(retiredCount / SEEDS).toBeGreaterThanOrEqual(0.6)
  })

  it('a freshly-fitted tyre never triggers a failure roll', () => {
    const config = makeSingleCarConfig()
    for (let seed = 1; seed <= 50; seed++) {
      let state = makeState([makeCar({ driverId: 'lone', teamId: 'lone', tyreAge: 1 })])
      const rng = createRng(seed)
      for (let i = 0; i < 3 * 3; i++) {
        state = stepSector(config, state, rng)
      }
      expect(state.cars[0]!.retired).toBe(false)
    }
  })

  it('a retired car is frozen — no more raceTime, laps, or position changes', () => {
    const config = makeSingleCarConfig()
    // Force a retirement by using a seed already known (from the test above's
    // range) to trigger one within the first lap, then confirm it freezes.
    let state = makeState([
      makeCar({ driverId: 'lone', teamId: 'lone', tyreAge: 60 }),
    ])
    const rng = createRng(1)
    let retiredAt: RaceState | null = null
    for (let i = 0; i < 15 * 3 && !retiredAt; i++) {
      state = stepSector(config, state, rng)
      if (state.cars[0]!.retired) retiredAt = state
    }
    expect(retiredAt).not.toBeNull()
    const frozenTime = retiredAt!.cars[0]!.raceTime
    const frozenLap = retiredAt!.cars[0]!.lap
    let after = retiredAt!
    for (let i = 0; i < 6; i++) after = stepSector(config, after, rng)
    expect(after.cars[0]!.raceTime).toBe(frozenTime)
    expect(after.cars[0]!.lap).toBe(frozenLap)
  })
})

describe('tyre failure: well-managed tyres rarely trigger it', () => {
  it('a normal AI-managed field sees a low mean retirement count per race', () => {
    const data = loadGameData()
    const RACES = 100
    let totalRetirements = 0

    for (let i = 0; i < RACES; i++) {
      const seed = i * 7 + 13
      const config: RaceConfig = {
        circuit: REFERENCE_CIRCUIT,
        tuning: data.tuning,
        compounds: data.compounds,
        drivers: data.drivers.drivers,
        teams: data.cars.teams,
        strategies: data.strategies.defaults,
        playerDriverId: 'none',
        seed,
      }
      let state = initRace(config)
      const rng = createRng(seed)
      for (let s = 0; s < config.circuit.laps * 3; s++) state = stepSector(config, state, rng)
      totalRetirements += state.cars.filter(c => c.retired).length
    }

    expect(totalRetirements / RACES).toBeLessThan(1.0)
  }, 30_000)
})

describe('weather crossover penalty: significantly harsher for the wrong compound', () => {
  it('dry tyres in the wet now cost a meaningfully larger lap-time penalty than before', () => {
    const car = makeCar({ driverId: 'lone', teamId: 'lone', compound: 'M', tyreAge: 5 })
    const config = makeSingleCarConfig()
    const rng = createRng(1)

    let dryLapTime = 0
    let wetLapTime = 0
    for (let sector = 0 as 0 | 1 | 2; sector < 3; sector++) {
      dryLapTime += computeSectorTime(config, car, sector, rng, 'DRY').sectorTime
    }
    for (let sector = 0 as 0 | 1 | 2; sector < 3; sector++) {
      wetLapTime += computeSectorTime(config, car, sector, rng, 'WET').sectorTime
    }

    // Old crossoverPenalty ceiling was 4.0s/lap total; new value is 9.0s/lap
    // plus the wetDegMultiplier now also aging the tyre faster in the wet —
    // the combined gap should clear the old ceiling by a wide margin.
    expect(wetLapTime - dryLapTime).toBeGreaterThan(6)
  })
})
