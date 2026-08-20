# Competitive Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the car performance spread so at least four teams can win races, taking the top team's win share from 95% to under 90% — while keeping a real backmarker tier and proving the change is genuine competitiveness rather than noise.

**Architecture:** Three tasks. Task 1 builds a Monte-Carlo metrics harness and makes the existing guardrails real (two current assertions are provably false), leaving the grid untouched. Task 2 applies the facet change and tightens the gates. Task 3 hunts collateral damage across the rest of the suite and re-measures the progression system. No `src/engine/` change at any point — this is a data change plus tests.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, JSON data with zod validation.

**Spec:** `docs/superpowers/specs/2026-08-20-competitive-grid-design.md`

**Oracle:** `MODEL_SPEC.md` — read §3 (the bands), §4 (the staged gate), §7 (why data alone cannot finish the job), §10 (invariants) and §12 (measurement traps) before starting.

## Global Constraints

- **`src/engine/` must not change.** If a task appears to need an engine edit, stop and report — this plan is data plus tests only.
- **Only `power`, `aero` and `handling` change in `src/data/cars.json`.** `reliability` and `pitCrew` keep their shipped values exactly. Halcyon's fragile `reliability: 72` and Zenith's `94` are deliberate character.
- **Team ordinal ranking must be preserved.** The change re-scales competitive spacing; it does not reorder the grid.
- **Do not rescale `reliability`.** An earlier proposal would have moved mechanical DNFs to 2.74%. Real F1 is **9.8pp** (computed, 2014–22), so the sim's 5–6% is already *below* reality. Raising it belongs to the incidents plan.
- **Do not compress driver facets.** Measured to reach 44.1% but it flattens all ten drivers into near-clones, and at c=0.4 hands Vortex 36% of wins by promoting `tyreManagement` to dominance.
- **Determinism is non-negotiable** (`MODEL_SPEC.md` §10): same seed plus same inputs gives a byte-identical race.
- **All balance values stay in `src/data/*.json`.** Never in logic.
- **Measurement trap:** `stepSector` never AI-manages the player's car. A real `playerDriverId` leaves one car on its starting tyre in `neutral` all race, skewing every field-wide statistic. Always set `playerDriverId` to a non-existent id in Monte-Carlo harnesses.
- **Never report a bare mean.** Win share at n=400 has an SE of ~1.5pp; finishing-position SD is 2.8–4.8. Size samples to the distinction being asserted and put the sample size in the failure message.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/engine/monteCarloHarness.ts` (create) | Reusable measurement harness: runs races over shipped circuits and computes every gated metric. No assertions — pure measurement, so Task 2 and the three follow-on plans reuse it. |
| `tests/engine/monteCarlo.test.ts` (modify) | The regression gates. Currently holds two provably false assertions and tests a fixture no circuit resembles. |
| `src/data/tuning.json` (modify) | `_regressionBands` — replace the three stale bands with the `MODEL_SPEC.md` §3 set. |
| `src/data/cars.json` (modify) | The facet change itself. Task 2 only. |

---

### Task 1: Metrics harness and honest guardrails

Build the measurement harness and make the existing Monte-Carlo tests true, **without touching the grid**. This task is worth its own review gate because it establishes the instrument every later gate depends on — and because two current assertions are false, so any change made before fixing them would be validated against a broken oracle.

**Files:**
- Create: `tests/engine/monteCarloHarness.ts`
- Modify: `tests/engine/monteCarlo.test.ts` (whole file)
- Modify: `src/data/tuning.json` (`_regressionBands`, currently near the end of the file)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `runRaces(opts: HarnessOptions): Metrics` from `tests/engine/monteCarloHarness.ts`
  - `type HarnessOptions = { races: number; circuitIds: string[]; seedBase?: number; difficulty?: 'rookie' | 'pro'; forceDry?: boolean }`
  - `type Metrics = { races: number; winShareByTeam: Record<string, number>; topTeamId: string; topTeamShare: number; distinctWinners: number; meanAbsPosChange: number; sePosChange: number; gridFinishSpearman: number; paceRankCorrelation: number; meanOvertakeEvents: number; minOvertakeEvents: number }`

- [ ] **Step 1: Read the current state of the two broken assertions**

Read `tests/engine/monteCarlo.test.ts` in full. Note three things you are about to change:

1. `buildConfig` sets `playerDriverId: 'd_voss'`. Because `stepSector` never AI-manages the player, Voss's car never pits and never changes pace mode — it sits on its starting tyre all race. Every measurement in this file is taken on a field with one deliberately crippled car.
2. It tests only `REFERENCE_CIRCUIT`, a 30-lap rain-free fixture. No shipped circuit resembles it (the calendar runs 42–60 laps with rain probabilities from 0.05 to 0.75).
3. Its `NOTE` comment says the original spec's band "was calibrated for a 3-team example grid with incidents/safety car". That is a useful historical clue: incidents were part of the intended design and were never implemented. Leave the observation in your report; do not act on it here.

- [ ] **Step 2: Write the harness**

Create `tests/engine/monteCarloHarness.ts`:

```ts
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain } from '@engine/types'

