# Overtaking Converts To Race Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a successful overtake durable in `raceTime`, and make being stuck behind a slower car genuinely possible on hard-to-pass circuits.

**Architecture:** Three surgical changes inside `src/engine/race.ts`. `resolveOvertakes` swaps the pair's `raceTime` instead of their array slots. The traffic-penalty cap becomes circuit- and sector-dependent, derived from `circuit.overtakingFactor`, so it can exceed 1.0 and let a faster car lose more than its advantage. And `resolveOvertakes` reads the real per-circuit `overtakingFactor` rather than the global `tuning.overtaking.sectorFactor` constant that shadows it.

**Tech Stack:** TypeScript strict, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-circuits-that-matter-design.md` (this is Plan A of two)

## Global Constraints

- **`src/data/circuits.json` MUST NOT change.** Its values are correct; this plan consumes them.
- **`src/data/cars.json` and `src/data/drivers.json` MUST NOT change.** Settled by predecessor plans.
- **This plan adds NO new `rng()` call.** It changes what happens after an existing roll succeeds, and changes multipliers. The RNG draw sequence must be byte-identical. Assert this (Task 1).
- **Engine purity (CLAUDE.md §3):** `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`. No `Math.random()`.
- **All tuning in `src/data/tuning.json`**, never hardcoded. New keys need a zod entry in `src/data/validators.ts` and a type in `src/engine/types.ts`.
- **Every new assertion must be failable.** This project has shipped four tautologies (`|ρ| ≤ 1`, `|paceCorr| ≤ 1`, `|Δpos| < 10` at 209 SE, `distinctWinners ≥ 1`) and one unfailable floor (`≥ 0.0` on a proportion). Mutate the code and confirm each new test catches it.
- **Harness discipline:** `playerDriverId: '__none__'`, ≥ 4 circuits, stated difficulty, report SE and sample size in failure messages (`MODEL_SPEC.md` §4, §12).
- **Determinism (`MODEL_SPEC.md` §10.1):** same seed ⇒ byte-identical race, compared on serialised `RaceState`.
- Overtake *counts* are a **diagnostic, not a gate** (`MODEL_SPEC.md` §5). Never assert a band on them.

---

### Task 1: Prove the RNG stream is untouched, and build the clearing-time instrument

**Files:**
- Create: `tests/engine/overtakeClearing.ts`
- Create: `tests/engine/overtakeRaceTime.test.ts`

**Interfaces:**
- Consumes: `initRace`, `stepSector` from `@engine/index`; `createRng` from `@engine/rng`; `loadGameData` from `@data/validators`
- Produces: `measureClearing(opts): ClearingResult` and `ClearingResult`, both used by Task 2 and Task 3

This task changes **no** production code. Its job is to build the instrument and pin the invariant *before* the behaviour moves, so that when Task 2 lands we can tell a real behavioural change from a stream artefact.

- [ ] **Step 1: Write the RNG-stream pin test**

Add to `tests/engine/overtakeRaceTime.test.ts`. This captures the current draw count and final state so Task 2 can prove it did not perturb the stream.

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain } from '@engine/types'

const GAME = loadGameData()

// A counting RNG wrapper: same values as createRng, but records how many draws
// were taken. The COUNT is the invariant Task 2 must not change.
function countingRng(seed: number): { rng: () => number; draws: () => number } {
  let s = seed >>> 0
  let n = 0
  const rng = () => {
    n++
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { rng, draws: () => n }
}

function config(circuitId: string, seed: number): RaceConfig {
  const circuit = GAME.circuits[circuitId]!
  return {
    circuit, tuning: GAME.tuning, compounds: GAME.compounds,
    drivers: GAME.drivers, teams: GAME.cars.teams,
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
  while (!state.finished) state = stepSector(cfg, state, rng)
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
    const EXPECTED = { veloce: -1, harbour_lights: -1 } // filled in Step 2
    for (const c of ['veloce', 'harbour_lights'] as const) {
      const { draws } = runFull(c, 7)
      expect(draws, `${c}: draw count is a Global Constraint, not a baseline`).toBe(EXPECTED[c])
    }
  }, 60_000)
})
```

