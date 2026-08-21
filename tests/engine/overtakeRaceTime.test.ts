// Pre-change baseline (measureClearing, advantage: 0.4, seeds 1000 + i*17 for
// i in [0, 40), clear-air "cleared" definition, default patienceLaps=15),
// recorded before Task 2 touches resolveOvertakes:
//
//   veloce:          failureRate=0  medianLapsToClear=3     meanLapsToClear=3.025
//   bengaluru:       failureRate=0  medianLapsToClear=3     meanLapsToClear=3.05
//   harbour_lights:  failureRate=0  medianLapsToClear=3     meanLapsToClear=3.05
//
// All three are near-identical today, because overtakingFactor is shadowed
// (§1.2 of the spec) -- circuit identity should have zero effect on clearing
// behaviour pre-change. Task 3 should see these numbers diverge by circuit
// once the shadowing is fixed.

import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain } from '@engine/types'
import { measureClearing } from './overtakeClearing'

const GAME = loadGameData()

// A counting RNG wrapper: same values as createRng, but records how many draws
// were taken. The COUNT is the invariant Task 2 must not change.
//
// NOTE: this is a corrected copy of createRng's mulberry32 body. The brief's
// original inline version XOR-assigned the second mixing step (`t ^= t + ...`)
// instead of plain-assigning it (`t = t + ...`), which produced a different
// sequence than @engine/rng's createRng. Verified against createRng(7) for
// 1000 draws before use; fixed here rather than touching rng.ts, per the task
// instructions.
function countingRng(seed: number): { rng: () => number; draws: () => number } {
  let s = seed >>> 0
  let n = 0
  const rng = () => {
    n++
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { rng, draws: () => n }
}

function config(circuitId: string, seed: number): RaceConfig {
  const circuit = GAME.circuits[circuitId]!
  return {
    circuit, tuning: GAME.tuning, compounds: GAME.compounds,
    drivers: GAME.drivers.drivers, teams: GAME.cars.teams,
    strategies: GAME.strategies.defaults.map(s => ({
      ...s,
      brain: (s.brain ?? 'naive') as StrategyBrain,
      plannedStops: s.plannedStops.map(st => ({ ...st, lap: Math.round((st.lap / 30) * circuit.laps) })),
    })),
    playerDriverId: '__none__',
    seed,
    tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
    mandatoryTwoCompound: GAME.tuning.tyreRules.mandatoryTwoCompound.pro,
    coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
    paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
  }
}

function runFull(circuitId: string, seed: number): { draws: number; state: string } {
  const cfg = config(circuitId, seed)
  const { rng, draws } = countingRng(seed)
  let state = initRace(cfg)
  // RaceState has no `finished` flag of its own (raceStore derives race-over
  // from lap/sector, see src/state/raceStore.ts:198) -- a `while (!state.finished)`
  // loop as first drafted from the brief never terminates. Bounded loop over
  // every sector of the race, matching monteCarloHarness's established idiom
  // (tests/engine/monteCarloHarness.ts:185).
  for (let i = 0; i < cfg.circuit.laps * 3; i++) state = stepSector(cfg, state, rng)
  return { draws: draws(), state: JSON.stringify(state) }
}

describe('overtaking: RNG stream discipline', () => {
  // Plan A's Global Constraint: NO new rng() call. The draw count over a full
  // race is the sharpest possible statement of that, and it is failable --
  // adding a single conditional roll anywhere in the tick moves it.
  it('a full race takes exactly the same number of RNG draws as before the change', () => {
    // Recorded from the pre-change engine on this exact fixture. Task 2 must
    // reproduce it. If Task 2 changes it, Task 2 added a roll -- fix Task 2,
    // do NOT re-baseline this number.
    const EXPECTED = { veloce: 6497, harbour_lights: 10918 }
    for (const c of ['veloce', 'harbour_lights'] as const) {
      const { draws } = runFull(c, 7)
      expect(draws, `${c}: draw count is a Global Constraint, not a baseline`).toBe(EXPECTED[c])
    }
  }, 60_000)
})

describe('overtaking: the clearing instrument is trustworthy', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 17)

  it('a car with no pace advantage almost never clears', () => {
    const r = measureClearing({ circuitId: 'veloce', seeds: SEEDS, advantage: 0 })
    expect(r.failureRate, `n=${r.trials}, SE=${r.seFailureRate.toFixed(3)}`).toBeGreaterThan(0.8)
  }, 120_000)

  it('a car with an overwhelming advantage clears quickly', () => {
    const r = measureClearing({ circuitId: 'veloce', seeds: SEEDS, advantage: 2.0 })
    expect(r.failureRate, `n=${r.trials}, SE=${r.seFailureRate.toFixed(3)}`).toBeLessThan(0.1)
    expect(r.medianLapsToClear, `n=${r.trials}`).toBeLessThan(4)
  }, 120_000)
})