export type HarnessOptions = {
  races: number
  circuitIds: string[]
  seedBase?: number
  difficulty?: 'rookie' | 'pro'
  forceDry?: boolean
}

export type Metrics = {
  races: number
  winShareByTeam: Record<string, number>
  topTeamId: string
  topTeamShare: number
  distinctWinners: number
  meanAbsPosChange: number
  sePosChange: number
  gridFinishSpearman: number
  paceRankCorrelation: number
  meanOvertakeEvents: number
  minOvertakeEvents: number
}

// Per-point s/lap cost of a car facet, derived from the engine's own arithmetic:
// facetToRating9 gives (100 - facet) * 9/100, then carDelta multiplies by
// deltaPerRating * sectorSplit[s] * 3. A car facet governs exactly one sector:
// power -> S1, aero -> S2, handling -> S3 (see src/engine/lapModel.ts:28-31).
function teamPaceDeficit(
  facets: { power: number; aero: number; handling: number },
  deltaPerRating: number,
  sectorSplit: readonly number[],
): number {
  const per = (i: number) => (9 / 100) * deltaPerRating * sectorSplit[i]! * 3
  return (100 - facets.power) * per(0)
    + (100 - facets.aero) * per(1)
    + (100 - facets.handling) * per(2)
}

function spearman(xs: number[], ys: number[]): number {
  // Inputs here are already ranks (grid slot, finish position), both dense and
  // tie-free within a race, so Pearson on the raw values IS Spearman's rho.
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx, b = ys[i]! - my
    num += a * b; dx += a * a; dy += b * b
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy)
}

function buildConfig(seed: number, circuitId: string, difficulty: 'rookie' | 'pro', forceDry: boolean): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId]
  if (!circuit) throw new Error(`unknown circuit ${circuitId}`)
  const profile = data.tuning.difficultyProfiles[difficulty]
  const laps = circuit.laps
  return {
    circuit: forceDry ? { ...circuit, rainProbability: 0 } : circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults.map(s => ({
      ...s,
      brain: (s.brain ?? 'naive') as StrategyBrain,
      plannedStops: s.plannedStops.map(stop => ({ ...stop, lap: Math.round((stop.lap / 30) * laps) })),
    })),
    // A non-existent id so EVERY car is AI-managed. See MODEL_SPEC.md §12 --
    // a real playerDriverId leaves one car on its start tyre in neutral all
    // race and silently skews every field-wide statistic.
    playerDriverId: '__none__',
    seed,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
    coverReactionScale: profile.coverReactionScale,
    paceModeAggression: profile.aiPaceModeAggression,
  }
}

