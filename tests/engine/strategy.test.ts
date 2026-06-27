import { describe, it, expect } from 'vitest'
import { shouldAIPit } from '@engine/strategy'
import type { RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
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