- [ ] **Step 2: Run it, read the two actual draw counts, and put them in `EXPECTED`**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "RNG draws"`
Expected: FAILS twice, each failure message printing the real count (e.g. `expected 33840 to be -1`). Copy the two real numbers into `EXPECTED`. Re-run; expect PASS.

This deliberately gets the number from the engine rather than from arithmetic — the tick's roll count depends on tyre-failure and mechanical-failure short-circuits that are not worth deriving by hand.

- [ ] **Step 3: Write the clearing-time instrument**

Create `tests/engine/overtakeClearing.ts`. It answers the one question §6.1 gates on: **how long does a demonstrably faster car take to clear the car ahead, and how often does it fail?**

```ts
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, CarState } from '@engine/types'

const GAME = loadGameData()

export interface ClearingOptions {
  circuitId: string
  /** Seeds to run; one clearing trial per seed. */
  seeds: number[]
  /** s/lap advantage to give the chasing car. Spec targets 0.3-0.5. */
  advantage: number
  /** Give up after this many laps and record a failure. */
  patienceLaps?: number
}

export interface ClearingResult {
  circuitId: string
  advantage: number
  trials: number
  /** Laps to clear, for the trials that cleared. */
  clearedLaps: number[]
  /** Fraction of trials that never cleared within patienceLaps. */
  failureRate: number
  meanLapsToClear: number
  medianLapsToClear: number
  /** Binomial SE of failureRate. */
  seFailureRate: number
}

/**
 * A two-car race: the chaser starts directly behind the leader and is `advantage`
 * s/lap faster. Everything else is held equal -- same team facets, same driver
 * facets, same compound, same age -- so the ONLY asymmetry is pace. That makes
 * "laps to clear" attributable to the overtaking model and nothing else.
 *
 * The advantage is injected through the leader's sectorBase-independent handling
 * facet rather than through tuning, so the pace gap is exact and does not
 * depend on which sector the cars are in.
 */
export function measureClearing(opts: ClearingOptions): ClearingResult { /* see Step 5 */ }
```

- [ ] **Step 4: Write the failing test for the instrument itself**

An instrument nobody has validated is worse than no instrument. Assert it reproduces a case whose answer is known by construction: with a **zero** advantage the chaser must essentially never clear, and with an absurd advantage it must essentially always clear quickly.

```ts
import { measureClearing } from './overtakeClearing'

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
```

Both are failable: the first fails if the model lets anyone through regardless of pace, the second if the model blocks everyone regardless of pace. Together they bracket the mechanism.

- [ ] **Step 5: Implement `measureClearing`**

```ts
export function measureClearing(opts: ClearingOptions): ClearingResult {
  const { circuitId, seeds, advantage, patienceLaps = 25 } = opts
  const circuit = GAME.circuits[circuitId]
  if (!circuit) throw new Error(`unknown circuit ${circuitId}`)

  // Two identical cars. The chaser's handling facet is raised so it is exactly
  // `advantage` s/lap faster: from lapModel, one facet point on `handling` is
  // worth (9/100) * deltaPerRating * sectorSplit[2] * 3 s/lap.
  const { deltaPerRating, sectorSplit } = GAME.tuning.carPerformance
  const perPoint = (9 / 100) * deltaPerRating * sectorSplit[2]! * 3
  const baseTeam = GAME.cars.teams[0]!
  const baseDriver = GAME.drivers[0]!

  const teams = [
    { ...baseTeam, id: 'leader' },
    { ...baseTeam, id: 'chaser', facets: { ...baseTeam.facets, handling: baseTeam.facets.handling + advantage / perPoint } },
  ]
  const drivers = [
    { ...baseDriver, id: 'lead_d', teamId: 'leader' },
    { ...baseDriver, id: 'chase_d', teamId: 'chaser' },
  ]

  const clearedLaps: number[] = []
  let failures = 0

  for (const seed of seeds) {
    const cfg: RaceConfig = {
      circuit, tuning: GAME.tuning, compounds: GAME.compounds,
      drivers, teams,
      // No planned stops: a pit stop would confound "laps to clear".
      strategies: [
        { driverId: 'lead_d', startCompound: 'medium', plannedStops: [], brain: 'naive' as StrategyBrain },
        { driverId: 'chase_d', startCompound: 'medium', plannedStops: [], brain: 'naive' as StrategyBrain },
      ],
      playerDriverId: '__none__',
      seed,
      tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
      mandatoryTwoCompound: false,
      coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
      paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
    }
    const rng = createRng(seed)
    let state = initRace(cfg)
    const startLap = state.lap
    let cleared = false

    const leading = (s: typeof state): string => {
      const active = s.cars.filter((c: CarState) => !c.retired)
      return [...active].sort((a, b) => a.raceTime - b.raceTime)[0]!.driverId
    }

    while (!state.finished && state.lap - startLap < patienceLaps) {
      state = stepSector(cfg, state, rng)
      if (leading(state) === 'chase_d') { clearedLaps.push(state.lap - startLap); cleared = true; break }
    }
    if (!cleared) failures++
  }

  const trials = seeds.length
  const failureRate = failures / trials
  const sorted = [...clearedLaps].sort((a, b) => a - b)
  return {
    circuitId, advantage, trials, clearedLaps, failureRate,
    meanLapsToClear: clearedLaps.length ? clearedLaps.reduce((a, b) => a + b, 0) / clearedLaps.length : NaN,
    medianLapsToClear: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN,
    seFailureRate: Math.sqrt(failureRate * (1 - failureRate) / trials),
  }
}
```

- [ ] **Step 6: Run and confirm both instrument tests pass**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts`
Expected: PASS. If the no-advantage case does NOT fail to clear, that is itself the §1.1 finding (`initRace` grid order may already put the chaser ahead) — investigate and report before proceeding; do not weaken the threshold.