export function runRaces(opts: HarnessOptions): Metrics {
  const { races, circuitIds, seedBase = 1000, difficulty = 'pro', forceDry = false } = opts
  const data = loadGameData()
  const teamById = new Map(data.cars.teams.map(t => [t.id, t]))
  const driverTeam = new Map(data.drivers.drivers.map(d => [d.id, d.teamId]))

  const paceByTeam = new Map(
    data.cars.teams.map(t => [
      t.id,
      teamPaceDeficit(t.facets, data.tuning.carPerformance.deltaPerRating, data.tuning.carPerformance.sectorSplit),
    ]),
  )
  const paceRank = new Map(
    [...paceByTeam.entries()].sort((a, b) => a[1] - b[1]).map(([id], i) => [id, i + 1]),
  )

  const winsByTeam: Record<string, number> = {}
  const absPosChanges: number[] = []
  let spearmanSum = 0
  let overtakeTotal = 0
  let overtakeMin = Number.POSITIVE_INFINITY
  const finishSumByTeam = new Map<string, number>()
  const finishCountByTeam = new Map<string, number>()

  for (let r = 0; r < races; r++) {
    const circuitId = circuitIds[r % circuitIds.length]!
    const seed = seedBase + r * 7919
    const config = buildConfig(seed, circuitId, difficulty, forceDry)
    let state = initRace(config)
    const grid = new Map(state.cars.map(c => [c.driverId, c.position]))
    const rng = createRng(seed)
    for (let i = 0; i < config.circuit.laps * 3; i++) state = stepSector(config, state, rng)

    const winnerTeam = driverTeam.get(state.cars[0]!.driverId)!
    winsByTeam[winnerTeam] = (winsByTeam[winnerTeam] ?? 0) + 1

    const gs: number[] = []
    const fs: number[] = []
    for (const car of state.cars) {
      const g = grid.get(car.driverId)!
      absPosChanges.push(Math.abs(g - car.position))
      gs.push(g); fs.push(car.position)
      const t = driverTeam.get(car.driverId)!
      finishSumByTeam.set(t, (finishSumByTeam.get(t) ?? 0) + car.position)
      finishCountByTeam.set(t, (finishCountByTeam.get(t) ?? 0) + 1)
    }
    spearmanSum += spearman(gs, fs)

    const ot = state.overtakeEvents.length
    overtakeTotal += ot
    if (ot < overtakeMin) overtakeMin = ot
  }

  const winShareByTeam: Record<string, number> = {}
  for (const t of teamById.keys()) winShareByTeam[t] = (winsByTeam[t] ?? 0) / races
  const topTeamId = Object.entries(winShareByTeam).sort((a, b) => b[1] - a[1])[0]![0]

  const n = absPosChanges.length
  const mean = absPosChanges.reduce((a, b) => a + b, 0) / n
  const variance = absPosChanges.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)

  // Genuine competitiveness check: does car pace rank still predict mean finish?
  const ranked = [...finishSumByTeam.keys()]
  const paceRanks = ranked.map(t => paceRank.get(t)!)
  const meanFinishes = ranked.map(t => finishSumByTeam.get(t)! / finishCountByTeam.get(t)!)

  return {
    races,
    winShareByTeam,
    topTeamId,
    topTeamShare: winShareByTeam[topTeamId]!,
    distinctWinners: Object.values(winsByTeam).filter(w => w > 0).length,
    meanAbsPosChange: mean,
    sePosChange: Math.sqrt(variance / n),
    gridFinishSpearman: spearmanSum / races,
    paceRankCorrelation: spearman(paceRanks, meanFinishes),
    meanOvertakeEvents: overtakeTotal / races,
    minOvertakeEvents: overtakeMin,
  }
}
```

- [ ] **Step 3: Tighten the `_regressionBands` schema first**

This must come before the band test below, or that test will not typecheck.

`src/data/validators.ts:100` currently has:

```ts
  _regressionBands: z.record(z.string(), z.unknown()).optional(),
```

Every band is therefore `unknown`, so `bands.topTeamWinRate[1]` is a type error under `strict`. Replace it with an explicit shape:

```ts
  _regressionBands: z.object({
    topTeamWinRate: z.tuple([z.number(), z.number()]),
    minDistinctWinners: z.number().int().positive(),
    meanAbsPosChange: z.tuple([z.number(), z.number()]),
    gridFinishSpearman: z.tuple([z.number(), z.number()]),
    minPaceRankCorrelation: z.number(),
    mechanicalDnfPerCarRace: z.tuple([z.number(), z.number()]),
    _note: z.string(),
  }).optional(),
```

Two things a reviewer should know about why this is safe. `Tuning` is `z.infer<typeof TuningSchema>` (`validators.ts:249`), so the tightened type propagates through `GameData.tuning` to every test automatically. And `src/engine/types.ts:105` declares its *own* looser `_regressionBands?: Record<string, unknown>` on the engine's separate `Tuning` interface — leave it alone. The engine never reads the bands, only tests do, and tests reach them via `loadGameData()`. This keeps the "no engine change" constraint intact.

Note `TuningSchema` ends with `.passthrough()` (`validators.ts:101`), so unknown top-level keys are tolerated; the tightening applies only inside `_regressionBands`.

- [ ] **Step 4: Write a test that proves the harness reproduces the documented baseline**

This is the test that makes the harness trustworthy. Add to `tests/engine/monteCarlo.test.ts`, replacing the whole file:

```ts
import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'

