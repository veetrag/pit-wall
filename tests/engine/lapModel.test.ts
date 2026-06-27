import { describe, it, expect } from 'vitest'
import { computeSectorTime } from '@engine/lapModel'
import { createRng } from '@engine/rng'
import type { RaceConfig, CarState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

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

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 30,
  sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

function makeConfig(overrides: Partial<RaceConfig> = {}): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'Test', code: 'TST', teamId: 't1', facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
    teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 55.6, aero: 55.6, handling: 55.6, reliability: 99, pitCrew: 80 } }],
    strategies: [{ teamId: 't1', startCompound: 'M', plannedStops: [] }],
    playerDriverId: 'd1',
    seed: 42,
    ...overrides,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 0,
    lap: 0, sector: 0, compound: 'M', tyreAge: 0,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: false,
    ...overrides,
  }
}

describe('computeSectorTime', () => {
  it('returns a positive sector time close to sectorBase', () => {
    const rng = createRng(1)
    const result = computeSectorTime(makeConfig(), makeCar(), 0, rng)
    expect(result.sectorTime).toBeGreaterThan(20)
    expect(result.sectorTime).toBeLessThan(45)
  })

  it('better car (lower rating) is faster', () => {
    const config = makeConfig({
      teams: [
        { id: 't1', name: 'Fast', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 100, aero: 100, handling: 100, reliability: 99, pitCrew: 80 } },
        { id: 't2', name: 'Slow', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 0,   aero: 0,   handling: 0,   reliability: 99, pitCrew: 80 } },
      ],
      drivers: [
        { id: 'd1', name: 'D1', code: 'D1X', teamId: 't1', facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } },
        { id: 'd2', name: 'D2', code: 'D2X', teamId: 't2', facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } },
      ],
    })
    const rng1 = createRng(42)
    const rng2 = createRng(42)
    const fast = computeSectorTime(config, makeCar({ driverId: 'd1', teamId: 't1' }), 0, rng1)
    const slow = computeSectorTime(config, makeCar({ driverId: 'd2', teamId: 't2' }), 0, rng2)
    expect(fast.sectorTime).toBeLessThan(slow.sectorTime)
  })

  it('push mode produces faster sector than conserve', () => {
    const rng1 = createRng(7)
    const rng2 = createRng(7)
    const pushing    = computeSectorTime(makeConfig(), makeCar({ paceMode: 'push' }), 0, rng1)
    const conserving = computeSectorTime(makeConfig(), makeCar({ paceMode: 'conserve' }), 0, rng2)
    expect(pushing.sectorTime).toBeLessThan(conserving.sectorTime)
  })

  it('same seed + same inputs = identical result (determinism)', () => {
    const a = computeSectorTime(makeConfig(), makeCar(), 1, createRng(100))
    const b = computeSectorTime(makeConfig(), makeCar(), 1, createRng(100))
    expect(a.sectorTime).toBe(b.sectorTime)
  })

  it('fuel load reduces pace (higher raceTime = more fuel burned = faster)', () => {
    const rng1 = createRng(5)
    const rng2 = createRng(5)
    const heavy = computeSectorTime(makeConfig(), makeCar({ raceTime: 0, lap: 0 }), 0, rng1)
    const light  = computeSectorTime(makeConfig(), makeCar({ raceTime: 2700, lap: 30 }), 0, rng2)
    expect(light.sectorTime).toBeLessThan(heavy.sectorTime)
  })
})
