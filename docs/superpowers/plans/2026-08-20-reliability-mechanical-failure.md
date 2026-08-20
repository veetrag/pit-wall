# Reliability / Mechanical Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `reliability` car facet actually affect races by adding a per-sector mechanical-failure roll, so team archetypes like "bulletproof" Zenith and "fragile" Halcyon become true.

**Architecture:** A per-sector RNG roll inside `stepSector` in `src/engine/race.ts`, sitting immediately after the existing tyre-failure roll and reusing the same `CarState.retired` / `retiredLap` plumbing. Chance is `tuning.mechanicalFailure.baseChancePerLap * (1 - reliability / 100)`, divided by 3 because the roll runs per sector rather than per lap. No new retirement semantics: a retired car already freezes and classifies after every finisher.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, zod for data validation.

**Spec:** `docs/superpowers/specs/2026-08-20-development-points-design.md` (§5)

## Global Constraints

- `src/engine/` imports nothing from `state/`, `ui/`, or `canvas/`. No `Math.random()` — all randomness flows through the injected `rng` parameter.
- The engine is deterministic: same seed + same inputs ⇒ identical race. Never call `rng()` conditionally in a way that changes call ordering for unaffected cars.
- All balance numbers live in `src/data/tuning.json`, never hardcoded in logic.
- TypeScript strict: no `any`. Use `unknown` + narrowing.
- Target DNF bands over a **56-lap** race: Halcyon (`reliability` 72) 10–15%; Zenith (`reliability` 94) 2–4%.
- `tuning.mechanicalFailure.baseChancePerLap` = **0.008** (derived in spec §5; do not change without re-deriving the bands).

---

### Task 1: Add the `mechanicalFailure` tuning constant

Plumbs the constant through data, zod schema, and the TypeScript type. No behaviour yet — this task exists so the type and validator changes are reviewable on their own, and so Task 2 can reference `config.tuning.mechanicalFailure` without a type error.