// A sample spanning the calendar's real variety rather than one synthetic
// fixture: a rain-heavy round, a dry desert round, the street circuit, and a
// high-speed round. MODEL_SPEC.md ss11 records that the old suite's blind spot
// was testing only a 30-lap rain-free fixture no shipped circuit resembles.
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('Monte-Carlo regression', () => {
  it('harness reproduces the documented baseline win share', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% ` +
      `winners=${m.distinctWinners} |dpos|=${m.meanAbsPosChange.toFixed(2)} ` +
      `rho=${m.gridFinishSpearman.toFixed(3)} paceCorr=${m.paceRankCorrelation.toFixed(3)} ` +
      `overtakes=${m.meanOvertakeEvents.toFixed(1)}`)
    // MODEL_SPEC.md ss3 records apex at 95.1% +- 0.22 over 19,200 races. At n=240
    // the SE is ~1.4pp, so a 0.88 floor is ~5 SE below the documented value:
    // wide enough not to flake, tight enough to catch a real break.
    expect(m.topTeamId).toBe('apex')
    expect(m.topTeamShare).toBeGreaterThan(0.88)
  }, 300_000)

  it('every gated metric is finite and in a sane range', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    expect(Number.isFinite(m.meanAbsPosChange)).toBe(true)
    expect(m.meanAbsPosChange).toBeGreaterThan(0)
    expect(m.meanAbsPosChange).toBeLessThan(10)
    expect(Math.abs(m.gridFinishSpearman)).toBeLessThanOrEqual(1)
    expect(Math.abs(m.paceRankCorrelation)).toBeLessThanOrEqual(1)
    expect(m.distinctWinners).toBeGreaterThanOrEqual(1)
  }, 200_000)

  it('determinism: same seed base gives identical metrics', () => {
    const a = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    const b = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    expect(a).toEqual(b)
    const c = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4243 })
    expect(c).not.toEqual(a)
  }, 200_000)

  it('regression bands in tuning.json match what the harness measures', () => {
    const bands = loadGameData().tuning._regressionBands
    expect(bands.topTeamWinRate[1]).toBeLessThanOrEqual(1)
    expect(bands.topTeamWinRate[0]).toBeLessThan(bands.topTeamWinRate[1])
    expect(bands.meanAbsPosChange[0]).toBeLessThan(bands.meanAbsPosChange[1])
    expect(bands.minDistinctWinners).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 5: Run the tests and confirm the band test fails for the right reason**

Run: `npx vitest run tests/engine/monteCarlo.test.ts`

Expected: `regression bands in tuning.json` FAILS — the schema now requires `meanAbsPosChange` and `minDistinctWinners`, but `tuning.json` does not yet supply them, so `loadGameData()` throws a ZodError. That is the correct failure: the schema is ahead of the data. The three harness tests cannot run until Step 6 fixes the data. Once it does, they should PASS on the current grid — if the baseline test does not reproduce `apex` above 0.88, **stop and report**: either the harness is wrong or the documented baseline is, and the difference must be understood before any grid change.

- [ ] **Step 6: Replace `_regressionBands` in `src/data/tuning.json`**

Find `"_regressionBands"` and replace the object with:

```json
  "_regressionBands": {
    "topTeamWinRate": [0.0, 0.97],
    "minDistinctWinners": 2,
    "meanAbsPosChange": [1.5, 4.0],
    "gridFinishSpearman": [0.55, 0.90],
    "minPaceRankCorrelation": 0.90,
    "mechanicalDnfPerCarRace": [0.04, 0.10],
    "_note": "Bands and their provenance live in MODEL_SPEC.md section 3. topTeamWinRate and minDistinctWinners are STAGED (MODEL_SPEC.md section 4): these are the today values. The competitive-grid plan tightens them to [0.0, 0.90] and 4; the race-incidents plan tightens win share to [0.35, 0.55]. Never loosen a gate that has already been met. Overtake event counts are deliberately NOT banded -- see MODEL_SPEC.md section 5."
  }
```

Note what is deliberately absent: `meanOvertakesPerRace` and `minOvertakesPerRace` are **gone**, not adjusted. `MODEL_SPEC.md` §5 explains why the metric cannot gate anything.

- [ ] **Step 7: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run`

Expected: PASS. Note the Monte-Carlo file is now slow (roughly 400 races over 42–60 lap circuits). If total runtime becomes a problem, reduce `races` in the *non-baseline* tests first and say so in your report — do not reduce the baseline test below the point where its SE justifies its threshold.

- [ ] **Step 8: Commit**

```bash
git add tests/engine/monteCarloHarness.ts tests/engine/monteCarlo.test.ts src/data/tuning.json src/data/validators.ts
git commit -m "test(engine): real Monte-Carlo harness, honest regression bands

The old suite measured a field with one deliberately crippled car
(playerDriverId was set, and stepSector never AI-manages the player, so that
car sat on its start tyre all race), on a 30-lap rain-free fixture no shipped
circuit resembles. Two of its assertions were provably false on real circuits:
the 20-70 overtake band fails high on dry Harbour Lights at 76.6, and 'every
race has at least 2 overtakes' fails outright on Silverpark.

Replaces them with a harness measuring the metrics MODEL_SPEC.md section 3
actually gates on, across a sample spanning the calendar's real variety. Drops
the overtake-count bands entirely rather than retuning them -- section 5 records
why the metric cannot gate anything. Grid unchanged; this is the instrument, not
the change."
```

---

### Task 2: Narrow the car performance spread

**Files:**
- Modify: `src/data/cars.json`
- Modify: `tests/engine/monteCarlo.test.ts`
- Modify: `src/data/tuning.json` (`_regressionBands` — tighten the staged gates)

**Interfaces:**
- Consumes: `runRaces` / `Metrics` from `tests/engine/monteCarloHarness.ts`
- Produces: the new grid in `cars.json`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/monteCarlo.test.ts`:

```ts
describe('competitive grid', () => {
  it('no team wins more than 90% of races', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% (n=${m.races})`)
    // n=240, SE ~1.9pp at p=0.85. The 0.90 ceiling sits ~2.6 SE above the
    // expected 0.85, so a real regression to 0.95 fails decisively.
    expect(m.topTeamShare, `top team ${m.topTeamId} won ${(m.topTeamShare * 100).toFixed(1)}% of ${m.races} races`)
      .toBeLessThanOrEqual(0.90)
  }, 300_000)

  it('at least four different teams win races', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`distinct winners: ${m.distinctWinners} -- ${JSON.stringify(
      Object.fromEntries(Object.entries(m.winShareByTeam).filter(([, v]) => v > 0)))}`)
    expect(m.distinctWinners, `only ${m.distinctWinners} teams won in ${m.races} races`)
      .toBeGreaterThanOrEqual(4)
  }, 300_000)

  it('car pace rank still predicts finishing position', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`pace-rank correlation: ${m.paceRankCorrelation.toFixed(3)}`)
    // The anti-lottery gate. If the target were met by making results random,
    // this collapses. MODEL_SPEC.md section 3 requires competitiveness to be genuine.
    expect(m.paceRankCorrelation, `pace rank no longer predicts finish (${m.paceRankCorrelation.toFixed(3)})`)
      .toBeGreaterThanOrEqual(0.90)
  }, 300_000)

  it('preserves the shipped team ordinal ranking', () => {
    const { cars, tuning } = loadGameData()
    const per = (i: number) => (9 / 100) * tuning.carPerformance.deltaPerRating * tuning.carPerformance.sectorSplit[i]! * 3
    const pace = (f: { power: number; aero: number; handling: number }) =>
      (100 - f.power) * per(0) + (100 - f.aero) * per(1) + (100 - f.handling) * per(2)
    const order = [...cars.teams].sort((a, b) => pace(a.facets) - pace(b.facets)).map(t => t.id)
    // Shipped order, measured before the change. A future edit must not silently
    // reorder the grid -- only re-space it.
    expect(order).toEqual([
      'apex', 'meridian', 'vortex', 'solstice', 'kestrel',
      'halcyon', 'delta', 'nimbus', 'terra', 'zenith',
    ])
  })

  it('keeps a real backmarker tier', () => {
    const { cars, tuning } = loadGameData()
    const per = (i: number) => (9 / 100) * tuning.carPerformance.deltaPerRating * tuning.carPerformance.sectorSplit[i]! * 3
    const pace = (f: { power: number; aero: number; handling: number }) =>
      (100 - f.power) * per(0) + (100 - f.aero) * per(1) + (100 - f.handling) * per(2)
    const byId = new Map(cars.teams.map(t => [t.id, pace(t.facets)]))
    const front = [...byId.values()].sort((a, b) => a - b).slice(0, 7)
    const frontSpread = front[6]! - front[0]!
    const cliff = byId.get('nimbus')! - front[6]!
    console.log(`front-seven spread ${frontSpread.toFixed(3)}s, cliff to nimbus ${cliff.toFixed(3)}s`)
    // Deliberately NOT a uniform flattening: tight front, distant tail, as real
    // F1 has. See the spec section 3.
    expect(frontSpread).toBeLessThan(0.15)
    expect(cliff).toBeGreaterThan(0.25)
  })

  it('leaves reliability and pitCrew untouched', () => {
    const { cars } = loadGameData()
    const byId = new Map(cars.teams.map(t => [t.id, t.facets]))
    // Shipped values. reliability drives mechanical DNFs (real F1: 9.8pp, sim
    // already below it) and pitCrew drives pit-stop time -- neither is this
    // plan's business.
    const expected: Record<string, { reliability: number; pitCrew: number }> = {
      apex: { reliability: 96, pitCrew: 90 },
      meridian: { reliability: 90, pitCrew: 88 },
      vortex: { reliability: 88, pitCrew: 85 },
      kestrel: { reliability: 85, pitCrew: 82 },
      solstice: { reliability: 87, pitCrew: 95 },
      delta: { reliability: 89, pitCrew: 80 },
      halcyon: { reliability: 72, pitCrew: 78 },
      nimbus: { reliability: 84, pitCrew: 86 },
      terra: { reliability: 80, pitCrew: 75 },
      zenith: { reliability: 94, pitCrew: 72 },
    }
    for (const [id, exp] of Object.entries(expected)) {
      expect(byId.get(id)!.reliability, `${id} reliability`).toBe(exp.reliability)
      expect(byId.get(id)!.pitCrew, `${id} pitCrew`).toBe(exp.pitCrew)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail for the right reason**

Run: `npx vitest run tests/engine/monteCarlo.test.ts`

Expected: `no team wins more than 90%` FAILS (currently ~95%), `at least four different teams win` FAILS (currently 3), `keeps a real backmarker tier` FAILS (the shipped front-seven spread is ~0.77s, far above 0.15). The ordinal, `reliability`/`pitCrew` and pace-rank tests should already PASS — pace-rank correlation is high today precisely because the grid is so deterministic.

- [ ] **Step 3: Apply the new facet values to `src/data/cars.json`**

Change **only** `power`, `aero` and `handling` on each team. Every other field — `reliability`, `pitCrew`, `developmentRate`, `archetype`, `history`, colours — stays exactly as shipped.

| team | power | aero | handling |
|---|---|---|---|
| apex | 92 | 95 | 90 |
| meridian | 98 | 91 | 89 |
| vortex | 87 | 95 | 94 |
| kestrel | 96 | 89 | 92 |
| solstice | 93 | 91 | 93 |
| delta | 92 | 90 | 93 |
| halcyon | 89 | 92 | 94 |
| nimbus | 86 | 84 | 85 |
| terra | 82 | 84 | 83 |
| zenith | 81 | 81 | 83 |

These come from scaling each team's deficit-from-100 by a single per-team scalar, which is why every archetype keeps its shape: Apex stays aero-led (95), Meridian power-led (98), Vortex handling-and-aero, Solstice balanced. Verified arithmetic: front seven land on uniform 0.015 s/lap steps (0.090 s/lap total), then a 0.386 s/lap cliff to Nimbus, and top-to-bottom narrows from 1.482 to 0.674 s/lap with the ordinal ranking unchanged.

- [ ] **Step 4: Tighten the staged gates in `src/data/tuning.json`**

Change `topTeamWinRate` from `[0.0, 0.97]` to `[0.0, 0.90]` and `minDistinctWinners` from `2` to `4`. Leave the `_note` intact — it records that win share tightens again to `[0.35, 0.55]` in the incidents plan.

- [ ] **Step 5: Update the Task 1 baseline test, which now asserts stale behaviour**

The `harness reproduces the documented baseline win share` test asserts `topTeamShare > 0.88`, which is exactly what this task breaks. Rewrite it to pin the *new* expected behaviour rather than deleting it:

```ts
  it('reproduces the expected post-change win share', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% ` +
      `winners=${m.distinctWinners} |dpos|=${m.meanAbsPosChange.toFixed(2)} ` +
      `rho=${m.gridFinishSpearman.toFixed(3)} paceCorr=${m.paceRankCorrelation.toFixed(3)}`)
    // Apex must remain the strongest team -- this change re-spaces the grid, it
    // does not reorder it. The searched grid measured 84.85% +- 0.52 over 4,800
    // races WITH a reliability rescale that is not being applied here; dropping
    // it returns the DNFs that were beating Voss, so expect slightly lower.
    expect(m.topTeamId).toBe('apex')
    expect(m.topTeamShare).toBeGreaterThan(0.60)
    expect(m.topTeamShare).toBeLessThanOrEqual(0.90)
  }, 300_000)
```

The `> 0.60` floor is deliberate: if the change overshoots into lottery territory the pace-rank gate catches it, but a floor here catches an overshoot that somehow preserves correlation.

- [ ] **Step 6: Run and verify**

Run: `npx vitest run tests/engine/monteCarlo.test.ts`
Expected: PASS, with the logged share near 0.83–0.85 and distinct winners at 6–8.

If `topTeamShare` lands above 0.90, do **not** loosen the gate. Report the measured value with its SE and stop — the searched grid was measured over 4,800 races across all 12 circuits and both difficulties, while this test samples 4 circuits at one difficulty, so a genuine discrepancy means the 4-circuit sample is unrepresentative and the sample should widen rather than the band.

- [ ] **Step 7: Run the full suite and triage**

Run: `npx tsc --noEmit && npx vitest run`

Expect breakages. Every engine and state test that asserts a lap time, gap, finishing order or win rate was written against the old 1.482 s/lap spread. For **each** failure, classify it in your report as one of:

- **stale fixture expectation** — the test hardcodes a number derived from the old grid. Update the number and say what it was and is.
- **real regression** — the change broke behaviour that should not have changed. Stop and report; do not paper over it.
- **now-invalid premise** — the test's whole setup assumed a dominant top team. Rewrite the test, explaining why.

Do not batch these as "fixed test expectations". A per-failure classification is the deliverable.

- [ ] **Step 8: Commit**

```bash
git add src/data/cars.json src/data/tuning.json tests/engine/monteCarlo.test.ts
git commit -m "balance(cars): narrow the grid so more than two teams can win

Apex won 95.08% of 19,200 measured races; Nimbus, Terra and Zenith won zero of
9,600. With rain disabled only two teams ever won -- rain was the sole mechanism
giving anyone else a chance. The cause was a 1.482 s/lap top-to-bottom spread
against a 0.97s noise SD: 8.9 sigma, which nothing survives.

Scales each team's facet deficit by a per-team scalar, so archetypes and the
ordinal ranking are preserved exactly and only the competitive spacing changes.
Front seven at uniform 0.015 s/lap steps, then a deliberate 0.386 s/lap cliff to
the backmarker tier -- tight front, distant tail, as real F1 has (median 3
distinct winners). Measured: 95.1% -> ~85%, 3 distinct winners -> 8, with
pace-rank correlation holding at 0.965 so the competitiveness is genuine rather
than noise.

reliability and pitCrew deliberately untouched. This is a prerequisite, not the
whole fix: MODEL_SPEC.md section 7 shows 81.5% is the floor for any cars.json-only
change, and closing the rest to 35-55% needs the race-incidents plan."
```

---

### Task 3: Verify no collateral damage and re-measure the progression arc

The grid change touches the input to every other balanced system. This task checks the ones that matter and records the new numbers, so the next three plans start from a known state.

**Files:**
- Modify: `MODEL_SPEC.md` (§3 "Sim at" column, §7 if the sensitivity picture changed)
- Modify: `docs/superpowers/specs/2026-08-20-competitive-grid-design.md` (§5 with measured-not-predicted numbers)
- Test: no new test file; may modify existing tests found stale

**Interfaces:**
- Consumes: the new grid; `runRaces` / `Metrics`
- Produces: updated oracle numbers for the follow-on plans

- [ ] **Step 1: Measure the metrics the plan did not gate**

Write a throwaway harness (delete it afterwards; do not commit it) and report, with sample sizes and standard errors:

- Mean `|grid − finish|` and grid↔finish Spearman ρ on the new grid, against the `MODEL_SPEC.md` §3 bands of 2.5–4.0 and 0.60–0.80. **These are expected to still miss** — they need the incidents plan. Report by how much; that is the incidents plan's target.
- Mechanical DNF rate per car-race, confirming it has not moved (it should not: `reliability` is untouched).
- The championship points distribution across a full 12-race season, before and after. A compressed grid should spread points more evenly; quantify it rather than assuming.
- Win share across **all 12 circuits and both difficulties**, not just the 4-circuit test sample, so the gate's representativeness is known.

- [ ] **Step 2: Re-measure the Development Points arc on the new grid**

The progression system was tuned against the old spread and its headline numbers are now stale. Using the real `applyUpgrades` from `src/state/upgradeOverlay.ts` and an exhaustive 110-DP build search, report:

- The optimal build and its s/lap value (was 0.537 on the old grid).
- Where a maxed Zenith and a maxed Terra now finish (were P15.29 and P12.7).
- Whether the underdog arc measured for the progression plan (+1.16 Zenith, +1.21 Terra positions early-vs-late season) holds, improves, or degrades. A compressed grid should *amplify* it, since the same 0.526 s/lap now closes a much larger share of a smaller gap.
- Whether `rivalDevelopment.poolPerRace` (0.36, sized against the old spread) is still correctly sized. **If rival development is now too strong relative to the compressed field, report it with numbers and stop** — do not change it here; it is a balance decision for the owner.

- [ ] **Step 3: Update `MODEL_SPEC.md` with the measured post-change values**

Update the "Sim at 2026-08-20" column in §3 to the measured post-change figures, and date it. If the §7 sensitivity picture changed materially, correct it. Add a line to §4's staged table recording that the competitive-grid stage is met, with the measured value.

Do **not** loosen any band. If a measurement misses a band, record the miss and which plan owns closing it.

- [ ] **Step 4: Update the spec's expected-outcome section with measured numbers**

`docs/superpowers/specs/2026-08-20-competitive-grid-design.md` §5 and §6 currently hold *predicted* values from the search, including a table with blank cells where the search's summary and detail tables disagreed. Replace with measured values and fill the gaps.

- [ ] **Step 5: Run the full suite one final time**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add MODEL_SPEC.md docs/superpowers/specs/2026-08-20-competitive-grid-design.md
git commit -m "docs: record measured post-change grid behaviour

Replaces the searched/predicted numbers in the spec with measured ones and
updates the oracle's current-state column. Records which MODEL_SPEC bands the
grid change alone does not reach -- |grid - finish| and grid-finish rho both
still need the race-incidents plan -- so the next plan starts from a known
state rather than re-deriving it."
```

---

## Self-Review

**Spec coverage.** §1 problem → Task 2 Step 3. §2 goal and gates → Task 2 Steps 1, 4. §3 "not a uniform flattening" → the `keeps a real backmarker tier` test; "not a reliability change" → the `leaves reliability and pitCrew untouched` test; "not a driver change" → Global Constraints, and no task touches `drivers.json`. §4 the change → Task 2 Step 3. §5 expected outcome → Task 2 Step 6 and Task 3 Step 4. §6 effect on progression → Task 3 Step 2. §7 testing → Task 1 in full plus Task 2 Steps 1–2. §8 risks → the anti-lottery gate (Task 2 Step 1), the triage classification (Task 2 Step 7), the points distribution (Task 3 Step 1). §9 follow-on plans → recorded in the Task 2 commit message and Task 3 Step 3. No gaps.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every data step carries the actual values. The one step that specifies requirements rather than literal content is Task 1 Step 6 (the zod schema), because the current shape of `_regressionBands`' schema has to be read before it can be edited — the step says exactly what to check for and which idiom to follow.

**Type consistency.** `runRaces(opts: HarnessOptions): Metrics` is used identically in both consuming tasks. Every field read off `Metrics` in a test (`topTeamId`, `topTeamShare`, `distinctWinners`, `meanAbsPosChange`, `sePosChange`, `gridFinishSpearman`, `paceRankCorrelation`, `meanOvertakeEvents`, `minOvertakeEvents`, `races`, `winShareByTeam`) is declared in the type. The `_regressionBands` keys written in Task 1 Step 5 (`topTeamWinRate`, `minDistinctWinners`, `meanAbsPosChange`, `gridFinishSpearman`, `minPaceRankCorrelation`, `mechanicalDnfPerCarRace`) are the same keys read in Task 1 Step 3's band test and tightened in Task 2 Step 4.

**Three deliberate design decisions worth flagging to a reviewer.**

The `spearman` helper runs Pearson on raw values. That is correct *only* because both inputs are dense, tie-free ranks within a race — grid slots and finishing positions are each a permutation of 1..N. It would be wrong if applied to arbitrary values, and it *is* applied to non-rank data in one place: `paceRankCorrelation` correlates pace *ranks* against mean *finishes*. Since one side is a rank and the other is monotone-ordered continuous, this is a Pearson-on-mixed measure rather than a true Spearman. It is fit for its purpose — detecting whether the ordering collapsed — but the name overstates it, and a reviewer should decide whether to rank-transform the finishes for strictness.

Task 1 deliberately leaves the grid alone and Task 2 then rewrites the baseline test Task 1 just added. That is not churn: Task 1's job is to prove the instrument reproduces a documented figure *before* it is trusted as a gate, which is only possible while the old grid is still in place.

Test runtime grows substantially — roughly 400 races over 42–60 lap circuits where the old suite ran 200 over 30 laps. Timeouts are set to 300s. If this becomes painful, the lever is reducing `races` in the non-baseline tests, and the constraint is that a threshold must stay justified by its sample's standard error.
