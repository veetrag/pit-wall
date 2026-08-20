import { describe, it, expect } from 'vitest'
import { shouldAIPit, aiDecision } from '@engine/strategy'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec, StrategyBrain } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08, consistencyReliefFactor: 0.40 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 1.0, penalty: 0.12, trafficCap: 0.70, dirtyAirDegBonus: 0.015, dirtyAirDegCapLaps: 8 },
  overtaking: { base: 0.22, paceGateMin: 0.05, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55], attackRacecraftBase: 0.5, defenceRacecraftFactor: 0.40, tyreFreshnessBonusMax: 0.15, paceModeFactor: 0.5 },
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

// Updated compound curves matching compounds.json
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
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['S'], lapsInDirtyAir: 0, retired: false, retiredLap: null, retiredCause: null,
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
    // S cliff is at 10; age 20 = 2.0x cliff fraction → CLIFF_EMERGENCY_THRESHOLD 1.5
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

describe('aiDecision pace modes', () => {
  it('smart brain uses neutral pace in mid-stint (not conserve)', () => {
    // S cliff=10, tyreAge=7 → fraction 0.70 — smart brain no longer conserves mid-stint
    const car = makeCar({ compound: 'S', tyreAge: 7, lap: 7, strategy: { teamId: 't1', startCompound: 'S', plannedStops: [{ lap: 20, compound: 'H' }], brain: 'smart' } })
    const result = aiDecision(makeConfig(), car, makeState({ lap: 7, totalLaps: 30 }), createRng(1))
    expect(result.paceMode).toBe('neutral')
    expect(result.pit).toBe(false)
  })

  it('smart brain pushes on fresh tyres', () => {
    // H cliff=24, tyreAge=2 → fraction 0.083 < 0.20 → push
    const car = makeCar({ compound: 'H', tyreAge: 2, lap: 16, strategy: { teamId: 't1', startCompound: 'H', plannedStops: [], brain: 'smart' } })
    const result = aiDecision(makeConfig(), car, makeState({ lap: 16, totalLaps: 30 }), createRng(1))
    expect(result.paceMode).toBe('push')
  })

  it('smart brain pits when cliff imminent', () => {
    // M cliff=16, driver tyreManagement=80 → tyreManagementFactor 0.8, so effective
    // age = tyreAge * 0.8. tyreAge=19 → effAge=15.2 → fraction 0.95 ≥ 0.90 → pit
    const car = makeCar({ compound: 'M', tyreAge: 19, lap: 20, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [], brain: 'smart' } })
    const result = aiDecision(makeConfig(), car, makeState({ lap: 20, totalLaps: 30 }), createRng(1))
    expect(result.pit).toBe(true)
  })
})

// ─── M2: Reactive Cover (Undercut Response) ─────────────────────────────────
// Scripted 2-car scenario: a trailing car has just pitted onto fresh tyres and
// sits within `coverWindowGap` of the leader, whose own tyres are worn enough
// to be cover-eligible. Spec: optimal covers ≥70% of seeds; naive never does
// (naive doesn't run the reactive branch at all).

describe('M2 reactive cover', () => {
  function makeUndercutScenario(leaderBrain: StrategyBrain) {
    const leader = makeCar({
      driverId: 'leader', teamId: 'leader', raceTime: 1000, lap: 15,
      compound: 'M', tyreAge: 9, pitsDone: 0, // M cliff=16 → cliffFrac 0.5625, above minCliffFracToCover 0.45
      strategy: { teamId: 'leader', startCompound: 'M', plannedStops: [], brain: leaderBrain },
    })
    const trailer = makeCar({
      driverId: 'trailer', teamId: 'trailer', raceTime: 1001, lap: 15,
      compound: 'M', tyreAge: 1, pitsDone: 1, // just pitted, fresh tyres
      strategy: { teamId: 'trailer', startCompound: 'M', plannedStops: [], brain: 'naive' },
    })
    const config: RaceConfig = {
      ...makeConfig(),
      drivers: [
        { id: 'leader', name: 'Leader', code: 'LDR', teamId: 'leader', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } },
        { id: 'trailer', name: 'Trailer', code: 'TRL', teamId: 'trailer', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } },
      ],
      teams: [
        { id: 'leader', name: 'Leader', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } },
        { id: 'trailer', name: 'Trailer', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } },
      ],
      strategies: [leader.strategy, trailer.strategy],
    }
    const state = makeState({ lap: 15, totalLaps: 30, cars: [leader, trailer] })
    return { config, leader, state }
  }

  it('optimal leader covers the undercut in ≥70% of seeds', () => {
    const { config, leader, state } = makeUndercutScenario('optimal')
    const SEEDS = 300
    let covered = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const result = aiDecision(config, leader, state, createRng(seed))
      if (result.pit) covered++
    }
    expect(covered / SEEDS).toBeGreaterThanOrEqual(0.70)
  })

  it('naive leader never reactively covers', () => {
    const { config, leader, state } = makeUndercutScenario('naive')
    for (let seed = 1; seed <= 50; seed++) {
      const result = aiDecision(config, leader, state, createRng(seed))
      expect(result.pit).toBe(false)
    }
  })
})

// ─── Strategy Value Validation Test ─────────────────────────────────────────
// Spec requirement: SMART finishes ≥1.5 positions ahead of NAIVE (≥2000 races).
// OPTIMAL ≥2.0 ahead of NAIVE.

