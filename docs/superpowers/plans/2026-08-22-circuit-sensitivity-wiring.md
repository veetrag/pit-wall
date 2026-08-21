# Circuit Sensitivity Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three remaining dead circuit fields — `carSensitivity`, `driverSensitivity`, `pitLaneTimeLoss` — so the 12 circuits stop being interchangeable.

**Architecture:** `lapModel.ts` reads the circuit's per-sector sensitivities in place of the global `sectorSplit` constants, used **raw** per the owner's decision, so a circuit compresses or amplifies the whole car and driver spread. Pit stops read the circuit's own lane loss. Four call sites read `pit.laneTimeLoss` today and all four must move together or the projection overlay silently mis-prices every stop.

**Tech Stack:** TypeScript strict, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-circuits-that-matter-design.md` (this is Plan B of two)

**Prerequisite:** Plan A (`2026-08-22-overtaking-race-time.md`) must be landed and reviewed first — both plans touch `src/engine/race.ts`.

## Global Constraints

- **`src/data/circuits.json` MUST NOT change.** Its values are correct; this plan consumes them. This includes the two `pitLaneTimeLoss` values that fall below `MODEL_SPEC.md` §3's floor — see Task 3.
- **`src/data/cars.json` and `src/data/drivers.json` MUST NOT change.** Settled by predecessor plans.
- **No regression band may be loosened.** A staged band may only be advanced toward its `MODEL_SPEC.md` §3 target, never past it and never widened to fit a measurement. This project has already shipped that failure once and corrected it once.
- **Engine purity (CLAUDE.md §3):** `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`. No `Math.random()`.
- **This plan adds NO new `rng()` call.** It changes multipliers only. The RNG draw count must be unchanged — Plan A's Task 1 pinned it; that test must keep passing.
- **Every new assertion must be failable.** Mutate the data and confirm the test catches it. Five non-failable assertions have shipped on this project already.
- **Harness discipline:** `playerDriverId: '__none__'`; measure over **all 12 circuits**, because this change makes circuits differ by design; report SE and sample size in every failure message.
- **Determinism (`MODEL_SPEC.md` §10.1):** same seed ⇒ byte-identical race, compared on serialised `RaceState` with a negative control.

---

### Task 1: Prove the circuits are currently identical, then make them differ

**Files:**
- Create: `tests/engine/circuitDifferentiation.test.ts`
- Modify: `src/engine/lapModel.ts` (~`:27-38`)

**Interfaces:**
- Consumes: `runRaces` / `Metrics` / `HARNESS_SAMPLE` from `tests/engine/monteCarloHarness.ts`
- Produces: `ALL_TWELVE` (the full circuit id list) for Tasks 2 and 3

- [ ] **Step 1: Write the failing differentiation test**

This is the test the whole plan exists to pass. `MODEL_SPEC.md` §8 proved Aurora and Kaido are bit-identical over 400 seeds; assert they are not.

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain } from '@engine/types'

const GAME = loadGameData()

export const ALL_TWELVE = [
  'bengaluru', 'monsoon_bay', 'veloce', 'harbour_lights', 'sol_desert', 'highland',
  'grand_savane', 'aurora', 'silverpark', 'costa_verde', 'kaido', 'altiplano',
] as const

/**
 * A race on `circuitId` with rain forced off and every circuit's lap count
 * normalised to 40, so the ONLY thing that can differ between two circuits is
 * their sectorBase and their sensitivity fields. Without the lap-count and rain
 * controls, two circuits differ for uninteresting reasons and the test proves
 * nothing about sensitivity.
 */
function raceFingerprint(circuitId: string, seed: number): string {
  const base = GAME.circuits[circuitId]!
  const circuit = { ...base, laps: 40, rainProbability: 0 }
  const cfg: RaceConfig = {
    circuit, tuning: GAME.tuning, compounds: GAME.compounds,
    drivers: GAME.drivers, teams: GAME.cars.teams,
    strategies: GAME.strategies.defaults.map(s => ({
      ...s,
      brain: (s.brain ?? 'naive') as StrategyBrain,
      plannedStops: s.plannedStops.map(st => ({ ...st, lap: Math.round((st.lap / 30) * 40) })),
    })),
    playerDriverId: '__none__',
    seed,
    tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
    mandatoryTwoCompound: GAME.tuning.tyreRules.mandatoryTwoCompound.pro,
    coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
    paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
  }
  const rng = createRng(seed)
  let state = initRace(cfg)
  while (!state.finished) state = stepSector(cfg, state, rng)
  // Finishing order plus the winning margin: the two things a player would
  // notice. Deliberately NOT the whole state -- sectorBase alone would make
  // that differ, which would let the test pass without sensitivity working.
  const order = [...state.cars].sort((a, b) => a.raceTime - b.raceTime)
  return order.map(c => c.driverId).join(',') + '|' + (order[1]!.raceTime - order[0]!.raceTime).toFixed(3)
}

describe('circuits: sensitivity fields differentiate the calendar', () => {
  // MODEL_SPEC.md section 8: Aurora and Kaido produced bit-identical races over
  // 400 seeds, because carSensitivity, driverSensitivity, overtakingFactor and
  // pitLaneTimeLoss all had no consumer in src/engine/. Kaido's carSensitivity
  // sums to 0.83 against Aurora's 1.03, so with the field wired the two must
  // diverge -- Kaido compresses the field by roughly 20%.
  it('Aurora and Kaido no longer produce the same race', () => {
    const differing = [1, 2, 3, 4, 5].filter(
      seed => raceFingerprint('aurora', seed) !== raceFingerprint('kaido', seed))
    expect(differing.length, 'seeds 1-5, rain off, laps normalised to 40').toBeGreaterThanOrEqual(4)
  }, 120_000)
})
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `npx vitest run tests/engine/circuitDifferentiation.test.ts`
Expected: FAIL, `expected 0 to be >= 4`. **A failure of 1, 2 or 3 means something already differentiates them and the premise needs re-checking before proceeding** — report it rather than pressing on.

- [ ] **Step 3: Wire `carSensitivity` and `driverSensitivity`**

In `src/engine/lapModel.ts`, replace the two global weights:

```ts
  // --- Car delta: per-sector from matching facet (S1←power, S2←aero, S3←handling) ---
  const governingFacet = [tf.power, tf.aero, tf.handling][sector]!
  const carRating = facetToRating9(governingFacet)
  // Per-circuit sensitivity, used RAW (spec section 3, the owner's decision):
  // the sums differ by circuit (Kaido 0.83, Veloce 1.00), so a circuit changes
  // HOW MUCH the car matters, not merely which sector it matters in. That is
  // what makes MODEL_SPEC section 3's per-circuit |dpos| ratio band reachable.
  // Was: tuning.carPerformance.sectorSplit[sector].
  const weight = circuit.carSensitivity[sector]!
  const carDelta = carRating * tuning.carPerformance.deltaPerRating * weight * 3

  // --- Driver delta: from pace facet ---
  const driverSkill = facetToRating9(df.pace) / 9 * 10
  // Was: tuning.driverPerformance.sectorSplit[sector].
  const driverWeight = circuit.driverSensitivity[sector]!
  const driverDelta = driverSkill * tuning.driverPerformance.deltaPerSkill * driverWeight * 3
