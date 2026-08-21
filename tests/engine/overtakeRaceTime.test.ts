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
import { createRng } from '@engine/rng'
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

/**
 * Step through a race and stop at the first tick that logs exactly one
 * OvertakeEvent from a sector that is NOT a lap boundary (pre-tick sector !== 2).
 *
 * The lap-boundary exclusion is deliberate, not convenience: on sector 2 the
 * same tick also applies pit stops (~20s), the two-compound penalty and the AI
 * pace decisions, any of which can legitimately re-order the pair or consume
 * further rng after the pass. Excluding it isolates the overtake mechanism,
 * which is what these two tests are about.
 */
function firstOvertakeTick(circuitId: string, seed: number): {
  cfg: RaceConfig
  before: ReturnType<typeof initRace>
  after: ReturnType<typeof initRace>
  event: { overtakerId: string; overtakenId: string }
} {
  const cfg = config(circuitId, seed)
  const rng = createRng(seed)
  let state = initRace(cfg)
  for (let i = 0; i < cfg.circuit.laps * 3; i++) {
    const before = state
    const next = stepSector(cfg, state, rng)
    const added = next.overtakeEvents.length - before.overtakeEvents.length
    if (added === 1 && before.sector !== 2) {
      return { cfg, before, after: next, event: next.overtakeEvents[next.overtakeEvents.length - 1]! }
    }
    state = next
  }
  throw new Error(`no non-lap-boundary overtake found on ${circuitId}/${seed}`)
}

const sumActiveRaceTime = (s: ReturnType<typeof initRace>): number =>
  s.cars.filter(c => !c.retired).reduce((acc, c) => acc + c.raceTime, 0)

describe('overtaking: a completed pass survives the next sort', () => {
  // The defect (spec section 1.1): resolveOvertakes swapped two slots in a local
  // array copy and never touched raceTime, so the traffic penalty, dirty air,
  // final classification and the next tick's resolveOvertakes all re-sorted it
  // away. This asserts the swap is now encoded where the sort can see it.
  it('an OvertakeEvent implies the pair order changed in raceTime terms', () => {
    const { after, event } = firstOvertakeTick('veloce', 7)
    const overtaker = after.cars.find(c => c.driverId === event.overtakerId)!
    const overtaken = after.cars.find(c => c.driverId === event.overtakenId)!
    expect(
      overtaker.raceTime,
      `${event.overtakerId} passed ${event.overtakenId} but is still behind on raceTime ` +
        `(${overtaker.raceTime.toFixed(3)} vs ${overtaken.raceTime.toFixed(3)}) -- the pass is cosmetic`,
    ).toBeLessThan(overtaken.raceTime)
  }, 60_000)

  // A swap conserves total time; an assignment would invent it (spec section 4.1).
  // The only accounted addition is ONE fightCost, charged to the overtaken car
  // alone -- charging both inverted the value of racecraft (the brain that
  // passed most was billed most, collapsing OPTIMAL's gain from 1.59 to 0.13),
  // and the attacker has already paid through the traffic penalty it
  // accumulated while following.
  it('an overtake does not create or destroy race time beyond the fight cost', () => {
    const { cfg, before, event } = firstOvertakeTick('veloce', 7)

    // The counterfactual: the identical tick from the identical state, with the
    // overtake probability forced to zero so no swap happens. base and
    // paceMultiplier are the ONLY inputs to `prob`; paceAdv (and therefore the
    // layer-2 traffic penalty, which shares it) is untouched, and with
    // bestProb == 0 the `prob > bestProb` test never fires, so no rng() draw is
    // taken either. Everything before resolveOvertakes is therefore
    // bit-identical between the two runs, which makes the difference in total
    // race time attributable to the swap and nothing else.
    const noPass: RaceConfig = {
      ...cfg,
      tuning: { ...cfg.tuning, overtaking: { ...cfg.tuning.overtaking, base: 0, paceMultiplier: 0 } },
    }
    const withPass = stepSector(cfg, before, createRng(1))
    const withoutPass = stepSector(noPass, before, createRng(1))

    // Sanity: the counterfactual really did suppress the pass we are pricing.
    expect(withoutPass.overtakeEvents.length, 'counterfactual still logged a pass').toBe(
      before.overtakeEvents.length,
    )
    expect(withPass.overtakeEvents.length).toBe(before.overtakeEvents.length + 1)

    const fightCost = cfg.tuning.overtaking.fightCost
    const delta = sumActiveRaceTime(withPass) - sumActiveRaceTime(withoutPass)
    expect(
      delta,
      `pass by ${event.overtakerId} moved total race time by ${delta.toFixed(6)}s; ` +
        `a swap plus one fightCost on the overtaken car alone must move it by ` +
        `exactly ${fightCost.toFixed(6)}s`,
    ).toBeCloseTo(fightCost, 6)
  }, 60_000)
})

describe('overtaking: track position has defensive value', () => {
  // Spec section 4.2. race.ts:165 capped the traffic penalty at
  // paceAdv * trafficCap (0.7), so a faster car ALWAYS netted >= 30% of its
  // advantage and therefore always eventually cleared. Nobody could be stuck.
  it('a hard circuit blocks a faster car far more often than an easy one', () => {
    const SEEDS = Array.from({ length: 60 }, (_, i) => 500 + i * 13)
    const easy = measureClearing({ circuitId: 'veloce', seeds: SEEDS, advantage: 0.4 })
    const hard = measureClearing({ circuitId: 'harbour_lights', seeds: SEEDS, advantage: 0.4 })
    const msg = `veloce ${easy.failureRate.toFixed(3)}+-${easy.seFailureRate.toFixed(3)} ` +
      `vs harbour_lights ${hard.failureRate.toFixed(3)}+-${hard.seFailureRate.toFixed(3)}, n=${SEEDS.length} each`
    // Pre-change these were equal, because overtakingFactor was shadowed.
    expect(hard.failureRate - easy.failureRate, msg).toBeGreaterThan(0.25)
  }, 300_000)
})
