# Race Incidents — Plan A (engine and bands) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the simulation chaos — driver errors, crashes and safety cars — so results stop being near-deterministic, then re-measure every regression band and settle them honestly.

**Architecture:** A new pure module `src/engine/incidents.ts` owns every *decision* (does this car err, is it terminal, how costly, does it deploy a safety car, for how long, what does compression do). `race.ts` owns *applying* those decisions to `CarState`/`RaceState`. The safety car is a two-state machine on the existing sector tick — no new loop. Its state lives on `RaceState`, which is what makes `projection.ts` price a stop under yellow correctly for free.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, seeded mulberry32 RNG, zod for data validation.

**Spec:** `docs/superpowers/specs/2026-08-22-race-incidents-design.md` — **read the amendment banner at the top first**, then §5 (architecture), §7 (tuning values) and §8 (testing). This plan implements that spec's **Plan A** only; the five UI surfaces in its §6 are Plan B and are out of scope here.

## Global Constraints

Copied verbatim from `CLAUDE.md` and the spec. Every task's requirements implicitly include these.

- **Engine purity.** `src/engine/` imports nothing from `state/`, `ui/` or `canvas/`.
- **Determinism is non-negotiable.** Same seed + same inputs ⇒ byte-identical race. No `Math.random()` anywhere in `src/engine/`; all randomness through the injected `Rng`.
- **RNG-stream discipline.** Every new roll MUST be guarded so a `0.0` tuning value performs **no `rng()` call at all**, following `race.ts`'s existing `perLap > 0 && rng() < perLap / 3` idiom. The order of that `&&` is load-bearing.
- **All balance constants live in `src/data/*.json`.** Never hardcoded in logic.
- **TypeScript strict, no `any`.** Exhaustive `switch` on unions with a `never` guard.
- **A band in `tuning.json._regressionBands` may only ever be ADVANCED toward its `MODEL_SPEC.md` §3 target, never widened.** This project has shipped that failure once.
- **`MODEL_SPEC.md` is the regression oracle.** If a change falsifies a statement in it, correct the document in the same commit. §3 and §4 must agree with each other.
- **Every new assertion must be failable.** Mutate the data and confirm the test catches it. Five unfailable assertions have shipped historically; do not add a sixth.
- **Editing `src/data/tuning.json`: surgical text edits only.** An agent once destroyed this file by round-tripping it through `JSON.stringify` — it reformatted every line, dropped the trailing newline, and reverted a `_note`. Verify with `git diff src/data/tuning.json` after every edit.
- **The spec's §2.1 stopping rule binds in BOTH directions.** Do not raise magnitudes to pull win share down into 0.35–0.55, and do not shave them to pull it back up. If real-F1-accurate rates put win share outside the band, that is a finding to report, not a number to fit. The one exception: `paceRankCorrelation < 0.90` is a defect to fix, not a finding to report.

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/incidents.ts` | **New.** Pure decisions: roll predicates, magnitudes, compression arithmetic, the effective-pit-loss helper. Owns no state and mutates nothing. |
| `src/engine/types.ts` | `IncidentKind`, `IncidentEvent`, `SafetyCarState`; two new `RaceState` fields; the new `tuning.incidents` shape. |
| `src/engine/race.ts` | Applies incident outcomes in the per-car map; runs the safety car state machine; disables overtaking under yellow. |
| `src/engine/lapModel.ts` | One change only: multiply the computed sector time by the safety car `paceMultiplier`. Performs no `rng()` call. |
| `src/engine/projection.ts` | Uses the effective-pit-loss helper so the "if you pit now" overlay is correct under yellow. |
| `src/state/raceStore.ts` | Uses the same helper at both pit call sites, so the player's real stop gets the same discount the projection promised. |
| `src/data/tuning.json` + `src/data/validators.ts` | The `incidents` block and its zod schema. |
| `tests/fixtures/tuning.ts` | `makeDeterministicTuning()` extended to zero the new keys. |
| `tests/engine/incidents.test.ts` | **New.** Unit tests for the pure module. |
| `tests/engine/safetyCar.test.ts` | **New.** State machine, compression, pit discount, projection-under-yellow. |
| `tests/fixtures/golden-race-pre-incidents.json` | **New.** The byte-identity reference, captured before any engine change. |

---

### Task 1: Capture the golden race, then add the tuning block, types and validator

The spec's §8.1 says the zero-config byte-identity test is the regression net for the entire existing suite and must be built **first**. It needs a reference captured **before** any engine change, so that happens in this task's opening steps.

**Files:**
- Create: `tests/fixtures/golden-race-pre-incidents.json`
- Create: `tests/engine/byteIdentity.test.ts`
- Modify: `src/data/tuning.json` (the `incidents` block)
- Modify: `src/data/validators.ts:113`
- Modify: `src/engine/types.ts:95`
- Modify: `tests/fixtures/tuning.ts` (`makeDeterministicTuning`)

**Interfaces:**
- Produces: the `tuning.incidents` shape that Tasks 2–5 consume; `makeDeterministicTuning()` zeroing the new keys.
- Consumes: nothing.

- [ ] **Step 1: Write the golden-capture script and run it BEFORE touching the engine**

Create `scripts/capture-golden-race.ts` — a throwaway capture tool, committed so the fixture is reproducible:

```ts
// Captures a serialised end-of-race RaceState as the byte-identity reference
// for the race-incidents work. Run BEFORE any engine change:
//   npx vite-node scripts/capture-golden-race.ts
import { writeFileSync } from 'node:fs'
import { initRace, stepSector } from '../src/engine/index'
import { createRng } from '../src/engine/rng'
import { loadGameData } from '../src/data/validators'
import type { RaceConfig } from '../src/engine/types'

const DATA = loadGameData()
const circuit = DATA.circuits['bengaluru']!
const config: RaceConfig = {
  circuit,
  tuning: DATA.tuning,
  compounds: DATA.compounds,
  drivers: DATA.drivers.drivers,
  teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults,
  playerDriverId: '__none__',
  seed: 424242,
}
let state = initRace(config)
const rng = createRng(424242)
for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
writeFileSync(
  'tests/fixtures/golden-race-pre-incidents.json',
  JSON.stringify(state, null, 2) + '\n',
)
// eslint-disable-next-line no-console
console.log('captured', state.cars.length, 'cars, lap', state.lap, 'rngState', state.rngState)
```

Run: `npx vite-node scripts/capture-golden-race.ts`
Expected: writes the fixture and prints `captured 20 cars, lap <n> rngState <n>`. **If `vite-node` is unavailable, add it as a devDependency or run the equivalent inside a temporary vitest test — do not skip this step, and do not hand-write the fixture.**

- [ ] **Step 2: Commit the golden fixture on its own**

```bash
git add scripts/capture-golden-race.ts tests/fixtures/golden-race-pre-incidents.json
git commit -m "test(engine): capture a golden pre-incidents race as the byte-identity reference

The race-incidents work adds rng() calls to the hot path. Every new roll is
guarded so a 0.0 tuning value draws nothing, but that guarantee needs a
reference to be checked against, and the reference has to be captured before
the engine changes. Committed separately so the fixture's provenance is a
commit that predates every incident mechanic."
```

- [ ] **Step 3: Write the byte-identity test (it must pass immediately, against an unchanged engine)**

Create `tests/engine/byteIdentity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const GOLDEN_PATH = 'tests/fixtures/golden-race-pre-incidents.json'

