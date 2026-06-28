import { describe, it, expect } from 'vitest'
import { shouldAIPit } from '@engine/strategy'
import type { RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08, consistencyReliefFactor: 0.40 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55], attackRacecraftBase: 0.5, defenceRacecraftFactor: 0.40, tyreFreshnessBonusMax: 0.15 },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3, pitCrewMeanRelief: 0.6, pitCrewSigmaRelief: 0.5 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false, netEstimateHorizonLaps: 12 },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
  tyreManagement: { degReliefFactor: 0.25 },
  weather: {
    crossoverPenalty: { dry: { DRY: 0, DAMP: 1.5, WET: 4.0 }, inter: { DRY: 2.0, DAMP: 0.5, WET: 0 }, wet: { DRY: 5.0, DAMP: 2.0, WET: 0 } },
    wetDegMultiplier: { inter: { DRY: 1.5, DAMP: 0.8, WET: 0.6 }, wet: { DRY: 2.0, DAMP: 1.0, WET: 0.5 } },
    wetSkillReliefMax: 0.10, wetNoiseReliefFactor: 0.30, forecastLap2Confidence: 0.65,
    timeline: { onsetWindow: [5, 25], minDuration: 3, maxDuration: 15, intensityBias: { stable: 0.05, variable: 0.25, wet: 0.60, mixed: 0.35 } },
  },
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

const CIRCUIT: CircuitSpec = {
  name: 'Strat', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'D1', code: 'DRV', teamId: 't1', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
    teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } }],
    strategies: [{ teamId: 't1', startCompound: 'S', plannedStops: [{ lap: 12, compound: 'H' }] }],
    playerDriverId: 'other',
    seed: 1,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 5, raceTime: 900, lap: 10,
    sector: 2, compound: 'S', tyreAge: 10, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'S', plannedStops: [{ lap: 12, compound: 'H' }] },
    isPlayer: false,
    ...overrides,
  }
}

function makeState(overrides: Partial<RaceState> = {}): RaceState {
  return {
    lap: 10, sector: 2, totalLaps: 30, cars: [], sectorResults: [],
    overtakeEvents: [], trackEvolutionLaps: 10, rngState: 1,
    weatherTimeline: Array(30).fill('DRY') as import('@engine/types').WeatherState[],
    weatherState: 'DRY' as import('@engine/types').WeatherState,
    ...overrides,
  }
}

describe('shouldAIPit', () => {
  it('pits on the planned stop lap', () => {
    const car = makeCar({ lap: 12 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 12 }))
    expect(result.pit).toBe(true)
    expect(result.compound).toBe('H')
  })

  it('does not pit before planned lap', () => {
    const car = makeCar({ lap: 8 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 8 }))
    expect(result.pit).toBe(false)
  })

  it('pits early when tyre is way past cliff', () => {
    const car = makeCar({ compound: 'S', tyreAge: 20, lap: 5 })
    const result = shouldAIPit(makeConfig(), car, makeState({ lap: 5 }))
    expect(result.pit).toBe(true)
  })

  it('does not pit if no more planned stops', () => {
    const config = makeConfig()
    const noStopConfig: RaceConfig = {
      ...config,
      strategies: [{ teamId: 't1', startCompound: 'H', plannedStops: [] }],
    }
    const noStopCar: CarState = {
      ...makeCar({ lap: 12, pitsDone: 1 }),
      strategy: { teamId: 't1', startCompound: 'H', plannedStops: [] },
    }
    const result = shouldAIPit(noStopConfig, noStopCar, makeState({ lap: 12 }))
    expect(result.pit).toBe(false)
  })
})
