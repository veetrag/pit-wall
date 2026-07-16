import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import type { RaceConfig, RaceState, CarState, SectorResult, DriverSpec, TeamSpec, CircuitSpec, CompoundSpec, TuningConstants } from '@engine/types'

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
  difficultyProfiles: {
    rookie: { brainCap: 'smart', brainPromote: false, coverReactionScale: 0.6, aiPaceModeAggression: 0.7, pitCrewConsistency: 1.0 },
    pro: { brainCap: 'optimal', brainPromote: true, coverReactionScale: 1.0, aiPaceModeAggression: 1.3, pitCrewConsistency: 1.0 },
  },
  strategyReaction: {
    coverUndercutEnabled: true, coverWindowGap: 1.5,
    coverReactionProb: { optimal: 0.85, smart: 0.45, naive: 0.0 },
    minCliffFracToCover: 0.45, minRemainingLaps: 6,
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
  name: 'Test', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}
const COMPOUNDS: Record<string, CompoundSpec> = {
  M: { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.04, cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
}
const DRIVER: DriverSpec = {
  id: 'd1', name: 'D1', code: 'D1X', teamId: 't1',
  facets: { pace: 70, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 },
}
const TEAM: TeamSpec = {
  id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000',
  facets: { power: 80, aero: 80, handling: 80, reliability: 99, pitCrew: 80 },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [DRIVER], teams: [TEAM],
    strategies: [{ teamId: 't1', startCompound: 'M', plannedStops: [] }],
    playerDriverId: 'd1', seed: 1,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 0, lap: 5,
    sector: 0, compound: 'M', tyreAge: 3, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: true,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0, retired: false, retiredLap: null,
    ...overrides,
  }
}

function makeSpinResult(overrides: Partial<SectorResult> = {}): SectorResult {
  return { driverId: 'd1', sectorTime: 30, tyreContribution: 0, trafficPenalty: 0, noiseSample: 0, spinLoss: 0, ...overrides }
}

function makeState(overrides: Partial<RaceState> = {}): RaceState {
  return {
    lap: 5, sector: 0, totalLaps: 30, cars: [makeCar()], sectorResults: [],
    overtakeEvents: [], trackEvolutionLaps: 5, rngState: 1,
    weatherTimeline: Array(30).fill('WET'), weatherState: 'WET',
    ...overrides,
  }
}

let fakeClock = 0

describe('processRadioTick — wet spin alert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // radioMapper's pit-radio cooldown is tracked in module-level state shared
    // across tests in this file — advance the clock far past any prior test's
    // window instead of resetting to 0, or leftover cooldown state suppresses
    // the very first push of the next test.
    fakeClock += 1_000_000
    vi.setSystemTime(fakeClock)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires wet_spin exactly when a new spin appears in sectorResults', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
    expect(pushAlert.mock.calls[0]![1]).toBe('urgent')
  })

  it('does not fire when there is no spin this tick', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ sectorResults: [makeSpinResult({ spinLoss: 0 })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).not.toHaveBeenCalled()
  })

  it('does not re-fire for the same spin on the next tick (radio state advances)', () => {
    const pushAlert = vi.fn()
    let radio = makeRadioState()
    const spunState = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    radio = processRadioTick(spunState, makeConfig(), radio, pushAlert)
    vi.setSystemTime(fakeClock + 10_000) // clear the cooldown window
    // same sectorResults array — no NEW spin since prevSpinCount already caught up
    processRadioTick(spunState, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
  })

  it('fires again on a second, later spin', () => {
    const pushAlert = vi.fn()
    let radio = makeRadioState()
    const firstSpin = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    radio = processRadioTick(firstSpin, makeConfig(), radio, pushAlert)
    vi.setSystemTime(fakeClock + 10_000)
    const secondSpin = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 }), makeSpinResult({ spinLoss: 3.0 })] })
    processRadioTick(secondSpin, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(2)
  })
})