/*
 * THE REGRESSION NET FOR THE ENTIRE RACE-INCIDENTS CHANGE.
 *
 * Adding rng() calls to the per-sector hot path would shift the draw sequence
 * and silently move every measured number in this repository. The spec's
 * section 5.5 therefore requires every new roll to be short-circuited so a 0.0
 * tuning value performs NO rng() call -- the same `perLap > 0 && rng() < ...`
 * idiom race.ts already uses for mechanical failure.
 *
 * This test is how that requirement is enforced. The fixture was captured from
 * a commit that predates every incident mechanic. If this test fails, a guard
 * is missing or mis-ordered; DO NOT re-capture the fixture to make it pass.
 * Re-capturing is how a stream shift gets laundered into a "new baseline".
 *
 * It compares serialised state, not summary metrics, deliberately: this
 * project's original determinism test passed while every car's lap times were
 * perturbed by 0.0007s and tyre ages by a full lap, because it only compared
 * summary figures.
 */
describe('byte-identity with incidents disabled', () => {
  it('reproduces the golden pre-incidents race exactly', () => {
    const golden = readFileSync(GOLDEN_PATH, 'utf8')
    const DATA = loadGameData()
    const circuit = DATA.circuits['bengaluru']!
    const config: RaceConfig = {
      circuit,
      tuning: DATA.tuning,
      compounds: DATA.compounds,
      drivers: DATA.drivers.drivers,
      teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults,
      playerDriverId: '__none__',
      seed: 424242,
    }
    let state = initRace(config)
    const rng = createRng(424242)
    for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
    expect(JSON.stringify(state, null, 2) + '\n').toBe(golden)
  }, 60_000)
})
```

Run: `npx vitest run tests/engine/byteIdentity.test.ts`
Expected: PASS (the engine has not changed yet).

**Note for later tasks:** once `RaceState` gains `safetyCar` and `incidents` (Task 3/4), this test's serialised output changes shape and the fixture must be re-captured **once**, in the task that adds the fields, with the diff reviewed to confirm only the two new empty/null fields appear. That is a legitimate re-capture; a re-capture that changes any *car* value is not.

- [ ] **Step 4: Add the tuning block**

In `src/data/tuning.json`, replace line 71's stub — a **surgical single-line edit**:

```json
  "incidents": { "dnfPerLap": 0.0, "driverErrorPerLap": 0.0 },
```

with:

```json
  "incidents": {
    "dnfPerLap": 0.0,
    "driverErrorPerLap": 0.0,
    "terminalFraction": 0.20,
    "errorTimeLossMean": 3.5,
    "errorTimeLossSigma": 1.5,
    "consistencyReliefMax": 0.35,
    "safetyCar": {
      "crashDeployChance": 0.0,
      "mechanicalDeployChance": 0.0,
      "gapCompression": 0.35,
      "paceMultiplier": 1.45,
      "laneTimeLossUnderSc": 10.0,
      "durationLapsMin": 3,
      "durationLapsMax": 5,
      "maxPerRace": 2
    }
  },
```

**Every rate stays 0.0 in this task.** `driverErrorPerLap`, `crashDeployChance` and `mechanicalDeployChance` are the three switches; they are turned on in Task 5 only, after all mechanism tests pass. The non-rate values (fractions, magnitudes, durations) are set to their final §7 values now, because they are inert while the rates are zero and it keeps Task 5 to a three-number diff.

`dnfPerLap` stays 0.0 and unused — it is dead in the shipped engine and the spec does not give it a consumer. Leave it; removing it is out of scope.

Verify: `git diff src/data/tuning.json` shows only this block changed, and `python3 -c "import json;json.load(open('src/data/tuning.json'))"` succeeds.

- [ ] **Step 5: Extend the type and the zod schema**

`src/engine/types.ts:95`, replace:

```ts
  incidents: { dnfPerLap: number; driverErrorPerLap: number }
```

with:

```ts
  incidents: {
    // dnfPerLap is dead: no consumer in src/engine/. Kept because removing it
    // is outside the race-incidents plan's scope.
    dnfPerLap: number
    driverErrorPerLap: number
    terminalFraction: number
    errorTimeLossMean: number
    errorTimeLossSigma: number
    consistencyReliefMax: number
    safetyCar: {
      crashDeployChance: number
      mechanicalDeployChance: number
      gapCompression: number
      paceMultiplier: number
      laneTimeLossUnderSc: number
      durationLapsMin: number
      durationLapsMax: number
      maxPerRace: number
    }
  }
```

`src/data/validators.ts:113`, replace:

```ts
  incidents: z.object({ dnfPerLap: z.number(), driverErrorPerLap: z.number() }),
```

with:

```ts
  incidents: z.object({
    dnfPerLap: z.number(),
    driverErrorPerLap: z.number(),
    terminalFraction: z.number().min(0).max(1),
    errorTimeLossMean: z.number(),
    errorTimeLossSigma: z.number(),
    consistencyReliefMax: z.number().min(0).max(1),
    safetyCar: z.object({
      crashDeployChance: z.number().min(0).max(1),
      mechanicalDeployChance: z.number().min(0).max(1),
      gapCompression: z.number().min(0).max(1),
      paceMultiplier: z.number(),
      laneTimeLossUnderSc: z.number(),
      durationLapsMin: z.number().int(),
      durationLapsMax: z.number().int(),
      maxPerRace: z.number().int(),
    }),
  }),
```

The `.min(0).max(1)` bounds on the four probabilities and two fractions are deliberate: they turn a fat-fingered `3.5` where `0.35` was meant into a load-time failure rather than a silently 10×-too-frequent mechanic.

- [ ] **Step 6: Extend `makeDeterministicTuning` to zero the new switches**

`tests/fixtures/tuning.ts`, in `makeDeterministicTuning`, replace:

```ts
    incidents: { dnfPerLap: 0, driverErrorPerLap: 0 },
```

with:

```ts
    incidents: {
      dnfPerLap: 0,
      driverErrorPerLap: 0,
      // Zeroing the two deploy chances is what keeps the safety car out of
      // these tests, and it must be done HERE rather than via maxPerRace: 0.
      // The deployment roll is guarded on the deploy chance (see
      // incidents.ts), so a zero chance draws no rng() at all; a zero
      // maxPerRace checked after the roll would still consume a draw and
      // shift the stream for every existing test.
      safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    },
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS, including the new byte-identity test and all 281 existing tests.

```bash
git add src/data src/engine/types.ts tests/fixtures/tuning.ts tests/engine/byteIdentity.test.ts
git commit -m "feat(engine): add the incidents tuning block, types and validator

Every rate ships at 0.0 -- driverErrorPerLap and the two safety-car deploy
chances are the three switches, turned on only after the mechanisms they
gate are built and tested. The non-rate values take their final spec values
now, since they are inert while the rates are zero.

The four probabilities and two fractions carry .min(0).max(1) bounds in zod
so a fat-fingered 3.5 where 0.35 was meant fails at load rather than running
a mechanic 10x too often.

makeDeterministicTuning zeroes the deploy CHANCES rather than maxPerRace,
because the deployment roll is guarded on the chance -- a zero maxPerRace
checked after the roll would still consume a draw and shift the stream."
```

---

### Task 2: `incidents.ts` — the pure decision module

Nothing calls this yet. Built and unit-tested in isolation first, because a roll function can be exercised a hundred thousand times without stepping a race, and because the spec's §5.1 makes this module's whole justification that it is testable apart from the sector loop.