```

`circuit` is already destructured from `config` at the top of the function, so no signature change.

- [ ] **Step 4: Run the differentiation test**

Run: `npx vitest run tests/engine/circuitDifferentiation.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the RNG draw count is unchanged**

Run: `npx vitest run tests/engine/overtakeRaceTime.test.ts -t "RNG draws"`
Expected: PASS with Plan A's recorded counts. This change touches multipliers only; if the count moved, something else changed.

- [ ] **Step 6: Commit**

```bash
git add src/engine/lapModel.ts tests/engine/circuitDifferentiation.test.ts
git commit -m "feat(engine): circuits differ in how much car and driver matter

carSensitivity and driverSensitivity were fully populated for all 12 circuits
and read nowhere; lapModel used global sectorSplit constants instead. Wired
raw, per the owner's decision, so a circuit compresses or amplifies the whole
spread rather than only reshaping which sector it lands in -- Kaido's 0.83 sum
against Veloce's 1.00 means the field is ~17% tighter there.

Asserts what MODEL_SPEC section 8 proved false: Aurora and Kaido produced
bit-identical races over 400 seeds and now diverge. The fingerprint compares
finishing order and winning margin with rain off and lap counts normalised, so
sectorBase alone cannot make the test pass."
```

---

### Task 2: Wire `pitLaneTimeLoss` at all four call sites

