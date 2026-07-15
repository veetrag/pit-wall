import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, CarState, CircuitSpec } from '@engine/types'

// M4: track position & traffic — pace mode must convert into real overtake
// probability, worn tyres must be genuinely passable, and equal pace/tyres
// must NOT reliably reorder the field (position still has value).

const REFERENCE_CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 30,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

const TUNING_FIXTURE = loadGameData().tuning
const COMPOUNDS_FIXTURE = loadGameData().compounds

// Two identical cars/drivers/teams so car/driver pace-advantage terms are
// exactly zero — isolates whichever lever a given test is probing.
function makeTwoCarConfig(): RaceConfig {
  const facets = { pace: 70, racecraft: 70, tyreManagement: 70, consistency: 70, wetWeather: 70, experience: 70 }
  const teamFacets = { power: 70, aero: 70, handling: 70, reliability: 99, pitCrew: 70 }
  return {
    circuit: REFERENCE_CIRCUIT,
    tuning: TUNING_FIXTURE,
    compounds: COMPOUNDS_FIXTURE,
    drivers: [
      { id: 'attacker', name: 'Attacker', code: 'ATK', teamId: 'attacker', facets },
      { id: 'defender', name: 'Defender', code: 'DEF', teamId: 'defender', facets },
    ],
    teams: [
      { id: 'attacker', name: 'Attacker', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets },
      { id: 'defender', name: 'Defender', colorPrimary: '#fff', colorSecondary: '#000', facets: teamFacets },
    ],
    strategies: [
      { teamId: 'attacker', startCompound: 'M', plannedStops: [], brain: 'naive' },
      { teamId: 'defender', startCompound: 'M', plannedStops: [], brain: 'naive' },
    ],
    playerDriverId: 'none',
    seed: 1,
  }
}

function makeCar(overrides: Partial<CarState> & { driverId: string; teamId: string }): CarState {
  return {
    position: 1, raceTime: 0, lap: 10, sector: 1, compound: 'M', tyreAge: 5,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: overrides.teamId, startCompound: 'M', plannedStops: [], brain: 'naive' },
    // Marking both cars as the "player" sidesteps AI pit/pace-mode decisions
    // entirely, so nothing but the mechanic under test can move the needle.
    isPlayer: true,
    tyreAllocation: { S: 99, M: 99, H: 99, I: 99, W: 99 },
    compoundsUsed: ['M'],
    lapsInDirtyAir: 0,
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

function overtakeRate(
  config: RaceConfig,
  buildCars: () => CarState[],
  trials: number,
): number {
  let overtakes = 0
  for (let seed = 1; seed <= trials; seed++) {
    const state = makeState(buildCars())
    const next = stepSector(config, state, createRng(seed))
    if (next.overtakeEvents.length > 0) overtakes++
  }
  return overtakes / trials
}

describe('M4: pace mode converts to overtake probability', () => {
  it('a PUSH attacker passes materially more often than an all-NEUTRAL baseline', () => {
    const config = makeTwoCarConfig()
    const gap = 0.3 // within gapThreshold (1.0s)

    const pushRate = overtakeRate(config, () => [
      makeCar({ driverId: 'attacker', teamId: 'attacker', raceTime: gap, paceMode: 'push' }),
      makeCar({ driverId: 'defender', teamId: 'defender', raceTime: 0, paceMode: 'neutral' }),
    ], 300)

    const baselineRate = overtakeRate(config, () => [
      makeCar({ driverId: 'attacker', teamId: 'attacker', raceTime: gap, paceMode: 'neutral' }),
      makeCar({ driverId: 'defender', teamId: 'defender', raceTime: 0, paceMode: 'neutral' }),
    ], 300)

    expect(pushRate).toBeGreaterThan(baselineRate)
    expect(pushRate).toBeGreaterThan(0.05)
  })
})

describe('M4: worn tyres are passable', () => {
  it('a fresh-tyre pursuer clears a leader well past the cliff within a bounded number of laps, in most seeds', () => {
    const config = makeTwoCarConfig()
    const SEEDS = 60
    const MAX_LAPS = 6
    let cleared = 0

    // Driver ids just have to match makeTwoCarConfig's roster; here "attacker"
    // plays the worn-tyre leader and "defender" plays the fresh-tyre pursuer.
    for (let seed = 1; seed <= SEEDS; seed++) {
      let state = makeState([
        makeCar({ driverId: 'attacker', teamId: 'attacker', position: 1, raceTime: 0, tyreAge: 40 }),
        makeCar({ driverId: 'defender', teamId: 'defender', position: 2, raceTime: 0.3, tyreAge: 2 }),
      ])
      const rng = createRng(seed)
      for (let i = 0; i < MAX_LAPS * 3; i++) {
        state = stepSector(config, state, rng)
      }
      const pursuer = state.cars.find(c => c.driverId === 'defender')!
      if (pursuer.position === 1) cleared++
    }

    expect(cleared / SEEDS).toBeGreaterThanOrEqual(0.5)
  })
})

describe('M4: position still has value', () => {
  it('equal pace and equal tyres does not reliably produce a pass', () => {
    const config = makeTwoCarConfig()
    const gap = 0.3

    const rate = overtakeRate(config, () => [
      makeCar({ driverId: 'attacker', teamId: 'attacker', raceTime: gap }),
      makeCar({ driverId: 'defender', teamId: 'defender', raceTime: 0 }),
    ], 300)

    expect(rate).toBeLessThan(0.05)
  })
})
