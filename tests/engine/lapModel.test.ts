import { describe, it, expect } from 'vitest'
import { computeSectorTime } from '@engine/lapModel'
import { createRng } from '@engine/rng'
import type { RaceConfig, CarState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'
import type { Rng } from '@engine/rng'

// Deterministic rng stub — feeds a fixed sequence of draws so probabilistic
// branches (like the wet-spin roll) can be tested exactly, not statistically.
function fakeRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]!
}

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08, consistencyReliefFactor: 0.40 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 1.0, penalty: 0.12, trafficCap: 0.70, hardCircuitScale: 1.5, dirtyAirDegBonus: 0.015, dirtyAirDegCapLaps: 8 },
  overtaking: { base: 0.22, paceGateMin: 0.05, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55], attackRacecraftBase: 0.5, defenceRacecraftFactor: 0.40, tyreFreshnessBonusMax: 0.15, paceModeFactor: 0.5, fightCost: 0.10, factorFloor: 0.35 },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3, pitCrewMeanRelief: 0.6, pitCrewSigmaRelief: 0.5 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false, netEstimateHorizonLaps: 12 },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
  tyreManagement: { degReliefFactor: 0.25 },
  tyreRules: {
    allocation: { rookie: { S: 4, M: 4, H: 4, I: 3, W: 3 }, pro: { S: 2, M: 2, H: 2, I: 2, W: 2 } },
    mandatoryTwoCompound: { rookie: false, pro: true },
    twoCompoundPenaltySec: 30.0,
  },
  tyreFailure: { cliffFractionThreshold: 1.45, chancePerLapOverThreshold: 0.30, maxChancePerLap: 0.50
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  difficultyProfiles: {
    rookie: { brainCap: 'smart', brainPromote: false, coverReactionScale: 0.6, aiPaceModeAggression: 0.7, pitCrewConsistency: 1.0 },
    pro: { brainCap: 'optimal', brainPromote: true, coverReactionScale: 1.0, aiPaceModeAggression: 1.3, pitCrewConsistency: 1.0 },
  },
  strategyReaction: {
    coverUndercutEnabled: true,
    coverWindowGap: 1.5,
    coverReactionProb: { optimal: 0.85, smart: 0.45, naive: 0.0 },
    minCliffFracToCover: 0.45,
    minRemainingLaps: 6,
  },
  weather: {
    crossoverPenalty: { dry: { DRY: 0, DAMP: 1.5, WET: 4.0 }, inter: { DRY: 2.0, DAMP: 0.5, WET: 0 }, wet: { DRY: 5.0, DAMP: 2.0, WET: 0 } },
    wetDegMultiplier: { inter: { DRY: 1.5, DAMP: 0.8, WET: 0.6 }, wet: { DRY: 2.0, DAMP: 1.0, WET: 0.5 } },
    wetSkillReliefMax: 0.10, wetNoiseReliefFactor: 0.30,
    wetIncident: { spinChance: { DRY: 0.0, DAMP: 0.010, WET: 0.040 }, spinTimeLossMean: 4.0, spinTimeLossSigma: 1.5, dryTrackSpinChance: 0.03 },
    forecastConfidence: [1.0, 1.0, 0.85, 0.65, 0.45],
    timeline: { onsetWindow: [5, 25], minDuration: 3, maxDuration: 15, intensityBias: { stable: 0.05, variable: 0.25, wet: 0.60, mixed: 0.35 } },
  },
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
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10, colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
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
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0, retired: false, retiredLap: null, retiredCause: null,
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

describe('wet mismatch spin (dry tyres in the wet)', () => {
  // Noise (gaussianPair) consumes draws [0],[1]; the spin roll consumes draw [2].
  // wetWeather=80 (default test driver) → effChance = 0.04 * (1 - 0.8*0.10) = 0.0368.
  const NOISE_DRAWS = [0.5, 0.5]

  it('never spins on a dry compound in DRY weather, no matter the roll', () => {
    const rng = fakeRng([...NOISE_DRAWS, 0.0])
    const result = computeSectorTime(makeConfig(), makeCar({ compound: 'M' }), 0, rng, 'DRY')
    expect(result.spinLoss).toBe(0)
  })

  it('spins on a dry compound in WET weather when the roll is under the effective threshold', () => {
    const rng = fakeRng([...NOISE_DRAWS, 0.03]) // < 0.0368
    const result = computeSectorTime(makeConfig(), makeCar({ compound: 'M' }), 0, rng, 'WET')
    expect(result.spinLoss).toBeGreaterThan(0)
  })

  it('does not spin on a dry compound in WET weather when the roll is over the effective threshold', () => {
    const rng = fakeRng([...NOISE_DRAWS, 0.05]) // > 0.0368
    const result = computeSectorTime(makeConfig(), makeCar({ compound: 'M' }), 0, rng, 'WET')
    expect(result.spinLoss).toBe(0)
  })

  it('a spin adds real time to the sector, on top of the base crossover penalty', () => {
    const rngSpin = fakeRng([...NOISE_DRAWS, 0.03])
    const rngNoSpin = fakeRng([...NOISE_DRAWS, 0.05])
    const withSpin = computeSectorTime(makeConfig(), makeCar({ compound: 'M' }), 0, rngSpin, 'WET')
    const withoutSpin = computeSectorTime(makeConfig(), makeCar({ compound: 'M' }), 0, rngNoSpin, 'WET')
    expect(withSpin.sectorTime).toBeGreaterThan(withoutSpin.sectorTime)
  })

  it('a proper wet compound never spins, even in WET weather', () => {
    const wetCompounds: Record<string, CompoundSpec> = {
      ...COMPOUNDS,
      W: { name: 'Wet', type: 'wet', offset: 1.0, lin: 0.012, cliff: 40, pen: 0.010, colorToken: '--tyre-wet' },
    }
    const config = makeConfig({ compounds: wetCompounds })
    const rng = fakeRng([...NOISE_DRAWS, 0.0]) // would trigger every time if the gate were open
    const result = computeSectorTime(config, makeCar({ compound: 'W' }), 0, rng, 'WET')
    expect(result.spinLoss).toBe(0)
  })

  it('a skilled wet-weather driver spins less often than an unskilled one at the same roll', () => {
    // Roll 0.038 sits between the two drivers' effective thresholds:
    // skill 0   → effChance 0.0400 → 0.038 < 0.0400 → spins
    // skill 100 → effChance 0.0360 → 0.038 > 0.0360 → does not spin
    const config = makeConfig({
      drivers: [{ id: 'd1', name: 'Test', code: 'TST', teamId: 't1', facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 0, experience: 80 } }],
    })
    const skilledConfig = makeConfig({
      drivers: [{ id: 'd1', name: 'Test', code: 'TST', teamId: 't1', facets: { pace: 50, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 100, experience: 80 } }],
    })
    const unskilled = computeSectorTime(config, makeCar({ compound: 'M' }), 0, fakeRng([...NOISE_DRAWS, 0.038]), 'WET')
    const skilled = computeSectorTime(skilledConfig, makeCar({ compound: 'M' }), 0, fakeRng([...NOISE_DRAWS, 0.038]), 'WET')
    expect(unskilled.spinLoss).toBeGreaterThan(0)
    expect(skilled.spinLoss).toBe(0)
  })
})