**Files:**
- Modify: `src/engine/race.ts:212`
- Modify: `src/engine/projection.ts:30`
- Modify: `src/state/raceStore.ts:201` and `:228`
- Test: `tests/engine/circuitDifferentiation.test.ts`

**Interfaces:**
- Consumes: `CircuitSpec.pitLaneTimeLoss` (already on the type, already validated)
- Produces: nothing new; four call sites change in lockstep

**Why this is one task and not four.** `pit.laneTimeLoss` is read in four places. `race.ts` applies the stop, `projection.ts` prices the "if you pit now" overlay, and `raceStore.ts` both drives the player's stop and decides when the player is still in the pit lane. **If these disagree, the projection overlay lies to the player about the game's centrepiece decision** — and it lies silently, by 2–4 seconds, which is exactly the magnitude that decides an undercut. They move together or not at all.

- [ ] **Step 1: Write the failing consistency test**

```ts
describe('circuits: pit lane loss comes from the circuit', () => {
  // pit.laneTimeLoss (22.0) was global while circuits specify 18.0-24.0.
  it('a stop at Veloce costs measurably less than at Grand Savane', () => {
    // Veloce 18.0 vs Grand Savane 24.0 -- a 6.0s difference, far larger than
    // stopSigma (0.3), so this is not a noise artefact.
    // Assert the measured difference in total pit time loss is 6.0 +- 1.0.
  }, 60_000)

  // The important one: the projection must agree with reality, or the
  // centrepiece interaction lies to the player.
  it('the projection prices a stop with the same lane loss the race charges', () => {
    // For each of Veloce (18.0) and Grand Savane (24.0), compare the stop cost
    // projection.ts computes against the one race.ts applies. They must match
    // exactly, not approximately.
  }, 60_000)
})
```

Run it. Expected: the first FAILS (difference is 0.0 — the global value is used everywhere); the second may pass vacuously today, since both sides read the same global. **It must still be written now**, because it is the test that catches wiring three sites and forgetting the fourth.

- [ ] **Step 2: Change all four call sites**

Each becomes `circuit.pitLaneTimeLoss` in place of `tuning.pit.laneTimeLoss`:

- `src/engine/race.ts:212` — `config.circuit.pitLaneTimeLoss`
- `src/engine/projection.ts:30` — `config.circuit.pitLaneTimeLoss`
- `src/state/raceStore.ts:201` — `config.circuit.pitLaneTimeLoss`
- `src/state/raceStore.ts:228` — destructure from `config.circuit`, not `config.tuning.pit`

At `raceStore.ts:228` the current line is `const { laneTimeLoss, stopMean, stopSigma } = config.tuning.pit`. `stopMean` and `stopSigma` stay on `tuning.pit`; only `laneTimeLoss` moves. Split the destructure rather than reaching for the circuit inside it.

- [ ] **Step 3: Grep to prove no call site was missed**

Run: `grep -rn "laneTimeLoss" src/`
Expected: the only remaining references are the `tuning.json` definition, its zod entry, and its `types.ts` declaration — **no consumer**. If a consumer remains, it was missed.