**Files:**
- Modify: `src/data/tuning.json`
- Modify: `src/data/validators.ts:54-58` (add after the `tyreFailure` block)
- Modify: `src/engine/types.ts:86-90` (add after the `tyreFailure` block)
- Test: `tests/data/validators.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `TuningConstants['mechanicalFailure']` with shape `{ baseChancePerLap: number }`, readable as `config.tuning.mechanicalFailure.baseChancePerLap`

- [ ] **Step 1: Write the failing test**

Append to `tests/data/validators.test.ts`:

```ts
it('loads the mechanicalFailure tuning block', () => {
  const data = loadGameData()
  expect(data.tuning.mechanicalFailure.baseChancePerLap).toBeCloseTo(0.008, 5)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/validators.test.ts`
Expected: FAIL — TypeScript error that `mechanicalFailure` does not exist on the tuning type.

- [ ] **Step 3: Add the constant to `src/data/tuning.json`**

Insert immediately after the closing brace of the `"tyreFailure"` object:

```json
  "mechanicalFailure": {
    "baseChancePerLap": 0.008
  },
```

- [ ] **Step 4: Add the zod schema**

In `src/data/validators.ts`, immediately after the `tyreFailure: z.object({...}),` block:

```ts
  mechanicalFailure: z.object({
    baseChancePerLap: z.number(),
  }),
```

- [ ] **Step 5: Add the TypeScript type**

In `src/engine/types.ts`, immediately after the `tyreFailure: {...}` block inside `TuningConstants`:

```ts
  // Per-lap mechanical failure chance at reliability 0, scaled down linearly by
  // the team's reliability facet. Rolled per sector as chance/3. Solved from the
  // target DNF bands in the design spec — see docs/superpowers/specs.
  mechanicalFailure: {
    baseChancePerLap: number
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/data/validators.test.ts`
Expected: PASS

- [ ] **Step 7: Confirm nothing else broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass. Other engine tests construct `TuningConstants` literals — if any fail to compile, add `mechanicalFailure: { baseChancePerLap: 0 }` to those fixtures (0 disables failures, which is what those tests want).

- [ ] **Step 8: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts src/engine/types.ts tests/data/validators.test.ts
git commit -m "feat(engine): add mechanicalFailure tuning constant

Plumbs tuning.mechanicalFailure.baseChancePerLap through data, zod schema,
and TuningConstants. No behaviour yet — the reliability facet has been inert
since it was added, and this is the constant that will drive it."
```

---

### Task 2: Implement the mechanical-failure roll

**Files:**
- Modify: `src/engine/race.ts:97-123` (inside the `state.cars.map` in `stepSector`, after the tyre-failure block)
- Test: `tests/engine/mechanicalFailure.test.ts` (create)

**Interfaces:**
- Consumes: `config.tuning.mechanicalFailure.baseChancePerLap` from Task 1
- Produces: no new exports. Sets the existing `CarState.retired` / `retiredLap` fields.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/mechanicalFailure.test.ts`. Model the fixtures on `tests/engine/tyreFailure.test.ts`, which is the closest existing pattern.

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, CircuitSpec } from '@engine/types'

const DATA = loadGameData()

// rainProbability 0 keeps every test dry: wet weather would introduce
// crossover penalties and wet-incident retirements and confound the rates.
const CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 56,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

function configFor(teamId: string, seed: number): RaceConfig {
  const team = DATA.cars.teams.find(t => t.id === teamId)!
  const drivers = DATA.drivers.drivers.filter(d => d.teamId === teamId).slice(0, 1)
  return {
    circuit: CIRCUIT,
    tuning: DATA.tuning,
    compounds: DATA.compounds,
    drivers,
    teams: [team],
    // Generous allocation and a mid-race stop keep tyres away from the cliff,
    // so any retirement observed here is mechanical, not a puncture.
    strategies: [{ teamId, startCompound: 'M', plannedStops: [{ lap: 28, compound: 'M' }], brain: 'smart' }],
    playerDriverId: 'none',
    seed,
    tyreAllocationBase: { S: 99, M: 99, H: 99, I: 99, W: 99 },
  }
}

/** Run one full race and report whether the single car retired. */
function raceRetires(teamId: string, seed: number): boolean {
  const config = configFor(teamId, seed)
  let state = initRace(config)
  const rng = createRng(seed)
  const totalSectors = CIRCUIT.laps * 3
  for (let i = 0; i < totalSectors; i++) state = stepSector(config, state, rng)
  return state.cars[0]!.retired
}

function dnfRate(teamId: string, races: number): number {
  let dnfs = 0
  for (let s = 0; s < races; s++) if (raceRetires(teamId, s + 1)) dnfs++
  return dnfs / races
}

describe('mechanical failure', () => {
  it('retires a fragile car far more often than a bulletproof one', () => {
    // Halcyon reliability 72, Zenith reliability 94.
    const fragile = dnfRate('halcyon', 300)
    const solid = dnfRate('zenith', 300)
    expect(fragile).toBeGreaterThan(solid)
  })

  it('never retires a car when the base chance is zero', () => {
    const config = configFor('halcyon', 7)
    config.tuning = { ...DATA.tuning, mechanicalFailure: { baseChancePerLap: 0 } }
    let state = initRace(config)
    const rng = createRng(7)
    for (let i = 0; i < CIRCUIT.laps * 3; i++) state = stepSector(config, state, rng)
    expect(state.cars[0]!.retired).toBe(false)
  })

  it('freezes a mechanically retired car', () => {
    // Force certain failure on the first roll.
    const config = configFor('halcyon', 3)
    config.tuning = { ...DATA.tuning, mechanicalFailure: { baseChancePerLap: 100 } }
    let state = initRace(config)
    const rng = createRng(3)
    state = stepSector(config, state, rng)
    const car = state.cars[0]!
    expect(car.retired).toBe(true)
    expect(car.retiredLap).not.toBeNull()

    const timeAtRetirement = car.raceTime
    state = stepSector(config, state, rng)
    // A frozen car accrues no further race time.
    expect(state.cars[0]!.raceTime).toBe(timeAtRetirement)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/mechanicalFailure.test.ts`
Expected: FAIL — the first and third tests fail because no car ever retires mechanically (`fragile` equals `solid` at 0; the forced-failure car is not retired).

- [ ] **Step 3: Implement the roll**

In `src/engine/race.ts`, inside `stepSector`'s `state.cars.map(car => {...})`, immediately after the closing brace of the tyre-failure `if (spec) {...}` block and before `return updated`:

```ts
    // Mechanical failure risk, independent of tyres: scaled by the team's
    // reliability facet, which was inert until now despite every team
    // archetype advertising it ("bulletproof", "a nightmare to keep
    // running"). Rolled per sector, so the per-lap chance is divided by 3 —
    // same convention as the tyre-failure roll above.
    if (!updated.retired) {
      const team = config.teams.find(t => t.id === car.teamId)
      if (team) {
        const mf = config.tuning.mechanicalFailure
        const perLap = mf.baseChancePerLap * (1 - team.facets.reliability / 100)
        if (perLap > 0 && rng() < perLap / 3) {
          updated = { ...updated, retired: true, retiredLap: car.lap }
        }
      }
    }
```

**Why the `!updated.retired` guard:** a car that just failed its tyre roll must not consume a second `rng()` draw, or the RNG stream diverges from a run where it survived — breaking determinism-by-construction.

**Why `perLap > 0`:** skips the `rng()` call entirely when failures are disabled, so a `baseChancePerLap: 0` config produces the exact same RNG stream as before this feature existed. That keeps every pre-existing engine test's expected values valid.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/mechanicalFailure.test.ts`
Expected: PASS (all 3)

- [ ] **Step 5: Commit**

```bash
git add src/engine/race.ts tests/engine/mechanicalFailure.test.ts
git commit -m "feat(engine): wire reliability to mechanical-failure retirements

The reliability facet existed in cars.json and was described in every team
archetype but had zero engine references. Adds a per-sector failure roll
scaled by reliability, reusing the CarState.retired plumbing from tyre
failure. Guarded so a car that already retired this sector does not consume
a second rng() draw, and so a zero base chance skips the draw entirely —
both preserve the existing RNG stream and keep determinism intact."
```

---

### Task 3: Calibrate to the target DNF bands and lock them

Task 2 proved the mechanic works directionally. This task proves it is *tuned* — that the rates match the spec's bands — and freezes those bands as regression tests.

**Files:**
- Modify: `tests/engine/mechanicalFailure.test.ts`
- Possibly modify: `src/data/tuning.json` (only if the measured rates miss the bands)

**Interfaces:**
- Consumes: `raceRetires` / `dnfRate` helpers from Task 2
- Produces: nothing

- [ ] **Step 1: Measure the actual rates**

Add a temporary reporting test to `tests/engine/mechanicalFailure.test.ts`:

```ts
it('REPORT: measured DNF rates', () => {
  for (const team of ['halcyon', 'terra', 'delta', 'zenith', 'apex']) {
    console.log(team, (dnfRate(team, 400) * 100).toFixed(1) + '%')
  }
  expect(true).toBe(true)
})
```

Run: `npx vitest run tests/engine/mechanicalFailure.test.ts`
Expected: printed rates near Halcyon ~11.8%, Zenith ~2.7%, Apex ~1.8% (spec §5). Monte-Carlo noise at 400 races is roughly ±2 percentage points.

- [ ] **Step 2: Adjust the constant only if a band is missed**

If Halcyon is outside 10–15% or Zenith outside 2–4%, scale `baseChancePerLap` in `src/data/tuning.json` proportionally (rates are near-linear in the constant at these magnitudes) and re-measure. Do not adjust per-team `reliability` values — those are character data, not balance dials.

- [ ] **Step 3: Replace the report with locked band assertions**

Delete the `REPORT` test and add:

```ts
it('holds the fragile-team DNF band', () => {
  // Halcyon reliability 72. Band from spec §5; 400 races gives roughly
  // +/-2pp of Monte-Carlo noise, so the band is deliberately wider than
  // the measured value.
  const rate = dnfRate('halcyon', 400)
  expect(rate).toBeGreaterThan(0.08)
  expect(rate).toBeLessThan(0.17)
})

it('holds the bulletproof-team DNF band', () => {
  // Zenith reliability 94 — the archetype promises it finishes races.
  const rate = dnfRate('zenith', 400)
  expect(rate).toBeGreaterThan(0.005)
  expect(rate).toBeLessThan(0.055)
})

it('orders the whole grid by reliability', () => {
  // The mechanic must be monotonic in reliability, not merely different at
  // the extremes — otherwise the archetypes still lie in the middle.
  const halcyon = dnfRate('halcyon', 300)  // 72
  const delta = dnfRate('delta', 300)      // 89
  const apex = dnfRate('apex', 300)        // 96
  expect(halcyon).toBeGreaterThan(delta)
  expect(delta).toBeGreaterThan(apex)
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/mechanicalFailure.test.ts`
Expected: PASS. If the monotonic test is flaky, raise its race count to 500 rather than widening the comparison — flakiness there means the sample is too small, not that the mechanic is wrong.

- [ ] **Step 5: Commit**

```bash
git add tests/engine/mechanicalFailure.test.ts src/data/tuning.json
git commit -m "test(engine): lock mechanical-failure DNF bands

Measures the rates the tuned constant actually produces and freezes them as
regression bands: fragile teams 8-17%, bulletproof 0.5-5.5%, plus a
monotonicity check across the grid so reliability ordering holds in the
middle of the field and not just at the extremes."
```

---

### Task 4: Re-validate the existing balance guardrails

The spec flags this as the main balance risk: mechanical failure is a *second* source of retirements stacked on tyre failure. The existing Monte-Carlo bands were measured at ~0.005 retirements/race; that figure will rise. Those bands must be re-validated deliberately, not just re-run and rubber-stamped.

**Files:**
- Modify: `tests/engine/monteCarlo.test.ts` (only if a band legitimately needs widening)
- Read: `tests/engine/strategy.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3
- Produces: nothing

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass. If they do, the guardrails absorbed the change — go to Step 4.

- [ ] **Step 2: If a Monte-Carlo band fails, diagnose before widening**

Read the failing assertion and decide which case applies:

- **Retirement-count band exceeded** — expected and legitimate. There is genuinely a new retirement source. Widen that specific band and comment it with the new mechanic as the cause.
- **Win-distribution or field-balance band shifted** — investigate rather than widen. Reliability correlates with car strength (Apex 96, Zenith 94), so failures do not fall evenly. If low-reliability *fast* teams (Halcyon 72, `handling` 88) now retire often enough to shift who wins, that is a real balance change worth surfacing, not a band to loosen.
- **Strategy-value margin (`strategy.test.ts`) shrank** — SMART/OPTIMAL must still beat NAIVE by the guardrail margin. Random retirements add noise that can mask strategy value. If the margin is genuinely compressed, lower `baseChancePerLap` rather than relaxing the margin: strategy mattering is the product thesis, DNF realism is not.

- [ ] **Step 3: Re-run until green**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Play one race on device and confirm the field does not feel thin**

```bash
npm run build && npx cap sync android
cd android && ./gradlew installDebug
```

Requires `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (Capacitor 8 needs JDK 21; 17 and 26 both fail).

Play a full race and check the timing tower. Expect roughly 0–2 DNFs across 20 cars. If a third or more of the grid retires, `baseChancePerLap` is too high regardless of what the per-team bands say — 20 cars each rolling every lap compounds far faster than the single-car tests reveal.

- [ ] **Step 5: Commit**

```bash
git add -A tests/
git commit -m "test(engine): re-validate balance guardrails with mechanical failure live

Mechanical failure is a second retirement source stacked on tyre failure, so
the Monte-Carlo bands needed deliberate re-validation rather than a re-run.
Confirmed on device that a full 20-car field does not thin out."
```

---

## Self-Review

**Spec coverage (§5):** per-lap roll scaled by reliability — Task 2. Reuses `CarState.retired` — Task 2. `tuning.mechanicalFailure` constant — Task 1. Target DNF bands locked as regression tests — Task 3. Monte-Carlo re-validation — Task 4. No gaps.

**Deviation from spec, already reconciled:** the spec originally specified two constants (`baseChancePerLap` + `reliabilityRelief`). Solving for the target bands requires relief = 1.019, which yields a negative chance near reliability 100. Spec §5 was revised to the single-constant form before this plan was written; both now agree.

**Type consistency:** `mechanicalFailure.baseChancePerLap` is named identically in `tuning.json`, `validators.ts`, `types.ts`, and all three task bodies. `raceRetires` / `dnfRate` are defined in Task 2 and reused unchanged in Task 3.

**Known risk not resolved by this plan:** the single-car tests in Tasks 2–3 cannot detect field-wide compounding — 20 cars rolling independently produce far more total retirements than one car's rate suggests. Task 4 Step 4 covers this with an on-device check, which is a human judgement rather than an assertion. That is deliberate: "does the field feel thin" is not a property a test can express.
