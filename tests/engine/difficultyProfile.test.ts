import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, CircuitSpec } from '@engine/types'
import { runRaces } from './monteCarloHarness'

// Same four-circuit sample as tests/engine/monteCarlo.test.ts: a rain-heavy
// round, a dry desert round, the street circuit and a high-speed round.
const HARNESS_SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

// M5: difficulty is now one profile lookup (tuning.difficultyProfiles) instead
// of scattered if (difficulty === ...) branches. These tests mirror what
// raceStore.ts's buildConfig does (it isn't exported — it's a thin Zustand
// wrapper — so the resolution logic is reproduced here against real data).

const REFERENCE_CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 30,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

const BRAIN_ORDER: StrategyBrain[] = ['naive', 'smart', 'optimal']

function applyBrainProfile(baseBrain: StrategyBrain, profile: { brainCap: StrategyBrain; brainPromote: boolean }): StrategyBrain {
  const baseIdx = BRAIN_ORDER.indexOf(baseBrain)
  const capIdx = BRAIN_ORDER.indexOf(profile.brainCap)
  const promotedIdx = profile.brainPromote ? Math.min(baseIdx + 1, BRAIN_ORDER.length - 1) : baseIdx
  return BRAIN_ORDER[Math.min(promotedIdx, capIdx)]!
}

// Builds a real RaceConfig the way buildConfig does, with one addition: a
// `pinnedBrainTeamId` team's brain is forced to 'naive' regardless of the
// profile, so its own behaviour is fixed across difficulties — isolating how
// much harder the *rest of the field* got, not how much smarter the pinned
// car itself became (a real player has no AI brain of their own).
function buildRealConfig(
  seed: number,
  difficulty: 'rookie' | 'pro',
  playerDriverId: string,
  pinnedBrainTeamId?: string,
  zeroMechanicalFailure = false,
): RaceConfig {
  const data = loadGameData()
  const profile = data.tuning.difficultyProfiles[difficulty]
  const strategies = data.strategies.defaults.map(s => ({
    ...s,
    brain: s.teamId === pinnedBrainTeamId ? 'naive' as StrategyBrain : applyBrainProfile((s.brain ?? 'naive') as StrategyBrain, profile),
  }))
  return {
    circuit: REFERENCE_CIRCUIT,
    tuning: zeroMechanicalFailure
      ? { ...data.tuning, mechanicalFailure: { baseChancePerLap: 0 } }
      : data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies,
    playerDriverId,
    seed,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
    coverReactionScale: profile.coverReactionScale,
    paceModeAggression: profile.aiPaceModeAggression,
  }
}

function runFullRace(config: RaceConfig, referenceDriverId: string): { position: number; gapToLeader: number } {
  let state = initRace(config)
  const rng = createRng(config.seed)
  const totalSectors = config.circuit.laps * 3
  for (let i = 0; i < totalSectors; i++) {
    state = stepSector(config, state, rng)
  }
  const leader = state.cars[0]!
  const reference = state.cars.find(c => c.driverId === referenceDriverId)!
  return { position: reference.position, gapToLeader: reference.raceTime - leader.raceTime }
}

describe('M5: difficulty profiles apply', () => {
  it('rookie vs pro yields different allocation, brain mix, and mandatoryTwoCompound', () => {
    const rookie = buildRealConfig(1, 'rookie', 'd_novak')
    const pro = buildRealConfig(1, 'pro', 'd_novak')

    expect(rookie.tyreAllocationBase).not.toEqual(pro.tyreAllocationBase)
    expect(rookie.mandatoryTwoCompound).toBe(false)
    expect(pro.mandatoryTwoCompound).toBe(true)
    expect(rookie.coverReactionScale).not.toBe(pro.coverReactionScale)
    expect(rookie.paceModeAggression).not.toBe(pro.paceModeAggression)

    // solstice's default brain is 'smart' — rookie caps at smart (no promote,
    // unchanged), pro promotes+caps at optimal.
    const rookieBrain = rookie.strategies.find(s => s.teamId === 'solstice')!.brain
    const proBrain = pro.strategies.find(s => s.teamId === 'solstice')!.brain
    expect(rookieBrain).toBe('smart')
    expect(proBrain).toBe('optimal')
  })
})