- [ ] **Step 4: Run both tests**

Run: `npx vitest run tests/engine/circuitDifferentiation.test.ts`
Expected: PASS.

- [ ] **Step 5: Decide `tuning.pit.laneTimeLoss`'s fate, with evidence**

After Step 3 it has no consumer. Either remove it from `tuning.json`, `validators.ts` and `types.ts` in one commit, **or** keep it as a documented default and say what reads it. Do not leave a live-looking global that nothing reads — that is precisely the shadowing defect the spec's §1.2 describes, and re-creating it here would be the same mistake in a new place.

- [ ] **Step 6: Commit**

```bash
git add src/engine/race.ts src/engine/projection.ts src/state/raceStore.ts src/data tests/engine
git commit -m "feat: pit lane loss comes from the circuit, at all four call sites

Circuits specify 18.0-24.0s and were ignored in favour of a global 22.0.
race.ts applies the stop, projection.ts prices the 'if you pit now' overlay, and
raceStore.ts both drives the player's stop and decides when they are still in
the lane. Moving three and forgetting one would make the projection lie to the
player by 2-4s -- the exact magnitude that decides an undercut -- so a test
asserts the projection and the race agree exactly rather than approximately."
```

---

### Task 3: Re-measure everything, and settle the pit-lane band question

**Files:**
- Modify: `MODEL_SPEC.md` (§3, §8)
- Modify: `docs/superpowers/specs/2026-08-22-circuits-that-matter-design.md` (§5's predicted → measured)
- Modify: `tests/engine/circuitDifferentiation.test.ts` (the §6.2 gates)
- Modify: `src/data/tuning.json` (`_regressionBands` only if a band ADVANCES toward its §3 target)

- [ ] **Step 1: Measure the per-circuit |Δpos| ratio — the number this plan exists to move**

For each of the 12 circuits, measure mean |grid − finish| over ≥ 120 races at pro. Report each with its SE, then the **ratio of max to min**.

Spec §6.2 gates this at **1.5–2.5×** (`MODEL_SPEC.md` §3, real F1 1.47×–2.67×). It measured exactly **1.00×** before this plan. Add it as a failable assertion.

If the ratio lands below 1.5, **report it with the per-circuit numbers rather than adjusting `circuits.json`** — the data is the owner's, the spec forbids changing it, and a ratio of 1.3 is a finding about the sensitivity spread, not a licence to edit the calendar.

- [ ] **Step 2: Settle the pit-lane band**

`MODEL_SPEC.md` §3 bands pit-lane loss at 19.5–24.0s. **Veloce's 18.0 and Harbour Lights' 19.0 fall below the floor.**

Per spec §5.2: the band describes the real-world *population mean across circuits*, not a per-circuit minimum — real pit lanes do vary below 19.7s. So:

- Compute the field-wide mean across the 12 (expected 21.0) and assert **that** against 19.5–24.0.
- Update `MODEL_SPEC.md` §3's row to state explicitly that the metric is the **mean across the calendar**, and note the per-circuit range with its two sub-floor members.

**This is a clarification of what the band measures, not a loosening of it.** State that distinction in the oracle in those terms, so a future reader cannot mistake it for precedent for widening a band to fit data.

- [ ] **Step 3: Re-measure every field-wide band across all 12 circuits, both difficulties**

Raw sensitivities change the total car and driver spread per circuit, so the field-wide figure is a weighted mean and may have moved in either direction. Measure and report with SEs:

top-team win share, distinct winners, `paceRankCorrelation`, mean |Δpos|, grid↔finish ρ, mechanical DNF per car-race.

Then, per spec §6.2:
- `paceRankCorrelation` **≥ 0.90** — the anti-lottery gate. If sensitivity compression pushed results toward randomness, this is what catches it.
- distinct winners **≥ 4**, ρ **0.60–0.80** — must not regress.
- **Any band now out of range is a finding to report, with the number and the likely cause. Not a number to edit.**

- [ ] **Step 4: Advance `meanAbsPosChange` if, and only if, it is earned**

`_regressionBands.meanAbsPosChange` sits at its staged `[1.75, 4.0]` while §3's final target is `[2.5, 4.0]`; the competitive-grid plan measured 2.803–2.968 and deliberately left advancing it to a later plan. If the measurement still comfortably clears 2.5 (say, ≥ 3 SE above it), advance the floor to 2.5 and record the measurement in `MODEL_SPEC.md` §4.

**A band may only ever be advanced to its §3 target, never past it.** If the measurement no longer clears 2.5, leave the band staged and report why.

- [ ] **Step 5: Update the oracle and the spec**

- `MODEL_SPEC.md` **§8:** all four circuit fields are now consumed. Mark them resolved, and state what remains dead, if anything.
- `MODEL_SPEC.md` **§3:** update the "Sim at" column and the per-circuit |Δpos| ratio row with the measured values, and date it. **§3 and §4 must agree** — a half-updated oracle is worse than an untouched one, and this project has shipped that failure once already.
- The **spec's §5** holds predictions. Replace them with measured numbers.

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src tests MODEL_SPEC.md docs
git commit -m "docs: measure the differentiated calendar, resolve the dead-data list

Records the per-circuit |grid - finish| ratio -- the single number saying
circuits matter, and exactly 1.00x before this plan -- against MODEL_SPEC
section 3's 1.5-2.5x band, and re-measures every field-wide band across all 12
circuits, since raw sensitivities make the field-wide figure a weighted mean.

Settles the pit-lane band question without widening it: Veloce's 18.0s and
Harbour Lights' 19.0s fall below section 3's floor, so the metric is redefined
as the mean across the calendar, which is what the real-world figure it derives
from always measured. That is a clarification of the metric, not precedent for
fitting a band to data.

All four fields on section 8's dead-data list are now consumed."
```

---

## Self-Review

**Spec coverage.** §5.1 `carSensitivity`/`driverSensitivity` → Task 1 Step 3. §5.2 `pitLaneTimeLoss` → Task 2 in full, band question in Task 3 Step 2. §5.3 the differentiation proof → Task 1 Steps 1-4 (Aurora/Kaido) and Task 3 Step 1 (the ratio). §6's shared discipline → the Global Constraints. §6.2's six gates → Task 3 Steps 1-3. §7's "moves win share out of band" risk → Task 3 Step 3's report-don't-edit rule. §7's "values below the §3 floor" risk → Task 3 Step 2. No gaps.

**Placeholder scan.** Task 2 Step 1's two test bodies are specified by their assertions and tolerances rather than written out, because both need the measured stop cost from a specific run. The tolerance (`6.0 ± 1.0`) and the exactness requirement on the projection comparison are both stated, so neither is open to interpretation. No TBDs.

**Type consistency.** `ALL_TWELVE` is declared in Task 1 and consumed in Tasks 2 and 3. `raceFingerprint(circuitId, seed): string` is used only within Task 1. `circuit.carSensitivity`, `circuit.driverSensitivity` and `circuit.pitLaneTimeLoss` are all already on `CircuitSpec` (`types.ts:120-123`) and already zod-validated, so no type or validator work is needed for the fields themselves — only for any tuning key that gets *removed* (Task 2 Step 5).

**Two things a reviewer should weigh.** First, Task 1's fingerprint compares finishing order and winning margin rather than whole serialised state, deliberately: `sectorBase` differs between circuits already, so a whole-state comparison would pass without sensitivity working at all. That choice is what makes the test prove the thing it claims. Second, Task 3's "report, don't edit" instruction appears four times. That repetition is intentional — the temptation to nudge a band or a circuit value is highest exactly here, at the end, when everything else is green.