- [ ] **Step 7: Record the pre-change baseline as a comment, not an assertion**

Run `measureClearing` on `veloce`, `bengaluru` and `harbour_lights` at `advantage: 0.4`, and write the three failure rates and median laps into a comment block at the top of the test file, labelled **pre-change**. Task 3 compares against these.

The point: today all three circuits should be near-identical, because `overtakingFactor` is shadowed. That comment is the evidence for §1.2.

- [ ] **Step 8: Commit**

```bash
git add tests/engine/overtakeClearing.ts tests/engine/overtakeRaceTime.test.ts
git commit -m "test(engine): clearing-time instrument and the RNG-draw invariant

Pins the exact RNG draw count over a full race, which is Plan A's Global
Constraint stated in its sharpest failable form -- adding any conditional roll
moves it. Adds a two-car clearing harness whose only asymmetry is pace, so
'laps to clear' is attributable to the overtaking model alone, and validates the
instrument by bracketing it: no advantage must almost never clear, an
overwhelming one must clear fast.

Records the pre-change baseline showing all three circuits behave identically,
which is the evidence for the spec's shadowed-overtakingFactor finding."
```

---

### Task 2: Make the pass durable and being stuck possible

**Files:**
- Modify: `src/engine/race.ts` (`resolveOvertakes` ~`:279-327`; traffic cap `:157-170`)
- Modify: `src/data/tuning.json` (`overtaking.fightCost`, `overtaking.factorFloor`)
- Modify: `src/data/validators.ts` (zod entries for both)
- Modify: `src/engine/types.ts` (`overtaking` shape)
- Test: `tests/engine/overtakeRaceTime.test.ts`

**Interfaces:**
- Consumes: `measureClearing` / `ClearingResult` from Task 1
- Produces: the changed `resolveOvertakes` semantics that Task 3 measures

- [ ] **Step 1: Add the two tuning keys**

In `src/data/tuning.json`, inside `overtaking`:

```json
"fightCost": 0.15,
"factorFloor": 0.35
```

`fightCost` is seconds lost by **both** cars on a completed pass. `factorFloor` bounds the divisor in the effective traffic cap so a circuit with a tiny `overtakingFactor` cannot produce an unbounded cap.

- [ ] **Step 2: Add zod validation and the type**

In `src/data/validators.ts`, in the `overtaking` object, add `fightCost: z.number(), factorFloor: z.number().positive(),`. `.positive()` on `factorFloor` matters: a zero would divide by zero.