**Files:**
- Create: `src/engine/incidents.ts`
- Create: `tests/engine/incidents.test.ts`
- Modify: `src/engine/index.ts` (re-export)

**Interfaces:**
- Consumes: `TuningConstants`, `CarState`, `CircuitSpec`, `SafetyCarState`, `Rng`.
- Produces, for Tasks 3–5:
  - `driverErrorChancePerSector(consistency: number, tuning: TuningConstants): number`
  - `rollDriverError(consistency: number, tuning: TuningConstants, rng: Rng): boolean`
  - `rollErrorIsTerminal(tuning: TuningConstants, rng: Rng): boolean`
  - `rollErrorTimeLoss(tuning: TuningConstants, rng: Rng): number`
  - `rollSafetyCarDeployment(cause: 'crash' | 'mechanical', tuning: TuningConstants, rng: Rng): boolean`
  - `rollSafetyCarDuration(tuning: TuningConstants, rng: Rng): number`
  - `compressRaceTimes(raceTimes: number[], compression: number): number[]`
  - `effectivePitLaneLoss(circuit: CircuitSpec, safetyCar: SafetyCarState | null, tuning: TuningConstants): number`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/incidents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRng } from '@engine/rng'
import {
  driverErrorChancePerSector,
  rollDriverError,
  rollErrorIsTerminal,
  rollErrorTimeLoss,
  rollSafetyCarDeployment,
  rollSafetyCarDuration,
  compressRaceTimes,
  effectivePitLaneLoss,
} from '@engine/incidents'
import { makeTuning } from '../fixtures/tuning'
import { loadGameData } from '@data/validators'
import type { SafetyCarState } from '@engine/types'

const T = makeTuning({
  incidents: {
    driverErrorPerLap: 0.0105,
    terminalFraction: 0.20,
    errorTimeLossMean: 3.5,
    errorTimeLossSigma: 1.5,
    consistencyReliefMax: 0.35,
    safetyCar: { crashDeployChance: 0.30, mechanicalDeployChance: 0.12 },
  },
})