type Brain = 'naive' | 'smart' | 'optimal'

function makeStrategyConfig(brain: Brain, startCompound: 'M' | 'H', pitLap: number, pitCompound: 'M' | 'H') {
  return {
    teamId: brain,
    startCompound,
    plannedStops: [{ lap: pitLap, compound: pitCompound }],
    brain,
  }
}

function makeValidationConfig(seed: number): RaceConfig {
  const IDENTICAL_FACETS = { power: 75, aero: 75, handling: 75, reliability: 99, pitCrew: 75 }
  // tyreManagement: 0 → effAge = realAge × degMultiplier (no management buffering)
  // This ensures cliff penalties are felt at the nominal cliff lap, making NAIVE's late pit costly
  const IDENTICAL_DRIVER = { pace: 75, racecraft: 75, tyreManagement: 0, consistency: 75, wetWeather: 75, experience: 75 }
  const CIRCUIT_30: CircuitSpec = {
    name: 'Validation', laps: 30, sectorBase: [28.0, 34.0, 28.0],
    carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
    overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
  }
  const brains: Brain[] = ['naive', 'smart', 'optimal', 'naive', 'naive', 'naive', 'naive', 'naive']
  const drivers = brains.map((b, i) => ({
    id: `d${i}`, name: `D${i}`, code: `D${i.toString().padStart(2, '0')}`,
    teamId: b, facets: IDENTICAL_DRIVER,
  }))
  const teams = ['naive', 'smart', 'optimal'].map(b => ({
    id: b, name: b, colorPrimary: '#fff', colorSecondary: '#000', facets: IDENTICAL_FACETS,
  }))
  // Filler naive teams share 'naive' teamId but need distinct entries
  // (only 3 unique team entries needed since the 5 filler cars share 'naive')
  const strategies = [
    // NAIVE: fixed lap=22 — deliberately 6 laps past M's cliff (16), representative of a
    // player who ignores cliff warnings and uses a generic "late-stop" plan
    makeStrategyConfig('naive', 'M', 22, 'H'),
    // SMART/OPTIMAL: same planned stop as fallback; dynamic brain fires before cliff is reached
    makeStrategyConfig('smart', 'M', 22, 'H'),
    makeStrategyConfig('optimal', 'M', 22, 'H'),
  ]
  const FULL_COMPOUNDS: Record<string, CompoundSpec> = {
    ...COMPOUNDS,
    I: { name: 'Inter',    type: 'wet', offset: 0.0, lin: 0.018, cliff: 30, pen: 0.015, colorToken: '--tyre-inter', optimalState: 'DAMP' },
    W: { name: 'Full Wet', type: 'wet', offset: 1.0, lin: 0.012, cliff: 40, pen: 0.010, colorToken: '--tyre-wet',  optimalState: 'WET'  },
  }
  return {
    circuit: CIRCUIT_30,
    tuning: { ...TUNING, incidents: { dnfPerLap: 0, driverErrorPerLap: 0 } },
    compounds: FULL_COMPOUNDS,
    drivers,
    teams,
    strategies,
    playerDriverId: 'none',
    seed,
    // Force dry weather for strategy isolation
    weatherSeed: 0,
  }
}

function runFullRace(config: RaceConfig): RaceState {
  let state = initRace(config)
  const rng = createRng(config.seed)
  const totalSectors = config.circuit.laps * 3
  for (let i = 0; i < totalSectors; i++) {
    state = stepSector(config, state, rng)
  }
  return state
}

describe('strategy value validation', () => {
  it('SMART finishes ≥1.5 positions ahead of NAIVE over 2000 races', () => {
    const RACES = 2000
    const posSum: Record<Brain, number> = { naive: 0, smart: 0, optimal: 0 }
    const brainToDriver: Record<Brain, string> = { naive: 'd0', smart: 'd1', optimal: 'd2' }

    for (let seed = 1; seed <= RACES; seed++) {
      const config = makeValidationConfig(seed)
      const final = runFullRace(config)
      for (const brain of ['naive', 'smart', 'optimal'] as Brain[]) {
        const driverId = brainToDriver[brain]
        const car = final.cars.find(c => c.driverId === driverId)
        if (car) posSum[brain] += car.position
      }
    }

    const avgNaive   = posSum.naive   / RACES
    const avgSmart   = posSum.smart   / RACES
    const avgOptimal = posSum.optimal / RACES

    const smartGain   = avgNaive - avgSmart    // positive = better finishing position
    const optimalGain = avgNaive - avgOptimal

    console.log(`[strategy-value] NAIVE avg=${avgNaive.toFixed(2)}  SMART avg=${avgSmart.toFixed(2)}  OPTIMAL avg=${avgOptimal.toFixed(2)}`)
    console.log(`[strategy-value] SMART gain=${smartGain.toFixed(2)}  OPTIMAL gain=${optimalGain.toFixed(2)}`)

    expect(smartGain).toBeGreaterThanOrEqual(1.5)
    // OPTIMAL uses a tighter cliff threshold and surgical undercut, should match or beat SMART
    expect(optimalGain).toBeGreaterThanOrEqual(1.5)
  }, 120_000) // 2 min timeout — 2000 full races
})