In `src/engine/types.ts`, add `fightCost: number` and `factorFloor: number` to the `overtaking` shape.

- [ ] **Step 3: Write the failing test for a durable pass**

```ts
describe('overtaking: a completed pass survives the next sort', () => {
  // The defect (spec section 1.1): resolveOvertakes swapped two slots in a local
  // array copy and never touched raceTime, so the traffic penalty, dirty air,
  // final classification and the next tick's resolveOvertakes all re-sorted it
  // away. This asserts the swap is now encoded where the sort can see it.
  it('an OvertakeEvent implies the pair order changed in raceTime terms', () => {
    // Run a race, find the first OvertakeEvent, and confirm that immediately
    // after the tick that logged it, the overtaker's raceTime is BELOW the
    // overtaken's -- i.e. the pass is real and not cosmetic.
    // Full body in the implementation; the assertion is:
    //   expect(overtakerTime).toBeLessThan(overtakenTime)
  }, 60_000)

  // A swap conserves total time; an assignment would invent it (spec section 4.1).
  it('an overtake does not create or destroy race time beyond the fight cost', () => {
    // Sum raceTime across all active cars before and after a tick containing
    // exactly one OvertakeEvent. The difference must be explained by sector
    // times plus exactly 2 * fightCost, within floating-point tolerance.
  }, 60_000)
})
```

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "survives the next sort"`
Expected: FAIL — the first assertion fails because the current code never writes `raceTime`.

- [ ] **Step 4: Implement the raceTime swap**

In `resolveOvertakes`, replace the slot swap:

```ts
  if (bestIdx > 0 && rng() < bestProb) {
    const behind = result[bestIdx]!
    const ahead = result[bestIdx - 1]!
    // Swap raceTime, not array slots. The slots were erased by the next sort --
    // see the spec's section 1.1. A swap conserves total time (an assignment
    // would gift the overtaker time it never made up on track) and is
    // automatically bounded to <= traffic.gapThreshold, because the pair is
    // only eligible inside that gap. Both cars also pay fightCost: racing
    // wheel-to-wheel is slower than clear air, and charging it to both changes
    // no gap while making a race full of passes genuinely slower.
    const fightCost = config.tuning.overtaking.fightCost
    result[bestIdx - 1] = { ...behind, raceTime: ahead.raceTime + fightCost }
    result[bestIdx] = { ...ahead, raceTime: behind.raceTime + fightCost }
    events.push({ lap, sector, overtakerId: behind.driverId, overtakenId: ahead.driverId })
  }
```

Note both the slot assignment **and** the time swap are kept: the slots keep the returned array ordered for the caller's convenience, and the times make it durable.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "survives the next sort"`
Expected: PASS, both assertions.

- [ ] **Step 6: Write the failing test for the circuit-dependent traffic cap**

```ts
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
```

Run it. Expected: FAIL — pre-change the two circuits behave identically, so the difference is ~0.

- [ ] **Step 7: Implement the circuit-dependent cap and the real overtaking factor**

Two edits in `src/engine/race.ts`.

The traffic cap, in the `penalisedCars` map (~`:157-170`):

```ts
    if (gap <= config.tuning.traffic.gapThreshold) {
      const paceAdv = calculatePaceAdvantage(config, car, ahead)
      const rawPenalty = config.tuning.traffic.penalty / 3
      // The cap is circuit- and sector-dependent. Dividing by overtakingFactor
      // means a hard circuit can push the cap ABOVE 1.0, letting a follower
      // lose MORE than its pace advantage -- which is the first time in this
      // simulation that track position has defensive value. factorFloor bounds
      // the divisor so a tiny factor cannot produce an unbounded cap, and
      // rawPenalty still bounds the absolute per-sector loss regardless.
      const factor = Math.max(config.circuit.overtakingFactor[sector]!, config.tuning.overtaking.factorFloor)
      const effectiveCap = config.tuning.traffic.trafficCap / factor
      const cappedPenalty = Math.min(rawPenalty, paceAdv * effectiveCap)
      return { ...car, raceTime: car.raceTime + cappedPenalty }
    }
```

