import { describe, it, expect } from 'vitest'
import { aiDecision } from '@engine/strategy'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type {
  RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec, StrategyBrain, SafetyCarState, WeatherState,
} from '@engine/types'

const TUNING: TuningConstants = makeDeterministicTuning({ ai: { neutralisationWindowLaps: 6, neutralisationCliffFrac: 0.55 } })

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10,  colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07,  colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
}

const CIRCUIT: CircuitSpec = {
  name: 'Strat', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

// tyreManagement 80 -> effective age = 0.8 x tyreAge on neutral pace in the dry.
function makeConfig(brain: StrategyBrain): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'D1', code: 'DRV', teamId: 't1', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
    teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } }],
    strategies: [{ teamId: 't1', startCompound: 'H', plannedStops: [{ lap: 20, compound: 'M' }], brain }],
    playerDriverId: 'other',
    seed: 1,
  }
}

function makeCar(brain: StrategyBrain, overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 5, raceTime: 900, lap: 10,
    sector: 2, compound: 'H', tyreAge: 5, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'H', plannedStops: [{ lap: 20, compound: 'M' }], brain },
    isPlayer: false,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['H'], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null,
    ...overrides,
  }
}

function makeState(car: CarState, safetyCar: SafetyCarState | null): RaceState {
  return {
    lap: car.lap, sector: 2, totalLaps: 30, cars: [car], sectorResults: [], overtakeEvents: [],
    safetyCar, incidents: [], trackEvolutionLaps: car.lap, rngState: 1,
    weatherTimeline: Array(30).fill('DRY') as WeatherState[], weatherState: 'DRY',
  }
}

const SC: SafetyCarState = { deployedLap: 9, lapsRemaining: 3, cause: 'crash', kind: 'sc' }
const VSC: SafetyCarState = { ...SC, kind: 'vsc' }
const rng = () => createRng(1)

describe('AI reaction to a neutralisation (spec 1.5 §1)', () => {
  for (const [name, sc] of [['SC', SC], ['VSC', VSC]] as const) {
    it(`a smart brain boxes under the ${name} when its planned stop is within the window, on the plan's compound`, () => {
      const car = makeCar('smart', { lap: 14 })          // stop at 20: 6 laps away
      const d = aiDecision(makeConfig('smart'), car, makeState(car, sc), rng())
      expect(d).toEqual({ pit: true, compound: 'M', paceMode: 'neutral' })
    })
  }

  it('one lap outside the window on fresh tyres: no reaction', () => {
    const car = makeCar('smart', { lap: 13 })            // 7 laps away; cliff 4/24
    expect(aiDecision(makeConfig('smart'), car, makeState(car, SC), rng()).pit).toBe(false)
  })

  it('worn tyres trigger the reaction even when the stop is far off', () => {
    const car = makeCar('smart', { lap: 5, compound: 'S', tyreAge: 8, compoundsUsed: ['S'] })   // cliff 6.4/10 = 0.64
    expect(aiDecision(makeConfig('smart'), car, makeState(car, null), rng()).pit, 'green flag: no stop yet').toBe(false)
    expect(aiDecision(makeConfig('smart'), car, makeState(car, SC), rng())).toEqual({ pit: true, compound: 'M', paceMode: 'neutral' })
  })

  it('an optimal brain reacts too', () => {
    const car = makeCar('optimal', { lap: 15 })
    expect(aiDecision(makeConfig('optimal'), car, makeState(car, VSC), rng()).pit).toBe(true)
  })

  it('a NAIVE brain ignores neutralisations', () => {
    const car = makeCar('naive', { lap: 14 })
    expect(aiDecision(makeConfig('naive'), car, makeState(car, SC), rng()).pit).toBe(false)
  })

  it('no reaction once the plan is complete', () => {
    const car = makeCar('smart', { lap: 14, pitsDone: 1 })
    expect(aiDecision(makeConfig('smart'), car, makeState(car, SC), rng()).pit).toBe(false)
  })

  it('draws NO rng: the reaction is a pure threshold', () => {
    for (const brain of ['smart', 'optimal'] as const) {
      let draws = 0
      const counting = () => { draws++; return 0.5 }
      const car = makeCar(brain, { lap: 14 })
      expect(aiDecision(makeConfig(brain), car, makeState(car, SC), counting).pit).toBe(true)
      expect(draws, brain).toBe(0)
    }
  })
})

describe('the race loop hands the AI the neutralisation as it stands AFTER the tick', () => {
  function atLapBoundary(lapsRemaining: number): RaceState {
    const config = makeConfig('smart')
    const s = initRace(config)
    return {
      ...s, lap: 14, sector: 2,
      safetyCar: { deployedLap: 12, lapsRemaining, cause: 'crash', kind: 'sc' },
      cars: s.cars.map(c => ({ ...c, lap: 14, tyreAge: 3, compound: 'H' as const })),
    }
  }

  it('boxes while the SC stays out past this boundary', () => {
    const next = stepSector(makeConfig('smart'), atLapBoundary(2), createRng(3))
    expect(next.safetyCar).not.toBeNull()
    expect(next.cars[0]!.pitsDone).toBe(1)
    expect(next.cars[0]!.compound).toBe('M')
  })

  it('does NOT box on the boundary where the SC comes in (it would pay the full green-flag loss)', () => {
    const next = stepSector(makeConfig('smart'), atLapBoundary(1), createRng(3))
    expect(next.safetyCar).toBeNull()
    expect(next.cars[0]!.pitsDone).toBe(0)
  })
})
