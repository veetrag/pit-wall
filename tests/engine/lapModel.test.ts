import { describe, it, expect } from 'vitest'
import { computeSectorTime } from '@engine/lapModel'
import { createRng } from '@engine/rng'
import type { RaceConfig, CarState, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'
import type { Rng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'

// Deterministic rng stub — feeds a fixed sequence of draws so probabilistic
// branches (like the wet-spin roll) can be tested exactly, not statistically.
function fakeRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]!
}

// The wet-spin tests below are MECHANISM tests: they feed hand-picked rng values
// either side of an effective threshold derived from these exact constants
// (e.g. 0.04 * (1 - wetWeather/100 * 0.10) = 0.0360-0.0400). They are pinned
// here rather than inherited from tuning.json so that re-balancing the shipped
// spin chance -- which is now 0.07 for WET -- cannot break a test that is not
// about balance at all.
const TUNING: TuningConstants = makeDeterministicTuning({
  weather: { wetIncident: { spinChance: { DRY: 0.0, DAMP: 0.010, WET: 0.040 } } },
})

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