And in `resolveOvertakes`, replace the shadowing constant:

```ts
  // Was: config.tuning.overtaking.sectorFactor[sector] -- a global constant
  // sitting in the exact place the per-circuit field belongs (spec section 1.2).
  const sectorEase = config.circuit.overtakingFactor[sector]!
```

Leave `tuning.overtaking.sectorFactor` in the data file and its type for now; Task 3 decides whether it is dead and removes it in one place with the evidence.

- [ ] **Step 8: Run the cap test**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "defensive value"`
Expected: PASS.

- [ ] **Step 9: Confirm the RNG-draw invariant still holds**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "RNG draws"`
Expected: **PASS with the Task 1 numbers unchanged.** If it fails, a roll was added or removed — fix the implementation. **Do not update the expected counts.** This is the Global Constraint.

- [ ] **Step 10: Run the whole suite and triage every break**

Run: `npx tsc --noEmit && npx vitest run`

Breaks are expected: the pre-change suite was measured against cosmetic overtaking. Classify each one in the report as either **(a)** a stale fixture assumption that encoded the defect, or **(b)** a real regression. Fix (b) properly; re-baseline (a) only with a comment saying which defect the old number encoded. Never re-baseline a band from `tuning.json._regressionBands` — those are the oracle's, and if one moves out of band that is a finding for Task 3, not a number to edit.

- [ ] **Step 11: Commit**

```bash
git add src/engine/race.ts src/data/tuning.json src/data/validators.ts src/engine/types.ts tests/engine/
git commit -m "feat(engine): overtakes change race time, and track position defends

resolveOvertakes swapped two slots in a local array copy and never touched
raceTime, so the traffic penalty, dirty air, final classification and the next
tick all re-sorted the pass away -- 46.3 logged overtakes a race with no effect
on the result. It now swaps the pair's raceTime, which conserves total time
where an assignment would gift the overtaker seconds it never made up, and is
automatically bounded by the 1.0s eligibility gap.

The traffic cap becomes circuit- and sector-dependent via overtakingFactor,
which was not merely unused but SHADOWED by a global constant in the exact place
it belonged. Dividing by it lets the cap exceed 1.0 on hard circuits, so a
faster car can lose more than its advantage -- the first time track position has
defensive value here. Previously the 0.7 cap guaranteed a faster car always
netted 30% and therefore always eventually cleared.

Adds overtaking.fightCost, charged to both cars on a completed pass."
```

---

### Task 3: Calibrate, measure against the spec's targets, and update the oracle

**Files:**
- Modify: `src/data/tuning.json` (`overtaking.base` retune; remove `sectorFactor` if dead)
- Modify: `src/engine/types.ts`, `src/data/validators.ts` (only if `sectorFactor` is removed)
- Modify: `MODEL_SPEC.md` (§9 no longer true; §3 and §8 updated)
- Modify: `tests/engine/overtakeRaceTime.test.ts` (the §6.1 gates)

- [ ] **Step 1: Measure the clearing targets across the calibration set**

Using `measureClearing` at `advantage: 0.4`, over ≥ 60 seeds, on **all 12 circuits**. Report failure rate ± SE and median laps to clear for each.

Compare against spec §6.1:

| Gate | Target |
|---|---|
| Laps to clear (0.3–0.5 s/lap advantage) | **3–8** |
| Failure rate, median circuit | **15–25%** |
| Failure rate, hardest circuit (Harbour Lights) | **60–75%** |

- [ ] **Step 2: Retune `overtaking.base` if, and only if, the targets are missed**

`base` is 0.22 against the old global `sectorFactor` mean of ~0.60; the per-circuit mean is different, so the effective probability has moved. Adjust `base` until §6.1's targets are met.

Two constraints on this step:
- **The field-wide overtake count is a calibration anchor, not a gate** (`MODEL_SPEC.md` §5). Aim near the historical 46.3 for continuity, but never assert a band on it, and never sacrifice a §6.1 target to hit it.
- **Report the search.** State which values were tried and what each measured. A fitted constant with no shown work is indistinguishable from a guess.

- [ ] **Step 3: Add the §6.1 gates as failable tests**