describe('driver error chance', () => {
  // The per-sector chance is the per-lap rate divided by 3 and relieved by
  // consistency, mirroring the wet spin's shape at lapModel.ts:67-71.
  it('is the per-lap rate over three, relieved by consistency', () => {
    // consistency 0 -> no relief at all
    expect(driverErrorChancePerSector(0, T)).toBeCloseTo(0.0105 / 3, 12)
    // consistency 100 -> full relief of consistencyReliefMax (35%)
    expect(driverErrorChancePerSector(100, T)).toBeCloseTo((0.0105 / 3) * 0.65, 12)
  })

  it('is monotonically decreasing in consistency', () => {
    let prev = Infinity
    for (let c = 0; c <= 100; c += 5) {
      const v = driverErrorChancePerSector(c, T)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('never goes negative even at an out-of-range consistency', () => {
    // consistencyReliefMax is zod-bounded to <= 1, so relief cannot exceed
    // 100% and this cannot flip sign. Asserted so a future bound change that
    // removes that guarantee fails here rather than silently making drivers
    // error-proof (a negative chance reads as "never" -- invulnerability).
    expect(driverErrorChancePerSector(100, makeTuning({
      incidents: { driverErrorPerLap: 0.0105, consistencyReliefMax: 1 },
    }))).toBe(0)
  })
})

describe('driver error roll', () => {
  it('converges on the configured chance', () => {
    const rng = createRng(7)
    const N = 200_000
    let hits = 0
    for (let i = 0; i < N; i++) if (rollDriverError(82.25, T, rng)) hits++
    const expected = driverErrorChancePerSector(82.25, T)
    // 3-sigma binomial band at N=200k: SE = sqrt(p(1-p)/N) ~= 1.9e-5
    const se = Math.sqrt(expected * (1 - expected) / N)
    expect(Math.abs(hits / N - expected)).toBeLessThan(4 * se)
  })

  it('DRAWS NOTHING when the rate is zero -- the RNG-stream guarantee', () => {
    // This is the property the whole existing test suite depends on. If the
    // guard is reordered to `rng() < chance && chance > 0`, this fails.
    const zeroed = makeTuning({ incidents: { driverErrorPerLap: 0 } })
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (let i = 0; i < 100; i++) expect(rollDriverError(50, zeroed, counting)).toBe(false)
    expect(draws, 'rng() must not be called when driverErrorPerLap is 0').toBe(0)
  })
})

describe('terminal fraction', () => {
  it('converges on terminalFraction', () => {
    const rng = createRng(11)
    const N = 100_000
    let terminal = 0
    for (let i = 0; i < N; i++) if (rollErrorIsTerminal(T, rng)) terminal++
    const se = Math.sqrt(0.2 * 0.8 / N)
    expect(Math.abs(terminal / N - 0.20)).toBeLessThan(4 * se)
  })
})

describe('error time loss', () => {
  it('is Gaussian around the mean and never negative', () => {
    const rng = createRng(13)
    const N = 50_000
    let sum = 0
    let min = Infinity
    for (let i = 0; i < N; i++) {
      const v = rollErrorTimeLoss(T, rng)
      sum += v
      min = Math.min(min, v)
    }
    // Clamped at 0, so the sample mean sits slightly ABOVE errorTimeLossMean.
    // At mean 3.5 / sigma 1.5 the clamp bites at -2.33 sigma (~1% of draws),
    // which lifts the mean by only ~0.02s -- hence the loose 0.15s tolerance
    // rather than a tight one.
    expect(sum / N).toBeGreaterThan(3.5)
    expect(sum / N).toBeLessThan(3.5 + 0.15)
    expect(min).toBeGreaterThanOrEqual(0)
  })
})

describe('safety car deployment roll', () => {
  it('uses the cause-specific chance', () => {
    const N = 100_000
    for (const [cause, p] of [['crash', 0.30], ['mechanical', 0.12]] as const) {
      const rng = createRng(17)
      let hits = 0
      for (let i = 0; i < N; i++) if (rollSafetyCarDeployment(cause, T, rng)) hits++
      const se = Math.sqrt(p * (1 - p) / N)
      expect(Math.abs(hits / N - p), `${cause} deploy rate`).toBeLessThan(4 * se)
    }
  })

  it('DRAWS NOTHING when the deploy chance is zero', () => {
    // Load-bearing beyond the usual reason: cars ALREADY retire today from
    // tyre and mechanical failures, so unlike the driver-error roll this one
    // would fire on the existing suite's retirements and break byte-identity
    // even with driverErrorPerLap at 0. The guard must be on the CHANCE.
    const zeroed = makeTuning({
      incidents: { safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 } },
    })
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (const cause of ['crash', 'mechanical'] as const) {
      for (let i = 0; i < 100; i++) {
        expect(rollSafetyCarDeployment(cause, zeroed, counting)).toBe(false)
      }
    }
    expect(draws, 'rng() must not be called when both deploy chances are 0').toBe(0)
  })
})

describe('safety car duration', () => {
  it('stays within the configured inclusive bounds and covers them', () => {
    const rng = createRng(19)
    const seen = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const d = rollSafetyCarDuration(T, rng)
      expect(Number.isInteger(d)).toBe(true)
      expect(d).toBeGreaterThanOrEqual(3)
      expect(d).toBeLessThanOrEqual(5)
      seen.add(d)
    }
    // Inclusive of BOTH ends: an off-by-one that makes max unreachable is the
    // most likely bug in an integer range roll.
    expect([...seen].sort()).toEqual([3, 4, 5])
  })
})

describe('gap compression', () => {
  it('scales every gap to the leader by the compression factor', () => {
    // Leader unmoved; a 25s gap becomes 8.75s at 0.35.
    expect(compressRaceTimes([100, 110, 125], 0.35)).toEqual([100, 103.5, 108.75])
  })

  it('is identity at compression 1 and full bunching at 0', () => {
    expect(compressRaceTimes([100, 110, 125], 1)).toEqual([100, 110, 125])
    expect(compressRaceTimes([100, 110, 125], 0)).toEqual([100, 100, 100])
  })

  it('takes the MINIMUM as the leader regardless of input order', () => {
    // race.ts passes active cars in whatever order they sit in; compression
    // must not depend on the caller having sorted them.
    expect(compressRaceTimes([125, 100, 110], 0.35)).toEqual([108.75, 100, 103.5])
  })

  it('returns an empty array unchanged', () => {
    expect(compressRaceTimes([], 0.35)).toEqual([])
  })
})

describe('effective pit lane loss', () => {
  const circuit = loadGameData().circuits['veloce']!   // pitLaneTimeLoss 18.0
  it('is the circuit value when there is no safety car', () => {
    expect(effectivePitLaneLoss(circuit, null, T)).toBe(18.0)
  })
  it('is laneTimeLossUnderSc while a safety car is active', () => {
    const sc: SafetyCarState = { deployedLap: 10, lapsRemaining: 3, cause: 'crash' }
    expect(effectivePitLaneLoss(circuit, sc, T)).toBe(T.incidents.safetyCar.laneTimeLossUnderSc)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/incidents.test.ts`
Expected: FAIL — `Failed to resolve import "@engine/incidents"`.

- [ ] **Step 3: Write `src/engine/incidents.ts`**

```ts
import type { CircuitSpec, SafetyCarState, TuningConstants } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'

/**
 * Race incidents — the DECISIONS only.
 *
 * This module is deliberately stateless and mutates nothing. `race.ts` owns
 * applying every outcome to `CarState`/`RaceState`; see the spec's section 5.5,
 * which settles the split explicitly because both sides touch sector time.
 *
 * RNG-STREAM DISCIPLINE. Every roll here short-circuits on a zero rate so it
 * performs no rng() call at all, matching race.ts's existing
 * `perLap > 0 && rng() < perLap / 3`. The order of that `&&` is load-bearing
 * and `tests/engine/incidents.test.ts` asserts it directly with a counting rng.
 * Without it, every measured number in this repository moves.
 */

/**
 * Per-SECTOR chance that a driver makes a mistake.
 *
 * Mirrors the wet spin's shape at lapModel.ts:67-71: a per-lap rate divided by
 * three, relieved by a driver facet. Relief reduces how OFTEN a driver errs; it
 * deliberately does not touch `terminalFraction` -- a mistake, once made, is no
 * less likely to end the race for a consistent driver.
 */
export function driverErrorChancePerSector(consistency: number, tuning: TuningConstants): number {
  const inc = tuning.incidents
  const relief = (consistency / 100) * inc.consistencyReliefMax
  return (inc.driverErrorPerLap / 3) * (1 - relief)
}

export function rollDriverError(consistency: number, tuning: TuningConstants, rng: Rng): boolean {
  const chance = driverErrorChancePerSector(consistency, tuning)
  return chance > 0 && rng() < chance
}

export function rollErrorIsTerminal(tuning: TuningConstants, rng: Rng): boolean {
  const f = tuning.incidents.terminalFraction
  return f > 0 && rng() < f
}

/**
 * Seconds lost to a non-terminal mistake. Clamped at zero, so the realised mean
 * sits marginally above `errorTimeLossMean` -- the same clamp the wet spin uses
 * at lapModel.ts:80.
 *
 * NOTE: gaussianPair consumes TWO rng draws and this function discards the
 * second. That is intentional and consistent -- lapModel.ts already pairs its
 * noise sample with the spin magnitude. Do not "optimise" it into a single draw
 * without re-capturing every measured figure in MODEL_SPEC.md section 3.
 */
export function rollErrorTimeLoss(tuning: TuningConstants, rng: Rng): number {
  const inc = tuning.incidents
  const [g] = gaussianPair(rng)
  return Math.max(0, inc.errorTimeLossMean + g * inc.errorTimeLossSigma)
}

export function rollSafetyCarDeployment(
  cause: 'crash' | 'mechanical',
  tuning: TuningConstants,
  rng: Rng,
): boolean {
  const sc = tuning.incidents.safetyCar
  const chance = cause === 'crash' ? sc.crashDeployChance : sc.mechanicalDeployChance
  return chance > 0 && rng() < chance
}

/** Inclusive of both bounds. */
export function rollSafetyCarDuration(tuning: TuningConstants, rng: Rng): number {
  const sc = tuning.incidents.safetyCar
  const span = sc.durationLapsMax - sc.durationLapsMin + 1
  return sc.durationLapsMin + Math.floor(rng() * span)
}

/**
 * Pull the field towards the leader. `raceTime := leader + (raceTime - leader) * c`.
 *
 * The leader is the MINIMUM of the input, not element 0: race.ts passes active
 * cars in whatever order they happen to sit in, and a compression that depended
 * on the caller sorting first would be a trap.
 *
 * Documented simplification (spec section 3): the engine has no un-lapping
 * concept, so this pulls a two-lap-down car unfairly close. It affects no gated
 * metric.
 */
export function compressRaceTimes(raceTimes: number[], compression: number): number[] {
  if (raceTimes.length === 0) return []
  const leader = Math.min(...raceTimes)
  return raceTimes.map(t => leader + (t - leader) * compression)
}

/**
 * The pit-lane loss that applies right now.
 *
 * SINGLE SOURCE OF TRUTH, and that is the point. `pitLaneTimeLoss` is read at
 * five call sites (race.ts, projection.ts, raceStore.ts x2, PitTimer.tsx). If
 * the safety-car discount were applied at some of them and not others, the
 * projection overlay would promise the player a discount the race then failed
 * to give -- by 8-12s, on the game's centrepiece decision. Every call site must
 * route through here.
 */
export function effectivePitLaneLoss(
  circuit: CircuitSpec,
  safetyCar: SafetyCarState | null,
  tuning: TuningConstants,
): number {
  if (safetyCar) return tuning.incidents.safetyCar.laneTimeLossUnderSc
  return circuit.pitLaneTimeLoss
}
```

- [ ] **Step 4: Add the `SafetyCarState` type (needed by this module's signatures)**

In `src/engine/types.ts`, after `OvertakeEvent`:

```ts
export interface SafetyCarState {
  deployedLap: number
  lapsRemaining: number
  cause: 'crash' | 'mechanical'
}
```

`IncidentEvent` and the `RaceState` fields come in Task 3 — this task adds only what `incidents.ts` needs to compile.

- [ ] **Step 5: Re-export from the engine's public surface**

In `src/engine/index.ts`, add:

```ts
export * from './incidents'
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx tsc --noEmit && npx vitest run tests/engine/incidents.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Confirm the full suite is still green and commit**

Run: `npx vitest run`
Expected: 281 existing + new incidents tests pass. Nothing calls `incidents.ts` yet, so byte-identity is untouched.

```bash
git add src/engine/incidents.ts src/engine/types.ts src/engine/index.ts tests/engine/incidents.test.ts
git commit -m "feat(engine): incidents.ts -- the pure incident decision module

Rolls, magnitudes, compression arithmetic and the effective-pit-loss helper.
Owns no state and mutates nothing; race.ts applies the outcomes (spec 5.5).
Nothing calls it yet, so the RNG stream is untouched.

Every roll short-circuits on a zero rate so it draws nothing, and the tests
assert that directly with a counting rng rather than trusting the source.
The safety-car deploy roll needs that guarantee more than the others: cars
already retire from tyre and mechanical failures today, so a roll guarded on
maxPerRace instead of on the deploy chance would fire on the existing suite's
retirements and break byte-identity even with driver error switched off.

effectivePitLaneLoss exists so the safety-car discount cannot be applied at
some of pitLaneTimeLoss's five call sites and not others -- that asymmetry
would make the projection overlay promise a discount the race never gave, by
8-12s, on the game's centrepiece decision."
```

---

### Task 3: Wire driver error into the tick, with the incident log

**Files:**
- Modify: `src/engine/types.ts` (`IncidentKind`, `IncidentEvent`, two `RaceState` fields)
- Modify: `src/engine/race.ts` (`initRace` and the per-car map in `stepSector`)
- Modify: `tests/fixtures/golden-race-pre-incidents.json` (**re-captured once** — see Step 4)
- Create: `tests/engine/driverError.test.ts`

**Interfaces:**
- Consumes: Task 2's `rollDriverError`, `rollErrorIsTerminal`, `rollErrorTimeLoss`.
- Produces: `RaceState.incidents: IncidentEvent[]`, `RaceState.safetyCar: SafetyCarState | null` (declared here, driven in Task 4), and `retiredCause: 'crash'`.

- [ ] **Step 1: Add the types**

In `src/engine/types.ts`:

```ts
export type IncidentKind =
  | 'driver_error'
  | 'crash'
  | 'safety_car_deployed'
  | 'safety_car_ended'

export interface IncidentEvent {
  lap: number
  sector: SectorIndex
  kind: IncidentKind
  /** null for safety-car events, which belong to the race rather than a car. */
  driverId: string | null
  /** Seconds, for 'driver_error' only; null otherwise. */
  timeLoss: number | null
}
```

Extend `CarState.retiredCause` (line 251) to include the new terminal cause:

```ts
  retiredCause: 'tyre' | 'mechanical' | 'crash' | null
```

Add to `RaceState` (after `overtakeEvents`):

```ts
  /**
   * Lives on RaceState rather than in the Zustand store deliberately, and it is
   * load-bearing: projection.ts clones RaceState and fast-forwards it, so with
   * safetyCar here the "if you pit now" overlay prices a stop under yellow
   * correctly with no changes to projection.ts at all.
   */
  safetyCar: SafetyCarState | null
  incidents: IncidentEvent[]
```

**Check every exhaustive `switch` on `retiredCause`** — `grep -rn "retiredCause" src/` — and add the `'crash'` arm wherever one exists. `tsc` will catch a missed `never` guard; a non-exhaustive `if/else` chain it will not, so read those by eye.

- [ ] **Step 2: Initialise the fields in `initRace`**

Find the `RaceState` literal `initRace` returns and add:

```ts
    safetyCar: null,
    incidents: [],
```

- [ ] **Step 3: Apply driver error in the per-car map**

In `src/engine/race.ts`'s `stepSector`, the map at ~`:97-149`. Add a `newIncidents` accumulator beside `newOvertakeEvents`:

```ts
  const newIncidents: IncidentEvent[] = [...state.incidents]
```

Then, **after** the mechanical-failure block and still inside the map:

```ts
    // Driver error. Ordering within this tick is fixed and load-bearing
    // (spec 5.5): tyre failure, then mechanical, then driver error, then --
    // outside this map -- the safety-car deployment roll for anything that
    // retired. Applied HERE rather than inside computeSectorTime because the
    // terminal branch retires the car and lapModel.ts returns a SectorResult
    // with no vocabulary for retirement.
    //
    // Consequence: the time loss is added to raceTime after computeSectorTime
    // has returned, so it does NOT appear in SectorResult.sectorTime. A UI that
    // needs it reads the IncidentEvent log.
    if (!updated.retired) {
      if (rollDriverError(driver.facets.consistency, config.tuning, rng)) {
        if (rollErrorIsTerminal(config.tuning, rng)) {
          updated = { ...updated, retired: true, retiredLap: car.lap, retiredCause: 'crash' }
          newIncidents.push({
            lap: car.lap, sector, kind: 'crash', driverId: car.driverId, timeLoss: null,
          })
        } else {
          const loss = rollErrorTimeLoss(config.tuning, rng)
          updated = { ...updated, raceTime: updated.raceTime + loss }
          newIncidents.push({
            lap: car.lap, sector, kind: 'driver_error', driverId: car.driverId, timeLoss: loss,
          })
        }
      }
    }
```

`driver` is already in scope from the tyre-failure block above. Thread `newIncidents` into the returned `RaceState` as `incidents: newIncidents`, and carry `safetyCar: state.safetyCar` through unchanged (Task 4 drives it).

- [ ] **Step 4: Re-capture the golden fixture ONCE, and review the diff**

`RaceState` gained two fields, so the serialised shape changed. This is the one legitimate re-capture.

Run: `npx vite-node scripts/capture-golden-race.ts`
Then: `git diff tests/fixtures/golden-race-pre-incidents.json`

**Expected: exactly two added lines** — `"safetyCar": null` and `"incidents": []`. **If any `raceTime`, `lap`, `tyreAge`, `retired` or `rngState` value changed, a guard is missing — fix the guard, do not accept the fixture.** That is the whole reason this step reviews the diff instead of just re-running the capture.

- [ ] **Step 5: Write the driver-error integration test**

Create `tests/engine/driverError.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()

function race(overrides: Parameters<typeof makeTuning>[0], seed: number) {
  const circuit = DATA.circuits['bengaluru']!
  const config: RaceConfig = {
    circuit,
    tuning: makeTuning(overrides),
    compounds: DATA.compounds,
    drivers: DATA.drivers.drivers,
    teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults,
    playerDriverId: '__none__',
    seed,
  }
  let state = initRace(config)
  const rng = createRng(seed)
  for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
  return state
}

// Errors switched fully on and fully terminal / fully non-terminal, so each
// branch is measured without the other diluting it.
const ERRORS_ON = {
  incidents: {
    driverErrorPerLap: 0.0105,
    safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0 },
}

describe('driver error', () => {
  it('logs non-terminal errors and charges time for them', () => {
    const state = race({ ...ERRORS_ON, incidents: { ...ERRORS_ON.incidents, terminalFraction: 0 } }, 5)
    const errors = state.incidents.filter(i => i.kind === 'driver_error')
    expect(errors.length, 'a 56-lap race with errors on should produce some').toBeGreaterThan(0)
    for (const e of errors) {
      expect(e.timeLoss).not.toBeNull()
      expect(e.timeLoss!).toBeGreaterThan(0)
      expect(e.driverId).not.toBeNull()
    }
    // terminalFraction 0 -> nobody crashes
    expect(state.incidents.filter(i => i.kind === 'crash')).toHaveLength(0)
    expect(state.cars.filter(c => c.retiredCause === 'crash')).toHaveLength(0)
  }, 60_000)

  it('retires the car on a terminal error, attributed as a crash', () => {
    const state = race({ ...ERRORS_ON, incidents: { ...ERRORS_ON.incidents, terminalFraction: 1 } }, 5)
    const crashes = state.incidents.filter(i => i.kind === 'crash')
    expect(crashes.length).toBeGreaterThan(0)
    // Every crash event corresponds to a car retired with cause 'crash', and
    // vice versa -- the log and the car state cannot drift apart.
    const crashedIds = new Set(state.cars.filter(c => c.retiredCause === 'crash').map(c => c.driverId))
    expect(new Set(crashes.map(c => c.driverId))).toEqual(crashedIds)
    // terminalFraction 1 -> no time-loss branch
    expect(state.incidents.filter(i => i.kind === 'driver_error')).toHaveLength(0)
  }, 60_000)

  it('errs less often for consistent drivers than for inconsistent ones', () => {
    // FAILS IF consistency relief is dropped or inverted. Aggregated over 12
    // seeds because a single race is far too small a sample to separate the
    // two groups.
    const cons = new Map(DATA.drivers.drivers.map(d => [d.id, d.facets.consistency]))
    let hiErrors = 0, loErrors = 0
    for (let seed = 1; seed <= 12; seed++) {
      const state = race({ ...ERRORS_ON, incidents: { ...ERRORS_ON.incidents, terminalFraction: 0 } }, seed)
      for (const e of state.incidents) {
        if (e.kind !== 'driver_error' || e.driverId === null) continue
        if (cons.get(e.driverId)! >= 88) hiErrors++
        else if (cons.get(e.driverId)! <= 76) loErrors++
      }
    }
    // Group sizes differ, so compare rates per driver, not raw counts.
    const nHi = [...cons.values()].filter(c => c >= 88).length
    const nLo = [...cons.values()].filter(c => c <= 76).length
    // eslint-disable-next-line no-console
    console.log(`errors/driver: consistency>=88 ${(hiErrors / nHi).toFixed(2)} (n=${nHi}), <=76 ${(loErrors / nLo).toFixed(2)} (n=${nLo})`)
    expect(hiErrors / nHi).toBeLessThan(loErrors / nLo)
  }, 300_000)
})
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS, byte-identity included.

```bash
git add src/engine tests/engine/driverError.test.ts tests/fixtures/golden-race-pre-incidents.json
git commit -m "feat(engine): driver error -- time loss, crashes, and the incident log

Applied in race.ts's per-car map rather than inside computeSectorTime,
because the terminal branch retires the car and lapModel.ts returns a
SectorResult with no vocabulary for retirement (spec 5.5). Ordering within
the tick is fixed: tyre, then mechanical, then driver error.

RaceState gains safetyCar and incidents. safetyCar is declared here and
driven in the next task; it lives on RaceState rather than the Zustand store
because projection.ts clones RaceState, so the 'if you pit now' overlay
prices a stop under yellow for free.

The golden byte-identity fixture is re-captured once here, since RaceState's
serialised shape changed. The diff is two added lines -- safetyCar null and
incidents empty -- and nothing else; no car value and no rngState moved.

driverErrorPerLap is still 0.0 in tuning.json. The tests drive the mechanism
through explicit overrides; the shipped switch flips in the final task."
```

---

### Task 4: The safety car state machine

**Files:**
- Modify: `src/engine/race.ts` (deployment roll, expiry, compression, overtaking guard, pit loss)
- Modify: `src/engine/lapModel.ts` (`paceMultiplier`)
- Modify: `src/engine/projection.ts` (effective pit loss)
- Modify: `src/state/raceStore.ts` (both pit call sites)
- Modify: `src/ui/PitTimer.tsx` (display the effective loss)
- Create: `tests/engine/safetyCar.test.ts`

**Interfaces:**
- Consumes: Task 2's `rollSafetyCarDeployment`, `rollSafetyCarDuration`, `compressRaceTimes`, `effectivePitLaneLoss`.
- Produces: a driven `RaceState.safetyCar`.

- [ ] **Step 1: Thread the safety car into `computeSectorTime`**

`src/engine/lapModel.ts` — extend the signature with an optional sixth parameter so every existing caller (including tests) keeps compiling:

```ts
export function computeSectorTime(
  config: RaceConfig,
  car: CarState,
  sector: SectorIndex,
  rng: Rng,
  weatherState: WeatherState = 'DRY',
  safetyCar: SafetyCarState | null = null,
): SectorResult {
```

At the **end** of the function, where `sectorTime` is assembled, apply the multiplier last:

```ts
  // Safety car: every car is scaled by the same factor, so this changes no
  // gaps. Its entire purpose is to make the pit-loss discount meaningful --
  // a lap under yellow is slow, so the time lost stopping is smaller.
  //
  // Applied here rather than in race.ts because it SCALES the computed sector
  // time rather than adding to it (spec 5.5's one exception). It performs no
  // rng() call, so it cannot perturb the stream.
  const scMultiplier = safetyCar ? tuning.incidents.safetyCar.paceMultiplier : 1
  sectorTime *= scMultiplier
```

If `sectorTime` is currently `const`, change it to `let`. Import `SafetyCarState` in the type import.

In `race.ts`, pass it through: `computeSectorTime(config, car, sector, rng, state.weatherState, state.safetyCar)`.

- [ ] **Step 2: Roll deployment after the per-car map**

In `stepSector`, **after** `updatedCars` is built and before the sort, add:

```ts
  // Safety car deployment. Rolled at most ONCE per tick even if two cars
  // retire in the same tick, and never while one is already active or once
  // maxPerRace is reached.
  //
  // `retiredThisTick` compares against the PREVIOUS state rather than checking
  // `retiredLap === lap`, because a car can retire on the same lap a previous
  // safety car ended and we must not re-deploy for a retirement already
  // accounted for.
  let safetyCar = state.safetyCar
  const scCfg = config.tuning.incidents.safetyCar
  const wasRetired = new Set(state.cars.filter(c => c.retired).map(c => c.driverId))
  const retiredThisTick = updatedCars.filter(c => c.retired && !wasRetired.has(c.driverId))
  const scDeployedCount = state.incidents.filter(i => i.kind === 'safety_car_deployed').length

  if (safetyCar === null && scDeployedCount < scCfg.maxPerRace && retiredThisTick.length > 0) {
    // Take the first retirement of the tick as the trigger. A tyre failure is
    // treated as 'mechanical' for deployment purposes -- a puncture strands a
    // car the same way a broken gearbox does.
    const trigger = retiredThisTick[0]!
    const cause: 'crash' | 'mechanical' = trigger.retiredCause === 'crash' ? 'crash' : 'mechanical'
    if (rollSafetyCarDeployment(cause, config.tuning, rng)) {
      const lapsRemaining = rollSafetyCarDuration(config.tuning, rng)
      safetyCar = { deployedLap: state.lap, lapsRemaining, cause }
      newIncidents.push({
        lap: state.lap, sector, kind: 'safety_car_deployed', driverId: null, timeLoss: null,
      })
    }
  }
```

- [ ] **Step 3: Compress gaps once, at deployment**

Immediately after the block above:

```ts
  // Compression happens ONCE, on the tick the safety car deploys. Applying it
  // every tick while deployed would collapse the field to the leader.
  const justDeployed = safetyCar !== null && state.safetyCar === null
  let carsAfterSc = updatedCars
  if (justDeployed) {
    const active = updatedCars.filter(c => !c.retired)
    const compressed = compressRaceTimes(active.map(c => c.raceTime), scCfg.gapCompression)
    const byId = new Map(active.map((c, i) => [c.driverId, compressed[i]!]))
    carsAfterSc = updatedCars.map(c =>
      byId.has(c.driverId) ? { ...c, raceTime: byId.get(c.driverId)! } : c)
  }
```

Use `carsAfterSc` in place of `updatedCars` from here on in the function.

- [ ] **Step 4: Expire the safety car on the lap boundary**

`race.ts:197-198` already computes both variables you need:

```ts
  const nextSector = ((sector + 1) % 3) as SectorIndex
  const lapCompleted = sector === 2
```

Use `lapCompleted` — it is equivalent to `nextSector === 0` and matches the surrounding style. Place
the decrement **after** that line and **before** the `return` at `:283`:

```ts
  // Tick the safety car down once per LAP, not per sector -- durationLapsMin/Max
  // are laps. Decrementing per sector would make a "3 lap" safety car last one.
  let scAfterTick = safetyCar
  if (scAfterTick !== null && lapCompleted) {
    const remaining = scAfterTick.lapsRemaining - 1
    if (remaining <= 0) {
      scAfterTick = null
      newIncidents.push({
        lap: state.lap, sector, kind: 'safety_car_ended', driverId: null, timeLoss: null,
      })
    } else {
      scAfterTick = { ...scAfterTick, lapsRemaining: remaining }
    }
  }
```

Then return `safetyCar: scAfterTick` in the `RaceState` literal at `:283`, alongside
`incidents: newIncidents`.

- [ ] **Step 5: Disable overtaking under yellow, and discount the pit loss**

Guard the `resolveOvertakes` call:

```ts
  // No overtaking under yellow. Correct for real racing, and it also stops the
  // sector-boundary check producing nonsense at freshly compressed gaps.
  const afterOvertakes = safetyCar === null
    ? resolveOvertakes(/* existing args */)
    : { cars: /* the un-overtaken list */, events: [] }
```

Match the real shape of `resolveOvertakes`'s return rather than this sketch.

Then replace **every** read of `config.circuit.pitLaneTimeLoss` with the helper:

- `src/engine/race.ts` (the pit-stop application)
- `src/engine/projection.ts:30`
- `src/state/raceStore.ts` (both sites)
- `src/ui/PitTimer.tsx`

each becoming `effectivePitLaneLoss(config.circuit, <safetyCarState>, config.tuning)`.

Run: `grep -rn "circuit.pitLaneTimeLoss" src/`
Expected: **only `effectivePitLaneLoss`'s own body in `incidents.ts`**. Any other hit is a call site that will disagree with the projection.

- [ ] **Step 6: Write the safety car tests**

Create `tests/engine/safetyCar.test.ts` covering:

1. **Deploys on a crash** — `crashDeployChance: 1`, `terminalFraction: 1`, `driverErrorPerLap` high: `state.incidents` contains `safety_car_deployed` and `state.safetyCar` is non-null at some point mid-race (step and inspect, don't only check the end state).
2. **Never deploys when both chances are 0**, even with retirements happening.
3. **Compresses gaps exactly once.** Capture gaps on the tick before and after deployment; assert the after-gaps are `before × gapCompression` within 1e-9, then step three more ticks and assert gaps are **not** compressed again.
4. **Expires after the rolled duration**, and logs `safety_car_ended`.
5. **`maxPerRace` is respected** — with chances at 1 and many retirements, `safety_car_deployed` count never exceeds `maxPerRace`.
6. **No overtakes are recorded while `safetyCar !== null`.**
7. **The projection prices a stop under yellow at the discount** — the §10 risk. Build a state with `safetyCar` non-null, call `projectPitNow`, and assert the implied stop cost equals `laneTimeLossUnderSc + stopMean`, **exactly** (`toBeCloseTo(..., 9)`), not approximately. Mirror the existing structure in `tests/engine/circuitDifferentiation.test.ts`'s projection test, which already zeroes `stopSigma` and `horizonLaps` for this purpose.
8. **`paceMultiplier` scales all cars equally** — assert that a tick under yellow leaves every *gap* unchanged while every *sector time* is larger.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS, byte-identity included (all three switches are still 0.0).

```bash
git add src tests/engine/safetyCar.test.ts
git commit -m "feat(engine): the safety car -- deployment, compression, and the pit discount

A two-state machine on the existing sector tick; no new loop, and the
'real time != sim time' rule is untouched. Deployment is rolled at most once
per tick, never while one is active, and never past maxPerRace. Compression
runs ONCE at deployment -- applying it per tick would collapse the field onto
the leader. The countdown ticks per lap, not per sector.

paceMultiplier is applied in lapModel because it scales the computed sector
time rather than adding to it (spec 5.5's one exception). It draws no rng, so
it cannot perturb the stream, and because it scales every car equally it
changes no gap -- its only job is to make the pit discount meaningful.

All five pitLaneTimeLoss call sites now route through effectivePitLaneLoss,
so the projection overlay and the race charge the same number. A test asserts
the projection prices a stop under yellow to nine decimals: if these ever
disagree the overlay lies to the player by 8-12s on the centrepiece decision.

The three switches are still 0.0 -- byte-identity holds and no measured figure
has moved yet."
```

---

### Task 5: Turn it on, measure everything, and settle the bands honestly

The only task with measurement risk. **Read the spec's §2.1 before starting** — its stopping rule now binds in both directions, and this task is where it applies.

**Files:**
- Modify: `src/data/tuning.json` (three switches, `mechanicalFailure.baseChancePerLap`, `_regressionBands._note`)
- Modify: `tests/engine/monteCarloHarness.ts` (report safety cars, crashes, incidents)
- Modify: `tests/engine/monteCarlo.test.ts`, `tests/engine/mechanicalFailure.test.ts`
- Audit: the seven test files that read live tuning
- Modify: `MODEL_SPEC.md` §3, §4, §7
- Modify: `docs/superpowers/specs/2026-08-22-race-incidents-design.md` (§8.2 measured column)

- [ ] **Step 1: Audit the seven live-tuning test files BEFORE flipping the switches**

These read real `tuning.json` and will see live incidents: `validators.test.ts`, `difficultyProfile.test.ts`, `gridConditions.test.ts`, `mechanicalFailure.test.ts`, `monteCarlo.test.ts`, `trafficOvertaking.test.ts`, `tyreFailure.test.ts`.

Apply this rule to each, and record the decision in the commit message:

> **A test measuring mechanism X gets incidents zeroed, unless incidents are its subject.** A traffic test whose sample is being eaten by crashes is measuring less than it claims to.

Expected outcome: `monteCarlo` and `mechanicalFailure` keep live incidents (that is their subject); `trafficOvertaking`, `tyreFailure`, `gridConditions` and `difficultyProfile` switch to `makeDeterministicTuning()` or add an explicit zeroing override; `validators` needs the new keys present, which Task 1 already handled.

- [ ] **Step 2: Extend the harness to report the new metrics**

`tests/engine/monteCarloHarness.ts` — add to `Metrics`:

```ts
  safetyCarsPerRace: number
  crashesPerCarRace: number
  driverErrorsPerRace: number
```

computing them from `state.incidents` and `state.cars`, and log them in the existing `console.log`. Keep `playerDriverId: '__none__'` — a real id leaves one car in `neutral` on its start tyre all race and skews every field-wide figure.

- [ ] **Step 3: Flip the three switches**

Surgical edits to `src/data/tuning.json`:

- `incidents.driverErrorPerLap`: `0.0` → **`0.0105`**
- `incidents.safetyCar.crashDeployChance`: `0.0` → **`0.30`**
- `incidents.safetyCar.mechanicalDeployChance`: `0.0` → **`0.12`**
- `mechanicalFailure.baseChancePerLap`: `0.008` → **`0.014`**

Then `git diff src/data/tuning.json` — expect exactly four changed values.

**The byte-identity test will now fail, and that is correct** — the stream has legitimately changed because rolls are live. Update its comment to say so and pin it to a zeroed config instead:

```ts
// Now that the shipped rates are non-zero, this test pins the GUARANTEE rather
// than the shipped config: a race run with the three switches explicitly zeroed
// must still reproduce the golden pre-incidents race. That is the property that
// keeps every makeDeterministicTuning-based test in the suite valid.
```

i.e. build its config from `makeDeterministicTuning()` rather than `DATA.tuning`. The fixture itself does **not** change.

- [ ] **Step 4: Measure everything, over all 12 circuits, both difficulties, at least two seed bases**

Write a throwaway probe under `tmp/` (delete it afterwards) reporting, with SEs and sample sizes:

top-team win share · distinct winners · mean |Δpos| · grid↔finish ρ · `paceRankCorrelation` · mechanical DNF/car-race · **crashes/car-race** · **safety cars/race** · **driver errors/race**

Check each against the spec's §8.2 targets:

| Metric | Target |
|---|---|
| Top-team win share | 0.35–0.55 |
| Distinct winners | ≥ 4 |
| Mechanical DNF / car-race | 6–10% |
| Crashes / car-race | 6–8pp |
| Safety cars / race | 0.5–0.8 |
| `paceRankCorrelation` | ≥ 0.90 |
| Mean \|Δpos\| | inside 2.5–4.0 |
| Grid↔finish ρ | inside 0.60–0.80 |

**Apply §2.1 exactly.** If win share lands outside 0.35–0.55 with the §7 magnitudes intact: **report it with the numbers and stop.** Do not adjust magnitudes in either direction. If `paceRankCorrelation < 0.90`, that is a defect — investigate rather than report.

Watch two specific things:
- **Rookie grid↔finish ρ measured 0.7874 against an 0.80 ceiling** with only 0.0126 of headroom. Incidents should push ρ *down*, away from the ceiling, but verify rather than assume.
- **Crashes/car-race should land near 6.98pp.** A materially different figure means §7.1's corrected derivation is still wrong; recheck it rather than adjusting the target.

- [ ] **Step 5: Un-skip the mechanical DNF band test**

`tests/engine/mechanicalFailure.test.ts` — the committed-skipped assertion on `mechanicalDnfPerCarRace`. Un-skip it and confirm it passes at the measured value against the **unchanged** 6–10% band from `tuning.json._regressionBands`. **If it does not pass, do not widen the band** — report the measurement.

- [ ] **Step 6: Add the new band gates**

In `tests/engine/monteCarlo.test.ts`, add failable assertions for safety cars per race and crashes per car-race, sized in SE from the measurement and citing the spec §8.2 targets as provenance. Follow the existing gates' style: state the sample size in the failure message, and say in a comment what change each gate would catch.

Add the two new bands to `tuning.json._regressionBands` so the gates read from the band file rather than from literals, matching how every other gate in that test works.

- [ ] **Step 7: Update the oracle**

`MODEL_SPEC.md`:
- **§3** — refresh the "Sim at" column with the measured values and re-date it; add rows for crashes/car-race and safety cars/race; the mechanical DNF row stops being "assertion skipped".
- **§4** — add the race-incidents row to the staging table with measured values. If win share landed in 0.35–0.55, tighten `topTeamWinRate`'s ceiling from 0.90 to **0.55** (its final §3 target — an advance, which is permitted). If it did not, record the measured figure and the argument, exactly as §3 requires of a missed band.
- **§7** — the "the simulation has no chaos" subsection is now **false**. Rewrite it rather than deleting it, in the style §8 and §9 already use: state what it claimed, that the incidents work falsified it, and what the numbers are now.
- **§3 and §4 must agree.** A half-updated oracle is worse than an untouched one, and this project has shipped that failure once.

Also update the spec's §8.2 "Current" column with the measured results.

- [ ] **Step 8: Full verification and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS. Delete the `tmp/` probe.

```bash
git add -A src tests MODEL_SPEC.md docs
git commit -m "feat(engine): switch race incidents on, and re-measure every band

<Fill in with the ACTUAL measured numbers -- win share, crashes/car-race,
safety cars/race, mechanical DNF, paceRankCorrelation, |dpos|, rho -- with
SEs and sample sizes, and state plainly whether each target was met.

If win share landed outside 0.35-0.55, say so in the subject line and give
the argument, per the spec's 2.1. Do not describe a missed band as met.>"
```

---

## Self-Review

**Spec coverage.** §5.1 `incidents.ts` → Task 2. §5.2's three risk sources → Task 3 (driver error), Task 5 (mechanical rate), Task 4 (crash → safety car). §5.3's `RaceState` placement → Task 3 Step 1, with the projection consequence tested in Task 4 Step 6.7. §5.4's four deployed-state changes → Task 4 Steps 1–5 (compression, paceMultiplier, pit loss, overtaking disabled). §5.5's split and ordering → Task 3 Step 3 and Task 4 Step 2. §5.5's RNG discipline → Task 1's byte-identity test plus Task 2's counting-rng assertions. §7's values → Task 1 (non-rates) and Task 5 (rates). §8.1's three defences → Task 1 Step 3, Task 4 Step 6, Task 5 Step 6. §8.2's bands → Task 5 Step 4. §8.3's discipline → Task 5 Steps 1, 2 and 4. **Not covered, deliberately:** §6's five UI surfaces, which are Plan B.

**Placeholder scan.** Task 4 Step 6's eight test cases are specified by their assertions and tolerances rather than written out in full, because each needs a mid-race state captured at a specific tick and writing them blind would produce code the implementer has to rewrite anyway. Each names its subject, its tolerance and what it would catch. Task 4 Step 5's `resolveOvertakes` guard is a sketch and says so — the real return shape has to be read from the source. Task 5 Step 8's commit message is deliberately a template: filling it with invented numbers is exactly the failure this project has already committed once.

**Type consistency.** `SafetyCarState` is declared in Task 2 Step 4 (needed for `incidents.ts` to compile) and consumed in Tasks 3 and 4. `IncidentEvent`/`IncidentKind` are declared in Task 3 Step 1 and consumed in Tasks 3, 4 and 5. `effectivePitLaneLoss`'s signature is fixed in Task 2 and used at five call sites in Task 4 Step 5. `retiredCause` gains `'crash'` in Task 3 Step 1, which is why that step also requires grepping every existing consumer.

**Three things a reviewer should weigh.** First, **Task 1 captures a golden fixture before any engine change and commits it separately.** That ordering is the whole regression net; a reviewer should check the fixture's commit genuinely predates every mechanic. Second, **the safety-car deploy roll is guarded on the deploy chance, not on `maxPerRace`.** This is the subtlest requirement in the plan: cars already retire today, so a roll guarded the other way would fire on the existing suite's retirements and break byte-identity even with driver error off. Task 2's test asserts it with a counting rng. Third, **Task 5 is where this plan can go wrong quietly.** The magnitudes are anchored to real F1, not chosen to land the win-share band, and §2.1 now forbids moving them in either direction. A reviewer should check that any missed band is reported with an argument rather than tuned away — and that the commit message contains measured numbers, not predicted ones.