describe('M5: monotonic difficulty curve', () => {
  it('a fixed mid-tier reference car (pinned to a simple naive strategy) falls further behind the leader on pro than on rookie, on average', () => {
    // Ordinal position is too noisy for this: on a 20-car grid, promoting one
    // specific rival's brain can reshuffle it a place or two around our
    // reference car for reasons that have nothing to do with the field
    // getting harder overall (e.g. an idiosyncratic extra pit stop for that
    // one team). Gap-to-leader is a continuous, less rank-noise-sensitive
    // measure of "how much harder is the field" and shows the expected
    // monotonic trend cleanly.
    const SEEDS = 500
    const REFERENCE_TEAM = 'solstice' // genuine midfield: not front-runner, not backmarker
    const REFERENCE_DRIVER = 'd_novak'
    let rookieGapTotal = 0
    let proGapTotal = 0

    for (let i = 0; i < SEEDS; i++) {
      const seed = i * 7 + 13
      // playerDriverId: 'none' (not a real id) so the reference car is still
      // AI-driven and actually executes its pinned naive plan — a real
      // driverId would mark it isPlayer and skip auto-pitting entirely.
      //
      // Mechanical failure is zeroed here (only here — the field-balance
      // guardrail below keeps it live) because this metric,
      // gapToLeader = reference.raceTime - leader.raceTime, goes sharply
      // negative when the *reference* car itself retires: its raceTime
      // freezes at the retirement lap, far below the leader's finishing
      // time, producing a huge negative outlier that has nothing to do with
      // "the field getting harder." Verified: with live tuning the reference
      // car retired 14/500 rookie races vs 22/500 pro races, and excluding
      // just those DNF races the underlying gap was already monotonic
      // (37.1 rookie vs 38.2 pro) — the raw failure was reference-car DNF
      // noise, not a genuine difficulty-curve regression.
      const rookieResult = runFullRace(buildRealConfig(seed, 'rookie', 'none', REFERENCE_TEAM, true), REFERENCE_DRIVER)
      const proResult = runFullRace(buildRealConfig(seed, 'pro', 'none', REFERENCE_TEAM, true), REFERENCE_DRIVER)
      rookieGapTotal += rookieResult.gapToLeader
      proGapTotal += proResult.gapToLeader
    }

    const avgRookieGap = rookieGapTotal / SEEDS
    const avgProGap = proGapTotal / SEEDS
    expect(avgProGap).toBeGreaterThan(avgRookieGap)
  }, 60_000)
})

describe('M5: guardrail — field-balance regression bands hold on both difficulties', () => {
  // Measured through the shared Monte-Carlo harness, not this file's
  // single-circuit fixture. MODEL_SPEC.md §4 requires a win-share band to be
  // measured FIELD-WIDE over a pooled multi-circuit sample at a stated
  // difficulty: the same grid measures 0.99 at rookie on one circuit but
  // 0.9417 across four, because one circuit means one lap count, one rain
  // probability and one strategy pattern. Asserting the band on a one-circuit
  // sample is a different, stricter, and false claim.
  //
  // The previous version of this test asserted only `>= topTeamWinRate[0]`,
  // whose floor is 0.0, and (before removal) an overtake band that
  // MODEL_SPEC.md §5 says cannot gate anything -- so it had no falsifiable
  // assertion at all while being named a guardrail.
  it('rookie and pro both keep the field-wide win-share and distinct-winner bands', () => {
    const bands = loadGameData().tuning._regressionBands
    expect(bands).toBeDefined()
    const band = bands!
    const RACES = 240

    for (const difficulty of ['rookie', 'pro'] as const) {
      const m = runRaces({ races: RACES, circuitIds: HARNESS_SAMPLE, difficulty })
      const n = `${difficulty}, n=${m.races} races over ${HARNESS_SAMPLE.length} circuits`
      console.log(`${n}: top=${m.topTeamId} share=${m.topTeamShare.toFixed(4)} ` +
        `winners=${m.distinctWinners} overtakes=${m.meanOvertakeEvents.toFixed(1)}`)
      // Ceiling is now the competitive-grid stage's 0.90 (MODEL_SPEC.md §4), and
      // this is the suite's tightest win-share gate: it asserts the level at BOTH
      // difficulties. Post-grid measurements on this 4-circuit sample: rookie
      // 0.7833-0.8792 over six seed bases, pro 0.8208-0.8583. Rookie is the
      // tighter margin at ~1.4 SE from the ceiling (SE ~1.5pp at n=240); fixed
      // seeds make it deterministic, so that margin is regression headroom, not
      // flake risk. The race-incidents plan tightens this to 0.35-0.55.
      expect(m.topTeamShare, n).toBeLessThanOrEqual(band.topTeamWinRate[1])
      expect(m.topTeamShare, n).toBeGreaterThanOrEqual(band.topTeamWinRate[0])
      // Now >= 4 (competitive-grid stage); measured 7-8 at both difficulties.
      expect(m.distinctWinners, n).toBeGreaterThanOrEqual(band.minDistinctWinners)
      // Overtake counts stay a diagnostic only -- MODEL_SPEC.md §5.
    }
  }, 120_000)
})