Write the three targets as assertions with sample sizes and SEs in the failure messages. For each, state in a comment how many SE of margin it has. **If a gate has less than 2 SE of margin, say so** rather than shipping a flaky gate — and prefer widening the sample over widening the band.

- [ ] **Step 4: Decide `tuning.overtaking.sectorFactor`'s fate, with evidence**

After Step 2, `sectorFactor` should have no remaining consumer. Grep to confirm. If dead, remove it from `tuning.json`, `validators.ts` and `types.ts` in the same commit, and record it in `MODEL_SPEC.md` §8's dead-data list as **resolved**. If it still has a consumer, say where and leave it.

- [ ] **Step 5: Re-measure every field-wide band across all 12 circuits**

Durable overtaking changes classifications, so every §3 metric may have moved. Measure and report, both difficulties:

- top-team win share, distinct winners, `paceRankCorrelation`, mean |Δpos|, grid↔finish ρ, mechanical DNF.

**Any band that has moved out of range is a finding to report, not a number to edit.** Note especially that `paceRankCorrelation ≥ 0.90` is the anti-lottery gate: durable overtaking should *raise* it, because results now reflect on-track order rather than pure cumulative pace. If it fell, something is wrong.

- [ ] **Step 6: Update `MODEL_SPEC.md`**

- **§9 ("overtaking is decorative") is no longer true.** Rewrite it to record what was wrong, what changed, and the measured clearing behaviour. Do not delete the finding — the history is why the gates exist.
- **§8's dead-data list:** `overtakingFactor` is now consumed. Mark it resolved and note the remaining three are Plan B's.
- **§3:** update the "Sim at" column for any metric that moved, and date it. §3 and §4 must not contradict each other — a half-updated oracle is worse than an untouched one, and this project has already shipped that failure once.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src tests MODEL_SPEC.md
git commit -m "balance(overtaking): calibrate against the clearing targets, update the oracle

Retunes overtaking.base for the per-circuit factor now in use and gates the
spec's clearing targets: a 0.3-0.5 s/lap advantage takes 3-8 laps to clear,
failing 15-25% on a median circuit and 60-75% at Harbour Lights.

MODEL_SPEC section 9 said overtaking was decorative. It is not any more, so that
section is rewritten rather than deleted -- the history is why these gates exist
-- and overtakingFactor comes off section 8's dead-data list."
```

---

## Self-Review

**Spec coverage.** §4.1 durable pass → Task 2 Steps 3-5. §4.2 traffic cap → Task 2 Steps 6-8. §4.3 real per-circuit factor → Task 2 Step 7. §4.4 RNG discipline → Task 1 Steps 1-2 and Task 2 Step 9. §6.1 gates → Task 3 Steps 1-3. §7's "swap conserves time" risk → Task 2 Step 3's second assertion. §7's "unbounded cap" risk → `factorFloor` (Task 2 Steps 1-2) plus `rawPenalty`'s standing bound. §7's "fitted constant" risk → Task 3 Step 2's report-the-search requirement. No gaps.

**Placeholder scan.** One deliberate exception: Task 2 Step 3's two test bodies are described by their assertions rather than written out, because both need the index of the first `OvertakeEvent` in a specific run, which has to be read from the engine rather than predicted. The assertion each must make is stated exactly. Task 1's `EXPECTED` draw counts are `-1` on purpose — Step 2 exists to replace them with measured values, and inventing them here would be worse than leaving them provably wrong.

**Type consistency.** `measureClearing(opts: ClearingOptions): ClearingResult` is used identically in Tasks 1, 2 and 3. Every field read off `ClearingResult` in a test (`failureRate`, `seFailureRate`, `medianLapsToClear`, `trials`) is declared. `overtaking.fightCost` and `overtaking.factorFloor` are added to `tuning.json`, `validators.ts` and `types.ts` in the same step (Task 2 Steps 1-2) and read in Task 2 Steps 4 and 7.

**One risk a reviewer should weigh.** Task 2 Step 10 will break existing tests, and the instruction to classify each break as stale-fixture or real-regression puts real judgment in an implementer's hands. That is deliberate — the alternative is enumerating breaks I cannot predict — but it is the step most worth a careful review.
