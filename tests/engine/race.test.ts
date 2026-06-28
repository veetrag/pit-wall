import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08, consistencyReliefFactor: 0.40 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 1.0, penalty: 0.12 },
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
    wetSkillReliefMax: 0.10, wetNoiseReliefFactor: 0.30, forecastConfidence: [1.0, 1.0, 0.85, 0.65, 0.45],
    timeline: { onsetWindow: [5, 25], minDuration: 3, maxDuration: 15, intensityBias: { stable: 0.05, variable: 0.25, wet: 0.60, mixed: 0.35 } },
  },
}

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 10,
  sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10, colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [
      { id: 'd1', name: 'Fast', code: 'FST', teamId: 'apex', facets: { pace: 90, racecraft: 95, tyreManagement: 80, consistency: 95, wetWeather: 80, experience: 80 } },
      { id: 'd2', name: 'Mid',  code: 'MID', teamId: 'mid',  facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 88, wetWeather: 80, experience: 80 } },
      { id: 'd3', name: 'Slow', code: 'SLW', teamId: 'back', facets: { pace: 10, racecraft: 70, tyreManagement: 80, consistency: 80, wetWeather: 80, experience: 80 } },
    ],
    teams: [
      { id: 'apex', name: 'Apex', colorPrimary: '#0ef', colorSecondary: '#000', facets: { power: 100,  aero: 100,  handling: 100,  reliability: 99, pitCrew: 80 } },
      { id: 'mid',  name: 'Mid',  colorPrimary: '#f00', colorSecondary: '#fff', facets: { power: 55.6, aero: 55.6, handling: 55.6, reliability: 98, pitCrew: 80 } },
      { id: 'back', name: 'Back', colorPrimary: '#ff0', colorSecondary: '#000', facets: { power: 11.1, aero: 11.1, handling: 11.1, reliability: 97, pitCrew: 80 } },
    ],
    strategies: [
      { teamId: 'apex', startCompound: 'M', plannedStops: [{ lap: 5, compound: 'H' }] },
      { teamId: 'mid',  startCompound: 'M', plannedStops: [{ lap: 5, compound: 'H' }] },
      { teamId: 'back', startCompound: 'S', plannedStops: [{ lap: 4, compound: 'H' }] },
    ],
    playerDriverId: 'd1',
    seed: 42,
  }
}

describe('initRace', () => {
  it('creates one CarState per driver', () => {
    const state = initRace(makeConfig())
    expect(state.cars).toHaveLength(3)
  })

  it('starts at lap 0, sector 0', () => {
    const state = initRace(makeConfig())
    expect(state.lap).toBe(0)
    expect(state.sector).toBe(0)
  })

  it('assigns starting compounds from strategy', () => {
    const state = initRace(makeConfig())
    const d3Car = state.cars.find(c => c.driverId === 'd3')!
    expect(d3Car.compound).toBe('S')
  })
})

describe('stepSector', () => {
  it('advances sector by 1', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const s1 = stepSector(config, s0, createRng(1))
    expect(s1.sector).toBe(1)
  })

  it('advances lap after 3 sectors', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    state = stepSector(config, state, rng)
    state = stepSector(config, state, rng)
    state = stepSector(config, state, rng)
    expect(state.lap).toBe(1)
    expect(state.sector).toBe(0)
  })

  it('does not mutate the previous state (pure function)', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const s0Lap = s0.lap
    stepSector(config, s0, createRng(1))
    expect(s0.lap).toBe(s0Lap)
  })

  it('is deterministic: same seed same result', () => {
    const config = makeConfig()
    const s0 = initRace(config)
    const a = stepSector(config, s0, createRng(77))
    const b = stepSector(config, s0, createRng(77))
    expect(a.cars[0]!.raceTime).toBe(b.cars[0]!.raceTime)
  })

  it('best car is leading after 10 laps', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(42)
    for (let i = 0; i < 30; i++) state = stepSector(config, state, rng)
    const leader = state.cars[0]!
    expect(leader.driverId).toBe('d1')
  })

  it('tyreAge increments after each completed lap', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 3; i++) state = stepSector(config, state, rng)
    expect(state.cars[0]!.tyreAge).toBe(1)
  })

  it('triggers AI pit stop on planned lap', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(42)
    for (let i = 0; i < 5 * 3; i++) state = stepSector(config, state, rng)
    const d3Car = state.cars.find(c => c.driverId === 'd3')!
    expect(d3Car.pitsDone).toBeGreaterThanOrEqual(1)
  })
})
