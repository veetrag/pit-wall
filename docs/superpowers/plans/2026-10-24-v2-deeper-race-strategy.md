# Pit Wall 2.0 — Deeper Race Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Pit Wall 2.0 in three slices on `feat/2.0`. **2.0a** makes the track rubber in and wash out visibly, gives tyres a temperature (cold out-laps, overheating, graining), adds DRS and DRS trains, and shows a live, calibrated safety-car likelihood. **2.0b** adds fuel and ERS as managed resources with a Power unit sheet, double-stacked stops and penalties (track limits, unsafe release, served vs added). **2.0c** adds team orders with the AI team-mate and a mid-race strategy planner, and extends the debrief and what-if to every new call. Determinism, the golden race, every existing Monte-Carlo band and every save are preserved; the version becomes 2.0 / versionCode 10.

**Architecture:** Every mechanic lands in the pure engine first (`src/engine/`, numbers in `tuning.json`, zod-validated), shipped **off**, and is switched on per slice only after measurement. 2.0 adds **no `rng()` call** to the race path: track limits reuse `lapModel`'s spare `noise2`, unsafe release reuses `pitStopTime`'s `g2` lower tail, team-order compliance is a hash. New per-car state is four optional objects (`fuel`, `ers`, `thermal`, `penalty`) written only when their feature is on, so the golden JSON never sees them. All stops go through one helper (`executeStop`/`fitTyres`). New player decisions are four new `PlayerCall` kinds (`fuel`, `ers`, `team_order`, `replan`), so replay, the debrief and what-if reproduce them. The UI only reads pure engine helpers (`drsTrains`, `neutralisationOutlook`, `effectiveOrder`, `fuelMarginLaps`, `thermalStatus`, `trackGrip`).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 19 + framer-motion, Zustand 5, zod 4, Vitest 4 (jsdom), PixiJS 8, Capacitor 8.

> **Status note (2026-10-31) — read before executing.** This plan was written when 1.6.2 was the
> latest release. Since then 1.7 (versionCode 10), 1.8 (11) and 1.9 (12) shipped from the content
> plan, so:
> - **Version numbers are stale.** Every "2.0 / versionCode 10" here (Goal, Task 27) must be
>   renumbered to the next free versionCode (13 or later) and the release name agreed in the 2.0
>   roadmap; the content plan's slice D also claims "2.0 / versionCode 13". Decide the order before
>   either runs.
> - **Task 2 is partly done.** Both projection defects it describes (the projected stop missing
>   `compoundsUsed`/`tyreAllocation`, and the fast-forward loops running past the flag) were fixed in
>   97e1ff0 with tests in `tests/engine/projection.test.ts` ("projectPitNow near the flag"). Task 2
>   still owns the `fitTyres`/`executeStop` refactor; its projection test will already pass, so its
>   RED step must target `fitTyres`/`executeStop` only.
> - **`RaceState.planHold` and `applyPlanHold` already exist** (1.6.2). Task 1's type additions append
>   after `planHold?` as written; nothing to add for the hold itself.
> - **`buildRaceConfig` grew** `lapsPercent` and `weather` parameters and a `RaceRecipe` (1.9,
>   `src/state/raceRecipe.ts`). Task 15 (FUEL LOAD at race setup) must thread `playerFuelLoad`
>   through the recipe too, or share codes and replays of fuel-managed races will not reproduce.
> - **New `PlayerCall` kinds must be appended to `CALL_KINDS`** in `src/state/startCodes.ts`
>   (append-only) or a start made from a 2.0 race cannot be encoded.

**Spec:** `docs/superpowers/specs/2026-10-24-v2-deeper-race-strategy-design.md` — binding. Section and ruling ids (A1…O3) below refer to it. Also read `CLAUDE.md` and `MODEL_SPEC.md` §3, §10, §14–§16.

## Global Constraints

- The engine stays pure and deterministic: same seed + same inputs ⇒ identical race. **No new `rng()` call anywhere in the race path** (spec A1). If an implementer believes one is needed, STOP and report: it must short-circuit with no draw at a zero rate, and it needs Veet's sign-off.
- `tests/engine/byteIdentity.test.ts` and `tests/fixtures/golden-race-pre-incidents.json` pass unchanged and are **never re-captured**. `makeDeterministicTuning` merges `v2Off()` first (spec A3). New `CarState` / `RaceState` / `SectorResult` fields are **absent** (not `undefined`) when their feature is off, and JSON key order of existing objects never changes (overwrite keys in place; append new keys last).
- Every balance number lives in `src/data/tuning.json`, declared in `src/data/validators.ts` (nested `z.object` strips unknown keys — an undeclared key arrives as `undefined`) and in `TuningConstants` in `src/engine/types.ts`.
- Monte-Carlo: every existing band holds after each switch-on. New bands are measured over four n=240 cells and sized by the band rule (Conventions). Fallbacks per spec §12.3, one step only, else ship the feature off (spec A5).
- Saves: season `SAVE_VERSION` 2, career 1, cloud 1 — no bumps. New persisted fields optional, appended last, same order in schema and snapshot. Settings keys appended to `K` and to the `loadSettings` destructure in the same order. The real 1.4 fixtures keep loading.
- Race Day Bold tokens only. Volt = player / call to action; caution = race control; hot = urgent; gain = good. Text on volt/caution/hot is ink. Tabular figures on live numbers. Every new control ≥ 44px with an `aria-label`; colour never the only signal; reduced motion swaps motion for opacity. Kit `EASE`/`PRESS`, never bouncy springs.
- No re-render storms: narrow Zustand selectors; per-tick derived data computed once per `raceState` reference; no per-frame allocations in Pixi.
- Never two full `vitest run`s at once. Bounded loops in tests (a `MAX_STEPS` bound plus a terminal assertion).
- Scenarios: re-author with the procedure in Conventions whenever a switch-on moves one.
- Engine purity: `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`.

## Review Focus

1. **The golden race with every switch off.** Owned by Task 1 (`V2OFF REPRODUCES THE GOLDEN RACE`) and re-run in every engine task. The `fitTyres` refactor (Task 2) is the riskiest single edit: key order and the absence of `+ 0` on the hot path.
2. **The projection prices exactly what the race charges.** Cold out-lap, double-stack queue, a served penalty, and no phantom two-compound penalty near the flag. Tests: Task 2 `A PROJECTION THAT REACHES THE FLAG RECORDS THE NEW COMPOUND`, Task 5 `OUT-LAP COST IS IN THE STOP PATH THE PROJECTION USES`, Task 17 `THE PROJECTION INCLUDES THE QUEUE`, Task 18 `A PENDING PENALTY IS SERVED IN THE PROJECTED STOP`.
3. **Replay of every new call kind.** `fuel`, `ers`, `team_order`, `replan` (and assisted PU calls) replay byte-identically, and a stale call (team order with no team-mate adjacent, a replan in a debrief future where the race has moved on) is a safe no-op. Tests: Task 25 `REPLAY REPRODUCES A RACE WITH EVERY 2.0 CALL`, Task 21 `A SWAP THAT NEVER BECOMES ADJACENT LAPSES`, Task 23 `A REPLAN IN THE PAST IS CLAMPED, NEVER THROWS`.
4. **The SC outlook is calibrated.** Task 10 `OUTLOOK IS CALIBRATED`.
5. **Band headroom.** |Δpos| ≤ 4.0 and ρ ≥ 0.60 after each slice; features switched on one at a time with a MEASURE after each (Tasks 12, 20, 26).

---

## File structure

**Engine (pure) — new:**
- `src/engine/hash.ts` — `hash01(...parts: number[])`, `stringHash(s)`.
- `src/engine/track.ts` — `rubberLaps`, `trackGrip`, `trackTemp`.
- `src/engine/thermal.ts` — `initThermal`, `thermalTarget`, `thermalPace`, `thermalAfterSector`, `thermalAtLapEnd`, `thermalStatus`, `outLapThermal`.
- `src/engine/drs.ts` — `greenSinceLap`, `drsOpenSet`, `drsOvertakeFactor`, `drsTrains`.
- `src/engine/outlook.ts` — `neutralisationOutlook`, `NeutralisationOutlook`.
- `src/engine/fuel.ts` — `initFuel`, `effectiveFuelMode`, `fuelPace`, `fuelWeightDelta`, `burnSector`, `fuelMarginLaps`, `fuelAtLapEnd`.
- `src/engine/ers.ts` — `initErs`, `ersSector`, `ErsSectorResult`.
- `src/engine/penalties.ts` — `trackLimitsChance`, `isTrackLimits`, `unsafeReleaseChance`, `recordTrackLimits`, `addPendingAtFlag`, `effectiveOrder`.
- `src/engine/teamOrders.ts` — `teamMateOf`, `complianceChance`, `applyTeamOrder`, `executeTeamOrders`, `aiTeamSwaps`.
- `src/engine/planner.ts` — `sanitizeStops`, `applyReplan`, `planPreview`.

**Engine — modified:** `types.ts`, `race.ts`, `lapModel.ts`, `tyres.ts`, `pitStop.ts`, `playerCalls.ts`, `projection.ts`, `redFlag.ts`, `strategy.ts`, `incidents.ts`, `debrief.ts`, `raceHistory.ts`, `index.ts`.

**Data:** `src/data/tuning.json`, `src/data/validators.ts`, `src/data/circuits.json` (`drsSectors`, `trackTempC`, `incidentRisk`), `src/data/radio.json`, `src/data/commentary.json`, `src/data/scenarios.json` (re-authored).

**State:** `src/state/raceStore.ts`, `src/state/buildRaceConfig.ts`, `src/state/seasonStore.ts`, `src/state/seasonPersistence.ts`, `src/state/settingsStore.ts`, `src/state/coachMarks.ts`, `src/state/radioRequests.ts`, `src/state/radioMapper.ts`, `src/state/commentaryMapper.ts`, `src/state/debriefRunner.ts`, `src/state/debriefWorkerRunner.ts`, `src/state/plannerStore.ts` (new), `src/workers/debrief.worker.ts`.

**UI / canvas:** new `src/ui/TrackGrip.tsx`, `src/ui/ScOutlook.tsx`, `src/ui/PowerUnitSheet.tsx`, `src/ui/BattleChips.tsx`, `src/ui/kit/ResourceGauge.tsx`, `src/ui/TeamOrdersSheet.tsx`, `src/ui/StrategyPlanner.tsx`, `src/ui/StewardToast.tsx`; modified `RaceHUD.tsx`, `TelemetryZone.tsx`, `kit/TyreMeter.tsx`, `TimingTower.tsx`, `PitPanel.tsx`, `PitTimer.tsx`, `WeatherStrip.tsx`, `RaceSetup.tsx`, `SettingsPanel.tsx`, `DebriefCard.tsx`, `LapChart.tsx`, `RadioRequest.tsx`, `src/canvas/TrackCanvas.tsx`.

**Tests (new):** `tests/engine/v2Foundations.test.ts`, `executeStop.test.ts`, `trackRubber.test.ts`, `thermal.test.ts`, `drs.test.ts`, `outlook.test.ts`, `fuel.test.ts`, `ers.test.ts`, `doubleStack.test.ts`, `penalties.test.ts`, `teamOrders.test.ts`, `planner.test.ts`, `v2Calls.test.ts`, `v2Bands.test.ts`; `tests/state/powerUnitAssist.test.ts`, `fuelLoadPersistence.test.ts`, `teamOrderFlow.test.tsx`, `plannerStore.test.ts`; `tests/ui/trackGrip.test.tsx`, `tyreTemp.test.tsx`, `towerV2.test.tsx`, `scOutlook.test.tsx`, `powerUnitSheet.test.tsx`, `penaltyPresentation.test.tsx`, `teamOrdersSheet.test.tsx`, `strategyPlanner.test.tsx`, `debriefV2.test.tsx`.

**Docs:** `MODEL_SPEC.md` §3 rows, §10 invariant 6, new §17; `docs/V2-CHECKLIST.md`.

## Conventions every task follows

- Single file: `npx vitest run <path>`. Full suite: `npx vitest run` (record the baseline count before Task 1). Types: `npx tsc --noEmit -p tsconfig.json`. Monte-Carlo/band files run in the `simulation` project (`vite.config.ts` `SIMULATION_SUITES`, 300 s timeouts); every new band file this plan creates (`tests/engine/v2Bands.test.ts`, which also holds the outlook calibration gate) is added to `SIMULATION_SUITES` in the task that creates it. Plain `npx vitest run <path>` runs either project.
- `console.log` from a passing test shows only with `--reporter=verbose`.
- No `Math.random()` in `src/engine/`. Every `switch` exhaustive with a `never` guard.
- A pre-existing test that fails and is not named by the task: STOP, report name and failure, do not edit its assertions. Exception (spec A3): a test measuring another mechanism through `makeTuning`/`makeConfig` with shipped values that turns red at a switch-on gets `...v2Off()` merged into its overrides; list each such file in the commit.
- Commit at the end of each task with the exact command shown. No confirmation needed (Veet's standing rule). Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Band sizing rule:** `low = floor((min × 0.7) / 0.05) × 0.05`, `high = ceil((max × 1.3) / 0.05) × 0.05`, two decimals, over four n=240 cells: pro/rookie × seed bases 1000/7000, on `SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']`.
- **Scenario re-authoring procedure:** run `npx vitest run tests/data/scenarios.test.ts`. If `STILL PRODUCES THE SITUATION ITS BRIEF PROMISES` or `CANNOT BE WON BY LETTING THE AI DRIVE IT` fails: (1) `FIND_SCENARIOS=1 SEEDS=400 npx vitest run tests/tools/findScenarios.run.test.ts --reporter=verbose`; (2) per failing scenario take the FIRST hit under its brief; (3) set `seed`, `startLap`, `goal.position` = par − 1 and `expect` from the hit line (keep `vscOut`/`dampAhead`/`redFlag` facts true or pick the next hit that keeps them); (4) keep `id`, `name`, `circuitId`, `playerDriverId`; (5) keep the `blurb` true, editing only a contradicted fact; (6) no hit → STOP and report; (7) re-run `npx vitest run tests/data/scenarios.test.ts tests/ui/scenariosBold.test.tsx tests/ui/scenarioSelect.test.tsx`; (8) list old → new in the commit.
- **Switch-on procedure (Tasks 12, 20, 26):** flip ONE feature to its shipped value, run the `MEASURE` cell for it, check every existing band in the printout, then the next feature. A band out → apply that feature's fallback (spec §12.3) once, re-measure; still out → set the feature back to off, record in MODEL_SPEC §17, continue.

---

# Slice 2.0a — Track & tyres

### Task 1: Foundations — types, tuning blocks shipped off, validators, `v2Off()` (spec §0.2, §0.3, §0.5–§0.7)

No behaviour changes. Every 2.0 block is added to `tuning.json` at its **off** value; the switch-on tasks flip them.

**Files:**
- Modify: `src/engine/types.ts` (new types, `TuningConstants` blocks, optional `CarState`/`RaceState`/`SectorResult`/`RaceConfig`/`CircuitSpec` fields, `IncidentKind` members)
- Modify: `src/data/tuning.json`, `src/data/validators.ts` (tuning blocks, circuit fields)
- Modify: `tests/fixtures/tuning.ts` (`v2Off`, merged inside `makeDeterministicTuning`)
- Create: `src/engine/hash.ts`
- Test: `tests/engine/v2Foundations.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by every later task):
  - `type FuelMode = 'rich' | 'standard' | 'save'`, `type FuelLoad = 'light' | 'target' | 'safe'`, `type ErsMode = 'harvest' | 'balanced' | 'attack' | 'defend'`, `type TeamOrderKind = 'swap' | 'hold' | 'free' | 'yield'`.
  - `interface FuelState { laps: number; mode: FuelMode; forced: boolean }`, `interface ErsState { charge: number; mode: ErsMode }`, `interface ThermalState { temp: number; coldLaps: number; grainLaps: number; heatWear: number }`, `interface PenaltyState { warnings: number; pendingSec: number; servedSec: number }`, `interface TeamOrderState { order: 'swap' | 'hold' | 'yield'; issuedLap: number; expiresLap: number }`.
  - `CarState.fuel?`, `.ers?`, `.thermal?`, `.penalty?`; `RaceState.teamOrder?`, `.replanned?: true`, `.boxFree?: Record<string, number>`; `SectorResult.trackLimits?: true`; `RaceConfig.playerFuelLoad?: FuelLoad`, `.teamMateAheadInStandings?: boolean`; `CircuitSpec.drsSectors?: SectorIndex[]`, `.trackTempC?: number`, `.incidentRisk?: number`.
  - `TuningConstants` blocks `fuelModel`, `ers`, `tyreTemp`, `drs`, `teamOrders`, `doubleStack`, `penalties`, `planner`, `scOutlook`; `trackEvolution.wash`; `incidents.wetErrorMultiplier`, `incidents.circuitRiskWeight`; `ai.scGambleChance`, `ai.scGambleMaxDelay`, `ai.scGambleMaxCliffFrac`; `debrief.maxResourceVerdicts`.
  - `hash01(...parts: number[]): number` in `[0, 1)`; `stringHash(s: string): number` (uint32).
  - `v2Off(): DeepPartial<TuningConstants>` from `tests/fixtures/tuning.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/v2Foundations.test.ts`:

```ts
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { hash01, stringHash } from '@engine/hash'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning, v2Off } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()

describe('2.0 foundations', () => {
  it('every 2.0 tuning block is declared and survives zod', () => {
    const t = DATA.tuning
    expect(t.fuelModel.enabled).toBe(false)
    expect(t.ers.enabled).toBe(false)
    expect(t.tyreTemp.enabled).toBe(false)
    expect(t.drs.enabled).toBe(false)
    expect(t.doubleStack.enabled).toBe(false)
    expect(t.penalties.enabled).toBe(false)
    expect(t.teamOrders.aiSwapStuckLaps).toBe(0)
    expect(t.trackEvolution.wash).toEqual({ DAMP: 0, WET: 0 })
    expect(t.incidents.wetErrorMultiplier).toEqual({ DRY: 1, DAMP: 1, WET: 1 })
    expect(t.incidents.circuitRiskWeight).toBe(0)
    expect(t.ai.scGambleMaxDelay).toBe(0)
    // Values the switch-on tasks rely on are present, not undefined (z.object strips unknown keys).
    expect(t.fuelModel.burn.save).toBeCloseTo(0.90)
    expect(t.ers.modes.attack.chargePerLap).toBeCloseTo(-0.40)
    expect(t.tyreTemp.windows.H).toEqual([92, 115])
    expect(t.drs.detectionGap).toBe(1.0)
    expect(t.penalties.trackLimits.warningsAllowed).toBe(3)
    expect(t.planner.previewFutures).toBe(4)
    expect(t.scOutlook.bands).toEqual([0.15, 0.30])
    expect(t.debrief.maxResourceVerdicts).toBe(4)
  })

  it('v2Off pins exactly the off values', () => {
    const t = makeDeterministicTuning({ fuelModel: { enabled: true } })
    expect(t.fuelModel.enabled, 'an explicit override still wins over v2Off').toBe(true)
    expect(makeDeterministicTuning().drs.enabled).toBe(false)
    expect(v2Off().trackEvolution?.wash).toEqual({ DAMP: 0, WET: 0 })
  })

  it('V2OFF REPRODUCES THE GOLDEN RACE (same config as byteIdentity)', () => {
    const golden = readFileSync('tests/fixtures/golden-race-pre-incidents.json', 'utf8')
    const circuit = DATA.circuits['bengaluru']!
    const config: RaceConfig = {
      circuit,
      tuning: makeDeterministicTuning({
        mechanicalFailure: { baseChancePerLap: 0.008 },
        tyreFailure: { chancePerLapOverThreshold: 0.30, maxChancePerLap: 0.50 },
        weather: { wetDegMultiplier: { dry: { DRY: 1.0, DAMP: 1.4, WET: 1.9 } } },
      }),
      compounds: DATA.compounds, drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults, playerDriverId: '__none__', seed: 424242,
    }
    let state = initRace(config)
    const rng = createRng(424242)
    for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
    const car = state.cars[0]!
    expect('fuel' in car || 'ers' in car || 'thermal' in car || 'penalty' in car).toBe(false)
    expect('teamOrder' in state || 'replanned' in state || 'boxFree' in state).toBe(false)
    expect(JSON.stringify(state, null, 2) + '\n').toBe(golden)
  }, 60_000)

  it('hash01 is deterministic, in [0, 1), and sensitive to every part', () => {
    const a = hash01(424242, 57, stringHash('d_chen'))
    expect(a).toBe(hash01(424242, 57, stringHash('d_chen')))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(hash01(424242, 58, stringHash('d_chen'))).not.toBe(a)
    expect(hash01(424243, 57, stringHash('d_chen'))).not.toBe(a)
    expect(hash01(424242, 57, stringHash('d_haas'))).not.toBe(a)
  })

  it('circuits carry the authored 2.0 facts (calendar means pinned)', () => {
    const cs = Object.values(DATA.circuits)
    expect(cs).toHaveLength(12)
    const meanTemp = cs.reduce((s, c) => s + (c.trackTempC ?? NaN), 0) / cs.length
    const meanRisk = cs.reduce((s, c) => s + (c.incidentRisk ?? NaN), 0) / cs.length
    expect(meanTemp).toBeCloseTo(32, 10)
    expect(meanRisk).toBeCloseTo(1.0, 10)
    for (const c of cs) expect(c.drsSectors!.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/v2Foundations.test.ts`
Expected: FAIL — `@engine/hash` does not exist; `v2Off` is not exported; `t.fuelModel` is undefined.

- [ ] **Step 3: Types**

In `src/engine/types.ts`, after `export type WeatherState = ...` add:

```ts
// ---- 2.0 (spec 2026-10-24) ----
export type FuelMode = 'rich' | 'standard' | 'save'
export type FuelLoad = 'light' | 'target' | 'safe'
export type ErsMode = 'harvest' | 'balanced' | 'attack' | 'defend'
export type TeamOrderKind = 'swap' | 'hold' | 'free' | 'yield'
/** Fuel in laps of fuel at standard burn (spec §1.2). */
export interface FuelState { laps: number; mode: FuelMode; forced: boolean }
/** charge in [0, 1] (spec §1.4). */
export interface ErsState { charge: number; mode: ErsMode }
/** One tyre temperature per car (spec §5, ruling H1). heatWear: extra laps of effective age. */
export interface ThermalState { temp: number; coldLaps: number; grainLaps: number; heatWear: number }
export interface PenaltyState { warnings: number; pendingSec: number; servedSec: number }
export interface TeamOrderState { order: 'swap' | 'hold' | 'yield'; issuedLap: number; expiresLap: number }
```

Inside `TuningConstants`, after `trackEvolution`, change it and add the blocks (place the new blocks just before `_regressionBands?`):

```ts
  trackEvolution: { startDelta: number; decayLaps: number; wash: { DAMP: number; WET: number } }
  fuelModel: {
    enabled: boolean
    loadMarginFrac: Record<FuelLoad, number>
    burn: Record<FuelMode, number>
    paceBurn: Record<PaceMode, number>
    neutralisedBurn: number
    paceDelta: Record<FuelMode, number>
    degMultiplier: Record<FuelMode, number>
    forcedSaveMargin: number
    forcedSavePenalty: number
    aiRichMinMargin: number
  }
  ers: {
    enabled: boolean
    startCharge: number
    modes: Record<ErsMode, { paceDelta: number; chargePerLap: number }>
    defendDrainPerSector: number
    defendPaceDelta: number
    attackOvertakeAdv: number
    defendResist: number
    neutralisedChargePerLap: number
    aiAttackGap: number
    aiMinAttackCharge: number
    aiMinDefendCharge: number
    aiHarvestBelow: number
  }
  tyreTemp: {
    enabled: boolean
    defaultTrackTemp: number
    weatherOffset: Record<WeatherState, number>
    runningHeat: number
    paceHeat: Record<PaceMode, number>
    fuelHeat: Record<FuelMode, number>
    dirtyAirHeat: number
    neutralisedHeat: number
    responsePerSector: number
    blankets: number
    formationWarm: number
    windows: Record<Compound, [number, number]>
    coldCoeff: number
    overheatCoeff: number
    overheatWearPerLap: number
    grainMargin: number
    grainOnsetLaps: number
    grainDurationLaps: number
    grainPenalty: number
    grainMaxGrip: number
    grainCompounds: Compound[]
    ai: { hotExcess: number; coldDeficit: number }
  }
  drs: {
    enabled: boolean
    detectionGap: number
    enableAfterLaps: number
    timeGain: number
    overtakeBonus: number
    trainNeutralisation: number
    trainMinCars: number
    aiTrainEscape: boolean
  }
  teamOrders: {
    swapMaxGap: number
    swapMargin: number
    swapLoss: number
    windowLaps: number
    compliance: {
      base: number; championshipAhead: number; perPriorSwap: number; lateRace: number; lateRaceLaps: number
      paceBonus: number; paceBonusAdv: number; holdBase: number; min: number; max: number
    }
    aiSwapStuckLaps: number
    aiSwapMinAdv: number
    yieldRequest: { minAdv: number; gap: number; lapEnds: number; minLapsLeft: number; maxPerRace: number }
  }
  doubleStack: {
    enabled: boolean
    entryShare: number
    releaseGap: number
    maxQueue: Record<StrategyBrain, number>
    maxQueueNeutralised: Record<StrategyBrain, number>
    emergencyCliffFrac: number
  }
  penalties: {
    enabled: boolean
    timePenaltySec: number
    trackLimits: {
      chancePerLap: number
      warningsAllowed: number
      paceModeFactor: Record<PaceMode, number>
      hotFactor: number
      consistencyRelief: number
      wetFactor: Record<WeatherState, number>
    }
    unsafeRelease: { chance: number; pitCrewRelief: number; stackedFactor: number }
    aiCoverMargin: number
  }
  planner: { maxStops: number; minStintLaps: number; previewFutures: number; previewSeedSalt: number }
  scOutlook: { horizonLaps: number; bands: [number, number] }
```

Extend `ai` to `{ neutralisationWindowLaps; neutralisationCliffFrac; weatherConfirmLaps; weatherMinLapsLeft; scGambleChance: number; scGambleMaxDelay: number; scGambleMaxCliffFrac: number }`, `incidents` with `wetErrorMultiplier: Record<WeatherState, number>; circuitRiskWeight: number`, and `debrief` with `maxResourceVerdicts: number`.

Append to `CircuitSpec`: `drsSectors?: SectorIndex[]; trackTempC?: number; incidentRisk?: number`. Append to `CarState` (after `retiredCause`): `fuel?: FuelState; ers?: ErsState; thermal?: ThermalState; penalty?: PenaltyState`. Append to `RaceState` (after `planHold?`): `teamOrder?: TeamOrderState; replanned?: true; boxFree?: Record<string, number>`. Append to `SectorResult`: `trackLimits?: true`. Append to `RaceConfig`: `playerFuelLoad?: FuelLoad; teamMateAheadInStandings?: boolean`. Add to `IncidentKind`: `| 'track_limits' | 'penalty_issued' | 'penalty_served' | 'penalty_added' | 'unsafe_release' | 'double_stack' | 'team_order_swap' | 'team_order_ignored' | 'team_order_lapsed' | 'graining' | 'fuel_critical'`. Export the new types from `src/engine/index.ts`'s type list.

- [ ] **Step 4: `hash.ts`**

Create `src/engine/hash.ts`:

```ts
/**
 * Deterministic hashing for decisions that must not draw from the race rng
 * (spec 2026-10-24 ruling A1): team-order compliance. Same integer finaliser
 * as forecastOffset / projectionSeed, folded over every part.
 */
export function stringHash(s: string): number {
  let h = 0x811C9DC5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h >>> 0
}

export function hash01(...parts: number[]): number {
  let h = 0x9E3779B1
  for (const p of parts) {
    h = (h ^ Math.imul((p | 0) + 1, 0x9E3779B1)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0
    h = (h ^ (h >>> 16)) >>> 0
  }
  return h / 4294967296
}
```

- [ ] **Step 5: `tuning.json` (all off) and circuits data**

In `src/data/tuning.json` change `"trackEvolution"` to `{ "startDelta": 0.30, "decayLaps": 20, "wash": { "DAMP": 0, "WET": 0 } }`; add to `"ai"`: `"scGambleChance": 0.35, "scGambleMaxDelay": 0, "scGambleMaxCliffFrac": 0.85`; add to `"incidents"`: `"wetErrorMultiplier": { "DRY": 1, "DAMP": 1, "WET": 1 }, "circuitRiskWeight": 0`; add to `"debrief"`: `"maxResourceVerdicts": 4`; and insert before `"_regressionBands"`:

```json
  "fuelModel": {
    "_note": "Spec 2026-10-24 §1.2. Fuel counted in laps at standard burn. enabled false until the 2.0b switch-on.",
    "enabled": false,
    "loadMarginFrac": { "light": -0.025, "target": -0.012, "safe": 0.004 },
    "burn": { "rich": 1.06, "standard": 1.0, "save": 0.90 },
    "paceBurn": { "push": 1.03, "neutral": 1.0, "conserve": 0.98 },
    "neutralisedBurn": 0.45,
    "paceDelta": { "rich": -0.12, "standard": 0.0, "save": 0.30 },
    "degMultiplier": { "rich": 1.0, "standard": 1.0, "save": 0.94 },
    "forcedSaveMargin": -0.3,
    "forcedSavePenalty": 0.5,
    "aiRichMinMargin": 0.4
  },
  "ers": {
    "_note": "Spec §1.4. charge in [0,1].",
    "enabled": false,
    "startCharge": 1.0,
    "modes": {
      "harvest":  { "paceDelta": 0.15,  "chargePerLap": 0.30 },
      "balanced": { "paceDelta": 0.0,   "chargePerLap": 0.0 },
      "attack":   { "paceDelta": -0.30, "chargePerLap": -0.40 },
      "defend":   { "paceDelta": 0.0,   "chargePerLap": 0.0 }
    },
    "defendDrainPerSector": 0.05,
    "defendPaceDelta": -0.10,
    "attackOvertakeAdv": 0.15,
    "defendResist": 0.35,
    "neutralisedChargePerLap": 0.5,
    "aiAttackGap": 1.0,
    "aiMinAttackCharge": 0.30,
    "aiMinDefendCharge": 0.15,
    "aiHarvestBelow": 0.25
  },
  "tyreTemp": {
    "_note": "Spec §5.2. One temperature per car; pace from distance outside the compound window.",
    "enabled": false,
    "defaultTrackTemp": 32,
    "weatherOffset": { "DRY": 0, "DAMP": -20, "WET": -35 },
    "runningHeat": 62,
    "paceHeat": { "push": 8, "neutral": 0, "conserve": -6 },
    "fuelHeat": { "rich": 2, "standard": 0, "save": -5 },
    "dirtyAirHeat": 3,
    "neutralisedHeat": -25,
    "responsePerSector": 0.35,
    "blankets": 70,
    "formationWarm": 15,
    "windows": { "S": [75, 100], "M": [85, 108], "H": [92, 115], "I": [50, 85], "W": [35, 75] },
    "coldCoeff": 0.20,
    "overheatCoeff": 0.20,
    "overheatWearPerLap": 0.08,
    "grainMargin": 8,
    "grainOnsetLaps": 2,
    "grainDurationLaps": 4,
    "grainPenalty": 0.35,
    "grainMaxGrip": 0.85,
    "grainCompounds": ["S", "M"],
    "ai": { "hotExcess": 4, "coldDeficit": 6 }
  },
  "drs": {
    "_note": "Spec §3.2. Per-sector DRS from circuits.json drsSectors.",
    "enabled": false,
    "detectionGap": 1.0,
    "enableAfterLaps": 2,
    "timeGain": 0.20,
    "overtakeBonus": 0.6,
    "trainNeutralisation": 1.0,
    "trainMinCars": 3,
    "aiTrainEscape": true
  },
  "teamOrders": {
    "_note": "Spec §2.2. Compliance is hashed, never drawn (ruling T1). aiSwapStuckLaps 0 = AI swaps off.",
    "swapMaxGap": 1.5,
    "swapMargin": 0.35,
    "swapLoss": 0.20,
    "windowLaps": 3,
    "compliance": { "base": 0.85, "championshipAhead": 0.25, "perPriorSwap": 0.15, "lateRace": 0.15, "lateRaceLaps": 5, "paceBonus": 0.10, "paceBonusAdv": 0.10, "holdBase": 0.92, "min": 0.05, "max": 0.98 },
    "aiSwapStuckLaps": 0,
    "aiSwapMinAdv": 0.25,
    "yieldRequest": { "minAdv": 0.15, "gap": 1.0, "lapEnds": 2, "minLapsLeft": 5, "maxPerRace": 1 }
  },
  "doubleStack": {
    "_note": "Spec §7.2.",
    "enabled": false,
    "entryShare": 0.5,
    "releaseGap": 0.8,
    "maxQueue": { "naive": 99, "smart": 3.0, "optimal": 2.0 },
    "maxQueueNeutralised": { "naive": 99, "smart": 6.0, "optimal": 5.0 },
    "emergencyCliffFrac": 1.3
  },
  "penalties": {
    "_note": "Spec §8.2. Track limits ride on lapModel's noise2, unsafe release on pitStopTime's g2 lower tail: no new draws.",
    "enabled": false,
    "timePenaltySec": 5,
    "trackLimits": { "chancePerLap": 0.012, "warningsAllowed": 3, "paceModeFactor": { "push": 1.8, "neutral": 1.0, "conserve": 0.5 }, "hotFactor": 0.5, "consistencyRelief": 0.5, "wetFactor": { "DRY": 1.0, "DAMP": 1.5, "WET": 1.2 } },
    "unsafeRelease": { "chance": 0.015, "pitCrewRelief": 0.5, "stackedFactor": 2.5 },
    "aiCoverMargin": 1.0
  },
  "planner": { "maxStops": 3, "minStintLaps": 4, "previewFutures": 4, "previewSeedSalt": 60013 },
  "scOutlook": { "horizonLaps": 5, "bands": [0.15, 0.30] },
```

In `src/data/circuits.json` add to each circuit (after `pitLaneTimeLoss`):

| circuit | `drsSectors` | `trackTempC` | `incidentRisk` |
|---|---|---|---|
| bengaluru | `[0]` | 38 | 1.10 |
| monsoon_bay | `[0]` | 31 | 1.15 |
| veloce | `[0, 2]` | 33 | 0.75 |
| harbour_lights | `[0]` | 27 | 1.45 |
| sol_desert | `[0, 2]` | 44 | 0.65 |
| highland | `[0, 2]` | 24 | 1.05 |
| grand_savane | `[0]` | 40 | 0.80 |
| aurora | `[0]` | 21 | 1.00 |
| silverpark | `[0, 2]` | 26 | 0.95 |
| costa_verde | `[0]` | 36 | 0.95 |
| kaido | `[0]` | 29 | 1.25 |
| altiplano | `[0, 2]` | 35 | 0.90 |

- [ ] **Step 6: Validators**

In `src/data/validators.ts`:
- `trackEvolution: z.object({ startDelta: z.number(), decayLaps: z.number(), wash: z.object({ DAMP: z.number().min(0).max(1), WET: z.number().min(0).max(1) }) })`.
- In `ai`: `scGambleChance: z.number().min(0).max(1), scGambleMaxDelay: z.number().int().min(0), scGambleMaxCliffFrac: z.number().min(0)`.
- In `incidents`: `wetErrorMultiplier: z.object({ DRY: z.number().min(0), DAMP: z.number().min(0), WET: z.number().min(0) }), circuitRiskWeight: z.number().min(0).max(1)`.
- In `debrief`: `maxResourceVerdicts: z.number().int().min(0)`.
- New top-level entries (before `_regressionBands`), with helpers declared above `TuningSchema`:

```ts
const Rec = <K extends string>(keys: readonly [K, ...K[]], v: z.ZodTypeAny = z.number()) =>
  z.object(Object.fromEntries(keys.map(k => [k, v])) as Record<K, z.ZodTypeAny>)
const PACE = ['push', 'neutral', 'conserve'] as const
const FUEL = ['rich', 'standard', 'save'] as const
const ERS = ['harvest', 'balanced', 'attack', 'defend'] as const
const WEATHER = ['DRY', 'DAMP', 'WET'] as const
const BRAINS = ['naive', 'smart', 'optimal'] as const
const COMPOUNDS = ['S', 'M', 'H', 'I', 'W'] as const
const Prob = z.number().min(0).max(1)
```

```ts
  fuelModel: z.object({
    _note: z.string().optional(), enabled: z.boolean(),
    loadMarginFrac: Rec(['light', 'target', 'safe']), burn: Rec(FUEL), paceBurn: Rec(PACE),
    neutralisedBurn: z.number().min(0), paceDelta: Rec(FUEL), degMultiplier: Rec(FUEL),
    forcedSaveMargin: z.number().max(0), forcedSavePenalty: z.number().min(0), aiRichMinMargin: z.number(),
  }),
  ers: z.object({
    _note: z.string().optional(), enabled: z.boolean(), startCharge: Prob,
    modes: Rec(ERS, z.object({ paceDelta: z.number(), chargePerLap: z.number() })),
    defendDrainPerSector: z.number().positive(), defendPaceDelta: z.number(), attackOvertakeAdv: z.number().min(0),
    defendResist: Prob, neutralisedChargePerLap: z.number().min(0), aiAttackGap: z.number().positive(),
    aiMinAttackCharge: Prob, aiMinDefendCharge: Prob, aiHarvestBelow: Prob,
  }).refine(e => e.modes.attack.chargePerLap < 0, { message: 'ers.modes.attack must drain' }),
  tyreTemp: z.object({
    _note: z.string().optional(), enabled: z.boolean(), defaultTrackTemp: z.number(),
    weatherOffset: Rec(WEATHER), runningHeat: z.number(), paceHeat: Rec(PACE), fuelHeat: Rec(FUEL),
    dirtyAirHeat: z.number(), neutralisedHeat: z.number(), responsePerSector: z.number().gt(0).max(1),
    blankets: z.number(), formationWarm: z.number(),
    windows: Rec(COMPOUNDS, z.tuple([z.number(), z.number()]).refine(([lo, hi]) => lo < hi)),
    coldCoeff: z.number().min(0), overheatCoeff: z.number().min(0), overheatWearPerLap: z.number().min(0),
    grainMargin: z.number().min(0), grainOnsetLaps: z.number().int().min(1), grainDurationLaps: z.number().int().min(1),
    grainPenalty: z.number().min(0), grainMaxGrip: Prob, grainCompounds: z.array(z.enum(COMPOUNDS)),
    ai: z.object({ hotExcess: z.number().min(0), coldDeficit: z.number().min(0) }),
  }),
  drs: z.object({
    _note: z.string().optional(), enabled: z.boolean(), detectionGap: z.number().positive(),
    enableAfterLaps: z.number().int().min(0), timeGain: z.number().min(0), overtakeBonus: z.number().min(0),
    trainNeutralisation: Prob, trainMinCars: z.number().int().min(2), aiTrainEscape: z.boolean(),
  }),
  teamOrders: z.object({
    _note: z.string().optional(), swapMaxGap: z.number().positive(), swapMargin: z.number().positive(),
    swapLoss: z.number().min(0), windowLaps: z.number().int().min(1),
    compliance: z.object({
      base: Prob, championshipAhead: Prob, perPriorSwap: Prob, lateRace: Prob, lateRaceLaps: z.number().int().min(0),
      paceBonus: Prob, paceBonusAdv: z.number().min(0), holdBase: Prob, min: Prob, max: Prob,
    }),
    aiSwapStuckLaps: z.number().int().min(0), aiSwapMinAdv: z.number().min(0),
    yieldRequest: z.object({ minAdv: z.number().min(0), gap: z.number().positive(), lapEnds: z.number().int().min(1), minLapsLeft: z.number().int().min(0), maxPerRace: z.number().int().min(0) }),
  }).refine(t => t.swapMargin > t.swapLoss, { message: 'teamOrders.swapMargin must exceed swapLoss or a swap does not flip the order' }),
  doubleStack: z.object({
    _note: z.string().optional(), enabled: z.boolean(), entryShare: Prob, releaseGap: z.number().min(0),
    maxQueue: Rec(BRAINS), maxQueueNeutralised: Rec(BRAINS), emergencyCliffFrac: z.number().positive(),
  }),
  penalties: z.object({
    _note: z.string().optional(), enabled: z.boolean(), timePenaltySec: z.number().positive(),
    trackLimits: z.object({
      chancePerLap: Prob, warningsAllowed: z.number().int().min(0), paceModeFactor: Rec(PACE),
      hotFactor: z.number().min(0), consistencyRelief: Prob, wetFactor: Rec(WEATHER),
    }),
    unsafeRelease: z.object({ chance: Prob, pitCrewRelief: Prob, stackedFactor: z.number().min(1) }),
    aiCoverMargin: z.number().min(0),
  }),
  planner: z.object({ maxStops: z.number().int().min(1), minStintLaps: z.number().int().min(1), previewFutures: z.number().int().min(1), previewSeedSalt: z.number().int() }),
  scOutlook: z.object({ horizonLaps: z.number().int().min(1), bands: z.tuple([Prob, Prob]).refine(([a, b]) => a < b) }),
```

In `CircuitSchema` append: `drsSectors: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])).optional(), trackTempC: z.number().optional(), incidentRisk: z.number().positive().optional()`.

- [ ] **Step 7: `v2Off()` in the fixture**

In `tests/fixtures/tuning.ts`, export (above `makeDeterministicTuning`):

```ts
/**
 * Every 2.0 switch at its OFF value (spec 2026-10-24 §0.2, ruling A3). With
 * these the engine is the 1.6.2 engine byte for byte; byteIdentity relies on it.
 * A new 2.0 switch MUST be added here in the task that creates it.
 */
export function v2Off(): DeepPartial<TuningConstants> {
  return {
    trackEvolution: { wash: { DAMP: 0, WET: 0 } },
    fuelModel: { enabled: false },
    ers: { enabled: false },
    tyreTemp: { enabled: false },
    drs: { enabled: false },
    doubleStack: { enabled: false },
    penalties: { enabled: false },
    teamOrders: { aiSwapStuckLaps: 0 },
    incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1, WET: 1 }, circuitRiskWeight: 0 },
    ai: { scGambleMaxDelay: 0 },
  }
}
```

and change `makeDeterministicTuning` to merge it first:

```ts
export function makeDeterministicTuning(overrides: DeepPartial<TuningConstants> = {}): TuningConstants {
  return makeTuning(deepMerge(deepMerge(v2Off(), {
    incidents: { /* …existing block unchanged… */ },
    mechanicalFailure: { baseChancePerLap: 0 },
    ai: { weatherConfirmLaps: 1, weatherMinLapsLeft: 0 },
    pit: { slowStopChance: 0 },
  }), overrides) as DeepPartial<TuningConstants>)
}
```

(`DeepPartial` is already declared in this file; export it.)

- [ ] **Step 8: Run**

Run: `npx vitest run tests/engine/v2Foundations.test.ts tests/engine/byteIdentity.test.ts tests/data/validators.test.ts`
Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json` — expected: no errors (any test file with a hand-built `CircuitSpec` or tuning literal still type-checks because the new fields are optional and tuning literals come from `makeTuning`). Then the full suite `npx vitest run` — expected: baseline + 5 passing.

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/engine/hash.ts src/engine/index.ts src/data/tuning.json src/data/validators.ts src/data/circuits.json tests/fixtures/tuning.ts tests/engine/v2Foundations.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): 2.0 foundations -- types, tuning blocks shipped off, v2Off fixture

Spec 2026-10-24 §0. Declares every 2.0 type, optional state field and tuning
block (fuel, ERS, tyre temperature, DRS, team orders, double-stack,
penalties, planner, SC outlook) with each switch OFF, plus the authored
circuit facts (drsSectors, trackTempC mean 32, incidentRisk mean 1.00) and
hash01 for rng-free decisions (ruling A1). makeDeterministicTuning merges
v2Off() first (ruling A3); the golden race reproduces unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: One stop path — `fitTyres` / `executeStop`, and the projection fixed (spec §0.4, ruling A4)

A pure refactor for the race, a deliberate fix for the projection. Every stop site calls one helper so later tasks (cold out-lap, queue, unsafe release, serving penalties) land in one place.

Two latent projection defects are fixed here and pinned by one test:
1. `projectPitNow` built the stopped car by hand without `compoundsUsed`/`tyreAllocation`, so a projection that reaches the flag can charge the player a phantom 30 s two-compound penalty.
2. It always stepped `horizonLaps × 3` / `netEstimateHorizonLaps × 3` sectors, **past the flag** when fewer laps remained; `raceEndsThisTick` is then true on every later boundary and the penalty is charged repeatedly.

**Files:**
- Modify: `src/engine/pitStop.ts` (`PitStopCost` gains `stationary`, `releaseDraw`; new `StopContext`, `StopOutcome`, `fitTyres`, `executeStop`)
- Modify: `src/engine/race.ts` (AI stop and plan stop blocks), `src/engine/playerCalls.ts` (`applyPlayerPit`), `src/engine/projection.ts`, `src/engine/index.ts`
- Test: `tests/engine/executeStop.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `interface PitStopCost { total: number; slow: number; stationary: number; releaseDraw: number }` (`stationary = total − laneLoss`; `releaseDraw` = the raw `g2`).
  - `interface StopContext { safetyCar: RaceState['safetyCar']; lap: number; sector: SectorIndex; boxFree?: Record<string, number> }`
  - `interface StopOutcome { car: CarState; cost: PitStopCost; queue: number; served: number; unsafe: boolean; boxFree?: Record<string, number>; events: IncidentEvent[] }`
  - `fitTyres(config: RaceConfig, car: CarState, compound: Compound, addSeconds: number): CarState`
  - `executeStop(config: RaceConfig, ctx: StopContext, car: CarState, compound: Compound, rng: Rng, opts?: { allowSlow?: boolean }): StopOutcome`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/executeStop.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector, projectPitNow } from '@engine/index'
import { executeStop, fitTyres, pitStopTime } from '@engine/pitStop'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
function cfg(over: Partial<RaceConfig> = {}): RaceConfig {
  return {
    circuit: DATA.circuits['veloce']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams, strategies: DATA.strategies.defaults,
    playerDriverId: 'd_voss', seed: 77,
    // Dry all race and a no-stop plan on hards (cliff 24 laps of 34: never past the
    // 1.45 failure threshold), so the two-compound rule genuinely bites.
    allDry: true, playerStrategyOverride: { teamId: 'apex', startCompound: 'H', plannedStops: [] },
    ...over,
  }
}

describe('one stop path (spec A4)', () => {
  it('fitTyres keeps key order and adds exactly addSeconds', () => {
    const car = initRace(cfg()).cars[0]!
    const out = fitTyres(cfg(), car, 'H', 21.5)
    expect(Object.keys(out)).toEqual(Object.keys(car))
    expect(out.raceTime).toBe(car.raceTime + 21.5)
    expect(out).toMatchObject({ compound: 'H', tyreAge: 0, pitsDone: car.pitsDone + 1, compoundsUsed: [...car.compoundsUsed, 'H'] })
    expect(out.tyreAllocation.H).toBe(car.tyreAllocation.H - 1)
  })

  it('executeStop draws exactly one gaussianPair and charges exactly pitStopTime().total with 2.0 off', () => {
    const config = cfg()
    const car = initRace(config).cars[0]!
    let calls = 0
    const base = createRng(5)
    const counting = () => { calls++; return base() }
    const out = executeStop(config, { safetyCar: null, lap: 3, sector: 2 }, car, 'H', counting)
    expect(calls).toBe(2)
    const expected = pitStopTime(config, car.teamId, null, createRng(5))
    expect(out.car.raceTime).toBe(car.raceTime + expected.total)
    expect(out).toMatchObject({ queue: 0, served: 0, unsafe: false, events: [] })
    expect('boxFree' in out && out.boxFree !== undefined).toBe(false)
  })

  it('a slow stop is logged with the context lap and sector', () => {
    const config = cfg({ tuning: makeDeterministicTuning({ pit: { slowStopChance: 1, pitCrewSlowRelief: 0 } }) })
    const car = initRace(config).cars[0]!
    const out = executeStop(config, { safetyCar: null, lap: 9, sector: 1 }, car, 'M', createRng(1))
    expect(out.events).toEqual([{ lap: 9, sector: 1, kind: 'slow_stop', driverId: car.driverId, timeLoss: out.cost.slow }])
  })

  it('A PROJECTION THAT REACHES THE FLAG RECORDS THE NEW COMPOUND (no phantom two-compound penalty)', () => {
    const withRule = cfg({ mandatoryTwoCompound: true })
    const without = cfg({ mandatoryTwoCompound: false })
    let s: RaceState = initRace(withRule)
    const rng = createRng(77)
    const laps = withRule.circuit.laps
    for (let i = 0; i < (laps - 4) * 3; i++) s = stepSector(withRule, s, rng)
    const me = s.cars.find(c => c.isPlayer)!
    expect(new Set(me.compoundsUsed).size, 'the player has used one dry compound so far').toBe(1)
    const a = projectPitNow(withRule, s, 'M', 999)
    const b = projectPitNow(without, s, 'M', 999)
    expect(a.netEstimatePosition, 'fitting a second compound satisfies the rule').toBe(b.netEstimatePosition)
    expect(a.rejoinPosition).toBe(b.rejoinPosition)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/executeStop.test.ts`
Expected: FAIL — `fitTyres`/`executeStop` are not exported; the projection test fails on `netEstimatePosition` (the rule-on run carries a +30 s penalty, charged on every boundary past the flag).

- [ ] **Step 3: `pitStop.ts`**

Change `PitStopCost` and `pitStopTime` (the association of `base` is unchanged, so `total` is bit-identical):

```ts
/** What one stop cost. `slow` is the slow part of `total`; `stationary` = total − lane loss; `releaseDraw` is g2. */
export interface PitStopCost { total: number; slow: number; stationary: number; releaseDraw: number }

export function pitStopTime(
  config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng,
  opts: { allowSlow?: boolean } = {},
): PitStopCost {
  const [stopNoise, g2] = gaussianPair(rng)
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
  const base = expectedPitStopTime(config, teamId, safetyCar) + stopNoise * effectiveStopSigma
  const slow = opts.allowSlow === false ? 0 : slowStopComponent(config, teamId, g2)
  const total = base + slow
  return { total, slow, stationary: total - effectivePitLaneLoss(config.circuit, safetyCar, config.tuning), releaseDraw: g2 }
}
```

Append:

```ts
import type { CarState, Compound, IncidentEvent, SectorIndex } from './types'
import { consumeTyreSet } from './tyres'

export interface StopContext {
  safetyCar: RaceState['safetyCar']
  /** For the incident log: the PRE-tick lap and the sector being completed. */
  lap: number
  sector: SectorIndex
  /** The team box occupancy (spec §7). Absent = double-stacking off. */
  boxFree?: Record<string, number>
}

export interface StopOutcome {
  car: CarState
  cost: PitStopCost
  /** Seconds queued behind the team-mate (spec §7). */
  queue: number
  /** Penalty seconds served at this stop (spec §8). */
  served: number
  unsafe: boolean
  boxFree?: Record<string, number>
  events: IncidentEvent[]
}

/**
 * The stopped car (spec 2026-10-24 §0.4, ruling A4). Spreads the car and only
 * overwrites keys it already has, so JSON key order never changes. 2.0 resets
 * (tyre temperature, served penalty) are added by later tasks HERE and nowhere else.
 */
export function fitTyres(config: RaceConfig, car: CarState, compound: Compound, addSeconds: number): CarState {
  return {
    ...car,
    raceTime: car.raceTime + addSeconds,
    compound,
    tyreAge: 0,
    pitsDone: car.pitsDone + 1,
    tyreAllocation: consumeTyreSet(car.tyreAllocation, compound),
    compoundsUsed: [...car.compoundsUsed, compound],
  }
}

/**
 * Every real stop: AI, plan, PIT button and the projection. Draws exactly one
 * gaussianPair (via pitStopTime) and nothing else. `compound` must already be
 * resolved against the allocation by the caller.
 */
export function executeStop(
  config: RaceConfig, ctx: StopContext, car: CarState, compound: Compound, rng: Rng,
  opts: { allowSlow?: boolean } = {},
): StopOutcome {
  const cost = pitStopTime(config, car.teamId, ctx.safetyCar, rng, opts)
  const queue = 0
  const served = 0
  // Exactly cost.total when nothing is added: no `+ 0` on the golden path.
  const add = queue === 0 && served === 0 ? cost.total : cost.total + queue + served
  const events: IncidentEvent[] = []
  if (cost.slow > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'slow_stop', driverId: car.driverId, timeLoss: cost.slow })
  return { car: fitTyres(config, car, compound, add), cost, queue, served, unsafe: false, events }
}
```

(Merge the new imports into the existing import lines at the top of the file.)

- [ ] **Step 4: Route the race through it**

In `src/engine/race.ts`, import `executeStop` from `./pitStop` and declare, just before `const finalCars: CarState[] = afterOvertakes.map(...)`:

```ts
  const stopCtx = { safetyCar, lap: state.lap, sector }
```

Replace the AI stop body (the block starting `if (decision.pit && !raceEndsThisTick) {`) with:

```ts
        if (decision.pit && !raceEndsThisTick) {
          const out = executeStop(config, stopCtx, updated, decision.compound, rng)
          updated = out.car
          newIncidents.push(...out.events)
        }
```

and the plan-stop body (inside `if (compound) {`) with:

```ts
          if (compound) {
            const out = executeStop(config, stopCtx, updated, compound, rng)
            updated = out.car
            newIncidents.push(...out.events)
          }
```

Delete `logSlow` and the now-unused `PitStopCost`/`pitStopTime`/`consumeTyreSet` imports if `tsc` reports them unused.

- [ ] **Step 5: The PIT button**

In `src/engine/playerCalls.ts` replace the body after `if (!resolved) return null` with:

```ts
  const out = executeStop(config, { safetyCar: state.safetyCar, lap: state.lap, sector: state.sector }, player, resolved, rng)
  // A stop from the panel consumes a held plan stop (pitsDone + 1) and ends the hold.
  const { planHold: _held, ...unheld } = state
  const next: RaceState = { ...unheld, cars: state.cars.map(car => car.isPlayer ? out.car : car) }
  if (out.events.length === 0) return next
  return { ...next, incidents: [...state.incidents, ...out.events] }
```

- [ ] **Step 6: The projection**

In `src/engine/projection.ts` replace the stop application and both loops:

```ts
  const playerCar = state.cars.find(c => c.driverId === playerDriverId)!
  const resolved = resolveAllocatedCompound(newCompound, playerCar.tyreAllocation) ?? newCompound
  // The EXPECTED stop (allowSlow false), through the race's own stop path (spec A4).
  const stop = executeStop(config, { safetyCar: state.safetyCar, lap: state.lap, sector: state.sector },
    projState.cars.find(c => c.driverId === playerDriverId)!, resolved, createRng(seed), { allowSlow: false })
  projState = { ...projState, cars: projState.cars.map(c => c.driverId === playerDriverId ? stop.car : c) }
  const finished = (s: RaceState) => s.lap >= s.totalLaps && s.sector === 0
  const rng = createRng(seed + 1)
  for (let i = 0; i < horizonLaps * 3 && !finished(projState); i++) projState = stepSector(projectionConfig, projState, rng)
```

and in the net-estimate loop `for (let i = 0; i < extraLaps * 3 && !finished(netState); i++)`. Rename the later `const playerCar = projState.cars.find(...)` to `const projected = ...` and use it below. Import `executeStop` and `resolveAllocatedCompound`.

- [ ] **Step 7: Run**

Run: `npx vitest run tests/engine/executeStop.test.ts tests/engine/byteIdentity.test.ts tests/engine/v2Foundations.test.ts tests/engine/slowStop.test.ts tests/engine/projection.test.ts tests/state/projectionDeterminism.test.ts tests/engine/replayFidelity.test.ts tests/engine/playerCalls.test.ts`
Expected: PASS. byteIdentity unchanged is the proof the refactor is exact. If `projection.test.ts` pins a numeric value that moved, check the run reaches the flag (only then is a change expected) and report it in the commit; otherwise STOP.

Then `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` — expected all pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/pitStop.ts src/engine/race.ts src/engine/playerCalls.ts src/engine/projection.ts src/engine/index.ts tests/engine/executeStop.test.ts
git commit -m "$(cat <<'EOF'
refactor(engine): one stop path (fitTyres/executeStop); projection stops at the flag

Spec 2026-10-24 §0.4, ruling A4. AI, plan, PIT-button and projected stops all
go through executeStop/fitTyres, so the 2.0 stop behaviours land in one place.
Byte-identical for the race (golden passes). Fixes two projection defects: the
projected stop did not record the new compound, and the loops stepped past the
flag, so near the end the overlay could charge a phantom two-compound penalty
on every boundary.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Track rubber — derived from the weather timeline, washed by rain (spec §4.3, rulings R1, R2)

**Files:**
- Create: `src/engine/track.ts`
- Modify: `src/engine/lapModel.ts` (`SectorContext`, `NO_CTX`, trackDelta from `ctx.rubberLaps`), `src/engine/race.ts` (compute once per tick, pass in), `src/engine/index.ts`
- Test: `tests/engine/trackRubber.test.ts`

**Interfaces:**
- Consumes: `TuningConstants.trackEvolution.wash` (Task 1).
- Produces:
  - `interface SectorContext { rubberLaps?: number; drsOpen?: boolean; ersPace?: number }`, `const NO_CTX: SectorContext`
  - `computeSectorTime(config, car, sector, rng, weatherState?, safetyCar?, ctx?: SectorContext): SectorResult`
  - `rubberLaps(timeline: readonly WeatherState[], lap: number, tuning: TuningConstants): number`
  - `rubberLapsFor(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number | undefined` — `undefined` when both wash rates are 0 (the 1.6 path)
  - `trackGrip(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number` in `[0, 1]`
  - `trackPaceDelta(state, tuning): number` — s/lap the green track costs now (UI)
  - `trackTemp(circuit: CircuitSpec, weather: WeatherState, tuning: TuningConstants): number`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/trackRubber.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rubberLaps, rubberLapsFor, trackGrip, trackPaceDelta, trackTemp } from '@engine/track'
import { computeSectorTime } from '@engine/lapModel'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { WeatherState } from '@engine/types'

const OFF = makeDeterministicTuning()
const ON = makeDeterministicTuning({ trackEvolution: { wash: { DAMP: 0.35, WET: 0.80 } } })
const dry = (n: number): WeatherState[] => Array(n).fill('DRY')

describe('track rubber (spec §4)', () => {
  it('with no wash it is exactly min(decayLaps, lap): the 1.6 formula', () => {
    for (const lap of [0, 1, 7, 20, 21, 55]) {
      const tl: WeatherState[] = [...dry(10), 'WET', 'WET', 'DAMP', ...dry(50)]
      expect(rubberLaps(tl, lap, OFF)).toBe(Math.min(20, lap))
    }
    expect(rubberLapsFor({ weatherTimeline: dry(60), lap: 12 }, OFF)).toBeUndefined()
  })

  it('a wet lap lays then washes 80%, a damp lap 35%', () => {
    const tl: WeatherState[] = [...dry(10), 'WET', 'DAMP', ...dry(5)]
    expect(rubberLaps(tl, 10, ON)).toBe(10)
    expect(rubberLaps(tl, 11, ON)).toBeCloseTo(11 * 0.2, 12)
    expect(rubberLaps(tl, 12, ON)).toBeCloseTo((11 * 0.2 + 1) * 0.65, 12)
    expect(rubberLaps(tl, 13, ON)).toBeCloseTo((11 * 0.2 + 1) * 0.65 + 1, 12)
  })

  it('grip is rubber / decayLaps, clamped; the pace cost mirrors lapModel', () => {
    const s = { weatherTimeline: dry(60), lap: 5 }
    expect(trackGrip(s, ON)).toBeCloseTo(0.25, 12)
    expect(trackPaceDelta(s, ON)).toBeCloseTo(0.30 * 0.75, 12)
    expect(trackGrip({ ...s, lap: 40 }, ON)).toBe(1)
  })

  it('lapModel uses ctx.rubberLaps when given and car.lap otherwise', () => {
    const config = makeConfig({}, 3)
    const car = { ...initRace(config).cars[0]!, lap: 10 }
    const t0 = computeSectorTime(config, car, 0, createRng(9)).sectorTime
    const tSame = computeSectorTime(config, car, 0, createRng(9), 'DRY', null, { rubberLaps: 10 }).sectorTime
    const tGreen = computeSectorTime(config, car, 0, createRng(9), 'DRY', null, { rubberLaps: 2 }).sectorTime
    expect(tSame).toBe(t0)
    expect(tGreen - t0).toBeCloseTo(0.30 * (8 / 20) / 3, 10)
  })

  it('track temperature: circuit value, else the default, plus the weather offset', () => {
    const c = makeConfig({}, 1).circuit
    expect(trackTemp({ ...c, trackTempC: 44 }, 'DRY', ON)).toBe(44)
    expect(trackTemp({ ...c, trackTempC: undefined }, 'DRY', ON)).toBe(32)
    expect(trackTemp({ ...c, trackTempC: 30 }, 'WET', ON)).toBe(30 + ON.tyreTemp.weatherOffset.WET)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/trackRubber.test.ts`
Expected: FAIL — `@engine/track` does not exist.

- [ ] **Step 3: `track.ts`**

```ts
import type { CircuitSpec, RaceState, TuningConstants, WeatherState } from './types'

/**
 * Laps of rubber on the racing line after `lap` completed laps (spec
 * 2026-10-24 §4.3, ruling R1). A pure fold over the weather timeline: each lap
 * lays one lap of rubber (capped at decayLaps), then a non-dry lap washes a
 * fraction off (ruling R2). With both wash rates 0 the arithmetic is exact
 * integers and equals min(decayLaps, lap), i.e. the 1.6 formula.
 */
export function rubberLaps(timeline: readonly WeatherState[], lap: number, tuning: TuningConstants): number {
  const { decayLaps, wash } = tuning.trackEvolution
  let r = 0
  for (let i = 0; i < lap; i++) {
    r = Math.min(decayLaps, r + 1)
    const w = timeline[i] ?? 'DRY'
    if (w !== 'DRY') {
      const f = wash[w]
      if (f > 0) r = r * (1 - f)
    }
  }
  return r
}

/** Undefined when nothing can wash (the 1.6 path: lapModel keeps car.lap). */
export function rubberLapsFor(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number | undefined {
  const w = tuning.trackEvolution.wash
  if (w.DAMP === 0 && w.WET === 0) return undefined
  return rubberLaps(state.weatherTimeline, state.lap, tuning)
}

export function trackGrip(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number {
  return Math.min(1, rubberLaps(state.weatherTimeline, state.lap, tuning) / tuning.trackEvolution.decayLaps)
}

/** Seconds per lap the green track costs now; the same expression lapModel uses, ×3. */
export function trackPaceDelta(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number {
  const { startDelta, decayLaps } = tuning.trackEvolution
  return startDelta * Math.max(0, 1 - rubberLaps(state.weatherTimeline, state.lap, tuning) / decayLaps)
}

export function trackTemp(circuit: CircuitSpec, weather: WeatherState, tuning: TuningConstants): number {
  return (circuit.trackTempC ?? tuning.tyreTemp.defaultTrackTemp) + tuning.tyreTemp.weatherOffset[weather]
}
```

- [ ] **Step 4: `lapModel.ts`**

Above `computeSectorTime`:

```ts
/** Per-tick facts race.ts computes once and hands to every car (spec 2026-10-24 §0.6). */
export interface SectorContext {
  /** Laps of rubber (§4). Absent = car.lap, the 1.6 formula. */
  rubberLaps?: number
  /** DRS open for this car in this sector (§3). */
  drsOpen?: boolean
  /** Seconds this sector from ERS deployment (§1.4). */
  ersPace?: number
}
export const NO_CTX: SectorContext = Object.freeze({})
```

Add the parameter `ctx: SectorContext = NO_CTX` after `safetyCar`, and change the track-evolution line to:

```ts
  const rubber = ctx.rubberLaps ?? car.lap
  const trackFraction = Math.max(0, 1 - rubber / tuning.trackEvolution.decayLaps)
```

- [ ] **Step 5: `race.ts`**

At the top of `stepSector` (after the `newIncidents` declaration):

```ts
  // Once per tick, not per car (spec §4.3). Undefined unless rain can wash rubber.
  const rubber = rubberLapsFor(state, config.tuning)
  const ctxBase: SectorContext = rubber === undefined ? NO_CTX : { rubberLaps: rubber }
```

and pass `ctxBase` as the seventh argument of `computeSectorTime`. Import `rubberLapsFor` from `./track` and `NO_CTX`, `type SectorContext` from `./lapModel`. Export `rubberLaps`, `rubberLapsFor`, `trackGrip`, `trackPaceDelta`, `trackTemp` and `type SectorContext` from `src/engine/index.ts`.

- [ ] **Step 6: Run**

Run: `npx vitest run tests/engine/trackRubber.test.ts tests/engine/byteIdentity.test.ts tests/engine/lapModel.test.ts tests/engine/v2Foundations.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/track.ts src/engine/lapModel.ts src/engine/race.ts src/engine/index.ts tests/engine/trackRubber.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): track rubber derived from the weather timeline, washed by rain

Spec 2026-10-24 §4.3, rulings R1/R2. rubberLaps folds the timeline; with wash
0 it is exactly min(decayLaps, lap), so lapModel's track-evolution term is the
1.6 one bit for bit (golden passes). Adds SectorContext for per-tick facts and
trackGrip/trackPaceDelta/trackTemp for the UI and the tyre model. Wash ships 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: TRACK GRIP on the weather strip, GRIP RESET, the canvas rubber line (spec §4.2, §4.5)

**Files:**
- Create: `src/ui/TrackGrip.tsx`
- Modify: `src/ui/WeatherStrip.tsx` (renders `<TrackGrip />`), `src/ui/RaceHUD.tsx` (no change if the strip owns it), `src/state/raceStore.ts` (GRIP RESET alert in `step`), `src/canvas/TrackCanvas.tsx` (rubber-line alpha)
- Test: `tests/ui/trackGrip.test.tsx`

**Interfaces:**
- Consumes: `trackGrip`, `trackPaceDelta` (Task 3).
- Produces: `TrackGrip(): JSX.Element | null`; `gripResetLost(prev: RaceState, next: RaceState, tuning): number` (exported from `src/state/raceStore.ts` — segments lost across one step, 0 when none); `gripText(grip: number, delta: number): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/trackGrip.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrackGrip, gripText } from '@ui/TrackGrip'
import { useRaceStore, gripResetLost } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'
import type { WeatherState } from '@engine/types'

const WASH = { trackEvolution: { wash: { DAMP: 0.35, WET: 0.80 } } }

describe('TRACK GRIP (spec §4.5)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('gripText rounds and states the cost', () => {
    expect(gripText(0.78, 0.066)).toBe('78% · +0.07s/lap')
    expect(gripText(1, 0)).toBe('100% · rubbered in')
  })

  it('renders a meter with an accessible value', () => {
    const config = makeConfig(WASH, 4)
    const s = { ...initRace(config), lap: 4, weatherTimeline: Array(60).fill('DRY') as WeatherState[] }
    useRaceStore.setState({ config, raceState: s, phase: 'racing' })
    render(<TrackGrip />)
    const m = screen.getByRole('meter', { name: /track grip/i })
    expect(m.getAttribute('aria-valuenow')).toBe('20')
    expect(m.getAttribute('aria-valuetext')).toMatch(/20 percent, plus 0\.24 seconds a lap/)
  })

  it('a wet lap costs segments and is reported once', () => {
    const config = makeConfig(WASH, 4)
    const tl: WeatherState[] = [...Array(12).fill('DRY'), 'WET', ...Array(40).fill('DRY')] as WeatherState[]
    const prev = { ...initRace(config), lap: 12, weatherTimeline: tl }
    const next = { ...prev, lap: 13 }
    expect(gripResetLost(prev, next, config.tuning)).toBe(5)       // 60% -> 13% of grip, 10 segments
    expect(gripResetLost(next, { ...next, lap: 14 }, config.tuning)).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ui/trackGrip.test.tsx`
Expected: FAIL — module `@ui/TrackGrip` not found.

- [ ] **Step 3: Implement**

`src/ui/TrackGrip.tsx`:

```tsx
import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { trackGrip, trackPaceDelta } from '@engine/index'
import { useReducedMotion } from '@ui/kit'

export function gripText(grip: number, delta: number): string {
  const pct = Math.round(grip * 100)
  return delta < 0.005 ? `${pct}% · rubbered in` : `${pct}% · +${delta.toFixed(2)}s/lap`
}

/** Spec 2026-10-24 §4.5. One reading per lap: selects lap + timeline only. */
export function TrackGrip() {
  const lap = useRaceStore(s => s.raceState?.lap ?? 0)
  const timeline = useRaceStore(s => s.raceState?.weatherTimeline)
  const tuning = useRaceStore(s => s.config?.tuning)
  const reduced = useReducedMotion()
  if (!timeline || !tuning) return null
  const st = { lap, weatherTimeline: timeline }
  const grip = trackGrip(st, tuning)
  const delta = trackPaceDelta(st, tuning)
  const pct = Math.round(grip * 100)
  const lit = Math.round(grip * 10)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)', fontSize: 12 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--lilac-dim)', letterSpacing: '0.08em' }}>TRACK GRIP</span>
      <div role="meter" aria-label="Track grip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-valuetext={`${pct} percent, plus ${delta.toFixed(2)} seconds a lap`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 8px)', gap: 2 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span key={i} className="slant-sm" initial={false}
            animate={{ opacity: i < lit ? 1 : 0.35 }} transition={{ duration: reduced ? 0 : 0.12 }}
            style={{ height: 8, background: i < lit ? 'var(--lilac)' : 'var(--dusk)' }} />
        ))}
      </div>
      <span style={{ color: 'var(--lilac)', fontVariantNumeric: 'tabular-nums' }}>{gripText(grip, delta)}</span>
    </div>
  )
}
```

In `WeatherStrip.tsx`, render `<TrackGrip />` as the strip's last row.

In `src/state/raceStore.ts` export:

```ts
/** Grip segments (of 10) a step washed away (spec §4.2); 0 when grip held or grew. */
export function gripResetLost(prev: RaceState, next: RaceState, tuning: RaceConfig['tuning']): number {
  if (next.lap === prev.lap) return 0
  const seg = (s: RaceState) => Math.round(trackGrip(s, tuning) * 10)
  return Math.max(0, seg(prev) - seg(next))
}
```

and in `step()`, after `nextState` is computed: `const lost = gripResetLost(raceState, nextState, config.tuning)`; when `lost >= 2` append a HUD alert `{ severity: 'caution', category: 'RADIO', message: 'GRIP RESET — the rain washed the rubber away.', icon: '🌧️' }` in the same `set` (one alert per occurrence; ≥ 2 so a single-segment rounding wobble never fires it).

In `src/canvas/TrackCanvas.tsx`, where the rubber-line `Graphics` alpha is set, compute it once per lap change from the store (`0.15 + 0.35 × trackGrip`), cached in a ref keyed on `raceState.lap` — no per-frame allocation.

- [ ] **Step 4: Run**

Run: `npx vitest run tests/ui/trackGrip.test.tsx tests/ui/weatherForecast.test.tsx tests/ui/weatherStripTokens.test.ts tests/ui/legacyTokenBan.test.ts tests/ui/colorMixBan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TrackGrip.tsx src/ui/WeatherStrip.tsx src/state/raceStore.ts src/canvas/TrackCanvas.tsx tests/ui/trackGrip.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TRACK GRIP meter, GRIP RESET alert, canvas rubber line follows grip

Spec 2026-10-24 §4.2/§4.5. The weather strip shows rubber as 10 segments with
the green-track cost; a wash of 2+ segments raises one GRIP RESET alert. Values
come from the engine's trackGrip/trackPaceDelta, so the HUD and the lap model
cannot disagree.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tyre temperature, part 1 — state, heat target, dynamics, pace, out-lap, start and restart (spec §5.2, rulings H1–H3)

**Files:**
- Create: `src/engine/thermal.ts`
- Modify: `src/engine/race.ts` (`initRace` writes `thermal`; per-sector update), `src/engine/lapModel.ts` (thermal pace in `v2Delta`), `src/engine/pitStop.ts` (`fitTyres` resets to blankets), `src/engine/redFlag.ts` (restart at blankets + formation), `src/engine/index.ts`
- Test: `tests/engine/thermal.test.ts`

**Interfaces:**
- Consumes: `trackTemp` (Task 3), `fitTyres` (Task 2), `TuningConstants.tyreTemp` (Task 1).
- Produces:
  - `initThermal(tuning: TuningConstants): ThermalState` (temp = blankets + formationWarm)
  - `outLapThermal(tuning: TuningConstants): ThermalState` (temp = blankets)
  - `thermalTarget(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): number`
  - `thermalWindow(config: RaceConfig, car: Pick<CarState, 'compound' | 'thermal'>, weather: WeatherState): { deficit: number; excess: number; applies: boolean }`
  - `thermalPace(config: RaceConfig, car: CarState, weather: WeatherState): number` (seconds this sector; 0 without `car.thermal`)
  - `thermalAfterSector(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): ThermalState`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/thermal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  initThermal, outLapThermal, thermalTarget, thermalWindow, thermalPace, thermalAfterSector,
} from '@engine/thermal'
import { initRace, stepSector } from '@engine/race'
import { executeStop } from '@engine/pitStop'
import { applyRedFlagRestart } from '@engine/redFlag'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, Compound, RaceConfig } from '@engine/types'

const ON = { tyreTemp: { enabled: true } }
function cfg(circuitId = 'bengaluru', over = {}): RaceConfig {
  const c = makeConfig({}, 11, circuitId)
  // allDry: thermal pace only applies to slicks on a dry track (ruling H3).
  return { ...c, allDry: true, tuning: makeDeterministicTuning({ ...ON, ...over }) }
}
const car0 = (config: RaceConfig, patch: Partial<CarState> = {}): CarState =>
  ({ ...initRace(config).cars[0]!, ...patch })

/** Seconds of thermal pace over one lap from `temp`, letting the temperature evolve. */
function lapCost(config: RaceConfig, compound: Compound, temp: number): number {
  let car = car0(config, { compound, thermal: { temp, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
  let sum = 0
  for (let s = 0; s < 3; s++) {
    sum += thermalPace(config, car, 'DRY')
    car = { ...car, thermal: thermalAfterSector(config, car, 'DRY', false) }
  }
  return sum
}

describe('tyre temperature (spec §5.2)', () => {
  it('start and stop temperatures', () => {
    const t = cfg().tuning
    expect(initThermal(t).temp).toBe(85)
    expect(outLapThermal(t)).toEqual({ temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 })
  })

  it('the heat target adds track, running heat, pace mode, dirty air and yellow', () => {
    const config = cfg('sol_desert')
    const base = car0(config, { paceMode: 'neutral', lapsInDirtyAir: 0 })
    expect(thermalTarget(config, base, 'DRY', false)).toBe(44 + 62)
    expect(thermalTarget(config, { ...base, paceMode: 'push' }, 'DRY', false)).toBe(44 + 62 + 8)
    expect(thermalTarget(config, { ...base, lapsInDirtyAir: 2 }, 'DRY', false)).toBe(44 + 62 + 3)
    expect(thermalTarget(config, base, 'DRY', true)).toBe(44 + 62 - 25)
    expect(thermalTarget(config, base, 'WET', false)).toBe(44 - 35 + 62)
  })

  it('window distances, and no thermal pace on the wrong tyre family (ruling H3)', () => {
    const config = cfg()
    const hot = car0(config, { compound: 'S', thermal: { temp: 110, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
    expect(thermalWindow(config, hot, 'DRY')).toEqual({ deficit: 0, excess: 10, applies: true })
    expect(thermalPace(config, hot, 'DRY')).toBeCloseTo(0.20 / 3, 12)
    expect(thermalWindow(config, hot, 'DAMP').applies).toBe(false)
    expect(thermalPace(config, hot, 'DAMP')).toBe(0)
  })

  it('a cold out-lap costs hards far more than softs (ruling H2)', () => {
    const config = cfg()                         // bengaluru 38 °C
    const h = lapCost(config, 'H', 70), m = lapCost(config, 'M', 70), s = lapCost(config, 'S', 70)
    expect(h).toBeGreaterThan(0.35)
    expect(m).toBeGreaterThan(s)
    expect(h).toBeGreaterThan(m)
    expect(s).toBeLessThan(0.05)
  })

  it('the temperature converges to the target at responsePerSector', () => {
    const config = cfg()
    const c = car0(config, { compound: 'M', thermal: { temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
    const target = thermalTarget(config, c, 'DRY', false)
    expect(thermalAfterSector(config, c, 'DRY', false).temp).toBeCloseTo(70 + 0.35 * (target - 70), 12)
  })

  it('initRace, every stop and a red-flag restart set the temperature', () => {
    const config = cfg()
    const s = initRace(config)
    expect(s.cars.every(c => c.thermal?.temp === 85)).toBe(true)
    const out = executeStop(config, { safetyCar: null, lap: 4, sector: 2 }, { ...s.cars[0]!, thermal: { temp: 101, coldLaps: 1, grainLaps: 2, heatWear: 0.4 } }, 'H', createRng(1))
    expect(out.car.thermal).toEqual({ temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 })
    const restarted = applyRedFlagRestart(config, s.cars, 'DRY', 20)
    expect(restarted.every(c => c.thermal?.temp === 85)).toBe(true)
  })

  it('OUT-LAP COST IS IN THE STOP PATH THE PROJECTION USES: a fresh hard is slower than a fresh soft by the cold margin', () => {
    const config = cfg()
    const tOn = (comp: Compound) => {
      const st = initRace(config)
      const stopped = executeStop(config, { safetyCar: null, lap: 0, sector: 0 }, st.cars[0]!, comp, createRng(3), { allowSlow: false }).car
      const next = stepSector(config, { ...st, cars: [stopped, ...st.cars.slice(1)] }, createRng(4))
      return next.sectorResults.find(r => r.driverId === stopped.driverId)!.sectorTime - next.sectorResults.find(r => r.driverId === stopped.driverId)!.tyreContribution
    }
    expect(tOn('H') - tOn('S')).toBeGreaterThan(0.15)
  })

  it('switched off, nothing exists and nothing changes', () => {
    const config = { ...cfg(), tuning: makeDeterministicTuning() }
    const s = initRace(config)
    expect(s.cars.some(c => 'thermal' in c)).toBe(false)
    expect(thermalPace(config, s.cars[0]!, 'DRY')).toBe(0)
  })
})
```

(The last-but-one test subtracts `tyreContribution` so the compounds' own offsets cancel; what remains is the thermal term plus identical noise for the same rng seed.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engine/thermal.test.ts`
Expected: FAIL — `@engine/thermal` not found.

- [ ] **Step 3: `thermal.ts`**

```ts
import type { CarState, RaceConfig, ThermalState, TuningConstants, WeatherState } from './types'
import { trackTemp } from './track'

/**
 * Tyre temperature (spec 2026-10-24 §5). One scalar per car (ruling H1). Pace
 * comes only from distance outside the compound's window; the out-lap cost is
 * simply the cold side after fitTyres resets to blanket temperature (H2).
 */
export function initThermal(t: TuningConstants): ThermalState {
  return { temp: t.tyreTemp.blankets + t.tyreTemp.formationWarm, coldLaps: 0, grainLaps: 0, heatWear: 0 }
}

export function outLapThermal(t: TuningConstants): ThermalState {
  return { temp: t.tyreTemp.blankets, coldLaps: 0, grainLaps: 0, heatWear: 0 }
}

export function thermalTarget(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): number {
  const tt = config.tuning.tyreTemp
  const fuelHeat = car.fuel ? tt.fuelHeat[car.fuel.forced ? 'save' : car.fuel.mode] : 0
  return trackTemp(config.circuit, weather, config.tuning) + tt.runningHeat + tt.paceHeat[car.paceMode]
    + fuelHeat + (car.lapsInDirtyAir > 0 ? tt.dirtyAirHeat : 0) + (neutralised ? tt.neutralisedHeat : 0)
}

export function thermalWindow(
  config: RaceConfig, car: Pick<CarState, 'compound' | 'thermal'>, weather: WeatherState,
): { deficit: number; excess: number; applies: boolean } {
  const th = car.thermal
  const spec = config.compounds[car.compound]
  if (!th || !spec) return { deficit: 0, excess: 0, applies: false }
  const [lo, hi] = config.tuning.tyreTemp.windows[car.compound]
  // Ruling H3: the crossover model owns a tyre on the wrong family's weather.
  const applies = (spec.type === 'dry') === (weather === 'DRY')
  return { deficit: Math.max(0, lo - th.temp), excess: Math.max(0, th.temp - hi), applies }
}

/** Seconds this sector, at the temperature the sector starts with. */
export function thermalPace(config: RaceConfig, car: CarState, weather: WeatherState): number {
  if (!car.thermal) return 0
  const { deficit: d, excess: e, applies } = thermalWindow(config, car, weather)
  if (!applies) return 0
  const tt = config.tuning.tyreTemp
  const grain = car.thermal.grainLaps > 0 ? tt.grainPenalty : 0
  return (tt.coldCoeff * (d / 10) ** 2 + tt.overheatCoeff * (e / 10) ** 2 + grain) / 3
}

/** The state after one sector: temperature toward the target (overheat wear: Task 6). */
export function thermalAfterSector(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean): ThermalState {
  const th = car.thermal!
  const target = thermalTarget(config, car, weather, neutralised)
  return { ...th, temp: th.temp + config.tuning.tyreTemp.responsePerSector * (target - th.temp) }
}
```

- [ ] **Step 4: Wire it**

`src/engine/lapModel.ts` — replace the `raw` line:

```ts
  const raw0 = base + carDelta + driverDelta + tyreSectorDelta + cpPenalty + fuelDelta + trackDelta + modeDelta + wingDelta + noiseSample + spinLoss
  // 2.0 terms (spec §0.6): summed separately and added only when non-zero, so
  // with every feature off `raw` is the 1.6 expression exactly.
  let v2Delta = 0
  if (car.thermal) v2Delta += thermalPace(config, car, weatherState)
  const raw = v2Delta === 0 ? raw0 : raw0 + v2Delta
```

`src/engine/race.ts` — in `initRace`'s car literal, after `retiredCause: null,` add `...(config.tuning.tyreTemp.enabled ? { thermal: initThermal(config.tuning) } : {}),`. In the step-1 map, directly after `let updated = { ...car, raceTime: car.raceTime + result.sectorTime }`:

```ts
    if (updated.thermal) {
      updated = { ...updated, thermal: thermalAfterSector(config, car, state.weatherState, state.safetyCar !== null) }
    }
```

`src/engine/pitStop.ts` `fitTyres` — append after `compoundsUsed`:

```ts
    ...(car.thermal ? { thermal: outLapThermal(config.tuning) } : {}),
```

`src/engine/redFlag.ts` `applyRedFlagRestart` — in the returned object append `...(car.thermal ? { thermal: initThermal(config.tuning) } : {}),` (ruling I1: blankets plus a formation-style warm-up). Export the thermal functions from `src/engine/index.ts`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/thermal.test.ts tests/engine/byteIdentity.test.ts tests/engine/executeStop.test.ts tests/engine/redFlag.test.ts tests/engine/lapModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/thermal.ts src/engine/lapModel.ts src/engine/race.ts src/engine/pitStop.ts src/engine/redFlag.ts src/engine/index.ts tests/engine/thermal.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): tyre temperature -- heat target, dynamics, window pace, cold out-lap

Spec 2026-10-24 §5.2, rulings H1-H3. One temperature per car moves toward a
target built from track temperature, running heat, pace mode, dirty air and
neutralisations; pace is lost outside the compound window. fitTyres resets to
blanket temperature, so the out-lap cost (hards >> softs) and the projection's
price of it come from the same path. Shipped off; golden unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tyre temperature, part 2 — overheating wear, graining, the AI's thermal pace (spec §5.2, §5.3, ruling H4)

**Files:**
- Modify: `src/engine/thermal.ts` (`heatWear` accumulation, `thermalAtLapEnd`, `thermalStatus`, `aiThermalPaceMode`), `src/engine/tyres.ts` (`effectiveTyreAge` adds `heatWear`), `src/engine/race.ts` (lap-end graining, AI pace override)
- Test: `tests/engine/thermal.test.ts` (extend)

**Interfaces:**
- Consumes: Task 5; `trackGrip` (Task 3).
- Produces:
  - `thermalAtLapEnd(config: RaceConfig, car: CarState, weather: WeatherState, grip: number): { thermal: ThermalState; grained: boolean }`
  - `thermalStatus(config: RaceConfig, car: CarState, weather: WeatherState): { zone: 'cold' | 'window' | 'hot'; lo: number; hi: number; temp: number; grainLaps: number } | null`
  - `aiThermalPaceMode(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean, proposed: PaceMode): PaceMode`
  - `effectiveTyreAge(car: Pick<CarState, 'tyreAge' | 'paceMode' | 'compound' | 'lapsInDirtyAir' | 'thermal' | 'fuel'>, ...)` — adds `thermal.heatWear` when non-zero.

- [ ] **Step 1: Extend the test**

Append to `tests/engine/thermal.test.ts`:

```ts
import { thermalAtLapEnd, thermalStatus, aiThermalPaceMode } from '@engine/thermal'
import { effectiveTyreAge } from '@engine/tyres'

describe('overheating wear, graining, AI (spec §5.2–§5.3)', () => {
  const th = (temp: number, extra: Partial<{ coldLaps: number; grainLaps: number; heatWear: number }> = {}) =>
    ({ temp, coldLaps: 0, grainLaps: 0, heatWear: 0, ...extra })

  it('a sector 10 °C over the window adds overheatWearPerLap/3 laps of age', () => {
    const config = cfg('sol_desert')
    const c = car0(config, { compound: 'S', thermal: th(110) })
    expect(thermalAfterSector(config, c, 'DRY', false).heatWear).toBeCloseTo(0.08 / 3, 12)
  })

  it('effectiveTyreAge adds heatWear, and is untouched without it', () => {
    const config = cfg()
    const driver = config.drivers[0]!
    const c = car0(config, { tyreAge: 10, thermal: th(90, { heatWear: 1.5 }) })
    const plain = effectiveTyreAge({ ...c, thermal: undefined }, driver, 'DRY', config.tuning)
    expect(effectiveTyreAge(c, driver, 'DRY', config.tuning)).toBeCloseTo(plain + 1.5, 12)
  })

  it('two cold lap ends on a green dry track start graining; it then counts down', () => {
    const config = cfg('aurora')                    // window M [85, 108]; grain below 77
    let c = car0(config, { compound: 'M', thermal: th(70) })
    const a = thermalAtLapEnd(config, c, 'DRY', 0.3)
    expect(a.grained).toBe(false)
    c = { ...c, thermal: a.thermal }
    const b = thermalAtLapEnd(config, c, 'DRY', 0.3)
    expect(b.grained).toBe(true)
    expect(b.thermal.grainLaps).toBe(4)
    expect(thermalAtLapEnd(config, { ...c, thermal: b.thermal }, 'DRY', 0.3).thermal.grainLaps).toBe(3)
  })

  it('no graining on a rubbered track (H4), on hards, or in the wet', () => {
    const config = cfg('aurora')
    const cold = { thermal: th(70, { coldLaps: 1 }) }
    expect(thermalAtLapEnd(config, car0(config, { compound: 'M', ...cold }), 'DRY', 0.9).grained).toBe(false)
    expect(thermalAtLapEnd(config, car0(config, { compound: 'H', ...cold }), 'DRY', 0.3).grained).toBe(false)
    expect(thermalAtLapEnd(config, car0(config, { compound: 'M', ...cold }), 'DAMP', 0.3).grained).toBe(false)
  })

  it('graining costs grainPenalty per lap while it lasts', () => {
    const config = cfg()
    const c = car0(config, { compound: 'M', thermal: th(95, { grainLaps: 2 }) })
    expect(thermalPace(config, c, 'DRY')).toBeCloseTo(0.35 / 3, 12)
  })

  it('status zones', () => {
    const config = cfg()
    expect(thermalStatus(config, car0(config, { compound: 'H', thermal: th(80) }), 'DRY')!.zone).toBe('cold')
    expect(thermalStatus(config, car0(config, { compound: 'H', thermal: th(100) }), 'DRY')!.zone).toBe('window')
    expect(thermalStatus(config, car0(config, { compound: 'S', thermal: th(105) }), 'DRY')!.zone).toBe('hot')
  })

  it('AI: a hot pusher backs off, a cold car pushes, a neutralisation changes nothing', () => {
    const config = cfg()
    const hot = car0(config, { compound: 'S', paceMode: 'push', thermal: th(106) })
    expect(aiThermalPaceMode(config, hot, 'DRY', false, 'push')).toBe('neutral')
    const cold = car0(config, { compound: 'H', thermal: th(80) })
    expect(aiThermalPaceMode(config, cold, 'DRY', false, 'neutral')).toBe('push')
    expect(aiThermalPaceMode(config, cold, 'DRY', true, 'neutral')).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/thermal.test.ts`
Expected: FAIL — the new exports are missing; `heatWear` stays 0.

- [ ] **Step 3: Implement**

In `thermal.ts`, replace `thermalAfterSector`'s return with:

```ts
  const { excess, applies } = thermalWindow(config, car, weather)
  const wear = applies && excess > 0 ? config.tuning.tyreTemp.overheatWearPerLap * (excess / 10) / 3 : 0
  return {
    ...th,
    temp: th.temp + config.tuning.tyreTemp.responsePerSector * (target - th.temp),
    heatWear: wear === 0 ? th.heatWear : th.heatWear + wear,
  }
```

and add:

```ts
/** Lap-boundary bookkeeping: graining onset and countdown (spec §5.2, ruling H4). */
export function thermalAtLapEnd(config: RaceConfig, car: CarState, weather: WeatherState, grip: number): { thermal: ThermalState; grained: boolean } {
  const th = car.thermal!
  const tt = config.tuning.tyreTemp
  if (th.grainLaps > 0) return { thermal: { ...th, grainLaps: th.grainLaps - 1 }, grained: false }
  if (weather !== 'DRY' || !tt.grainCompounds.includes(car.compound)) return { thermal: th.coldLaps === 0 ? th : { ...th, coldLaps: 0 }, grained: false }
  const [lo] = tt.windows[car.compound]
  const coldLaps = th.temp < lo - tt.grainMargin ? th.coldLaps + 1 : 0
  if (coldLaps >= tt.grainOnsetLaps && grip < tt.grainMaxGrip) {
    return { thermal: { ...th, coldLaps: 0, grainLaps: tt.grainDurationLaps }, grained: true }
  }
  return { thermal: { ...th, coldLaps }, grained: false }
}

export function thermalStatus(config: RaceConfig, car: CarState, weather: WeatherState) {
  if (!car.thermal) return null
  const [lo, hi] = config.tuning.tyreTemp.windows[car.compound]
  const { deficit, excess } = thermalWindow(config, car, weather)
  const zone: 'cold' | 'window' | 'hot' = deficit > 0 ? 'cold' : excess > 0 ? 'hot' : 'window'
  return { zone, lo, hi, temp: car.thermal.temp, grainLaps: car.thermal.grainLaps }
}

/** Smart/optimal only; the caller skips naive brains (spec §5.3). */
export function aiThermalPaceMode(config: RaceConfig, car: CarState, weather: WeatherState, neutralised: boolean, proposed: PaceMode): PaceMode {
  if (!car.thermal || neutralised) return proposed
  const { deficit, excess, applies } = thermalWindow(config, car, weather)
  if (!applies) return proposed
  const ai = config.tuning.tyreTemp.ai
  if (proposed === 'push' && excess > ai.hotExcess) return 'neutral'
  if (deficit > ai.coldDeficit) return 'push'
  return proposed
}
```

(Add `PaceMode` to the `./types` import for `aiThermalPaceMode`, and `Compound` for `outLapCost` in Task 7.)

`src/engine/tyres.ts` — widen the `Pick` to include `'thermal' | 'fuel'` (both optional) and replace the return:

```ts
  const base = car.tyreAge * tyreManagementFactor * paceDegMultiplier * wetDegMult * dirtyAirMult
  // 2.0 (spec §1.2, §5.2): fuel-mode wear and overheating wear. Both skipped when
  // absent, so the 1.6 expression is returned unchanged.
  const fuelMult = car.fuel ? tuning.fuelModel.degMultiplier[car.fuel.forced ? 'save' : car.fuel.mode] : 1
  const withFuel = fuelMult === 1 ? base : base * fuelMult
  const heat = car.thermal ? car.thermal.heatWear : 0
  return heat === 0 ? withFuel : withFuel + heat
```

`src/engine/race.ts` — compute `const gripNow = config.tuning.tyreTemp.enabled ? trackGrip(state, config.tuning) : 1` once per tick. In the `finalCars` map, inside `if (lapCompleted) {` after `updated.lapsInDirtyAir = ...`:

```ts
      if (updated.thermal) {
        const lapEnd = thermalAtLapEnd(config, updated, state.weatherState, gripNow)
        updated.thermal = lapEnd.thermal
        if (lapEnd.grained) newIncidents.push({ lap: state.lap, sector, kind: 'graining', driverId: car.driverId, timeLoss: null })
      }
```

and after `updated.paceMode = decision.paceMode` (AI branch):

```ts
        if (updated.thermal && (car.strategy.brain ?? 'naive') !== 'naive') {
          updated.paceMode = aiThermalPaceMode(config, updated, state.weatherState, safetyCar !== null, updated.paceMode)
        }
```

- [ ] **Step 4: Run**

Run: `npx vitest run tests/engine/thermal.test.ts tests/engine/tyres.test.ts tests/engine/byteIdentity.test.ts tests/engine/strategy.test.ts tests/engine/tyreFailure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/thermal.ts src/engine/tyres.ts src/engine/race.ts tests/engine/thermal.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): overheating wear, graining, and the AI's thermal pace calls

Spec 2026-10-24 §5.2-§5.3, ruling H4. Overheating accumulates heatWear, which
effectiveTyreAge adds (one wear source of truth for the gauge, AI and radio).
Softs/mediums held cold on a green dry track grain for 4 laps. Smart/optimal
brains back off a hot push and push to warm cold tyres. Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tyre temperature on screen — tyre meter band, COLD tags, out-lap price, radio, coach mark (spec §5.1, §5.4)

This task also adds the **shared 2.0 radio plumbing**: one table mapping the player's new incident kinds to `radio.json` triggers, so Tasks 13, 17, 18, 19 and 21 only add rows.

**Files:**
- Modify: `src/engine/thermal.ts` (`outLapCost`), `src/ui/kit/TyreMeter.tsx` (optional `thermal` prop), `src/ui/TelemetryZone.tsx`, `src/ui/TimingTower.tsx` (COLD tag), `src/ui/PitPanel.tsx` (out-lap line), `src/state/radioMapper.ts` (`V2_RADIO`, `prevPlayerIncidents`), `src/data/radio.json`, `src/state/coachMarks.ts` (`tyre_temp`), `src/ui/RaceHUD.tsx` (coach trigger)
- Test: `tests/ui/tyreTemp.test.tsx`, `tests/engine/thermal.test.ts` (one case)

**Interfaces:**
- Consumes: `thermalStatus`, `thermalTarget`, `thermalPace`, `thermalAfterSector` (Tasks 5–6).
- Produces:
  - `outLapCost(config: RaceConfig, car: CarState, compound: Compound, weather: WeatherState): number` — seconds the first lap on fresh `compound` costs from blanket temperature (0 when tyre temperature is off).
  - `TyreMeter` prop `thermal?: { zone: 'cold' | 'window' | 'hot'; pos: number; grainLaps: number }` (`pos` in [0, 1] across lo−20 … hi+20).
  - `V2_RADIO: Partial<Record<IncidentKind, string>>` and `RadioState.prevPlayerIncidents: number` in `radioMapper.ts`.
  - Coach mark id `'tyre_temp'` (appended to `NEW_COACH_MARKS`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/thermal.test.ts`:

```ts
import { outLapCost } from '@engine/thermal'

describe('outLapCost (spec §5.4)', () => {
  it('prices the first lap from blankets; 0 when the model is off', () => {
    const config = cfg()
    const c = car0(config)
    expect(outLapCost(config, c, 'H', 'DRY')).toBeGreaterThan(outLapCost(config, c, 'M', 'DRY'))
    expect(outLapCost(config, c, 'S', 'DRY')).toBeLessThan(0.05)
    const off = { ...config, tuning: makeDeterministicTuning() }
    expect(outLapCost(off, initRace(off).cars[0]!, 'H', 'DRY')).toBe(0)
  })
})
```

Create `tests/ui/tyreTemp.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TyreMeter } from '@ui/kit'
import { V2_RADIO, makeRadioState, processRadioTick } from '@state/radioMapper'
import { NEW_COACH_MARKS } from '@state/coachMarks'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'

describe('tyre temperature on screen (spec §5.4)', () => {
  it('the meter states the zone in words, not only colour', () => {
    render(<TyreMeter compound="H" wear={0.2} lapsOnTyre={1} cliffLaps={20} thermal={{ zone: 'cold', pos: 0.1, grainLaps: 0 }} />)
    expect(screen.getByText('COLD')).toBeTruthy()
    expect(screen.getByRole('meter', { name: /tyre temperature/i }).getAttribute('aria-valuetext')).toBe('Cold')
  })

  it('graining shows a countdown chip', () => {
    render(<TyreMeter compound="M" wear={0.3} lapsOnTyre={4} cliffLaps={9} thermal={{ zone: 'cold', pos: 0.05, grainLaps: 3 }} />)
    expect(screen.getByText('GRAINING 3L')).toBeTruthy()
  })

  it('without thermal the meter is unchanged (no temperature row)', () => {
    render(<TyreMeter compound="M" wear={0.3} lapsOnTyre={4} cliffLaps={9} />)
    expect(screen.queryByRole('meter', { name: /tyre temperature/i })).toBeNull()
  })

  it('the player graining is radioed once', () => {
    expect(V2_RADIO.graining).toBe('graining')
    const config = makeConfig({}, 2)
    const s0 = initRace({ ...config, playerDriverId: 'd_voss' })
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    // tryPush rate-limits on Date.now(); a minute between ticks keeps the cooldown out of the test.
    let t = 1e12
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (t += 60_000))
    let r = processRadioTick(s0, config, makeRadioState(), push)
    const s1 = { ...s0, incidents: [{ lap: 3, sector: 2 as const, kind: 'graining' as const, driverId: 'd_voss', timeLoss: null }] }
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    expect(lines.filter(l => /grain/i.test(l))).toHaveLength(1)
    now.mockRestore()
  })

  it('tyre_temp is a new coach mark', () => {
    expect(NEW_COACH_MARKS).toContain('tyre_temp')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/ui/tyreTemp.test.tsx tests/engine/thermal.test.ts`
Expected: FAIL — `outLapCost`, `V2_RADIO`, the `thermal` prop and `tyre_temp` do not exist.

- [ ] **Step 3: Engine helper**

In `thermal.ts`:

```ts
/** Seconds the first lap on fresh `compound` costs (spec §5.4): three sectors from blankets. */
export function outLapCost(config: RaceConfig, car: CarState, compound: Compound, weather: WeatherState): number {
  if (!config.tuning.tyreTemp.enabled) return 0
  let c: CarState = { ...car, compound, thermal: outLapThermal(config.tuning) }
  let sum = 0
  for (let s = 0; s < 3; s++) {
    sum += thermalPace(config, c, weather)
    c = { ...c, thermal: thermalAfterSector(config, c, weather, false) }
  }
  return sum
}
```

- [ ] **Step 4: TyreMeter**

In `src/ui/kit/TyreMeter.tsx` add the optional prop and, below the wear grid:

```tsx
      {thermal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div role="meter" aria-label="Tyre temperature" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(thermal.pos * 100)} aria-valuetext={ZONE_TEXT[thermal.zone]}
            style={{ position: 'relative', flex: 1, height: 8, display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 2 }}>
            <span className="slant-sm" style={{ background: 'var(--dusk)' }} />
            <span className="slant-sm" style={{ background: 'rgba(var(--gain-rgb), 0.55)' }} />
            <span className="slant-sm" style={{ background: 'rgba(var(--hot-rgb), 0.55)' }} />
            <motion.span initial={false} animate={{ left: `${thermal.pos * 100}%` }}
              transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
              style={{ position: 'absolute', top: -3, width: 3, height: 14, marginLeft: -1.5, background: 'var(--white)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, minWidth: 44,
            color: thermal.zone === 'hot' ? 'var(--hot)' : thermal.zone === 'cold' ? 'var(--lilac-dim)' : 'var(--gain)' }}>
            {ZONE_LABEL[thermal.zone]}
          </span>
          {thermal.grainLaps > 0 && (
            <span className="slant-sm" style={{ background: 'var(--caution)', color: 'var(--ink)', fontWeight: 800, fontSize: 11, padding: '2px 6px' }}>
              GRAINING {thermal.grainLaps}L
            </span>
          )}
        </div>
      )}
```

with `const ZONE_LABEL = { cold: 'COLD', window: 'IN WINDOW', hot: 'HOT' } as const`, `const ZONE_TEXT = { cold: 'Cold', window: 'In window', hot: 'Overheating' } as const`, and `EASE` imported from `./motion`. (The window segment is the middle half: `pos` maps lo−20…hi+20 onto the bar, so `pos ∈ [0.25, 0.75]` ≈ in window. Ruling H5: no °C on the HUD.)

In `TelemetryZone.tsx`, pass `thermal` from `thermalStatus(config, player, raceState.weatherState)`:

```ts
const st = thermalStatus(config, player, raceState.weatherState)
const thermal = st ? { zone: st.zone, pos: Math.min(1, Math.max(0, (st.temp - (st.lo - 20)) / (st.hi - st.lo + 40))), grainLaps: st.grainLaps } : undefined
```

- [ ] **Step 5: Tower tag, pit panel line**

`TimingTower.tsx` `TowerRow`: when `thermalStatus(...)?.zone === 'cold'` and `car.tyreAge === 0`, render a caution text tag `COLD` (11px Big Shoulders 700, `aria-hidden`; the row's `aria-label` gains ", cold tyres"). The tower's row data is derived once per `raceState` in the existing memo; compute the flag there, not per render.

`PitPanel.tsx`: under each compound chip, a lilac-dim line `OUT-LAP +0.42s` from `outLapCost(config, player, compound, raceState.weatherState)` when > 0.05 s; `aria-describedby` on the chip.

- [ ] **Step 6: Radio plumbing**

In `src/state/radioMapper.ts`:

```ts
/**
 * The player's 2.0 incidents and the radio trigger each one fires (spec
 * 2026-10-24). One row per kind; later tasks add rows. Lines live in radio.json.
 */
export const V2_RADIO: Partial<Record<IncidentKind, string>> = {
  graining: 'graining',
}
```

Add `prevPlayerIncidents: number` to `RadioState` (0 in `makeRadioState`). In `processRadioTick`, before the retirement block's early return path ends (right after `next.prevRetired = player.retired` and the retired return):

```ts
  const mine = state.incidents.filter(i => i.driverId === player.driverId)
  for (const ev of mine.slice(radio.prevPlayerIncidents)) {
    const trigger = V2_RADIO[ev.kind]
    if (trigger) tryPush(trigger, 1, { sec: ev.timeLoss?.toFixed(1) ?? '' }, pushAlert)
  }
  next.prevPlayerIncidents = mine.length
```

In `src/data/radio.json` add:

```json
  "graining": ["We're graining. It'll clean up in a few laps.", "Front-left is graining. Hold it, it clears."],
  "tyres_hot": ["Tyres are cooked. Manage them.", "Overheating the rears. Ease off."],
  "tyres_in": ["Tyres are in. Go."],
```

and a one-shot "tyres hot" check in `processRadioTick` (`hotWarned` flag in `RadioState`, reset at each stop): fire `tyres_hot` when `thermalStatus(...).zone === 'hot'` with excess > 6.

- [ ] **Step 7: Coach mark**

`src/state/coachMarks.ts`: `NEW_COACH_MARKS = ['safety_car', 'pit_window', 'radio_request', 'tyre_temp'] as const`. In `RaceHUD.tsx`, beside the `pit_window` trigger: `const tempOwed = useNewCoachMarkOwed('tyre_temp')` and `if (tempOwed && player?.thermal && player.tyreAge === 0 && player.pitsDone > 0) request('tyre_temp')`, with a `<CoachMark id="tyre_temp" … text="Fresh tyres start cold. Hards take most of a lap to switch on — watch the temperature band." />` anchored to the telemetry zone, following the `pit_window` mark's markup.

- [ ] **Step 8: Run**

Run: `npx vitest run tests/ui/tyreTemp.test.tsx tests/engine/thermal.test.ts tests/ui/newCoachMarks.test.tsx tests/state/coachStore.test.ts tests/state/settingsStore.test.ts tests/ui/raceHudBold.test.tsx tests/ui/timingTowerFlash.test.tsx tests/state/radioMapper.test.ts tests/ui/tokenContrast.test.ts tests/ui/legacyTokenBan.test.ts`
Expected: PASS. (If `newCoachMarks.test.tsx` enumerates the marks, extend its expected list with `tyre_temp` — that is the test's job, not a regression.)

- [ ] **Step 9: Commit**

```bash
git add src/engine/thermal.ts src/ui/kit/TyreMeter.tsx src/ui/TelemetryZone.tsx src/ui/TimingTower.tsx src/ui/PitPanel.tsx src/state/radioMapper.ts src/data/radio.json src/state/coachMarks.ts src/ui/RaceHUD.tsx tests/ui/tyreTemp.test.tsx tests/engine/thermal.test.ts tests/ui/newCoachMarks.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): tyre temperature band, COLD tags, out-lap price, radio, coach mark

Spec 2026-10-24 §5.4. The tyre meter gains a cold/window/hot band with a
marker and a GRAINING countdown (words, not only colour; no degrees, ruling
H5). The pit panel prices each compound's out-lap from the engine. Adds the
shared V2_RADIO table so later 2.0 incidents only add rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: DRS, train neutralisation, and the optimal brain's train escape (spec §3.2–§3.3, rulings D1–D3)

**Files:**
- Create: `src/engine/drs.ts`
- Modify: `src/engine/race.ts` (open set once per tick, per-car ctx, `resolveOvertakes` factor), `src/engine/lapModel.ts` (`−timeGain`), `src/engine/strategy.ts` (train escape), `src/engine/index.ts`
- Test: `tests/engine/drs.test.ts`

**Interfaces:**
- Consumes: `SectorContext` (Task 3), `circuit.drsSectors` (Task 1).
- Produces:
  - `greenSinceLap(state: Pick<RaceState, 'incidents'>): number`
  - `drsOpenSet(config: RaceConfig, state: RaceState, sector: SectorIndex): Set<string>`
  - `drsOvertakeFactor(config: RaceConfig, open: ReadonlySet<string>, behindId: string, aheadId: string): number`
  - `drsTrains(config: RaceConfig, state: Pick<RaceState, 'cars'>): { carIds: string[] }[]`
  - `inTrainBehindHead(config: RaceConfig, state: Pick<RaceState, 'cars'>, driverId: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/drs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { greenSinceLap, drsOpenSet, drsOvertakeFactor, drsTrains, inTrainBehindHead } from '@engine/drs'
import { computeSectorTime } from '@engine/lapModel'
import { aiDecision } from '@engine/strategy'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

function cfg(on = true): RaceConfig {
  const c = makeConfig({}, 5, 'veloce')            // drsSectors [0, 2]
  return { ...c, allDry: true, tuning: makeDeterministicTuning(on ? { drs: { enabled: true } } : {}) }
}
/** Leader at 0, then cars at the given gaps behind each other; the rest far back. */
function field(config: RaceConfig, gaps: number[], lap = 6): RaceState {
  const s = initRace(config)
  let t = 0
  const cars = s.cars.map((c, i) => {
    if (i === 0) return { ...c, raceTime: 0, lap }
    if (i <= gaps.length) { t += gaps[i - 1]!; return { ...c, raceTime: t, lap } }
    return { ...c, raceTime: 100 + i * 5, lap }
  })
  return { ...s, lap, cars, weatherState: 'DRY' }
}

describe('DRS (spec §3.2)', () => {
  it('green since: start, or one past the last SC end / red-flag restart; a VSC end does not reset it', () => {
    expect(greenSinceLap({ incidents: [] })).toBe(0)
    const ev = (lap: number, kind: 'safety_car_ended' | 'vsc_ended' | 'red_flag_restart') => ({ lap, sector: 2 as const, kind, driverId: null, timeLoss: null })
    expect(greenSinceLap({ incidents: [ev(9, 'safety_car_ended'), ev(14, 'vsc_ended')] })).toBe(10)
    expect(greenSinceLap({ incidents: [ev(9, 'safety_car_ended'), ev(20, 'red_flag_restart')] })).toBe(21)
  })

  it('open: within 1.0 s, in a DRS sector, green, dry, after 2 laps, never the leader', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.8, 1.4])
    const ids = s.cars.map(c => c.driverId)
    expect([...drsOpenSet(config, s, 0)].sort()).toEqual([ids[1], ids[2]].sort())
    expect(drsOpenSet(config, s, 1).size, 'S2 is not a DRS sector at veloce').toBe(0)
    expect(drsOpenSet(config, { ...s, lap: 1 }, 0).size, 'not before lap 2').toBe(0)
    expect(drsOpenSet(config, { ...s, weatherState: 'DAMP' }, 0).size, 'ruling D3').toBe(0)
    expect(drsOpenSet(config, { ...s, safetyCar: { deployedLap: 5, lapsRemaining: 2, cause: 'crash', kind: 'vsc' } }, 0).size).toBe(0)
    expect(drsOpenSet(cfg(false), s, 0).size).toBe(0)
  })

  it('the pass factor: +overtakeBonus, cancelled when the defender has DRS too', () => {
    const config = cfg()
    expect(drsOvertakeFactor(config, new Set(['b']), 'b', 'a')).toBeCloseTo(1.6, 12)
    expect(drsOvertakeFactor(config, new Set(['b', 'a']), 'b', 'a')).toBe(1)
    expect(drsOvertakeFactor(config, new Set(['a']), 'b', 'a')).toBe(1)
  })

  it('trains: maximal runs of ≥ 3 cars each within 1.0 s', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.8, 0.9, 1.4, 0.3])
    const ids = [...s.cars].sort((a, b) => a.raceTime - b.raceTime).map(c => c.driverId)
    expect(drsTrains(config, s)).toEqual([{ carIds: ids.slice(0, 4) }])
    expect(inTrainBehindHead(config, s, ids[2]!)).toBe(true)
    expect(inTrainBehindHead(config, s, ids[0]!), 'the head is not stuck').toBe(false)
  })

  it('lapModel: an open DRS is exactly −timeGain', () => {
    const config = cfg()
    const car = { ...initRace(config).cars[1]!, lap: 6 }
    const a = computeSectorTime(config, car, 0, createRng(2), 'DRY', null).sectorTime
    const b = computeSectorTime(config, car, 0, createRng(2), 'DRY', null, { drsOpen: true }).sectorTime
    expect(a - b).toBeCloseTo(0.20, 10)
  })

  it('AI: an optimal car stuck in a train with its stop near boxes into clear air', () => {
    const config = cfg()
    const s = field(config, [0.5, 0.6, 0.7])
    const sorted = [...s.cars].sort((a, b) => a.raceTime - b.raceTime)
    // tyreAge 10 keeps the cliff fraction (≈0.53) below the 0.60 undercut rule, so only the train rule can fire.
    const stuck = { ...sorted[2]!, tyreAge: 10, compound: 'M' as const, lapsInDirtyAir: 3, strategy: { ...sorted[2]!.strategy, brain: 'optimal' as const, plannedStops: [{ lap: 12, compound: 'H' as const }] } }
    const state = { ...s, cars: s.cars.map(c => c.driverId === stuck.driverId ? stuck : c) }
    expect(aiDecision(config, stuck, state, createRng(1))).toMatchObject({ pit: true, compound: 'H' })
    expect(aiDecision(cfg(false), stuck, state, createRng(1)).pit, 'DRS off: no escape rule').toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/drs.test.ts`
Expected: FAIL — `@engine/drs` not found.

- [ ] **Step 3: `drs.ts`**

```ts
import type { RaceConfig, RaceState, SectorIndex } from './types'

/** Lap from which DRS counts again: start, SC end or red-flag restart (spec §3.2). */
export function greenSinceLap(state: Pick<RaceState, 'incidents'>): number {
  let since = 0
  for (const ev of state.incidents) {
    if (ev.kind === 'safety_car_ended' || ev.kind === 'red_flag_restart') since = Math.max(since, ev.lap + 1)
  }
  return since
}

function runningSorted(state: Pick<RaceState, 'cars'>) {
  return state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
}

/** Who has DRS in `sector` this tick, from the PRE-tick order (ruling D1). */
export function drsOpenSet(config: RaceConfig, state: RaceState, sector: SectorIndex): Set<string> {
  const d = config.tuning.drs
  const open = new Set<string>()
  if (!d.enabled || state.safetyCar !== null || state.weatherState !== 'DRY') return open
  if (!(config.circuit.drsSectors ?? []).includes(sector)) return open
  if (state.lap - greenSinceLap(state) < d.enableAfterLaps) return open
  const sorted = runningSorted(state)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.raceTime - sorted[i - 1]!.raceTime <= d.detectionGap) open.add(sorted[i]!.driverId)
  }
  return open
}

/** Multiplier on the pass probability (ruling D2: the train cancels the bonus). */
export function drsOvertakeFactor(config: RaceConfig, open: ReadonlySet<string>, behindId: string, aheadId: string): number {
  if (!open.has(behindId)) return 1
  const d = config.tuning.drs
  return 1 + d.overtakeBonus * (1 - d.trainNeutralisation * (open.has(aheadId) ? 1 : 0))
}

export function drsTrains(config: RaceConfig, state: Pick<RaceState, 'cars'>): { carIds: string[] }[] {
  const d = config.tuning.drs
  const sorted = runningSorted(state)
  const out: { carIds: string[] }[] = []
  let run: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const linked = i > 0 && sorted[i]!.raceTime - sorted[i - 1]!.raceTime <= d.detectionGap
    if (linked) run.push(sorted[i]!.driverId)
    else { if (run.length >= d.trainMinCars) out.push({ carIds: run }); run = [sorted[i]!.driverId] }
  }
  if (run.length >= d.trainMinCars) out.push({ carIds: run })
  return out
}

export function inTrainBehindHead(config: RaceConfig, state: Pick<RaceState, 'cars'>, driverId: string): boolean {
  return drsTrains(config, state).some(t => t.carIds.indexOf(driverId) > 0)
}
```

- [ ] **Step 4: Wire the race**

`lapModel.ts`, in the `v2Delta` block: `if (ctx.drsOpen) v2Delta -= tuning.drs.timeGain`.

`race.ts` `stepSector`: after `ctxBase`, `const drsOpen = drsOpenSet(config, state, sector)` and in the per-car call pass `drsOpen.has(car.driverId) ? { ...ctxBase, drsOpen: true } : ctxBase`. Give `resolveOvertakes` a final parameter `drsOpen: ReadonlySet<string>` (pass it at the call site) and replace its `prob`:

```ts
    const raw = (config.tuning.overtaking.base * sectorEase +
        paceAdv * config.tuning.overtaking.paceMultiplier * sectorEase) *
        attackMult * defendMult * wingOvertakeFactor(config, behind.driverId, ahead.driverId, sector)
    const drsF = drsOvertakeFactor(config, drsOpen, behind.driverId, ahead.driverId)
    // Multiplied only when it does something, so the off path is the 1.6 expression.
    const prob = Math.min(0.85, drsF === 1 ? raw : raw * drsF)
```

`strategy.ts` `aiDecision`, after the OPTIMAL undercut-attempt block:

```ts
  // OPTIMAL: escape a DRS train into clear air (spec §3.3) -- the first step on
  // MODEL_SPEC §9.4's "price traffic". Pure threshold, no draw.
  const drs = config.tuning.drs
  if (brain === 'optimal' && drs.enabled && drs.aiTrainEscape && nextStop &&
      car.lapsInDirtyAir >= 3 && cliffFrac >= 0.50 && nextStop.lap - car.lap <= 8 && remainingLaps > 8 &&
      inTrainBehindHead(config, state, car.driverId)) {
    return pitWith(car, nextStop.compound, 'neutral')
  }
```

Export the `drs.ts` functions from `index.ts`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/drs.test.ts tests/engine/byteIdentity.test.ts tests/engine/overtakeRaceTime.test.ts tests/engine/trafficOvertaking.test.ts tests/engine/strategy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/drs.ts src/engine/race.ts src/engine/lapModel.ts src/engine/strategy.ts src/engine/index.ts tests/engine/drs.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): DRS per sector, train neutralisation, optimal train escape

Spec 2026-10-24 §3, rulings D1-D3. A car within 1.0 s at the start of a DRS
sector gains 0.2 s there and +60% pass chance, cancelled when the defender has
DRS too (a train). Off for 2 laps after the start / SC / restart, under any
neutralisation and on a non-dry track. drsTrains feeds the UI, the harness and
an optimal-brain rule that boxes out of a train. Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: DRS on screen — tower pill, train bracket, canvas link, pit panel note (spec §3.4)

**Files:**
- Create: `src/state/towerV2.ts` (pure per-tick derivation)
- Modify: `src/ui/TimingTower.tsx`, `src/canvas/TrackCanvas.tsx`, `src/ui/PitPanel.tsx`
- Test: `tests/ui/towerV2.test.tsx`

**Interfaces:**
- Consumes: `drsOpenSet`, `drsTrains` (Task 8).
- Produces: `towerV2(config: RaceConfig, state: RaceState): Map<string, TowerV2Row>` with `interface TowerV2Row { drs: 'open' | 'neutralised' | null; train: { index: number; size: number; first: boolean; last: boolean } | null; penaltySec: number; coldTyres: boolean }` (all four fields are computed here: `penaltySec` from `car.penalty` (0 until Task 18 creates penalties) and `coldTyres` from `thermalStatus`; Task 19 adds the "+5" chip that reads `penaltySec`). Memoised by the caller on the `raceState` reference.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/towerV2.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { towerV2 } from '@state/towerV2'
import { TimingTower } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

function setup() {
  const base = makeConfig({}, 5, 'veloce')
  const config = { ...base, allDry: true, playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ drs: { enabled: true } }) }
  const s = initRace(config)
  const order = s.cars.map(c => c.driverId)
  const gaps = [0, 0.5, 1.2, 1.6, 2.7]               // cars 0-3 a train (each within 1.0 s); car 4 is 1.1 s back
  const cars = s.cars.map((c, i) => ({ ...c, lap: 6, raceTime: i < gaps.length ? gaps[i]! : 50 + i }))
  const state = { ...s, lap: 6, sector: 0 as const, cars, weatherState: 'DRY' as const }
  return { config, state, order }
}

describe('DRS on the tower (spec §3.4)', () => {
  it('derives open / neutralised and train membership for the NEXT sector', () => {
    const { config, state, order } = setup()            // the next sector raced is S1 (index 0), a DRS sector
    const rows = towerV2(config, state)
    expect(rows.get(order[0]!)!.drs).toBeNull()
    expect(rows.get(order[1]!)!.drs).toBe('open')
    expect(rows.get(order[2]!)!.drs, 'the car ahead has DRS too').toBe('neutralised')
    expect(rows.get(order[1]!)!.train).toEqual({ index: 0, size: 4, first: false, last: false })
    expect(rows.get(order[0]!)!.train!.first).toBe(true)
    expect(rows.get(order[4]!)!.train).toBeNull()
  })

  it('renders a DRS pill and an accessible train label', () => {
    const { config, state } = setup()
    useRaceStore.setState({ config, raceState: { ...state, cars: state.cars.map((c, i) => ({ ...c, position: i + 1 })) }, phase: 'racing' })
    render(<TimingTower />)
    expect(screen.getAllByText('DRS').length).toBeGreaterThan(0)
    expect(screen.getByText('TRAIN ×4')).toBeTruthy()
    // The player leads, so the train's head row is inside the tower's window.
    expect(screen.getAllByLabelText(/in a DRS train of 4/i).length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/towerV2.test.tsx`
Expected: FAIL — `@state/towerV2` not found.

- [ ] **Step 3: Derivation**

`src/state/towerV2.ts`:

```ts
import { drsOpenSet, drsTrains, thermalStatus } from '@engine/index'
import type { RaceConfig, RaceState, SectorIndex } from '@engine/types'

export interface TowerV2Row {
  drs: 'open' | 'neutralised' | null
  train: { index: number; size: number; first: boolean; last: boolean } | null
  penaltySec: number
  coldTyres: boolean
}

/**
 * Per-row 2.0 facts for the tower, derived ONCE per raceState (spec §3.4).
 * DRS is shown for the sector about to be raced (state.sector), which is the
 * sector the engine will evaluate on the next step.
 */
export function towerV2(config: RaceConfig, state: RaceState): Map<string, TowerV2Row> {
  const open = drsOpenSet(config, state, state.sector as SectorIndex)
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const aheadOf = new Map(sorted.map((c, i) => [c.driverId, sorted[i - 1]?.driverId]))
  const trains = drsTrains(config, state)
  const out = new Map<string, TowerV2Row>()
  for (const car of state.cars) {
    const ahead = aheadOf.get(car.driverId)
    const drs = !open.has(car.driverId) ? null : ahead !== undefined && open.has(ahead) ? 'neutralised' : 'open'
    const ti = trains.findIndex(t => t.carIds.includes(car.driverId))
    const t = ti >= 0 ? trains[ti]! : null
    const pos = t ? t.carIds.indexOf(car.driverId) : -1
    out.set(car.driverId, {
      drs,
      train: t ? { index: ti, size: t.carIds.length, first: pos === 0, last: pos === t.carIds.length - 1 } : null,
      penaltySec: car.penalty?.pendingSec ?? 0,
      coldTyres: car.tyreAge === 0 && thermalStatus(config, car, state.weatherState)?.zone === 'cold',
    })
  }
  return out
}
```

(The `coldTyres` field replaces the inline COLD computation added to `TowerRow` in Task 7; move it here and read it from the map.)

- [ ] **Step 4: Tower and canvas**

In `TimingTower.tsx`: `const v2 = useMemo(() => (config && raceState ? towerV2(config, raceState) : null), [config, raceState])`; pass `v2Row` to each `TowerRow`. In the row:
- DRS pill after the gap: `open` → `<Pill tone="gain">DRS</Pill>`; `neutralised` → lilac-dim outline pill `DRS ✕` with `title="Neutralised — the car ahead has DRS too"`.
- Train bracket: a 3 px `--dusk` bar on the row's left edge (rounded ends only on `first`/`last`), and on the `first` row a lilac-dim label `TRAIN ×{size}` (Big Shoulders 700, 10 px).
- `aria-label` gains `, DRS open` / `, DRS neutralised` / `, in a DRS train of {size}`.
- Row motion stays the existing `layout` FLIP; the bracket inherits it. Reduced motion: no change needed (the tower already respects it).

Add `tone="gain"` to `Pill` if missing (`TONE.gain = { background: 'var(--gain)', color: 'var(--ink)' }`).

In `TrackCanvas.tsx`: on each `raceState` change compute `drsTrains` once and redraw a pooled `Graphics` (`trainLinks`) — a 2 px line at `rgba(var(--lilac-rgb), 0.35)` between consecutive train cars' interpolated positions, updated in the ticker by reusing the same `Graphics` (`clear()` then `moveTo/lineTo`), no new objects per frame.

In `PitPanel.tsx`: when the projection result's rejoin lands inside a train (run `drsTrains` on nothing new — use `projectionResult.driverAheadId` and the current gaps: if `rejoinGap ≤ detectionGap` and the car ahead is itself in a train) show `Rejoins in a DRS train (×N)` in caution under the rejoin line.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/ui/towerV2.test.tsx tests/ui/timingTowerFlash.test.tsx tests/ui/rivalIntelTower.test.tsx tests/ui/trackCanvasTeams.test.ts tests/ui/kit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/towerV2.ts src/ui/TimingTower.tsx src/ui/kit/Pill.tsx src/canvas/TrackCanvas.tsx src/ui/PitPanel.tsx tests/ui/towerV2.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): DRS pills, DRS-train brackets, canvas train links, rejoin-in-train note

Spec 2026-10-24 §3.4. towerV2 derives per-row 2.0 facts once per race state
(DRS open/neutralised for the next sector, train membership, pending penalty,
cold tyres) so the tower does not recompute per row or per frame.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Circuit risk and rain as real hazards; the neutralisation outlook; the optimal SC gamble (spec §9.2, rulings O1–O3)

**Files:**
- Create: `src/engine/outlook.ts`
- Modify: `src/engine/incidents.ts` (`incidentRiskFactor`, risk-aware `driverErrorChancePerSector` / `rollDriverError`), `src/engine/race.ts` (factor once per tick), `src/engine/strategy.ts` (gamble), `src/engine/index.ts`, `tests/engine/monteCarloHarness.ts` (export `buildHarnessConfig`), `vite.config.ts` (`SIMULATION_SUITES` += `tests/engine/v2Bands.test.ts`)
- Test: `tests/engine/outlook.test.ts`, `tests/engine/v2Bands.test.ts` (new; calibration gate)

**Interfaces:**
- Consumes: `effectiveTyreAge`, `tyreCliffFraction`, `neutralisationKind`.
- Produces:
  - `incidentRiskFactor(config: RaceConfig, weather: WeatherState): number` (exactly `1` when off)
  - `driverErrorChancePerSector(consistency: number, tuning: TuningConstants, riskFactor?: number): number`; `rollDriverError(consistency, tuning, rng, riskFactor?: number): boolean`
  - `type OutlookReason = 'street' | 'wet' | 'worn_tyres' | 'sc_used' | 'all_used'`
  - `type NeutralisationOutlook = { kind: 'out' } | { kind: 'clear'; chance: number; band: 'low' | 'medium' | 'high'; horizon: number; reasons: OutlookReason[] }`
  - `neutralisationOutlook(config: RaceConfig, state: Pick<RaceState, 'cars' | 'lap' | 'totalLaps' | 'safetyCar' | 'incidents' | 'weatherState'>, horizon?: number): NeutralisationOutlook`
  - `buildHarnessConfig(seed: number, circuitId: string, difficulty: 'rookie' | 'pro', forceDry: boolean, tuning?: TuningConstants): RaceConfig` (harness)

- [ ] **Step 1: Write the failing unit test**

Create `tests/engine/outlook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { neutralisationOutlook } from '@engine/outlook'
import { incidentRiskFactor, driverErrorChancePerSector } from '@engine/incidents'
import { aiDecision } from '@engine/strategy'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeTuning, makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig } from '@engine/types'

const LIVE = { incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1.4, WET: 1.8 }, circuitRiskWeight: 1 } }
// allDry so no weather stop pre-empts the AI cases; the wet case passes weatherState explicitly.
const cfg = (id: string, over = LIVE): RaceConfig => ({ ...makeConfig({}, 3, id), allDry: true, tuning: makeTuning(over) })

describe('risk inputs (spec §9.2, ruling O2)', () => {
  it('the factor is exactly 1 when off and multiplies the error chance when on', () => {
    const off = { ...makeConfig({}, 3, 'harbour_lights'), tuning: makeDeterministicTuning() }
    expect(incidentRiskFactor(off, 'WET')).toBe(1)
    const on = cfg('harbour_lights')
    expect(incidentRiskFactor(on, 'DRY')).toBeCloseTo(1.45, 12)
    expect(incidentRiskFactor(on, 'WET')).toBeCloseTo(1.45 * 1.8, 12)
    const t = on.tuning
    expect(driverErrorChancePerSector(80, t, 2)).toBeCloseTo(2 * driverErrorChancePerSector(80, t), 15)
    expect(driverErrorChancePerSector(80, t, 1)).toBe(driverErrorChancePerSector(80, t))
  })
})

describe('the outlook (spec §9.2)', () => {
  it('reads OUT under a neutralisation', () => {
    const c = cfg('veloce')
    const s = { ...initRace(c), safetyCar: { deployedLap: 3, lapsRemaining: 2, cause: 'crash' as const, kind: 'sc' as const } }
    expect(neutralisationOutlook(c, s)).toEqual({ kind: 'out' })
  })

  it('is higher at a street circuit than at a fast open one, and higher in the wet', () => {
    const street = cfg('harbour_lights'), open = cfg('sol_desert')
    const p = (c: RaceConfig, w: 'DRY' | 'WET' = 'DRY') => {
      const o = neutralisationOutlook(c, { ...initRace(c), lap: 10, weatherState: w })
      if (o.kind !== 'clear') throw new Error('expected clear')
      return o
    }
    expect(p(street).chance).toBeGreaterThan(p(open).chance)
    expect(p(street, 'WET').chance).toBeGreaterThan(p(street).chance)
    expect(p(street).reasons).toContain('street')
    expect(p(street, 'WET').reasons).toContain('wet')
  })

  it('worn tyres raise it; used caps lower it; it is 0 with every cap used', () => {
    const c = cfg('aurora')
    const s = { ...initRace(c), lap: 20 }
    const base = neutralisationOutlook(c, s)
    const worn = neutralisationOutlook(c, { ...s, cars: s.cars.map(x => ({ ...x, tyreAge: 40, compound: 'S' as const })) })
    if (base.kind !== 'clear' || worn.kind !== 'clear') throw new Error('expected clear')
    expect(worn.chance).toBeGreaterThan(base.chance)
    expect(worn.reasons).toContain('worn_tyres')
    const ev = (kind: 'safety_car_deployed' | 'vsc_deployed' | 'red_flag') => ({ lap: 1, sector: 0 as const, kind, driverId: null, timeLoss: null })
    const capped = neutralisationOutlook(c, { ...s, incidents: [ev('safety_car_deployed'), ev('safety_car_deployed'), ev('vsc_deployed'), ev('vsc_deployed'), ev('red_flag')] })
    expect(capped).toMatchObject({ kind: 'clear', chance: 0, reasons: ['all_used'] })
  })

  it('bands follow scOutlook.bands', () => {
    const c = cfg('harbour_lights')
    const o = neutralisationOutlook(c, { ...initRace(c), lap: 10 })
    if (o.kind !== 'clear') throw new Error('expected clear')
    const [lo, hi] = c.tuning.scOutlook.bands
    expect(o.band).toBe(o.chance < lo ? 'low' : o.chance < hi ? 'medium' : 'high')
    expect(o.horizon).toBe(5)
  })
})

describe('the optimal SC gamble (spec §9.2)', () => {
  it('delays a due planned stop while the chance is high, at most scGambleMaxDelay laps', () => {
    const base = cfg('harbour_lights', { ...LIVE, ai: { scGambleMaxDelay: 3, scGambleChance: 0.01 } } as never)
    const s0 = initRace(base)
    const me = { ...s0.cars[4]!, lap: 20, tyreAge: 3, compound: 'H' as const, strategy: { ...s0.cars[4]!.strategy, brain: 'optimal' as const, plannedStops: [{ lap: 20, compound: 'M' as const }] } }
    const st = { ...s0, lap: 20, cars: s0.cars.map(c => c.driverId === me.driverId ? me : c) }
    expect(aiDecision(base, me, st, createRng(1)).pit, 'stays out on the gamble').toBe(false)
    const late = { ...me, lap: 23 }
    expect(aiDecision(base, late, { ...st, lap: 23, cars: st.cars.map(c => c.driverId === me.driverId ? late : c) }, createRng(1)).pit, 'never more than 3 laps late').toBe(true)
    const off = { ...base, tuning: makeTuning({ ...LIVE, ai: { scGambleMaxDelay: 0 } } as never) }
    expect(aiDecision(off, me, st, createRng(1)).pit).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/outlook.test.ts`
Expected: FAIL — `@engine/outlook` and `incidentRiskFactor` do not exist.

- [ ] **Step 3: Risk inputs**

In `src/engine/incidents.ts`:

```ts
/** Circuit and weather multiplier on driver error (spec §9.2, ruling O2). Exactly 1 when off. */
export function incidentRiskFactor(config: RaceConfig, weather: WeatherState): number {
  const inc = config.tuning.incidents
  const wet = inc.wetErrorMultiplier[weather]
  const w = inc.circuitRiskWeight
  const circuit = w === 0 ? 1 : 1 + w * ((config.circuit.incidentRisk ?? 1) - 1)
  return wet === 1 && circuit === 1 ? 1 : wet * circuit
}

export function driverErrorChancePerSector(consistency: number, tuning: TuningConstants, riskFactor = 1): number {
  const inc = tuning.incidents
  const relief = (consistency / 100) * inc.consistencyReliefMax
  const base = (inc.driverErrorPerLap / 3) * (1 - relief)
  return riskFactor === 1 ? base : base * riskFactor
}

export function rollDriverError(consistency: number, tuning: TuningConstants, rng: Rng, riskFactor = 1): boolean {
  const chance = driverErrorChancePerSector(consistency, tuning, riskFactor)
  return chance > 0 && rng() < chance
}
```

In `race.ts` `stepSector`: `const riskFactor = incidentRiskFactor(config, state.weatherState)` once per tick, passed as the 4th argument of `rollDriverError`. (Short-circuit unchanged: at `driverErrorPerLap 0` no draw.)

- [ ] **Step 4: `outlook.ts`**

```ts
import type { RaceConfig, RaceState, WeatherState } from './types'
import { driverErrorChancePerSector, incidentRiskFactor, neutralisationKind } from './incidents'
import { effectiveTyreAge, tyreCliffFraction } from './tyres'

export type OutlookReason = 'street' | 'wet' | 'worn_tyres' | 'sc_used' | 'all_used'
export type NeutralisationOutlook =
  | { kind: 'out' }
  | { kind: 'clear'; chance: number; band: 'low' | 'medium' | 'high'; horizon: number; reasons: OutlookReason[] }

type OutlookState = Pick<RaceState, 'cars' | 'lap' | 'totalLaps' | 'safetyCar' | 'incidents' | 'weatherState'>

/**
 * P(an SC, VSC or red flag within `horizon` laps), from the engine's own hazard
 * (spec 2026-10-24 §9.2, ruling O1): driver error × terminal × circuit/weather,
 * mechanical by reliability, tyre failure from each car's projected cliff
 * fraction, times the deployment chances still available under the caps.
 * Pure; no rng; no memory the model does not have.
 */
export function neutralisationOutlook(config: RaceConfig, state: OutlookState, horizon = config.tuning.scOutlook.horizonLaps): NeutralisationOutlook {
  if (neutralisationKind(state.safetyCar) !== null) return { kind: 'out' }
  const t = config.tuning
  const inc = t.incidents
  const H = Math.max(0, Math.min(horizon, state.totalLaps - state.lap))
  const count = (k: string) => state.incidents.filter(i => i.kind === k).length
  const scLeft = count('safety_car_deployed') < inc.safetyCar.maxPerRace
  const vscLeft = count('vsc_deployed') < inc.vsc.maxPerRace
  const rfLeft = count('red_flag') < inc.redFlag.maxPerRace && state.totalLaps - state.lap > inc.redFlag.minLapsLeft
  const rf = rfLeft ? inc.redFlag.crashChance : 0
  const sc = (c: number) => (scLeft ? c : 0)
  const vsc = (c: number) => (vscLeft ? c : 0)
  const pCrash = rf + (1 - rf) * (sc(inc.safetyCar.crashDeployChance) + (1 - sc(inc.safetyCar.crashDeployChance)) * vsc(inc.vsc.crashDeployChance))
  const pMech = sc(inc.safetyCar.mechanicalDeployChance) + (1 - sc(inc.safetyCar.mechanicalDeployChance)) * vsc(inc.vsc.mechanicalDeployChance)
  const reasons: OutlookReason[] = []
  if (pCrash === 0 && pMech === 0) return { kind: 'clear', chance: 0, band: 'low', horizon: H, reasons: ['all_used'] }

  const risk = incidentRiskFactor(config, state.weatherState)
  const tf = t.tyreFailure
  let lambda = 0
  let worn = 0
  for (const car of state.cars) {
    if (car.retired) continue
    const driver = config.drivers.find(d => d.id === car.driverId)!
    const team = config.teams.find(tm => tm.id === car.teamId)!
    const crash = driverErrorChancePerSector(driver.facets.consistency, t, risk) * 3 * inc.terminalFraction
    const mech = t.mechanicalFailure.baseChancePerLap * (1 - team.facets.reliability / 100)
    const spec = config.compounds[car.compound]
    const f = spec ? tyreCliffFraction(spec, effectiveTyreAge(car, driver, state.weatherState, t)) : 0
    const g = spec ? tyreCliffFraction(spec, effectiveTyreAge({ ...car, tyreAge: car.tyreAge + 1 }, driver, state.weatherState, t)) - f : 0
    let tyre = 0
    for (let k = 1; k <= H; k++) tyre += Math.min(tf.maxChancePerLap, tf.chancePerLapOverThreshold * Math.max(0, f + k * g - tf.cliffFractionThreshold))
    if (f + H * g > tf.cliffFractionThreshold) worn++
    lambda += H * (crash * pCrash + mech * pMech) + tyre * pMech
  }
  const chance = 1 - Math.exp(-lambda)
  const [lo, hi] = t.scOutlook.bands
  if ((config.circuit.incidentRisk ?? 1) >= 1.15 && inc.circuitRiskWeight > 0) reasons.push('street')
  if (state.weatherState !== 'DRY' && inc.wetErrorMultiplier[state.weatherState as WeatherState] > 1) reasons.push('wet')
  if (worn > 0) reasons.push('worn_tyres')
  if (!scLeft) reasons.push('sc_used')
  return { kind: 'clear', chance, band: chance < lo ? 'low' : chance < hi ? 'medium' : 'high', horizon: H, reasons }
}
```

- [ ] **Step 5: The gamble**

In `strategy.ts` `aiDecision`, immediately before `// Planned stop` (`if (nextStop && car.lap >= nextStop.lap)`):

```ts
  // OPTIMAL: hold a due stop a lap or three when a neutralisation is likely
  // (spec §9.2). Never past scGambleMaxDelay; never on badly worn tyres. Pure.
  if (brain === 'optimal' && ai.scGambleMaxDelay > 0 && nextStop && car.lap >= nextStop.lap &&
      car.lap - nextStop.lap < ai.scGambleMaxDelay && cliffFrac < ai.scGambleMaxCliffFrac) {
    const o = neutralisationOutlook(config, state)
    if (o.kind === 'clear' && o.chance >= ai.scGambleChance) {
      return { pit: false, compound: car.compound, paceMode: cliffFrac < 0.18 * aggression ? 'push' : 'neutral' }
    }
  }
```

(`ai` is already declared above in `aiDecision`; `aggression` is declared just above the planned-stop block — move the `aggression` declaration above this new block.)

Performance note for the implementer: `neutralisationOutlook` is O(cars × horizon); it runs only for optimal cars whose stop is due, a handful of calls per race. No cache needed.

- [ ] **Step 6: Calibration gate**

In `tests/engine/monteCarloHarness.ts` rename `buildConfig` to `export function buildHarnessConfig(seed, circuitId, difficulty, forceDry, tuning = loadGameData().tuning)` using `tuning` in the config, and update `runRaces` to call it. Add `'tests/engine/v2Bands.test.ts'` to `SIMULATION_SUITES` in `vite.config.ts`. Create `tests/engine/v2Bands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { neutralisationOutlook } from '@engine/outlook'
import { buildHarnessConfig } from './monteCarloHarness'
import { makeTuning } from '../fixtures/tuning'

export const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']
const DEPLOY = new Set(['safety_car_deployed', 'vsc_deployed', 'red_flag'])

describe('2.0 bands', () => {
  it('OUTLOOK IS CALIBRATED: in every well-populated bucket, observed is within 0.06 of predicted', () => {
    const tuning = makeTuning({ incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1.4, WET: 1.8 }, circuitRiskWeight: 1 } })
    const buckets = [[0, 0.15], [0.15, 0.30], [0.30, 1.01]] as const
    const acc = buckets.map(() => ({ n: 0, pred: 0, hit: 0 }))
    for (let r = 0; r < 240; r++) {
      const seed = 31000 + r * 7919
      const config = buildHarnessConfig(seed, SAMPLE[r % SAMPLE.length]!, 'pro', false, tuning)
      let s = initRace(config)
      const rng = createRng(seed)
      const preds: { lap: number; p: number }[] = []
      const MAX_STEPS = config.circuit.laps * 3
      for (let i = 0; i < MAX_STEPS; i++) {
        s = stepSector(config, s, rng)
        if (s.sector === 0 && s.totalLaps - s.lap >= 5) {
          const o = neutralisationOutlook(config, s, 5)
          if (o.kind === 'clear') preds.push({ lap: s.lap, p: o.chance })
        }
      }
      expect(s.lap).toBe(s.totalLaps)
      const deploys = s.incidents.filter(e => DEPLOY.has(e.kind)).map(e => e.lap)
      for (const { lap, p } of preds) {
        const b = buckets.findIndex(([lo, hi]) => p >= lo && p < hi)
        acc[b]!.n++; acc[b]!.pred += p
        if (deploys.some(d => d >= lap && d < lap + 5)) acc[b]!.hit++
      }
    }
    for (const [i, a] of acc.entries()) {
      // eslint-disable-next-line no-console
      console.log(`MEASURE outlook bucket ${i} n=${a.n} pred=${(a.pred / Math.max(1, a.n)).toFixed(3)} obs=${(a.hit / Math.max(1, a.n)).toFixed(3)}`)
      if (a.n < 200) continue
      expect(Math.abs(a.hit / a.n - a.pred / a.n), `bucket ${i}`).toBeLessThanOrEqual(0.06)
    }
  }, 300_000)
})
```

- [ ] **Step 7: Run**

Run: `npx vitest run tests/engine/outlook.test.ts tests/engine/incidents.test.ts tests/engine/driverError.test.ts tests/engine/byteIdentity.test.ts`
Expected: PASS.
Run: `npx vitest run tests/engine/v2Bands.test.ts --reporter=verbose`
Expected: PASS with three `MEASURE outlook` lines. If a populated bucket is off by more than 0.06, STOP and report the lines — the outlook formula and the engine disagree, which is a defect, not a tuning question.

- [ ] **Step 8: Commit**

```bash
git add src/engine/outlook.ts src/engine/incidents.ts src/engine/race.ts src/engine/strategy.ts src/engine/index.ts tests/engine/outlook.test.ts tests/engine/v2Bands.test.ts tests/engine/monteCarloHarness.ts vite.config.ts
git commit -m "$(cat <<'EOF'
feat(engine): circuit/weather incident risk, neutralisation outlook, SC gamble

Spec 2026-10-24 §9.2, rulings O1-O3. Driver error scales with circuit
incidentRisk (calendar mean 1.00) and rain; both ship off. The outlook is the
engine's own hazard over the next 5 laps under the remaining caps, with a
calibration gate (observed within 0.06 of predicted per bucket). Optimal brains
may hold a due stop up to 3 laps when a neutralisation is likely (off).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The SC meter — top bar, reasons card, pit panel and planner line (spec §9.1, §9.3)

**Files:**
- Create: `src/ui/ScOutlook.tsx`
- Modify: `src/ui/RaceHUD.tsx` (top bar), `src/ui/PitPanel.tsx` (one line)
- Test: `tests/ui/scOutlook.test.tsx`

**Interfaces:**
- Consumes: `neutralisationOutlook` (Task 10).
- Produces: `ScOutlook(): JSX.Element | null`; `outlookLabel(o: NeutralisationOutlook): string`; `REASON_TEXT: Record<OutlookReason, string>`; `useLapOutlook(): NeutralisationOutlook | null` (recomputed only when `raceState.lap` or `safetyCar` changes).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/scOutlook.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScOutlook, outlookLabel, REASON_TEXT } from '@ui/ScOutlook'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

describe('SC meter (spec §9.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('labels: OUT, and a rounded percentage with the band', () => {
    expect(outlookLabel({ kind: 'out' })).toBe('SC OUT')
    expect(outlookLabel({ kind: 'clear', chance: 0.236, band: 'medium', horizon: 5, reasons: [] })).toBe('SC 24% · MED')
  })

  it('renders a 44px button with a full spoken label, and the reasons card on tap', () => {
    const base = makeConfig({}, 3, 'harbour_lights')
    const config = { ...base, tuning: makeTuning({ incidents: { circuitRiskWeight: 1 } }) }
    useRaceStore.setState({ config, raceState: { ...initRace(config), lap: 10 }, phase: 'racing' })
    render(<ScOutlook />)
    const btn = screen.getByRole('button', { name: /safety car chance next 5 laps \d+ percent/i })
    expect(parseInt(getComputedStyle(btn).minHeight, 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(btn)
    expect(screen.getByText(REASON_TEXT.street)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/scOutlook.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { neutralisationOutlook, type NeutralisationOutlook, type OutlookReason } from '@engine/index'
import { useReducedMotion, snapIn, PRESS } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'

export const REASON_TEXT: Record<OutlookReason, string> = {
  street: 'Street circuit — walls punish mistakes',
  wet: 'Wet track — more mistakes',
  worn_tyres: 'Cars running past the cliff',
  sc_used: 'Safety cars used up — VSC or red only',
  all_used: 'Every neutralisation used',
}
const BAND = { low: 'LOW', medium: 'MED', high: 'HIGH' } as const

export function outlookLabel(o: NeutralisationOutlook): string {
  return o.kind === 'out' ? 'SC OUT' : `SC ${Math.round(o.chance * 100)}% · ${BAND[o.band]}`
}

/** Once per lap end, not per sector: the number must not flicker (spec §9.3). */
export function useLapOutlook(): NeutralisationOutlook | null {
  const lap = useRaceStore(s => s.raceState?.lap)
  const sc = useRaceStore(s => s.raceState?.safetyCar)
  const config = useRaceStore(s => s.config)
  return useMemo(() => {
    const st = useRaceStore.getState().raceState
    return config && st ? neutralisationOutlook(config, st) : null
  }, [config, lap, sc])
}

export function ScOutlook() {
  const o = useLapOutlook()
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  const uiTap = useUiTap()
  if (!o) return null
  const level = o.kind === 'out' ? 3 : o.band === 'high' ? 3 : o.band === 'medium' ? 2 : 1
  const spoken = o.kind === 'out'
    ? 'Safety car or VSC out now'
    : `Safety car chance next ${o.horizon} laps ${Math.round(o.chance * 100)} percent, ${o.band}`
  return (
    <div style={{ position: 'relative' }}>
      <motion.button type="button" aria-label={spoken} aria-expanded={open} className="slant-sm kit-focus"
        whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS}
        onClick={() => { uiTap(); setOpen(v => !v) }}
        style={{ minHeight: 44, minWidth: 44, padding: '0 10px', border: 'none', background: 'var(--grape)', color: 'var(--lilac)',
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {[1, 2, 3].map(i => (
          <motion.span key={i} className="slant-sm" aria-hidden
            animate={!reduced && o.kind === 'clear' && o.band === 'high' && i === 3 ? { opacity: [1, 0.5, 1] } : { opacity: i <= level ? 1 : 0.25 }}
            transition={!reduced && o.kind === 'clear' && o.band === 'high' ? { duration: 1.2, repeat: Infinity } : { duration: 0 }}
            style={{ width: 14, height: 8, background: 'var(--caution)', opacity: i <= level ? 1 : 0.25 }} />
        ))}
        <span>{outlookLabel(o)}</span>
      </motion.button>
      <AnimatePresence>
        {open && o.kind === 'clear' && (
          <motion.div {...snapIn(reduced)} role="dialog" aria-label="Safety car outlook" className="slant-md"
            style={{ position: 'absolute', top: 50, right: 0, zIndex: 20, width: 240, padding: 12, background: 'var(--night)', color: 'var(--lilac)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
            <div style={{ color: 'var(--white)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              SC or VSC in the next {o.horizon} laps: {Math.round(o.chance * 100)}%
            </div>
            {o.reasons.length === 0 ? <div>Nothing unusual.</div> : o.reasons.map(r => <div key={r}>· {REASON_TEXT[r]}</div>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

In `RaceHUD.tsx` render `<ScOutlook />` in the top bar right group, before `SpeedControl`. In `PitPanel.tsx`, under the projection, add `SC CHANCE NEXT 5 LAPS: 24%` (lilac-dim, tabular) from `useLapOutlook()`, hidden when `out`.

- [ ] **Step 4: Run**

Run: `npx vitest run tests/ui/scOutlook.test.tsx tests/ui/raceHudBold.test.tsx tests/ui/pitPanelDiscount.test.tsx tests/ui/legacyTokenBan.test.ts tests/ui/colorMixBan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ScOutlook.tsx src/ui/RaceHUD.tsx src/ui/PitPanel.tsx tests/ui/scOutlook.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): SC meter with reasons card; SC chance beside the pit projection

Spec 2026-10-24 §9.1/§9.3. Three caution segments and a percentage in the top
bar, recomputed once per lap; a tap explains why. HIGH pulses (static under
reduced motion). The pit panel shows the same number next to the projection.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 2.0a switched on — measure one feature at a time, bands, scenarios, MODEL_SPEC §17.1, phone pass

The commit that changes shipped races for 2.0a. Follow the **switch-on procedure** (Conventions): rubber wash → tyre temperature → DRS → outlook inputs (wet + circuit risk) → SC gamble, measuring after each.

**Files:**
- Modify: `src/data/tuning.json` (switches; two new bands), `src/data/validators.ts` (`_regressionBands` keys)
- Modify: `tests/engine/monteCarloHarness.ts` (metrics), `tests/engine/v2Bands.test.ts` (MEASURE + gates), `tests/engine/monteCarlo.test.ts` (well-formedness)
- Modify (only if Step 5 says so): tests that measure another mechanism through `makeTuning`/`makeConfig`
- Modify: `src/data/scenarios.json` (only if moved), `MODEL_SPEC.md` (§3 rows, §10 invariant 6, new §17 with §17.1), `docs/V2-CHECKLIST.md`

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: `Metrics.grainingPerRace`, `Metrics.drsTrainLapEndsPerRace`, diagnostics `Metrics.drsPassShare`, `Metrics.optimalGainShipped` (MEASURE only); `_regressionBands.grainingPerRace`, `_regressionBands.drsTrainLapEndsPerRace`.

- [ ] **Step 1: Harness metrics**

In `tests/engine/monteCarloHarness.ts` add to `Metrics`:

```ts
  // 2.0a (spec 2026-10-24 §12.2). graining: 'graining' incidents. drsTrainLapEnds:
  // lap ends (sector 0 after a step) with at least one DRS train. drsPassShare:
  // diagnostic only -- share of overtake events made on a sector where the
  // overtaker had DRS open.
  grainingPerRace: number
  drsTrainLapEndsPerRace: number
  drsPassShare: number
```

Counters: `let graining = 0, trainLapEnds = 0, drsPasses = 0`. In the step loop, before `stepSector`, `const open = drsOpenSet(config, state, state.sector)` when `config.tuning.drs.enabled`; after it, for each new overtake event in `next.overtakeEvents.slice(state.overtakeEvents.length)` count `open.has(ev.overtakerId)`; and `if (next.sector === 0 && drsTrains(config, next).length > 0) trainLapEnds++`. After the race `graining += state.incidents.filter(i => i.kind === 'graining').length`. Return `grainingPerRace: graining / races`, `drsTrainLapEndsPerRace: trainLapEnds / races`, `drsPassShare: overtakeTotal ? drsPasses / overtakeTotal : 0`. Add an optional `tuning?: TuningConstants` to `HarnessOptions`, threaded into `buildHarnessConfig`.

- [ ] **Step 2: The MEASURE cell and the failing gates**

Append inside `describe('2.0 bands', …)` in `tests/engine/v2Bands.test.ts`:

```ts
  // MEASURE=1 FEATURE=<label> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.0" --reporter=verbose
  it.runIf(process.env.MEASURE === '1')('MEASURE 2.0: four cells, n=240 each, SAMPLE', () => {
    const label = process.env.FEATURE ?? 'shipped'
    for (const difficulty of ['pro', 'rookie'] as const) {
      for (const seedBase of [1000, 7000]) {
        const m = runRaces({ races: 240, circuitIds: SAMPLE, difficulty, seedBase })
        // eslint-disable-next-line no-console
        console.log(`MEASURE ${label} ${difficulty} seedBase=${seedBase} n=240 ` +
          `top=${m.topTeamShare.toFixed(3)} winners=${m.distinctWinners} dpos=${m.meanAbsPosChange.toFixed(3)} ` +
          `rho=${m.gridFinishSpearman.toFixed(3)} paceRank=${m.paceRankCorrelation.toFixed(3)} ` +
          `mech=${m.mechanicalDnfPerCarRace.toFixed(4)} crash=${m.crashesPerCarRace.toFixed(4)} ` +
          `sc=${m.safetyCarsPerRace.toFixed(3)} vsc=${m.vscPerRace.toFixed(3)} aiNeut=${m.aiNeutralisationStopsPerRace.toFixed(3)} ` +
          `slow=${m.slowStopsPerRace.toFixed(3)} red=${m.redFlagPerRace.toFixed(3)} ` +
          `graining=${m.grainingPerRace.toFixed(3)} trains=${m.drsTrainLapEndsPerRace.toFixed(3)} drsPass=${m.drsPassShare.toFixed(3)} ` +
          `overtakes=${m.meanOvertakeEvents.toFixed(1)}`)
      }
    }
  }, 1_800_000)

  it('2.0a rates are inside their bands, and live', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    expect(m.grainingPerRace, 'graining must be live').toBeGreaterThan(0)
    expect(m.drsTrainLapEndsPerRace, 'trains must form').toBeGreaterThan(0)
    expect(m.grainingPerRace).toBeGreaterThanOrEqual(b.grainingPerRace[0])
    expect(m.grainingPerRace).toBeLessThanOrEqual(b.grainingPerRace[1])
    expect(m.drsTrainLapEndsPerRace).toBeGreaterThanOrEqual(b.drsTrainLapEndsPerRace[0])
    expect(m.drsTrainLapEndsPerRace).toBeLessThanOrEqual(b.drsTrainLapEndsPerRace[1])
  })
```

(Imports: `runRaces` from `./monteCarloHarness`, `loadGameData` from `@data/validators`.) The aiWeatherStops band is measured on the showery circuits, so also run `MEASURE=1 npx vitest run tests/engine/race16Bands.test.ts -t "MEASURE weather" --reporter=verbose` after the rubber and wet switches.

Run: `npx vitest run tests/engine/v2Bands.test.ts -t "2.0a rates"`
Expected: FAIL — graining is 0 and the band keys are undefined.

- [ ] **Step 3: Baseline, then one feature at a time**

Baseline: `MEASURE=1 FEATURE=baseline npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.0" --reporter=verbose 2>&1 | grep MEASURE` — record four lines.

Then, in order, set in `tuning.json` and run the same command with `FEATURE=<name>`, recording four lines each:
1. `rubber`: `trackEvolution.wash` → `{ "DAMP": 0.35, "WET": 0.80 }`.
2. `thermal`: `tyreTemp.enabled` → `true`.
3. `drs`: `drs.enabled` → `true`.
4. `risk`: `incidents.wetErrorMultiplier` → `{ "DRY": 1, "DAMP": 1.4, "WET": 1.8 }`, `incidents.circuitRiskWeight` → `1.0`.
5. `gamble`: `ai.scGambleMaxDelay` → `3`.

After each, compare every existing band (spec §12.1, `_regressionBands`) against the four lines. A band out: apply that feature's single fallback (spec §12.3; rubber and gamble have none — switch them back off), re-measure with `FEATURE=<name>-fallback`. Still out: set the feature back to its off value and note it for §17.1. Sanity limits that STOP the task instead: `crash` > 0.12, `dpos` > 4.5, `paceRank` < 0.85 (these indicate a defect, not a balance question).

- [ ] **Step 4: Write the two new bands**

From the final four lines, size `grainingPerRace` and `drsTrainLapEndsPerRace` by the band rule. Add both to `tuning.json._regressionBands` (after `redFlagPerRace`) and to `validators.ts` (`z.tuple([z.number(), z.number()])`); append to `_note`: ` 2.0a (2026-10-24 spec): grainingPerRace and drsTrainLapEndsPerRace added, 4-circuit sample, same rule; existing bands re-measured with rubber wash, tyre temperature, DRS, circuit/wet incident risk and the optimal SC gamble switched on one at a time (MODEL_SPEC §17.1).` In `monteCarlo.test.ts` well-formedness add `expect(b.grainingPerRace[0]).toBeLessThan(b.grainingPerRace[1])` and the same for `drsTrainLapEndsPerRace`.

Run: `npx vitest run tests/engine/v2Bands.test.ts tests/engine/monteCarlo.test.ts tests/engine/neutralisationBands.test.ts tests/engine/race16Bands.test.ts tests/engine/setupBalance.test.ts tests/engine/circuitDifferentiation.test.ts tests/engine/qualifyingBands.test.ts tests/engine/overtakeRaceTime.test.ts tests/engine/mechanicalFailure.test.ts`
Expected: PASS. A pre-existing band failing here after Step 3 passed means the gate's own sample disagrees with the MEASURE sample — STOP and report both numbers.

- [ ] **Step 5: Tests that measure something else**

Run: `npx vitest run`. First add to `tests/fixtures/tuning.ts`:

```ts
/** `overrides` with every 2.0 switch off underneath (spec A3), for tests whose subject is not 2.0. */
export function withV2Off(overrides: DeepPartial<TuningConstants> = {}): DeepPartial<TuningConstants> {
  return deepMerge(v2Off(), overrides) as DeepPartial<TuningConstants>
}
```

For each failure whose test builds its tuning with `makeTuning(o)` or `makeConfig(o, …)` (shipped values) and whose subject is not a 2.0 mechanic, change the argument to `withV2Off(o)` (a deep merge — a shallow `{ ...v2Off(), ...o }` would drop nested keys, the 2026-08 NaN defect). Re-run; it must pass with no assertion change. Any other failure: STOP and report.

- [ ] **Step 6: Scenarios**

Follow the scenario re-authoring procedure (Conventions). Every 2.0a switch can move a handover.

- [ ] **Step 7: Golden race and OPTIMAL diagnostic**

Run: `npx vitest run tests/engine/byteIdentity.test.ts tests/engine/v2Foundations.test.ts` — expected PASS, fixture untouched.

Diagnostic for Veet (not a gate): `MEASURE_OPTIMAL=1` — add to `tests/engine/strategy.test.ts` an `it.runIf(process.env.MEASURE_OPTIMAL === '1')` copy of the paired OPTIMAL-vs-NAIVE measurement that builds its tuning with `makeTuning()` (shipped 2.0a) instead of `makeDeterministicTuning()`, n=2000, printing `MEASURE optimalGain shipped=<gain> se=<se>`. Run it once and record the line.

- [ ] **Step 8: MODEL_SPEC**

In `MODEL_SPEC.md`:
- §3: add rows `| **Graining / race** | — (spec 2026-10-24 §5) | 4-circuit sample, n=240 per cell: pro …/…, rookie …/… | **LOW – HIGH** | **Yes** — same sizing rule |` and the same shape for `**Lap ends with a DRS train / race**`.
- §10: add invariant `6. **2.0 adds no rng draw to the race path.** Track limits read lapModel's noise2 lower tail, unsafe release pitStopTime's g2 lower tail, team-order compliance hash01. A new 2.0 mechanic that needs a draw must short-circuit with none at a zero rate.`
- New `## 17. 2.0: deeper race strategy (2026-10-24)` with `### 17.1 2.0a — track and tyres`: the spec link; the five switch-ons in order with their MEASURE lines verbatim (baseline + each feature, four lines each); any fallback taken or feature left off, with the band and value that forced it; the `MEASURE outlook` lines; the `optimalGain shipped` line with one sentence on what it means for MODEL_SPEC §9.4; the projection fix from Task 2 (two defects, one test).

- [ ] **Step 9: Phone feel-test (2.0a)**

Build a local release APK (`npm run build && npx cap sync android && (cd android && ./gradlew assembleRelease)`; install per `docs/DEVICE-CHECKLIST.md` §1) and append to `docs/V2-CHECKLIST.md`:

```markdown
### 2.0a: track & tyres (spec 2026-10-24, plan 2026-10-24-v2-deeper-race-strategy, Tasks 1–12)

Built as a local release APK; not published (spec ruling A6).

**Phone pass:** lap 1 is visibly slower and the TRACK GRIP bar fills; a shower drains it with one
GRIP RESET; the out-lap on hards reads COLD and costs ~half a second, softs barely; pushing softs
at Sol Desert turns the band HOT and the cliff gauge speeds up; a medium on a cold Aurora track
while conserving shows GRAINING and clears; DRS pills appear on the tower one sector ahead, a train
bracket "TRAIN ×N" forms behind a slow car, and the player's pill reads "DRS ✕" inside it; the SC
meter rises at Harbour Lights and in rain, reads OUT under a neutralisation, its reasons card opens;
60 fps holds with the train links drawn (check the frame meter in a 20-car train).

**Calls for Veet after the pass:** wash 0.35/0.80; the thermal window numbers and coefficients
(0.20/0.20) — does the undercut still feel worth it; DRS 0.2 s / +60%; SC meter bands 15/30%;
`optimalGain shipped` value.
```

- [ ] **Step 10: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts src/data/scenarios.json tests/engine/monteCarloHarness.ts tests/engine/v2Bands.test.ts tests/engine/monteCarlo.test.ts tests/engine/strategy.test.ts tests/fixtures/tuning.ts MODEL_SPEC.md docs/V2-CHECKLIST.md
git commit -m "$(cat <<'EOF'
feat(balance): 2.0a switched on -- rubber wash, tyre temperature, DRS, incident risk, SC gamble

Spec 2026-10-24 §12-§13. Each feature switched on alone and measured over four
n=240 cells; every existing band holds (MEASURE lines and any fallback in
MODEL_SPEC §17.1). New bands grainingPerRace and drsTrainLapEndsPerRace sized by
the 1.5 rule. Golden race unchanged. Scenarios re-authored where moved (listed
below). Files whose tests now pin v2Off: (listed below).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Replace the two "(listed below)" phrases with the actual lists before committing (old → new seed/lap/goal per scenario; one file path per line).

---

# Slice 2.0b — Power & pit lane

### Task 13: Fuel — load, burn, weight, modes, forced lift-and-coast, AI policy, the `fuel` call (spec §1.1–§1.2, §1.5, rulings F1–F3)

**Files:**
- Create: `src/engine/fuel.ts`
- Modify: `src/engine/race.ts` (init, per-sector burn, lap-end forced save, AI mode), `src/engine/lapModel.ts` (weight + mode pace), `src/engine/strategy.ts` (`aiResourceModes`), `src/engine/playerCalls.ts` (`fuel` call), `src/engine/index.ts`
- Test: `tests/engine/fuel.test.ts`

**Interfaces:**
- Consumes: `TuningConstants.fuelModel`, `RaceConfig.playerFuelLoad` (Task 1); `effectiveTyreAge` already multiplies `fuelModel.degMultiplier` (Task 6).
- Produces:
  - `raceLaps(config: RaceConfig): number` (= `lapsOverride ?? circuit.laps`)
  - `initFuel(config: RaceConfig, isPlayer: boolean): FuelState`
  - `effectiveFuelMode(f: FuelState): FuelMode`
  - `fuelPace(config: RaceConfig, car: CarState): number` (seconds this sector)
  - `fuelWeightDelta(config: RaceConfig, car: CarState): number` (seconds this sector; replaces the 1.6 term)
  - `burnSector(config: RaceConfig, car: CarState, neutralised: boolean): FuelState`
  - `fuelMarginLaps(car: Pick<CarState, 'fuel' | 'lap' | 'sector'>, totalLaps: number): number`
  - `fuelAtLapEnd(config: RaceConfig, car: CarState): { fuel: FuelState; critical: boolean }`
  - `aiResourceModes(config: RaceConfig, car: CarState, state: RaceState): { fuel?: FuelMode; ers?: ErsMode }` (ERS half in Task 14)
  - `PlayerCall` member `{ step: number; kind: 'fuel'; mode: FuelMode }`; `applyPlayerFuel(state: RaceState, mode: FuelMode): RaceState`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/fuel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  raceLaps, initFuel, burnSector, fuelMarginLaps, fuelAtLapEnd, fuelWeightDelta, fuelPace, effectiveFuelMode,
} from '@engine/fuel'
import { aiResourceModes } from '@engine/strategy'
import { applyCall } from '@engine/playerCalls'
import { initRace, stepSector } from '@engine/race'
import { effectiveTyreAge } from '@engine/tyres'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning, makeTuning, withV2Off } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, RaceConfig } from '@engine/types'

const ON = { fuelModel: { enabled: true } }
const cfg = (over: Partial<RaceConfig> = {}): RaceConfig =>
  ({ ...makeConfig({}, 8, 'bengaluru'), allDry: true, tuning: makeDeterministicTuning(ON), ...over })
const car = (config: RaceConfig, patch: Partial<CarState> = {}): CarState => ({ ...initRace(config).cars[3]!, ...patch })

describe('fuel (spec §1.2)', () => {
  it('loads by distance: AI on target, the player on their choice', () => {
    const c = cfg()
    expect(raceLaps(c)).toBe(56)
    expect(initFuel(c, false)).toEqual({ laps: 56 * (1 - 0.012), mode: 'standard', forced: false })
    expect(initFuel({ ...c, playerFuelLoad: 'light' }, true).laps).toBeCloseTo(56 * 0.975, 12)
    expect(initFuel({ ...c, playerFuelLoad: 'light' }, false).laps, 'AI ignores the player load').toBeCloseTo(56 * 0.988, 12)
  })

  it('burns per sector by mode, pace mode and neutralisation', () => {
    const c = cfg()
    const f = (mode: 'rich' | 'standard' | 'save', pace: 'push' | 'neutral' = 'neutral', neutral = false) =>
      50 - burnSector(c, car(c, { paceMode: pace, fuel: { laps: 50, mode, forced: false } }), neutral).laps
    expect(f('standard')).toBeCloseTo(1 / 3, 12)
    expect(f('rich', 'push')).toBeCloseTo(1.06 * 1.03 / 3, 12)
    expect(f('save')).toBeCloseTo(0.90 / 3, 12)
    expect(f('standard', 'neutral', true)).toBeCloseTo(0.45 / 3, 12)
  })

  it('margin counts the remaining distance including the partial lap', () => {
    expect(fuelMarginLaps({ fuel: { laps: 10.4, mode: 'standard', forced: false }, lap: 46, sector: 0 }, 56)).toBeCloseTo(0.4, 12)
    expect(fuelMarginLaps({ fuel: { laps: 10.4, mode: 'standard', forced: false }, lap: 46, sector: 1 }, 56)).toBeCloseTo(0.4 + 1 / 3, 12)
  })

  it('forced lift-and-coast below −0.3 laps, logged once, released at 0 (ruling F1)', () => {
    const c = cfg()
    const short = car(c, { lap: 40, sector: 0, fuel: { laps: 15.6, mode: 'rich', forced: false } })   // margin −0.4
    const a = fuelAtLapEnd(c, short)
    expect(a).toEqual({ fuel: { laps: 15.6, mode: 'rich', forced: true }, critical: true })
    expect(effectiveFuelMode(a.fuel)).toBe('save')
    expect(fuelAtLapEnd(c, { ...short, fuel: a.fuel }).critical, 'logged once').toBe(false)
    const back = { ...short, fuel: { laps: 16.0, mode: 'rich' as const, forced: true } }               // margin 0
    expect(fuelAtLapEnd(c, back).fuel.forced).toBe(false)
  })

  it('pace: mode delta plus the forced penalty', () => {
    const c = cfg()
    expect(fuelPace(c, car(c, { fuel: { laps: 30, mode: 'rich', forced: false } }))).toBeCloseTo(-0.12 / 3, 12)
    expect(fuelPace(c, car(c, { fuel: { laps: 30, mode: 'rich', forced: true } }))).toBeCloseTo((0.30 + 0.5) / 3, 12)
  })

  it('weight collapses to the 1.6 term plus a constant at standard burn', () => {
    const c = cfg()
    const L = 56, lap = 20
    const x = car(c, { lap, fuel: { laps: L * 0.988 - lap, mode: 'standard', forced: false } })
    const old = -(lap * c.tuning.fuel.effectPerLap) / 3
    expect(fuelWeightDelta(c, x) - old).toBeCloseTo((-0.012 * L) * c.tuning.fuel.effectPerLap / 3, 12)
  })

  it('save mode spares the tyre (degMultiplier 0.94)', () => {
    const c = cfg()
    const d = c.drivers.find(x => x.id === car(c).driverId)!
    const std = effectiveTyreAge(car(c, { tyreAge: 10, fuel: { laps: 30, mode: 'standard', forced: false } }), d, 'DRY', c.tuning)
    const sav = effectiveTyreAge(car(c, { tyreAge: 10, fuel: { laps: 30, mode: 'save', forced: false } }), d, 'DRY', c.tuning)
    expect(sav / std).toBeCloseTo(0.94, 12)
  })

  it('AI policy: short → save; battling with margin → rich; else standard; naive standard', () => {
    const c = cfg()
    const s = initRace(c)
    // The fastest car (Voss) 0.5 s behind the slowest (Kane): a genuine battle with pace in hand.
    const voss = s.cars.find(x => x.driverId === 'd_voss')!
    const kane = s.cars.find(x => x.driverId === 'd_kane')!
    const me = { ...voss, lap: 20, sector: 0 as const, raceTime: 100.5, strategy: { ...voss.strategy, brain: 'optimal' as const } }
    const ahead = { ...kane, raceTime: 100 }
    const rest = s.cars.filter(x => x !== voss && x !== kane).map((x, i) => ({ ...x, raceTime: 200 + i }))
    const st = { ...s, lap: 20, cars: [ahead, me, ...rest] }
    const withFuel = (laps: number) => ({ ...me, fuel: { laps, mode: 'standard' as const, forced: false } })
    expect(aiResourceModes(c, withFuel(35.6), st).fuel).toBe('save')      // margin −0.4
    expect(aiResourceModes(c, withFuel(36.6), st).fuel).toBe('rich')      // margin 0.6, battling
    expect(aiResourceModes(c, withFuel(36.2), st).fuel).toBe('standard')  // margin 0.2 < aiRichMinMargin
    const naive = { ...withFuel(35.6), strategy: { ...me.strategy, brain: 'naive' as const } }
    expect(aiResourceModes(c, naive, st).fuel).toBe('standard')
  })

  it('the fuel call sets the player mode and is a no-op without a fuel model', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    const s = initRace(c)
    const next = applyCall(c, s, { step: 0, kind: 'fuel', mode: 'save' }, createRng(1))
    expect(next.cars.find(x => x.isPlayer)!.fuel!.mode).toBe('save')
    const off = { ...c, tuning: makeDeterministicTuning() }
    const s0 = initRace(off)
    expect(applyCall(off, s0, { step: 0, kind: 'fuel', mode: 'save' }, createRng(1))).toBe(s0)
  })

  it('INVARIANT: over a full AI race no car finishes more than 0.4 laps short on average', () => {
    const c = { ...makeConfig(withV2Off(ON), 8, 'bengaluru'), tuning: makeTuning(withV2Off(ON)) }
    let s = initRace(c)
    const rng = createRng(8)
    for (let i = 0; i < 56 * 3; i++) s = stepSector(c, s, rng)
    const running = s.cars.filter(x => !x.retired)
    const mean = running.reduce((a, x) => a + fuelMarginLaps(x, 56), 0) / running.length
    expect(mean).toBeGreaterThanOrEqual(-0.4)
    expect(Math.min(...running.map(x => fuelMarginLaps(x, 56)))).toBeGreaterThan(-0.8)
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/fuel.test.ts`
Expected: FAIL — `@engine/fuel` not found.

- [ ] **Step 3: `fuel.ts`**

```ts
import type { CarState, FuelMode, FuelState, RaceConfig } from './types'

/** Fuel in laps of fuel at standard burn (spec 2026-10-24 §1.2, ruling F2). */
export function raceLaps(config: RaceConfig): number {
  return config.lapsOverride ?? config.circuit.laps
}

export function initFuel(config: RaceConfig, isPlayer: boolean): FuelState {
  const load = isPlayer ? config.playerFuelLoad ?? 'target' : 'target'
  return { laps: raceLaps(config) * (1 + config.tuning.fuelModel.loadMarginFrac[load]), mode: 'standard', forced: false }
}

export function effectiveFuelMode(f: FuelState): FuelMode {
  return f.forced ? 'save' : f.mode
}

export function fuelPace(config: RaceConfig, car: CarState): number {
  if (!car.fuel) return 0
  const fm = config.tuning.fuelModel
  return (fm.paceDelta[effectiveFuelMode(car.fuel)] + (car.fuel.forced ? fm.forcedSavePenalty : 0)) / 3
}

/** Replaces the 1.6 weight term when fuel is on: lighter = faster. */
export function fuelWeightDelta(config: RaceConfig, car: CarState): number {
  return -((raceLaps(config) - car.fuel!.laps) * config.tuning.fuel.effectPerLap) / 3
}

export function burnSector(config: RaceConfig, car: CarState, neutralised: boolean): FuelState {
  const fm = config.tuning.fuelModel
  const f = car.fuel!
  const b = fm.burn[effectiveFuelMode(f)] * fm.paceBurn[car.paceMode] * (neutralised ? fm.neutralisedBurn : 1) / 3
  return { ...f, laps: f.laps - b }
}

export function fuelMarginLaps(car: Pick<CarState, 'fuel' | 'lap' | 'sector'>, totalLaps: number): number {
  return car.fuel ? car.fuel.laps - (totalLaps - car.lap - car.sector / 3) : 0
}

/** Forced lift-and-coast on below forcedSaveMargin, off again at 0 (ruling F1: no fuel DNF). */
export function fuelAtLapEnd(config: RaceConfig, car: CarState): { fuel: FuelState; critical: boolean } {
  const f = car.fuel!
  const m = fuelMarginLaps(car, raceLaps(config))
  if (!f.forced && m < config.tuning.fuelModel.forcedSaveMargin) return { fuel: { ...f, forced: true }, critical: true }
  if (f.forced && m >= 0) return { fuel: { ...f, forced: false }, critical: false }
  return { fuel: f, critical: false }
}
```

Note: at a lap boundary `race.ts` calls this on the updated car whose `lap` was just incremented and `sector` is still the pre-tick `2` on the car object; pass `{ ...updated, sector: 0 }` so the margin counts whole laps left.

- [ ] **Step 4: Wire the race and the call**

`lapModel.ts`: `const fuelDelta = car.fuel ? fuelWeightDelta(config, car) : -(car.lap * tuning.fuel.effectPerLap) / 3`, and in the `v2Delta` block `if (car.fuel) v2Delta += fuelPace(config, car)`.

`race.ts` `initRace` car literal, before the thermal spread: `...(config.tuning.fuelModel.enabled ? { fuel: initFuel(config, isPlayer) } : {}),`. Per sector, after the thermal update: `if (updated.fuel) updated = { ...updated, fuel: burnSector(config, car, state.safetyCar !== null) }`. At the lap boundary, after the thermal lap-end block:

```ts
      if (updated.fuel) {
        const fe = fuelAtLapEnd(config, { ...updated, sector: 0 })
        updated.fuel = fe.fuel
        if (fe.critical) newIncidents.push({ lap: state.lap, sector, kind: 'fuel_critical', driverId: car.driverId, timeLoss: null })
      }
```

and in the AI branch after the thermal pace override:

```ts
        const res = aiResourceModes(config, updated, stateForAI)
        if (updated.fuel && res.fuel && res.fuel !== updated.fuel.mode) updated.fuel = { ...updated.fuel, mode: res.fuel }
```

`strategy.ts`:

```ts
/** AI fuel and ERS modes at a lap boundary (spec §1.5). Pure. ERS half: Task 14. */
export function aiResourceModes(config: RaceConfig, car: CarState, state: RaceState): { fuel?: FuelMode; ers?: ErsMode } {
  const brain = car.strategy.brain ?? 'naive'
  const out: { fuel?: FuelMode; ers?: ErsMode } = {}
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const i = sorted.findIndex(c => c.driverId === car.driverId)
  const ahead = i > 0 ? sorted[i - 1] : undefined
  const battling = !!ahead && car.raceTime - ahead.raceTime <= config.tuning.ers.aiAttackGap &&
    paceAdvantage(config, car, ahead) >= config.tuning.overtaking.paceGateMin
  if (car.fuel) {
    if (brain === 'naive') out.fuel = 'standard'
    else {
      const m = fuelMarginLaps({ ...car, sector: 0 }, raceLaps(config))
      out.fuel = m < 0 ? 'save' : battling && m >= config.tuning.fuelModel.aiRichMinMargin ? 'rich' : 'standard'
    }
  }
  return out
}
```

`paceAdvantage` is `race.ts`'s private `calculatePaceAdvantage` — move it to `src/engine/pace.ts` as `export function paceAdvantage(config, faster, slower): number` (unchanged body) and import it in both `race.ts` and `strategy.ts` (no behaviour change; `race.ts` keeps calling it).

`playerCalls.ts`: add `| { step: number; kind: 'fuel'; mode: FuelMode }` to `PlayerCall`, and

```ts
/** No fuel model, no change: returns the SAME state (spec §0.5). */
export function applyPlayerFuel(state: RaceState, mode: FuelMode): RaceState {
  const p = state.cars.find(c => c.isPlayer)
  if (!p?.fuel || p.fuel.mode === mode) return state
  return { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, fuel: { ...c.fuel!, mode } } : c) }
}
```

with `case 'fuel': return applyPlayerFuel(state, call.mode)` in `applyCall`. Export the new functions and types from `index.ts`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/fuel.test.ts tests/engine/byteIdentity.test.ts tests/engine/v2Foundations.test.ts tests/engine/lapModel.test.ts tests/engine/playerCalls.test.ts tests/engine/strategy.test.ts tests/engine/trafficOvertaking.test.ts`
Expected: PASS. (`trafficOvertaking` covers the `paceAdvantage` move.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/fuel.ts src/engine/pace.ts src/engine/race.ts src/engine/lapModel.ts src/engine/strategy.ts src/engine/playerCalls.ts src/engine/index.ts tests/engine/fuel.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): fuel -- load, burn, weight, modes, forced lift-and-coast, AI policy

Spec 2026-10-24 §1.2/§1.5, rulings F1-F3. Fuel in laps; burn by fuel mode,
pace mode and neutralisation; weight replaces the 1.6 term and collapses to it
at standard burn. Short by 0.3 laps forces lift-and-coast with a penalty until
the margin recovers (no fuel DNF). Player 'fuel' call; smart/optimal AI save
when short and run rich in a battle. paceAdvantage moved to pace.ts unchanged.
Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: ERS — charge, four modes, attack and defend in the overtake roll, AI policy, the `ers` call (spec §1.3–§1.5, rulings E1, E2, I1)

**Files:**
- Create: `src/engine/ers.ts`
- Modify: `src/engine/race.ts` (init, per-sector deployment, overtake adjust), `src/engine/redFlag.ts` (recharge), `src/engine/strategy.ts` (`aiResourceModes` ERS half), `src/engine/playerCalls.ts` (`ers` call), `src/engine/index.ts`
- Test: `tests/engine/ers.test.ts`

**Interfaces:**
- Consumes: `SectorContext.ersPace` (Task 3), `paceAdvantage` (Task 13), `drs.detectionGap`.
- Produces:
  - `initErs(tuning: TuningConstants): ErsState`
  - `interface ErsSectorResult { ers: ErsState; pace: number; attacking: number; defending: number }` (`attacking`/`defending` = deployment fraction in [0, 1])
  - `ersSector(config: RaceConfig, car: CarState, neutralised: boolean, threatenedFromBehind: boolean): ErsSectorResult`
  - `ersOvertakeAdjust(config: RaceConfig, fx: ReadonlyMap<string, { attacking: number; defending: number }>, behindId: string, aheadId: string, paceAdv: number): { adv: number; mult: number }`
  - `PlayerCall` member `{ step: number; kind: 'ers'; mode: ErsMode }`; `applyPlayerErs(state: RaceState, mode: ErsMode): RaceState`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/ers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initErs, ersSector, ersOvertakeAdjust } from '@engine/ers'
import { aiResourceModes } from '@engine/strategy'
import { applyCall } from '@engine/playerCalls'
import { applyRedFlagRestart } from '@engine/redFlag'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, ErsMode, RaceConfig } from '@engine/types'

const cfg = (): RaceConfig => ({ ...makeConfig({}, 4, 'veloce'), allDry: true, tuning: makeDeterministicTuning({ ers: { enabled: true } }) })
const withErs = (c: RaceConfig, mode: ErsMode, charge: number, patch: Partial<CarState> = {}): CarState =>
  ({ ...initRace(c).cars[0]!, ers: { mode, charge }, ...patch })

describe('ERS (spec §1.4)', () => {
  it('starts full and balanced', () => {
    expect(initErs(cfg().tuning)).toEqual({ charge: 1, mode: 'balanced' })
  })

  it('harvest, balanced, attack, and an empty battery deploys nothing (ruling E2)', () => {
    const c = cfg()
    const h = ersSector(c, withErs(c, 'harvest', 0.5), false, false)
    expect(h.pace).toBeCloseTo(0.15 / 3, 12); expect(h.ers.charge).toBeCloseTo(0.6, 12)
    expect(ersSector(c, withErs(c, 'balanced', 0.5), false, false)).toEqual({ ers: { mode: 'balanced', charge: 0.5 }, pace: 0, attacking: 0, defending: 0 })
    const a = ersSector(c, withErs(c, 'attack', 1), false, false)
    expect(a.pace).toBeCloseTo(-0.30 / 3, 12); expect(a.ers.charge).toBeCloseTo(1 - 0.40 / 3, 12); expect(a.attacking).toBe(1)
    const half = ersSector(c, withErs(c, 'attack', 0.40 / 6), false, false)
    expect(half.attacking).toBeCloseTo(0.5, 12); expect(half.ers.charge).toBeCloseTo(0, 12)
    const flat = ersSector(c, withErs(c, 'attack', 0), false, false)
    expect(flat).toEqual({ ers: { mode: 'attack', charge: 0 }, pace: 0, attacking: 0, defending: 0 })
  })

  it('defend deploys only with a car close behind', () => {
    const c = cfg()
    expect(ersSector(c, withErs(c, 'defend', 1), false, false).defending).toBe(0)
    const d = ersSector(c, withErs(c, 'defend', 1), false, true)
    expect(d.defending).toBe(1); expect(d.pace).toBeCloseTo(-0.10 / 3, 12); expect(d.ers.charge).toBeCloseTo(0.95, 12)
  })

  it('a neutralisation recharges and deploys nothing; the charge is clamped to 1', () => {
    const c = cfg()
    const n = ersSector(c, withErs(c, 'attack', 0.9), true, true)
    expect(n).toEqual({ ers: { mode: 'attack', charge: 1 }, pace: 0, attacking: 0, defending: 0 })
  })

  it('overtake: attack adds pace advantage, defend scales the chance down', () => {
    const c = cfg()
    const fx = new Map([['b', { attacking: 1, defending: 0 }], ['a', { attacking: 0, defending: 1 }]])
    expect(ersOvertakeAdjust(c, fx, 'b', 'a', 0.1)).toEqual({ adv: 0.1 + 0.15, mult: 1 - 0.35 })
    expect(ersOvertakeAdjust(c, new Map(), 'b', 'a', 0.1)).toEqual({ adv: 0.1, mult: 1 })
  })

  it('AI ERS policy', () => {
    const c = cfg()
    const s = initRace(c)
    const voss = s.cars.find(x => x.driverId === 'd_voss')!, kane = s.cars.find(x => x.driverId === 'd_kane')!
    const opt = (charge: number, raceTime = 100.5) => ({ ...voss, raceTime, sector: 0 as const, ers: { mode: 'balanced' as const, charge }, strategy: { ...voss.strategy, brain: 'optimal' as const } })
    const rest = s.cars.filter(x => x !== voss && x !== kane).map((x, i) => ({ ...x, raceTime: 300 + i }))
    const battle = (me: CarState) => ({ ...s, cars: [{ ...kane, raceTime: 100 }, me, ...rest] })
    expect(aiResourceModes(c, opt(0.8), battle(opt(0.8))).ers).toBe('attack')
    expect(aiResourceModes(c, opt(0.2), battle(opt(0.2))).ers, 'too little to attack, harvest').toBe('harvest')
    const leading = (me: CarState) => ({ ...s, cars: [me, { ...kane, raceTime: 100.6 }, ...rest] })
    expect(aiResourceModes(c, opt(0.8, 100), leading(opt(0.8, 100))).ers).toBe('defend')
    const naive = { ...opt(0.8), strategy: { ...voss.strategy, brain: 'naive' as const } }
    expect(aiResourceModes(c, naive, battle(naive)).ers).toBe('balanced')
  })

  it('the ers call, and a red-flag restart recharges (ruling I1)', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    const s = initRace(c)
    const next = applyCall(c, s, { step: 0, kind: 'ers', mode: 'attack' }, createRng(1))
    expect(next.cars.find(x => x.isPlayer)!.ers!.mode).toBe('attack')
    const drained = s.cars.map(x => ({ ...x, ers: { mode: 'attack' as const, charge: 0.1 } }))
    expect(applyRedFlagRestart(c, drained, 'DRY', 20).every(x => x.ers!.charge === 1 && x.ers!.mode === 'attack')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/ers.test.ts`
Expected: FAIL — `@engine/ers` not found.

- [ ] **Step 3: `ers.ts`**

```ts
import type { CarState, ErsState, RaceConfig, TuningConstants } from './types'

export function initErs(t: TuningConstants): ErsState {
  return { charge: t.ers.startCharge, mode: 'balanced' }
}

export interface ErsSectorResult { ers: ErsState; pace: number; attacking: number; defending: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * One sector of deployment (spec 2026-10-24 §1.4). Decided before the sector
 * time is computed; the pace goes in via SectorContext.ersPace. An empty
 * battery keeps the mode and deploys nothing (ruling E2). No rng.
 */
export function ersSector(config: RaceConfig, car: CarState, neutralised: boolean, threatenedFromBehind: boolean): ErsSectorResult {
  const e = config.tuning.ers
  const s = car.ers!
  const none = (charge: number): ErsSectorResult => ({ ers: { ...s, charge: clamp01(charge) }, pace: 0, attacking: 0, defending: 0 })
  if (neutralised) return none(s.charge + e.neutralisedChargePerLap / 3)
  switch (s.mode) {
    case 'balanced': return none(s.charge)
    case 'harvest': {
      const m = e.modes.harvest
      return { ers: { ...s, charge: clamp01(s.charge + m.chargePerLap / 3) }, pace: m.paceDelta / 3, attacking: 0, defending: 0 }
    }
    case 'attack': {
      const need = -e.modes.attack.chargePerLap / 3
      const frac = s.charge <= 0 ? 0 : Math.min(1, s.charge / need)
      if (frac === 0) return none(s.charge)
      return { ers: { ...s, charge: clamp01(s.charge - need * frac) }, pace: e.modes.attack.paceDelta * frac / 3, attacking: frac, defending: 0 }
    }
    case 'defend': {
      if (!threatenedFromBehind || s.charge <= 0) return none(s.charge)
      const frac = Math.min(1, s.charge / e.defendDrainPerSector)
      return { ers: { ...s, charge: clamp01(s.charge - e.defendDrainPerSector * frac) }, pace: e.defendPaceDelta * frac / 3, attacking: 0, defending: frac }
    }
    default: { const never: never = s.mode; return never }
  }
}

/** ERS in the pass roll: attack adds pace advantage, defend scales the chance. Identity without deployment. */
export function ersOvertakeAdjust(
  config: RaceConfig, fx: ReadonlyMap<string, { attacking: number; defending: number }>,
  behindId: string, aheadId: string, paceAdv: number,
): { adv: number; mult: number } {
  const e = config.tuning.ers
  const att = fx.get(behindId)?.attacking ?? 0
  const def = fx.get(aheadId)?.defending ?? 0
  return { adv: att > 0 ? paceAdv + e.attackOvertakeAdv * att : paceAdv, mult: def > 0 ? 1 - e.defendResist * def : 1 }
}
```

- [ ] **Step 4: Wire the race**

`race.ts` `initRace`: `...(config.tuning.ers.enabled ? { ers: initErs(config.tuning) } : {}),` after the fuel spread. In `stepSector`, before the step-1 map:

```ts
  // ERS (spec §1.4): who has a car within detectionGap behind, from the pre-tick order.
  const ersFx = new Map<string, { attacking: number; defending: number }>()
  const threatened = new Set<string>()
  if (config.tuning.ers.enabled) {
    const pre = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
    for (let i = 1; i < pre.length; i++) {
      if (pre[i]!.raceTime - pre[i - 1]!.raceTime <= config.tuning.drs.detectionGap) threatened.add(pre[i - 1]!.driverId)
    }
  }
```

Inside the map, before `computeSectorTime`:

```ts
    const ersR = car.ers ? ersSector(config, car, state.safetyCar !== null, threatened.has(car.driverId)) : null
    if (ersR && (ersR.attacking > 0 || ersR.defending > 0)) ersFx.set(car.driverId, { attacking: ersR.attacking, defending: ersR.defending })
    let ctx = drsOpen.has(car.driverId) ? { ...ctxBase, drsOpen: true } : ctxBase
    if (ersR && ersR.pace !== 0) ctx = { ...ctx, ersPace: ersR.pace }
```

pass `ctx` to `computeSectorTime`, and after the thermal/fuel updates: `if (ersR) updated = { ...updated, ers: ersR.ers }`.

`lapModel.ts` `v2Delta` block: `if (ctx.ersPace) v2Delta += ctx.ersPace`.

`resolveOvertakes` gains `ersFx` as a final parameter; replace the gate and the pace term:

```ts
    const baseAdv = paceAdvantage(config, behind, ahead)
    const ers = ersOvertakeAdjust(config, ersFx, behind.driverId, ahead.driverId, baseAdv)
    const paceAdv = ers.adv
    if (paceAdv < config.tuning.overtaking.paceGateMin) continue
    // … attackMult, defendMult, raw, drsF as before …
    const fx = drsF * ers.mult
    const prob = Math.min(0.85, fx === 1 ? raw : raw * fx)
```

`redFlag.ts` `applyRedFlagRestart`: append `...(car.ers ? { ers: { ...car.ers, charge: config.tuning.ers.startCharge } } : {}),` (ruling I1).

`strategy.ts` `aiResourceModes`, after the fuel block:

```ts
  if (car.ers) {
    const e = config.tuning.ers
    const behind = i >= 0 ? sorted[i + 1] : undefined
    const threatened = !!behind && behind.raceTime - car.raceTime <= e.aiAttackGap
    if (brain === 'naive') out.ers = 'balanced'
    else if (battling && car.ers.charge >= e.aiMinAttackCharge) out.ers = 'attack'
    else if (threatened && car.ers.charge >= e.aiMinDefendCharge) out.ers = 'defend'
    else if (car.ers.charge < e.aiHarvestBelow) out.ers = 'harvest'
    else out.ers = 'balanced'
  }
```

and in `race.ts`'s AI branch: `if (updated.ers && res.ers && res.ers !== updated.ers.mode) updated.ers = { ...updated.ers, mode: res.ers }`.

`playerCalls.ts`: `| { step: number; kind: 'ers'; mode: ErsMode }`, `applyPlayerErs` mirroring `applyPlayerFuel`, `case 'ers'`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/ers.test.ts tests/engine/fuel.test.ts tests/engine/byteIdentity.test.ts tests/engine/overtakeRaceTime.test.ts tests/engine/trafficOvertaking.test.ts tests/engine/redFlag.test.ts tests/engine/playerCalls.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/ers.ts src/engine/race.ts src/engine/lapModel.ts src/engine/redFlag.ts src/engine/strategy.ts src/engine/playerCalls.ts src/engine/index.ts tests/engine/ers.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): ERS -- charge, harvest/balanced/attack/defend, pass-roll effects, AI policy

Spec 2026-10-24 §1.3-§1.5, rulings E1/E2/I1. Deployment is decided per sector
before the sector time; attack adds pace and pass advantage, defend (only with
a car within 1 s behind) adds pace and resists the pass. An empty battery keeps
the mode and deploys nothing. Neutralisations recharge; a red-flag restart
refills. Player 'ers' call; smart/optimal AI attack, defend and harvest by
threshold. Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: FUEL LOAD at race setup — persisted, threaded into the config (spec §1.1, §11, ruling F3)

**Files:**
- Modify: `src/state/seasonStore.ts` (`PlayerStrategyChoice.fuelLoad?`), `src/state/seasonPersistence.ts` (`PlayerStrategySchema.fuelLoad` optional, last), `src/state/buildRaceConfig.ts` (`config.playerFuelLoad`), `src/ui/RaceSetup.tsx` (control)
- Test: `tests/state/fuelLoadPersistence.test.ts`, `tests/ui/raceSetupBold.test.tsx` (one case)

**Interfaces:**
- Consumes: `FuelLoad` (Task 1), `initFuel` reads `config.playerFuelLoad` (Task 13).
- Produces: `PlayerStrategyChoice { startCompound; plannedStops; wing?; fuelLoad?: FuelLoad }`; `buildRaceConfig` writes `playerFuelLoad` **only** when the choice carries a load other than `'target'`.

- [ ] **Step 1: Write the failing test**

Create `tests/state/fuelLoadPersistence.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(), get: vi.fn(async () => ({ value: null })), remove: vi.fn() } }))

import { SeasonSnapshotSchema } from '@state/seasonPersistence'
import { buildRaceConfig } from '@state/buildRaceConfig'

const SEASON_14 = readFileSync('tests/fixtures/season-save-1.4.json', 'utf8').trim()

describe('fuel load (spec §1.1, §11)', () => {
  it('A REAL 1.4 SEASON STILL PARSES AND RE-SERIALISES BYTE FOR BYTE', () => {
    const parsed = SeasonSnapshotSchema.parse(JSON.parse(SEASON_14))
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(JSON.parse(SEASON_14)))
  })

  it('a strategy with a fuel load round-trips; the key is last', () => {
    const raw = JSON.parse(SEASON_14) as Record<string, unknown>
    const strat = { startCompound: 'M', plannedStops: [{ lap: 18, compound: 'H' }], wing: 3, fuelLoad: 'light' }
    const parsed = SeasonSnapshotSchema.parse({ ...raw, playerStrategy: strat })
    expect(parsed.playerStrategy).toEqual(strat)
    expect(Object.keys(parsed.playerStrategy!).at(-1)).toBe('fuelLoad')
  })

  it('buildRaceConfig writes playerFuelLoad only for a non-target load', () => {
    const plan = { startCompound: 'M' as const, plannedStops: [{ lap: 18, compound: 'H' as const }] }
    expect('playerFuelLoad' in buildRaceConfig(1, 'd_voss', 'veloce', 'pro', plan)).toBe(false)
    expect('playerFuelLoad' in buildRaceConfig(1, 'd_voss', 'veloce', 'pro', { ...plan, fuelLoad: 'target' })).toBe(false)
    expect(buildRaceConfig(1, 'd_voss', 'veloce', 'pro', { ...plan, fuelLoad: 'safe' }).playerFuelLoad).toBe('safe')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/state/fuelLoadPersistence.test.ts`
Expected: FAIL — `fuelLoad` is stripped by zod; `playerFuelLoad` never written.

- [ ] **Step 3: Implement**

`seasonStore.ts`: `export interface PlayerStrategyChoice { startCompound: Compound; plannedStops: PitStop[]; wing?: Wing; fuelLoad?: FuelLoad }`.

`seasonPersistence.ts` `PlayerStrategySchema`: append `fuelLoad: z.enum(['light', 'target', 'safe']).optional(),` after `wing` (optional, last — a save without it is unchanged; no version bump, spec §11).

`buildRaceConfig.ts`, beside the wing line at the end:

```ts
  // Absent for the default load, so every existing config is unchanged (spec §1.1).
  const load = playerStrategy?.fuelLoad
  if (load !== undefined && load !== 'target') config.playerFuelLoad = load
```

`RaceSetup.tsx`: under the `WingSelector`, a `Segmented` labelled `Fuel load` with options `LIGHT` (sub `−2.5% · faster, short`), `TARGET` (sub `−1.2% · balanced`), `SAFE` (sub `+0.4% · heavy, safe`) — subs computed from `tuning.fuelModel.loadMarginFrac` × laps as laps ("−1.4 L"); rendered only when `tuning.fuelModel.enabled`; default `target`; stored with the choice passed to `confirmRaceSetup`. The retry pre-fill (`retrySetupPrefill`) carries it with the rest of `playerStrategy`.

Append inside the `describe` of `tests/ui/raceSetupBold.test.tsx` (add `import { loadGameData } from '@data/validators'`):

```tsx
  it('FUEL LOAD appears exactly when the fuel model is on, defaulting to TARGET', () => {
    render(<RaceSetup />)
    const group = screen.queryByRole('radiogroup', { name: 'Fuel load' })
    // RaceSetup reads the shipped tuning, so this holds before and after the 2.0b switch-on (Task 20).
    expect(group !== null).toBe(loadGameData().tuning.fuelModel.enabled)
    if (group) expect(within(group).getByRole('radio', { checked: true }).textContent).toMatch(/^TARGET/)
  })
```

`RaceSetup` reads `loadGameData().tuning.fuelModel` (the same source it already uses for compounds and laps), not the race store.

- [ ] **Step 4: Run**

Run: `npx vitest run tests/state/fuelLoadPersistence.test.ts tests/state/seasonPersistence.test.ts tests/state/sprintPersistence.test.ts tests/state/raceFacts16.test.ts tests/ui/raceSetupBold.test.tsx tests/ui/retrySetupPrefill.test.tsx tests/state/buildRaceConfigSetups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/seasonStore.ts src/state/seasonPersistence.ts src/state/buildRaceConfig.ts src/ui/RaceSetup.tsx tests/state/fuelLoadPersistence.test.ts tests/ui/raceSetupBold.test.tsx
git commit -m "$(cat <<'EOF'
feat(setup): FUEL LOAD choice at race setup, persisted as an optional last key

Spec 2026-10-24 §1.1/§11, ruling F3. LIGHT/TARGET/SAFE, shown only with the
fuel model on; buildRaceConfig writes playerFuelLoad only for a non-default
load so existing configs are unchanged. No save version bump; the real 1.4
season fixture still parses and re-serialises byte for byte.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: The Power unit on screen — gauges, PU sheet, battle chips, ASSISTED/MANUAL, coach mark (spec §1.3, §1.6, §1.7, ruling E3)

**Files:**
- Create: `src/ui/kit/ResourceGauge.tsx`, `src/ui/PowerUnitSheet.tsx` (exports `PowerUnitSheet`, `PuButton`), `src/ui/BattleChips.tsx`
- Modify: `src/ui/kit/index.ts`, `src/ui/TelemetryZone.tsx`, `src/ui/RaceHUD.tsx`, `src/state/raceStore.ts` (`setFuelMode`, `setErsMode`, `puSheetOpen`, `puManual`, assisted calls in `step`), `src/state/settingsStore.ts` (`puAssist`), `src/ui/SettingsPanel.tsx`, `src/state/coachMarks.ts` (`power_unit`), `src/data/radio.json`, `src/state/radioMapper.ts` (`fuel_critical` row, battery-flat one-shot)
- Test: `tests/state/powerUnitAssist.test.ts`, `tests/ui/powerUnitSheet.test.tsx`

**Interfaces:**
- Consumes: `fuelMarginLaps`, `raceLaps` (Task 13), `aiResourceModes` (Tasks 13–14), `applyPlayerFuel`/`applyPlayerErs`.
- Produces:
  - raceStore: `setFuelMode(mode: FuelMode, opts?: { assisted?: boolean }): void`, `setErsMode(mode: ErsMode, opts?: { assisted?: boolean }): void`, `puSheetOpen: boolean`, `openPuSheet()`, `closePuSheet()`, `puManual: boolean` (true after any non-assisted PU call this race), exported pure `assistedPuCalls(config, state, step): PlayerCall[]`.
  - settingsStore: `puAssist: boolean` (default `true`), `setPuAssist(v: boolean)`, key `K.puAssist = 'settings.puAssist'` appended last.
  - `ResourceGauge({ kind: 'fuel' | 'battery'; value: number; forced?: boolean }): JSX.Element`
  - `battleState(config, state): { attack: boolean; defend: boolean }` (exported from `BattleChips.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/state/powerUnitAssist.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(), get: vi.fn(async () => ({ value: null })), remove: vi.fn() } }))

import { useRaceStore, assistedPuCalls } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { replay } from '@engine/debrief'
import { createRng } from '@engine/rng'
import { initRace } from '@engine/race'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

const ON = { fuelModel: { enabled: true }, ers: { enabled: true } }

describe('Power unit assist (spec §1.6, ruling E3)', () => {
  beforeEach(() => { useRaceStore.getState().resetRace(); useSettingsStore.setState({ puAssist: true }) })

  it('assistedPuCalls proposes the smart policy as calls, only where it differs', () => {
    const base = makeConfig({}, 5, 'veloce')
    const config = { ...base, playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(ON) }
    const s = initRace(config)
    const calls = assistedPuCalls(config, { ...s, lap: 3, sector: 0 }, 9)
    for (const c of calls) expect(c.step).toBe(9)
    expect(calls.every(c => c.kind === 'fuel' || c.kind === 'ers')).toBe(true)
  })

  it('an assisted race replays byte-identically from its call log', () => {
    const base = makeConfig({}, 5, 'veloce')
    const config = { ...base, playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(ON) }
    useRaceStore.setState({ phase: 'racing', config, raceState: initRace(config), rng: createRng(config.seed), stepCount: 0, playerCalls: [] })
    const MAX_STEPS = config.circuit.laps * 3
    for (let i = 0; i < MAX_STEPS && useRaceStore.getState().phase === 'racing'; i++) useRaceStore.getState().step()
    const st = useRaceStore.getState()
    expect(st.phase).toBe('finished')
    expect(st.playerCalls.some(c => c.kind === 'ers' || c.kind === 'fuel')).toBe(true)
    expect(JSON.stringify(replay(config, config.seed, st.playerCalls).state)).toBe(JSON.stringify(st.raceState))
  })

  it('a manual change switches this race to MANUAL; no further assisted calls', () => {
    const base = makeConfig({}, 5, 'veloce')
    const config = { ...base, playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(ON) }
    useRaceStore.setState({ phase: 'racing', config, raceState: initRace(config), rng: createRng(config.seed), stepCount: 0, playerCalls: [] })
    useRaceStore.getState().setErsMode('harvest')
    expect(useRaceStore.getState().puManual).toBe(true)
  })
})
```

Create `tests/ui/powerUnitSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PowerUnitSheet, PuButton } from '@ui/PowerUnitSheet'
import { ResourceGauge } from '@ui/kit'
import { battleState } from '@ui/BattleChips'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

const ON = { fuelModel: { enabled: true }, ers: { enabled: true } }
function load() {
  const config = { ...makeConfig({}, 5, 'veloce'), playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(ON) }
  useRaceStore.setState({ phase: 'racing', config, raceState: initRace(config), rng: createRng(config.seed), stepCount: 0, playerCalls: [] })
  return config
}

describe('Power unit UI (spec §1.7)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('gauges speak their value and flag forced lift-and-coast in words', () => {
    render(<ResourceGauge kind="fuel" value={-0.4} forced />)
    expect(screen.getByRole('meter', { name: 'Fuel' }).getAttribute('aria-valuetext')).toBe('Fuel minus 0.4 laps, lift and coast')
    expect(screen.getByText('LIFT & COAST')).toBeTruthy()
    render(<ResourceGauge kind="battery" value={0} />)
    expect(screen.getByText('FLAT')).toBeTruthy()
  })

  it('the sheet sets fuel and ERS through logged calls', () => {
    load()
    render(<><PuButton /><PowerUnitSheet /></>)
    fireEvent.click(screen.getByRole('button', { name: /power unit/i }))
    fireEvent.click(screen.getByRole('radio', { name: /SAVE/ }))
    fireEvent.click(screen.getByRole('radio', { name: /ATTACK/ }))
    const calls = useRaceStore.getState().playerCalls
    expect(calls.map(c => c.kind)).toEqual(['fuel', 'ers'])
    expect(useRaceStore.getState().raceState!.cars.find(c => c.isPlayer)!.ers!.mode).toBe('attack')
  })

  it('battle state: attack within 1.0 s of the car ahead, defend with one within 1.0 s behind', () => {
    const config = load()
    const s = useRaceStore.getState().raceState!
    const me = s.cars.find(c => c.isPlayer)!
    const others = s.cars.filter(c => !c.isPlayer)
    const cars = [{ ...others[0]!, raceTime: 100 }, { ...me, raceTime: 100.6 }, { ...others[1]!, raceTime: 101.2 }, ...others.slice(2).map((c, i) => ({ ...c, raceTime: 200 + i }))]
    expect(battleState(config, { ...s, cars })).toEqual({ attack: true, defend: true })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/powerUnitAssist.test.ts tests/ui/powerUnitSheet.test.tsx`
Expected: FAIL — the modules and store actions do not exist.

- [ ] **Step 3: Store and settings**

`settingsStore.ts`: add `puAssist: boolean` (default `true`) and `setPuAssist`, key `puAssist: 'settings.puAssist'` appended **last** to `K`; append `puAssist` to the positional destructure in `loadSettings` and parse `puAssist != null ? puAssist === 'true' : true`.

`raceStore.ts`:

```ts
/**
 * The smart AI policy for the player's power unit, as calls (spec ruling E3).
 * Logged like any other call, so an assisted race replays exactly.
 */
export function assistedPuCalls(config: RaceConfig, state: RaceState, step: number): PlayerCall[] {
  const me = state.cars.find(c => c.isPlayer)
  if (!me || me.retired) return []
  const proxy = { ...me, strategy: { ...me.strategy, brain: 'smart' as const } }
  const want = aiResourceModes(config, proxy, state)
  const out: PlayerCall[] = []
  if (me.fuel && want.fuel && want.fuel !== me.fuel.mode) out.push({ step, kind: 'fuel', mode: want.fuel })
  if (me.ers && want.ers && want.ers !== me.ers.mode) out.push({ step, kind: 'ers', mode: want.ers })
  return out
}
```

State: `puSheetOpen: false`, `puManual: false` (reset in every `start*`/`resetRace`). Actions:

```ts
  setFuelMode(mode, opts) {
    const { config, raceState, stepCount, rng } = get()
    if (!config || !raceState || !rng) return
    const call = { step: stepCount, kind: 'fuel' as const, mode }
    set(s => ({ raceState: applyCall(config, raceState, call, rng), playerCalls: [...s.playerCalls, call], puManual: s.puManual || !opts?.assisted }))
  },
```

(`setErsMode` the same with `kind: 'ers'`.) In `step()`, after the new state is set and only when `nextState.sector === 0 && !finished && useSettingsStore.getState().puAssist && !get().puManual`: `for (const c of assistedPuCalls(config, nextState, get().stepCount)) (c.kind === 'fuel' ? get().setFuelMode(c.mode, { assisted: true }) : c.kind === 'ers' ? get().setErsMode(c.mode, { assisted: true }) : undefined)`. Calls carry the step count the race has just reached, so replay applies them before the next step exactly as live.

- [ ] **Step 4: Components**

`src/ui/kit/ResourceGauge.tsx`:

```tsx
import { motion } from 'framer-motion'
import { useReducedMotion } from './motion'

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`

/** Fuel margin (laps, centre-zero) or battery (0–1, ten segments). Spec §1.7. */
export function ResourceGauge({ kind, value, forced = false }: { kind: 'fuel' | 'battery'; value: number; forced?: boolean }) {
  const reduced = useReducedMotion()
  if (kind === 'fuel') {
    const tone = forced ? 'var(--hot)' : value < 0 ? 'var(--caution)' : 'var(--gain)'
    const half = Math.min(1, Math.abs(value) / 1.5) * 50
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 72 }}>
        <div role="meter" aria-label="Fuel" aria-valuemin={-3} aria-valuemax={3} aria-valuenow={Math.round(value * 10) / 10}
          aria-valuetext={`Fuel ${value >= 0 ? 'plus' : 'minus'} ${Math.abs(value).toFixed(1)} laps${forced ? ', lift and coast' : ''}`}
          style={{ position: 'relative', height: 8, background: 'var(--dusk)' }} className="slant-sm">
          <motion.span initial={false} animate={{ width: `${half}%`, opacity: forced && !reduced ? [1, 0.5, 1] : 1 }}
            transition={forced && !reduced ? { duration: 0.9, repeat: Infinity } : { duration: reduced ? 0 : 0.12 }}
            style={{ position: 'absolute', top: 0, bottom: 0, background: tone, ...(value >= 0 ? { left: '50%' } : { right: '50%' }) }} />
          <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--lilac)' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: tone, fontVariantNumeric: 'tabular-nums' }}>
          {forced ? 'LIFT & COAST' : `FUEL ${signed(value)} L`}
        </span>
      </div>
    )
  }
  const lit = Math.round(Math.min(1, Math.max(0, value)) * 10)
  const tone = value <= 0 ? 'var(--hot)' : value < 0.25 ? 'var(--caution)' : 'var(--gain)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 72 }}>
      <div role="meter" aria-label="Battery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`Battery ${Math.round(value * 100)} percent`} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span key={i} className="slant-sm" initial={false} animate={{ opacity: i < lit ? 1 : 0.3 }}
            transition={{ duration: reduced ? 0 : 0.12 }} style={{ height: 8, background: i < lit ? tone : 'var(--dusk)' }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: tone, fontVariantNumeric: 'tabular-nums' }}>
        {value <= 0 ? 'FLAT' : `ERS ${Math.round(value * 100)}%`}
      </span>
    </div>
  )
}
```

`src/ui/PowerUnitSheet.tsx`: `PuButton` — 48 px slanted grape button, `aria-label="Power unit"`, label `PU`, opens the sheet (Light haptic via `useUiTap`), rendered only when the player car has `fuel` or `ers`. `PowerUnitSheet` — a bottom sheet (`motion.div`, enters with a 200 ms slide-up on `EASE`, opacity only under reduced motion; `role="dialog"`, `aria-label="Power unit"`, closes on backdrop tap and Android back via `useAndroidBackButton`): a `Segmented` `Fuel mode` (`RICH`/`STD`/`SAVE`, subs from tuning: `${signed(paceDelta)}s · ${signed((burn−1)×100)}% fuel`), a `Segmented` `ERS mode` (`HARVEST`/`BAL`/`ATTACK`/`DEFEND`, subs `−0.30s · −40%/lap` etc.), a `Toggle` `ASSISTED` bound to `puAssist`, and the line `At this rate: +0.1 L at the flag` = `fuelMarginLaps − (laps left × (burn[mode]×paceBurn[pace] − 1))`. Selecting calls `setFuelMode`/`setErsMode` (manual).

`src/ui/BattleChips.tsx`:

```tsx
export function battleState(config: RaceConfig, state: RaceState): { attack: boolean; defend: boolean } {
  const me = state.cars.find(c => c.isPlayer)
  if (!me?.ers || me.retired || state.safetyCar) return { attack: false, defend: false }
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const i = sorted.findIndex(c => c.isPlayer)
  const g = config.tuning.ers.aiAttackGap
  return {
    attack: i > 0 && me.raceTime - sorted[i - 1]!.raceTime <= g,
    defend: i < sorted.length - 1 && sorted[i + 1]!.raceTime - me.raceTime <= g,
  }
}
```

`BattleChips` renders up to two 48 px volt chips (`ATTACK` / `DEFEND`, ink text, `aria-label` "ERS attack" / "ERS defend", `aria-pressed` when that mode is set) in an `AnimatePresence`, entering `x: 24 → 0` over 160 ms (`EASE`; opacity only under reduced motion). A tap: Medium haptic (`useHaptics().impact(ImpactStyle.Medium)`), `setErsMode('attack' | 'defend')`. While the player deploys ATTACK, `TrackCanvas` raises the player's glow alpha (read `ers.mode === 'attack' && ers.charge > 0` once per tick).

`TelemetryZone.tsx`: right of the tyre meter, `<ResourceGauge kind="fuel" value={fuelMarginLaps(player, raceLaps(config))} forced={player.fuel.forced} />` and `<ResourceGauge kind="battery" value={player.ers.charge} />` when present. `RaceHUD.tsx`: `<BattleChips />` above the lever row; `<PuButton />` between `PaceModeToggle` and `PitButton`; `<PowerUnitSheet />` beside `PitPanel`. `SettingsPanel.tsx`: a `Toggle` "Power unit: assisted".

Radio: `V2_RADIO.fuel_critical = 'fuel_critical'`; `radio.json` `"fuel_critical": ["We're short on fuel. Lift and coast, I'll tell you when.", "Fuel critical. Lift into the braking zones."]`, `"battery_flat": ["Battery's flat. Harvest."]` with a one-shot when the player's charge hits 0 in attack/defend (reset when the charge exceeds 0.25).

Coach mark `power_unit` appended to `NEW_COACH_MARKS`; requested the first time `battleState(...).attack || .defend` is true for the player: "Within a second of a car? Tap ATTACK to deploy the battery. It drains fast — HARVEST refills it."

- [ ] **Step 5: Run**

Run: `npx vitest run tests/state/powerUnitAssist.test.ts tests/ui/powerUnitSheet.test.tsx tests/state/settingsStore.test.ts tests/ui/settingsBold.test.tsx tests/ui/raceHudBold.test.tsx tests/ui/newCoachMarks.test.tsx tests/ui/kit.test.tsx tests/ui/tokenContrast.test.ts tests/engine/replayFidelity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/kit/ResourceGauge.tsx src/ui/kit/index.ts src/ui/PowerUnitSheet.tsx src/ui/BattleChips.tsx src/ui/TelemetryZone.tsx src/ui/RaceHUD.tsx src/ui/SettingsPanel.tsx src/canvas/TrackCanvas.tsx src/state/raceStore.ts src/state/settingsStore.ts src/state/coachMarks.ts src/state/radioMapper.ts src/data/radio.json tests/state/powerUnitAssist.test.ts tests/ui/powerUnitSheet.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Power unit -- fuel and battery gauges, PU sheet, ATTACK/DEFEND chips, assist

Spec 2026-10-24 §1.3/§1.6/§1.7, ruling E3. Fuel margin and battery gauges in
the telemetry zone; a PU sheet for fuel and ERS modes with tuning-derived
consequences; volt battle chips appear within a second of a car. ASSISTED
(default) logs the smart policy's fuel/ERS calls at lap ends, so assisted
races replay exactly; any manual change makes the race MANUAL.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Double-stacked stops — the team box, the queue, AI deferral, the BOX BUSY line (spec §7, rulings S1, S2)

**Files:**
- Modify: `src/engine/pitStop.ts` (`boxQueueEstimate`, `deferForBusyBox`, queue + box claim in `executeStop`), `src/engine/race.ts` (thread `boxFree` through the tick; AI deferral; write `state.boxFree`), `src/engine/playerCalls.ts` (button stop claims the box), `src/engine/projection.ts` (passes `state.boxFree`)
- Modify: `src/ui/PitPanel.tsx`, `src/ui/PitTimer.tsx`, `src/state/raceStore.ts` (`lastStopQueue`), `src/state/radioMapper.ts`, `src/data/radio.json`
- Test: `tests/engine/doubleStack.test.ts`

**Interfaces:**
- Consumes: `executeStop`/`StopContext.boxFree` (Task 2), `TuningConstants.doubleStack`.
- Produces:
  - `boxQueueEstimate(config: RaceConfig, boxFree: Record<string, number> | undefined, car: CarState, safetyCar: RaceState['safetyCar']): number`
  - `deferForBusyBox(config: RaceConfig, car: CarState, queue: number, neutralised: boolean, weatherStop: boolean, cliffFrac: number): boolean`
  - `StopOutcome.queue` and `StopOutcome.boxFree` now real; incident `double_stack` (driverId = queued car, timeLoss = queue).
  - raceStore `lastStopQueue: number`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/doubleStack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { executeStop, boxQueueEstimate, deferForBusyBox } from '@engine/pitStop'
import { applyCall } from '@engine/playerCalls'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { effectivePitLaneLoss } from '@engine/incidents'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig } from '@engine/types'

const cfg = (on = true): RaceConfig =>
  ({ ...makeConfig({}, 6, 'veloce'), allDry: true, tuning: makeDeterministicTuning(on ? { doubleStack: { enabled: true } } : {}) })

describe('double-stacked stops (spec §7)', () => {
  it('the first car claims the box; a team-mate arriving inside it queues exactly the overlap', () => {
    const c = cfg()
    const s = initRace(c)
    const a = { ...s.cars[0]!, raceTime: 500 }               // apex #1
    const b = { ...s.cars[1]!, raceTime: 501 }               // apex #2, 1 s behind
    const ctx = { safetyCar: null, lap: 10, sector: 2 as const, boxFree: {} }
    const first = executeStop(c, ctx, a, 'H', createRng(1))
    const lane = effectivePitLaneLoss(c.circuit, null, c.tuning)
    const expectFree = 500 + lane * 0.5 + first.cost.stationary + 0.8
    expect(first.boxFree!.apex).toBeCloseTo(expectFree, 9)
    expect(first.queue).toBe(0)
    const second = executeStop(c, { ...ctx, boxFree: first.boxFree }, b, 'H', createRng(2))
    expect(second.queue).toBeCloseTo(expectFree - (501 + lane * 0.5), 9)
    expect(second.car.raceTime).toBeCloseTo(501 + second.cost.total + second.queue, 9)
    expect(second.events).toContainEqual({ lap: 10, sector: 2, kind: 'double_stack', driverId: b.driverId, timeLoss: second.queue })
  })

  it('off: no queue, no box state', () => {
    const c = cfg(false)
    const s = initRace(c)
    const out = executeStop(c, { safetyCar: null, lap: 1, sector: 2, boxFree: { apex: 1e9 } }, s.cars[0]!, 'H', createRng(1))
    expect(out.queue).toBe(0)
    expect(out.boxFree).toBeUndefined()
  })

  it('AI deferral: by brain, looser under yellow, never for weather or a cliff emergency', () => {
    const c = cfg()
    const s = initRace(c)
    const opt = { ...s.cars[0]!, strategy: { ...s.cars[0]!.strategy, brain: 'optimal' as const } }
    const naive = { ...opt, strategy: { ...opt.strategy, brain: 'naive' as const } }
    expect(deferForBusyBox(c, opt, 2.5, false, false, 0.8)).toBe(true)
    expect(deferForBusyBox(c, opt, 2.5, true, false, 0.8), 'under yellow the limit is 5 s').toBe(false)
    expect(deferForBusyBox(c, opt, 2.5, false, true, 0.8), 'weather stops never wait').toBe(false)
    expect(deferForBusyBox(c, opt, 2.5, false, false, 1.4), 'cliff emergency never waits').toBe(false)
    expect(deferForBusyBox(c, naive, 50, false, false, 0.8)).toBe(false)
  })

  it('the PIT button claims the box on the state', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    const s = initRace(c)
    const next = applyCall(c, s, { step: 0, kind: 'pit', compound: 'H' }, createRng(1))
    expect(next.boxFree!.apex).toBeGreaterThan(0)
    const off = { ...c, tuning: makeDeterministicTuning() }
    expect('boxFree' in applyCall(off, initRace(off), { step: 0, kind: 'pit', compound: 'H' }, createRng(1))).toBe(false)
  })

  it('THE PROJECTION INCLUDES THE QUEUE', () => {
    const c = { ...cfg(), playerDriverId: 'd_voss' }
    let s = initRace(c)
    const rng = createRng(6)
    for (let i = 0; i < 30; i++) s = stepSector(c, s, rng)
    const me = s.cars.find(x => x.isPlayer)!
    const busy = { ...s, boxFree: { apex: me.raceTime + 60 } }
    const free = projectPitNow(c, s, 'H', 11)
    const queued = projectPitNow(c, busy, 'H', 11)
    expect(queued.rejoinPosition).toBeGreaterThan(free.rejoinPosition)
    expect(boxQueueEstimate(c, busy.boxFree, me, null)).toBeCloseTo(60 - effectivePitLaneLoss(c.circuit, null, c.tuning) * 0.5, 9)
  })

  it('in a race, a team stacking under yellow logs double_stack and both cars still finish', () => {
    const c = { ...cfg(), tuning: makeDeterministicTuning({ doubleStack: { enabled: true }, incidents: { driverErrorPerLap: 0.6, terminalFraction: 1, safetyCar: { crashDeployChance: 1 }, redFlag: { crashChance: 0 } } }) }
    let s = initRace(c)
    const rng = createRng(6)
    const MAX_STEPS = c.circuit.laps * 3
    for (let i = 0; i < MAX_STEPS; i++) s = stepSector(c, s, rng)
    expect(s.lap).toBe(s.totalLaps)
    // Not every seed stacks; the assertion is that the mechanism is reachable and well-formed when it does.
    for (const e of s.incidents.filter(x => x.kind === 'double_stack')) expect(e.timeLoss!).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/doubleStack.test.ts`
Expected: FAIL — `boxQueueEstimate`/`deferForBusyBox` missing; no queue.

- [ ] **Step 3: `pitStop.ts`**

```ts
/** Seconds a stop now would queue behind the team-mate (spec §7.2). 0 when off or the box is free. */
export function boxQueueEstimate(config: RaceConfig, boxFree: Record<string, number> | undefined, car: CarState, safetyCar: RaceState['safetyCar']): number {
  if (!config.tuning.doubleStack.enabled || !boxFree) return 0
  const free = boxFree[car.teamId]
  if (free === undefined) return 0
  const laneIn = effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) * config.tuning.doubleStack.entryShare
  return Math.max(0, free - (car.raceTime + laneIn))
}

/** The team keeps an AI car out a lap rather than queue too long (spec §7.2, ruling S2). Pure. */
export function deferForBusyBox(config: RaceConfig, car: CarState, queue: number, neutralised: boolean, weatherStop: boolean, cliffFrac: number): boolean {
  const d = config.tuning.doubleStack
  if (!d.enabled || queue <= 0 || weatherStop || cliffFrac >= d.emergencyCliffFrac) return false
  const brain = car.strategy.brain ?? 'naive'
  return queue > (neutralised ? d.maxQueueNeutralised : d.maxQueue)[brain]
}
```

In `executeStop` replace `const queue = 0` and the return:

```ts
  const ds = config.tuning.doubleStack
  const queue = boxQueueEstimate(config, ctx.boxFree, car, ctx.safetyCar)
  // … served (Task 18), add, events (slow_stop) as before …
  if (queue > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'double_stack', driverId: car.driverId, timeLoss: queue })
  const lane = effectivePitLaneLoss(config.circuit, ctx.safetyCar, config.tuning)
  const boxFree = ds.enabled
    ? { ...(ctx.boxFree ?? {}), [car.teamId]: car.raceTime + lane * ds.entryShare + queue + cost.stationary + ds.releaseGap }
    : undefined
  return { car: fitTyres(config, car, compound, add), cost, queue, served, unsafe: false, boxFree, events }
```

(`car.raceTime` is the arrival: the caller passes the car before the stop.)

- [ ] **Step 4: Thread it**

`race.ts`: before `finalCars`, `let boxFree = config.tuning.doubleStack.enabled ? state.boxFree ?? {} : undefined`; build `stopCtx` per stop as `{ safetyCar, lap: state.lap, sector, boxFree }`; after each `executeStop`, `boxFree = out.boxFree`. In the AI branch, before executing:

```ts
        if (decision.pit && !raceEndsThisTick) {
          const spec = config.compounds[updated.compound]
          const driver = config.drivers.find(d => d.id === car.driverId)!
          const cliffFrac = spec ? tyreCliffFraction(spec, effectiveTyreAge(updated, driver, state.weatherState, config.tuning)) : 0
          const weatherStop = config.compounds[decision.compound]?.type !== spec?.type
          const q = boxQueueEstimate(config, boxFree, updated, safetyCar)
          if (!deferForBusyBox(config, updated, q, safetyCar !== null, weatherStop, cliffFrac)) {
            const out = executeStop(config, { safetyCar, lap: state.lap, sector, boxFree }, updated, decision.compound, rng)
            updated = out.car
            newIncidents.push(...out.events)
            boxFree = out.boxFree
          }
        }
```

(With double-stacking off `deferForBusyBox` returns false and draws nothing, so the stream is unchanged.) The plan stop does the same without deferral. In the returned state, append `...(boxFree !== undefined ? { boxFree } : {})` after `weatherState`.

`playerCalls.ts` `applyPlayerPit`: pass `boxFree: state.boxFree` in the context and write `...(out.boxFree !== undefined ? { boxFree: out.boxFree } : {})` onto `next`. `projection.ts`: pass `boxFree: state.boxFree`, and replace `projState` with `{ ...projState, ...(stop.boxFree ? { boxFree: stop.boxFree } : {}), cars: … }`.

- [ ] **Step 5: UI and radio**

`PitPanel.tsx`: `const q = boxQueueEstimate(config, raceState.boxFree, player, raceState.safetyCar)`; when `q > 0.05` show a caution line `BOX BUSY — {mateCode} in the box · +{q.toFixed(1)}s queue` (`role="status"`). `raceStore.pitNow`: store `lastStopQueue: out.queue` — read it from the `double_stack` incident the call logged (`timeLoss`), 0 otherwise; the plan-stop path in `step()` the same. `PitTimer.tsx`: when `lastStopQueue > 0`, count `QUEUE +2.1` in caution before the stationary count. Radio: `V2_RADIO.double_stack = 'double_stack'` for the player's own queue; plus in `processRadioTick`, when a `double_stack` incident names the **team-mate** within one lap of the player's last stop, push `double_stack_mate`. `radio.json`: `"double_stack": ["Box is busy, you're queuing behind {mate}."], "double_stack_mate": ["Double stack — you first, {mate} queues behind."]` (`{mate}` = the team-mate's code; add it to the vars passed by the V2 loop).

- [ ] **Step 6: Run**

Run: `npx vitest run tests/engine/doubleStack.test.ts tests/engine/executeStop.test.ts tests/engine/byteIdentity.test.ts tests/engine/projection.test.ts tests/state/pitLaneLossLatch.test.tsx tests/ui/pitPanelDiscount.test.tsx tests/state/slowStopPresentation.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/pitStop.ts src/engine/race.ts src/engine/playerCalls.ts src/engine/projection.ts src/ui/PitPanel.tsx src/ui/PitTimer.tsx src/state/raceStore.ts src/state/radioMapper.ts src/data/radio.json tests/engine/doubleStack.test.ts
git commit -m "$(cat <<'EOF'
feat(engine,ui): double-stacked stops -- one box per team, queue, AI deferral

Spec 2026-10-24 §7, rulings S1/S2. Each team's box is a free-at instant on the
shared race clock; a car arriving while it is busy queues the overlap (logged
double_stack). Smart/optimal AI keep a car out a lap rather than queue past 3/2
s (6/5 s under yellow); weather and cliff emergencies never wait; the player's
own stops never defer. The PIT button and the projection use the same box, and
the pit panel warns BOX BUSY. Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Penalties — track limits on `noise2`, unsafe release on `g2`, served at the stop or added at the flag (spec §8.2, rulings N1–N3)

**Files:**
- Create: `src/engine/penalties.ts`
- Modify: `src/engine/lapModel.ts` (track-limits check), `src/engine/race.ts` (init, warnings, flag addition, AI cover), `src/engine/pitStop.ts` (`executeStop` serves and rolls unsafe release), `src/engine/index.ts`
- Test: `tests/engine/penalties.test.ts`

**Interfaces:**
- Consumes: `normalCdf`, `PitStopCost.releaseDraw` (Task 2), `thermalWindow` (Task 5), `paceAdvantage` (Task 13).
- Produces:
  - `initPenalty(): PenaltyState`
  - `trackLimitsChance(config: RaceConfig, car: CarState, weather: WeatherState): number` (per sector)
  - `recordTrackLimits(config: RaceConfig, car: CarState, lap: number, sector: SectorIndex): { penalty: PenaltyState; events: IncidentEvent[] }`
  - `unsafeReleaseChance(config: RaceConfig, teamId: string, stacked: boolean): number`
  - `addPendingAtFlag(cars: CarState[], lap: number, sector: SectorIndex): { cars: CarState[]; events: IncidentEvent[] }`
  - `effectiveOrder(state: Pick<RaceState, 'cars'>): CarState[]` (running cars by `raceTime + pendingSec`)
  - `aiPenaltyCoverPace(config: RaceConfig, car: CarState, state: RaceState, cliffFrac: number, proposed: PaceMode): PaceMode`
  - `StopOutcome.served` / `.unsafe` now real; incidents `track_limits`, `penalty_issued`, `penalty_served`, `penalty_added`, `unsafe_release`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/penalties.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  initPenalty, trackLimitsChance, recordTrackLimits, unsafeReleaseChance, addPendingAtFlag, effectiveOrder, aiPenaltyCoverPace,
} from '@engine/penalties'
import { executeStop } from '@engine/pitStop'
import { computeSectorTime } from '@engine/lapModel'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, RaceConfig } from '@engine/types'

const ON = { penalties: { enabled: true } }
const cfg = (over = {}): RaceConfig =>
  ({ ...makeConfig({}, 7, 'veloce'), allDry: true, tuning: makeDeterministicTuning({ ...ON, ...over }) })
const withPen = (c: RaceConfig, pen = initPenalty(), patch: Partial<CarState> = {}): CarState =>
  ({ ...initRace(c).cars[0]!, penalty: pen, ...patch })

describe('track limits (spec §8.2)', () => {
  it('the chance follows pace mode, consistency and weather', () => {
    const c = cfg()
    const car = withPen(c)
    const cons = c.drivers.find(d => d.id === car.driverId)!.facets.consistency
    const base = 0.012 / 3 * (1 - cons / 100 * 0.5)
    expect(trackLimitsChance(c, { ...car, paceMode: 'neutral' }, 'DRY')).toBeCloseTo(base, 15)
    expect(trackLimitsChance(c, { ...car, paceMode: 'push' }, 'DRY')).toBeCloseTo(base * 1.8, 15)
    expect(trackLimitsChance(c, { ...car, paceMode: 'neutral' }, 'DAMP')).toBeCloseTo(base * 1.5, 15)
  })

  it('three warnings, then 5 s for every further offence', () => {
    const c = cfg()
    let car = withPen(c)
    const kinds: string[][] = []
    for (let i = 0; i < 5; i++) {
      const r = recordTrackLimits(c, car, 10 + i, 1)
      car = { ...car, penalty: r.penalty }
      kinds.push(r.events.map(e => e.kind))
    }
    expect(kinds).toEqual([['track_limits'], ['track_limits'], ['track_limits'], ['track_limits', 'penalty_issued'], ['track_limits', 'penalty_issued']])
    expect(car.penalty).toEqual({ warnings: 5, pendingSec: 10, servedSec: 0 })
  })

  it('lapModel marks an offence at about the configured rate, without an extra draw', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 0.9 } } })
    const car = withPen(c, initPenalty(), { paceMode: 'push' })
    const p = trackLimitsChance(c, car, 'DRY')
    let hits = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      let draws = 0
      const base = createRng(1000 + i)
      const counting = () => { draws++; return base() }
      if (computeSectorTime(c, car, 0, counting, 'DRY', null).trackLimits) hits++
      expect(draws).toBe(2)
    }
    expect(hits / N).toBeGreaterThan(p - 0.03)
    expect(hits / N).toBeLessThan(p + 0.03)
  })

  it('never under a neutralisation (N3), never without the feature', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 1 } } })
    const car = withPen(c, initPenalty(), { paceMode: 'push' })
    const sc = { deployedLap: 1, lapsRemaining: 2, cause: 'crash' as const, kind: 'sc' as const }
    for (let i = 0; i < 50; i++) expect(computeSectorTime(c, car, 0, createRng(i), 'DRY', sc).trackLimits).toBeUndefined()
    const off = cfg({ penalties: { enabled: false } })
    expect(Object.keys(computeSectorTime(off, initRace(off).cars[0]!, 0, createRng(1))).includes('trackLimits')).toBe(false)
  })
})

describe('serving and unsafe release (spec §8.2)', () => {
  it('a pending penalty is served at the stop: 5 s stationary, logged', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 0 } } })
    const car = withPen(c, { warnings: 4, pendingSec: 5, servedSec: 0 })
    const clean = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, withPen(c), 'H', createRng(3))
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, car, 'H', createRng(3))
    expect(out.car.raceTime - clean.car.raceTime).toBeCloseTo(5, 9)
    expect(out.served).toBe(5)
    expect(out.car.penalty).toEqual({ warnings: 4, pendingSec: 0, servedSec: 5 })
    expect(out.events.map(e => e.kind)).toContain('penalty_served')
  })

  it('A PENDING PENALTY IS SERVED IN THE PROJECTED STOP, and the projection never rolls an unsafe release', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 1 } } })
    const car = withPen(c, { warnings: 4, pendingSec: 5, servedSec: 0 })
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, car, 'H', createRng(3), { allowSlow: false })
    expect(out.served).toBe(5)
    expect(out.unsafe).toBe(false)
  })

  it('an unsafe release issues a new pending penalty after serving the old one; stacked is likelier', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 1 } } })
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, withPen(c, { warnings: 0, pendingSec: 5, servedSec: 0 }), 'H', createRng(3))
    expect(out.unsafe).toBe(true)
    expect(out.car.penalty).toEqual({ warnings: 0, pendingSec: 5, servedSec: 5 })
    expect(out.events.map(e => e.kind)).toEqual(expect.arrayContaining(['penalty_served', 'unsafe_release', 'penalty_issued']))
    const d = cfg()
    expect(unsafeReleaseChance(d, 'apex', true)).toBeCloseTo(unsafeReleaseChance(d, 'apex', false) * 2.5, 15)
  })

  it('at the flag every pending penalty is added before the classification', () => {
    const c = cfg()
    const cars = initRace(c).cars.map((x, i) => ({ ...x, raceTime: i, penalty: { warnings: 0, pendingSec: i === 0 ? 5 : 0, servedSec: 0 } }))
    const r = addPendingAtFlag(cars, 33, 2)
    expect(r.cars[0]!.raceTime).toBe(5)
    expect(r.cars[0]!.penalty).toEqual({ warnings: 0, pendingSec: 0, servedSec: 5 })
    expect(r.events).toEqual([{ lap: 33, sector: 2, kind: 'penalty_added', driverId: cars[0]!.driverId, timeLoss: 5 }])
    expect(effectiveOrder({ cars }).map(x => x.driverId).indexOf(cars[0]!.driverId)).toBe(5)
  })

  it('end to end: a race with a pending penalty classifies the car behind its road position', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 0 } } })
    let s = initRace(c)
    // A naive car on hards with no planned stop never pits at veloce (34 laps), so the penalty reaches the flag.
    s = { ...s, cars: s.cars.map((x, i) => i === 0
      ? { ...x, compound: 'H' as const, strategy: { ...x.strategy, plannedStops: [], brain: 'naive' as const }, penalty: { warnings: 0, pendingSec: 30, servedSec: 0 } }
      : x) }
    const rng = createRng(7)
    const MAX_STEPS = c.circuit.laps * 3
    for (let i = 0; i < MAX_STEPS; i++) s = stepSector(c, s, rng)
    expect(s.incidents.some(e => e.kind === 'penalty_added' && e.driverId === initRace(c).cars[0]!.driverId)).toBe(true)
  })

  it('AI cover: no stop left and the car behind inside the penalty → push', () => {
    const c = cfg()
    const s = initRace(c)
    const me = { ...s.cars[0]!, raceTime: 100, pitsDone: 1, penalty: { warnings: 4, pendingSec: 5, servedSec: 0 }, strategy: { ...s.cars[0]!.strategy, brain: 'optimal' as const } }
    const st = { ...s, cars: [me, { ...s.cars[1]!, raceTime: 103 }, ...s.cars.slice(2).map((x, i) => ({ ...x, raceTime: 200 + i }))] }
    expect(aiPenaltyCoverPace(c, me, st, 0.3, 'neutral')).toBe('push')
    expect(aiPenaltyCoverPace(c, me, st, 0.8, 'neutral'), 'tyres too worn').toBe('neutral')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/penalties.test.ts`
Expected: FAIL — `@engine/penalties` not found.

- [ ] **Step 3: `penalties.ts`**

```ts
import type { CarState, IncidentEvent, PaceMode, PenaltyState, RaceConfig, RaceState, SectorIndex, WeatherState } from './types'
import { thermalWindow } from './thermal'

export function initPenalty(): PenaltyState { return { warnings: 0, pendingSec: 0, servedSec: 0 } }

/** Per-sector chance of exceeding track limits (spec §8.2). */
export function trackLimitsChance(config: RaceConfig, car: CarState, weather: WeatherState): number {
  const tl = config.tuning.penalties.trackLimits
  if (tl.chancePerLap <= 0) return 0
  const driver = config.drivers.find(d => d.id === car.driverId)!
  const hot = car.thermal ? thermalWindow(config, car, weather).excess > 0 : false
  return tl.chancePerLap / 3 * tl.paceModeFactor[car.paceMode] * (hot ? 1 + tl.hotFactor : 1)
    * (1 - driver.facets.consistency / 100 * tl.consistencyRelief) * tl.wetFactor[weather]
}

export function recordTrackLimits(config: RaceConfig, car: CarState, lap: number, sector: SectorIndex): { penalty: PenaltyState; events: IncidentEvent[] } {
  const p = config.tuning.penalties
  const prev = car.penalty!
  const warnings = prev.warnings + 1
  const events: IncidentEvent[] = [{ lap, sector, kind: 'track_limits', driverId: car.driverId, timeLoss: null }]
  if (warnings <= p.trackLimits.warningsAllowed) return { penalty: { ...prev, warnings }, events }
  events.push({ lap, sector, kind: 'penalty_issued', driverId: car.driverId, timeLoss: p.timePenaltySec })
  return { penalty: { ...prev, warnings, pendingSec: prev.pendingSec + p.timePenaltySec }, events }
}

export function unsafeReleaseChance(config: RaceConfig, teamId: string, stacked: boolean): number {
  const u = config.tuning.penalties.unsafeRelease
  const crew = config.teams.find(t => t.id === teamId)!.facets.pitCrew / 100
  return u.chance * (1 - crew * u.pitCrewRelief) * (stacked ? u.stackedFactor : 1)
}

export function addPendingAtFlag(cars: CarState[], lap: number, sector: SectorIndex): { cars: CarState[]; events: IncidentEvent[] } {
  const events: IncidentEvent[] = []
  const out = cars.map(c => {
    const pend = c.penalty?.pendingSec ?? 0
    if (c.retired || pend <= 0) return c
    events.push({ lap, sector, kind: 'penalty_added', driverId: c.driverId, timeLoss: pend })
    return { ...c, raceTime: c.raceTime + pend, penalty: { ...c.penalty!, pendingSec: 0, servedSec: c.penalty!.servedSec + pend } }
  })
  return { cars: out, events }
}

export function effectiveOrder(state: Pick<RaceState, 'cars'>): CarState[] {
  return state.cars.filter(c => !c.retired)
    .sort((a, b) => (a.raceTime + (a.penalty?.pendingSec ?? 0)) - (b.raceTime + (b.penalty?.pendingSec ?? 0)))
}

/** Smart/optimal with a penalty and no stop left: build the gap (spec §8.2). Pure. */
export function aiPenaltyCoverPace(config: RaceConfig, car: CarState, state: RaceState, cliffFrac: number, proposed: PaceMode): PaceMode {
  const pend = car.penalty?.pendingSec ?? 0
  if (pend <= 0 || (car.strategy.brain ?? 'naive') === 'naive' || car.strategy.plannedStops[car.pitsDone] || cliffFrac >= 0.7) return proposed
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const behind = sorted[sorted.findIndex(c => c.driverId === car.driverId) + 1]
  return behind && behind.raceTime - car.raceTime < pend + config.tuning.penalties.aiCoverMargin ? 'push' : proposed
}
```

- [ ] **Step 4: Wire it**

`lapModel.ts`, after the spin block and before `raw0`:

```ts
  // Track limits (spec §8.2, ruling N2): the lower tail of noise2, which a
  // non-spinning sector does not otherwise use. No draw; none under yellow (N3).
  let trackLimits = false
  if (car.penalty && safetyCar === null && spinLoss === 0) {
    const p = trackLimitsChance(config, car, weatherState)
    if (p > 0 && normalCdf(noise2) < p) trackLimits = true
  }
```

and append `...(trackLimits ? { trackLimits: true as const } : {})` as the last property of the returned `SectorResult`.

`race.ts`: `initRace` → `...(config.tuning.penalties.enabled ? { penalty: initPenalty() } : {}),` after the thermal spread. In the step-1 map, after the ERS update: `if (result.trackLimits && updated.penalty) { const r = recordTrackLimits(config, updated, car.lap, sector); updated = { ...updated, penalty: r.penalty }; newIncidents.push(...r.events) }`. In the flag block, after the two-compound map: `const flag = isRaceEnd && config.tuning.penalties.enabled ? addPendingAtFlag(carsBeforeSort, state.lap, sector) : null` — use `flag?.cars ?? carsBeforeSort` for the sort and push `flag.events`. In the AI branch, after the resource modes: `if (updated.penalty) updated.paceMode = aiPenaltyCoverPace(config, updated, stateForAI, cliffFracNow, updated.paceMode)` (compute `cliffFracNow` once with `tyreCliffFraction(effectiveTyreAge(...))`).

`pitStop.ts` `executeStop`, replacing `const served = 0` and the tail:

```ts
  const pen = config.tuning.penalties
  const served = pen.enabled ? car.penalty?.pendingSec ?? 0 : 0
  // … add, slow_stop, queue as before …
  if (served > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'penalty_served', driverId: car.driverId, timeLoss: served })
  const unsafe = pen.enabled && opts.allowSlow !== false &&
    normalCdf(cost.releaseDraw) < unsafeReleaseChance(config, car.teamId, queue > 0)
  if (unsafe) {
    events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'unsafe_release', driverId: car.driverId, timeLoss: null })
    events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'penalty_issued', driverId: car.driverId, timeLoss: pen.timePenaltySec })
  }
  const fitted = fitTyres(config, car, compound, add)
  const stopped = car.penalty && pen.enabled
    ? { ...fitted, penalty: { ...car.penalty, pendingSec: unsafe ? pen.timePenaltySec : 0, servedSec: car.penalty.servedSec + served } }
    : fitted
  return { car: stopped, cost, queue, served, unsafe, boxFree, events }
```

(`unsafe` uses the lower tail of `g2`; the slow stop uses the upper tail, so the two cannot both happen and no draw is added. With penalties off nothing here runs.)

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/penalties.test.ts tests/engine/doubleStack.test.ts tests/engine/executeStop.test.ts tests/engine/slowStop.test.ts tests/engine/byteIdentity.test.ts tests/engine/lapModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/penalties.ts src/engine/lapModel.ts src/engine/race.ts src/engine/pitStop.ts src/engine/index.ts tests/engine/penalties.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): penalties -- track limits, unsafe release, served at the stop or added at the flag

Spec 2026-10-24 §8.2, rulings N1-N3. Track limits read the lower tail of
lapModel's spare noise2 and unsafe release the lower tail of pitStopTime's g2:
no new draws. Three warnings, then 5 s per offence. A pending penalty is served
in the next stop (also in the projection, which never rolls an unsafe release)
or added at the flag before classification. AI with a penalty and no stop left
pushes to cover it. Shipped off.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Penalties on screen — steward toast, "+5" chips, effective position, pit panel and timer, lap chart (spec §8.1, §8.3)

**Files:**
- Create: `src/ui/StewardToast.tsx`
- Modify: `src/state/towerV2.ts` (already carries `penaltySec`), `src/ui/TimingTower.tsx` ("+5" chip, player readout), `src/ui/PitPanel.tsx`, `src/ui/PitTimer.tsx`, `src/ui/RaceHUD.tsx`, `src/engine/raceHistory.ts` (`penaltyLaps`), `src/ui/LapChart.tsx`, `src/ui/RaceResult.tsx` ("+5s added"), `src/state/radioMapper.ts`, `src/data/radio.json`, `src/data/commentary.json`, `src/state/commentaryMapper.ts`
- Test: `tests/ui/penaltyPresentation.test.tsx`, `tests/engine/raceHistory.test.ts` (one case)

**Interfaces:**
- Consumes: `effectiveOrder` (Task 18), incidents `track_limits` / `penalty_issued` / `penalty_served` / `penalty_added` / `unsafe_release`.
- Produces:
  - `stewardMessage(ev: IncidentEvent, warningsAllowed: number, warnings: number): { text: string; tone: 'caution' | 'hot' } | null`
  - `playerEffectivePosition(state: RaceState): { road: number; after: number } | null`
  - `CarHistory.penaltyLaps: number[]` (1-based lap of each `penalty_issued`)

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/penaltyPresentation.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { stewardMessage, StewardToast } from '@ui/StewardToast'
import { playerEffectivePosition } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

const ev = (kind: 'track_limits' | 'penalty_issued' | 'unsafe_release' | 'penalty_served', timeLoss: number | null = null) =>
  ({ lap: 5, sector: 1 as const, kind, driverId: 'd_voss', timeLoss })

describe('penalties on screen (spec §8.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('steward messages: warnings in caution, penalties in hot, words not colour', () => {
    expect(stewardMessage(ev('track_limits'), 3, 2)).toEqual({ text: 'TRACK LIMITS · WARNING 2/3', tone: 'caution' })
    expect(stewardMessage(ev('penalty_issued', 5), 3, 4)).toEqual({ text: '5s TIME PENALTY', tone: 'hot' })
    expect(stewardMessage(ev('unsafe_release'), 3, 0)).toEqual({ text: 'UNSAFE RELEASE — UNDER INVESTIGATION', tone: 'caution' })
    expect(stewardMessage(ev('penalty_served', 5), 3, 0)).toEqual({ text: '5s PENALTY SERVED', tone: 'caution' })
  })

  it('road position and position after penalties', () => {
    const c = { ...makeConfig({}, 2, 'veloce'), playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ penalties: { enabled: true } }) }
    const s = initRace(c)
    const cars = s.cars.map((x, i) => ({ ...x, raceTime: i * 2, position: i + 1, penalty: { warnings: 0, pendingSec: x.isPlayer ? 5 : 0, servedSec: 0 } }))
    expect(playerEffectivePosition({ ...s, cars })).toEqual({ road: 1, after: 3 })
  })

  it('the toast is a polite live region and names the penalty in text', () => {
    const c = { ...makeConfig({}, 2, 'veloce'), playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ penalties: { enabled: true } }) }
    const s = initRace(c)
    useRaceStore.setState({ config: c, raceState: { ...s, incidents: [ev('penalty_issued', 5)] }, phase: 'racing' })
    render(<StewardToast />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('5s TIME PENALTY')
  })
})
```

Append to `tests/engine/raceHistory.test.ts` (it already imports `makeConfig`, `makeDeterministicTuning`, `lapHistory`):

```ts
describe('lapHistory penalties (2.0, spec §8.3)', () => {
  it('records the 1-based lap of every penalty issued', () => {
    const base = makeConfig({}, 9, 'veloce')
    // Every offence is a penalty (no warnings) and offences are frequent, so some car is penalised.
    const config: RaceConfig = { ...base, tuning: makeDeterministicTuning({ penalties: { enabled: true, trackLimits: { chancePerLap: 1, warningsAllowed: 0 } } }) }
    const h = lapHistory(config, config.seed, [])
    const laps = h.cars.flatMap(c => c.penaltyLaps)
    expect(laps.length).toBeGreaterThan(0)
    for (const l of laps) { expect(l).toBeGreaterThanOrEqual(1); expect(l).toBeLessThanOrEqual(h.totalLaps) }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/ui/penaltyPresentation.test.tsx tests/engine/raceHistory.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement**

`src/ui/StewardToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { useReducedMotion, snapIn } from '@ui/kit'
import type { IncidentEvent } from '@engine/types'

export function stewardMessage(ev: IncidentEvent, warningsAllowed: number, warnings: number): { text: string; tone: 'caution' | 'hot' } | null {
  switch (ev.kind) {
    case 'track_limits': return warnings <= warningsAllowed ? { text: `TRACK LIMITS · WARNING ${warnings}/${warningsAllowed}`, tone: 'caution' } : null
    case 'penalty_issued': return { text: `${ev.timeLoss ?? 5}s TIME PENALTY`, tone: 'hot' }
    case 'unsafe_release': return { text: 'UNSAFE RELEASE — UNDER INVESTIGATION', tone: 'caution' }
    case 'penalty_served': return { text: `${ev.timeLoss ?? 5}s PENALTY SERVED`, tone: 'caution' }
    default: return null
  }
}

/** The player's steward decisions, newest first, one at a time (spec §8.3). */
export function StewardToast() {
  const incidents = useRaceStore(s => s.raceState?.incidents)
  const me = useRaceStore(s => s.raceState?.cars.find(c => c.isPlayer))
  const allowed = useRaceStore(s => s.config?.tuning.penalties.trackLimits.warningsAllowed ?? 3)
  const seen = useRef(0)
  const [msg, setMsg] = useState<{ text: string; tone: 'caution' | 'hot'; id: number } | null>(null)
  const { impact } = useHaptics()
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!incidents || !me) return
    const mine = incidents.filter(i => i.driverId === me.driverId)
    const fresh = mine.slice(seen.current)
    seen.current = mine.length
    let warnings = me.penalty?.warnings ?? 0
    for (const ev of fresh.reverse()) {
      const m = stewardMessage(ev, allowed, warnings)
      if (ev.kind === 'track_limits') warnings--
      if (m) { setMsg({ ...m, id: Date.now() }); impact(m.tone === 'hot' ? ImpactStyle.Heavy : ImpactStyle.Light); break }
    }
  }, [incidents, me, allowed, impact])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) }, [msg])
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', top: 'calc(var(--safe-top) + 56px)', left: 12, right: 12, pointerEvents: 'none' }}>
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.id} {...snapIn(reduced)} className="slant-md"
            style={{ background: msg.tone === 'hot' ? 'var(--hot)' : 'var(--caution)', color: 'var(--ink)', padding: '8px 14px',
              fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 18 }}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

(`useHaptics()` returns `{ impact, success, warning, … }`; `impact(style)` is fire-and-forget.)

`TimingTower.tsx`: export

```ts
export function playerEffectivePosition(state: RaceState): { road: number; after: number } | null {
  const me = state.cars.find(c => c.isPlayer)
  if (!me || me.retired || !(me.penalty && me.penalty.pendingSec > 0)) return null
  return { road: me.position, after: effectiveOrder(state).findIndex(c => c.isPlayer) + 1 }
}
```

A row with `v2Row.penaltySec > 0` shows a hot `+5` chip (ink text, tabular, `aria-label` "five second penalty pending"). Under the tower, when `playerEffectivePosition` is non-null: `P{road} ▸ P{after} after +{sec}s` with ▼ in hot when `after > road` (gain ▲ is impossible here; the arrow is the non-colour signal).

`PitPanel.tsx`: when the player has `pendingSec > 0`, a hot line `Serves +5s penalty at this stop`. `PitTimer.tsx`: when the stop's `penalty_served` incident is present, count the served seconds in hot first ("PENALTY 5.0"). `RaceHUD.tsx`: mount `<StewardToast />`.

`raceHistory.ts`: `CarHistory.penaltyLaps: number[]` initialised `[]`; after the replay, for each `penalty_issued` incident push `ev.lap + 1` to that car. `LapChart.tsx`: a hot `+5` glyph (10 px Big Shoulders) on the line at each `penaltyLaps` lap; included in the text summary ("5-second penalty on lap 31"). `RaceResult.tsx`: under the player's position, "+5s added" when a `penalty_added` incident names the player.

Radio/commentary: `V2_RADIO.penalty_issued = 'penalty'`, `V2_RADIO.unsafe_release = 'unsafe_release'`; `radio.json` `"penalty": ["Five-second penalty. We serve it at the stop — or build the gap.", "That's a five. Push, we need the margin."], "unsafe_release": ["Unsafe release, they're looking at it."], "track_limits_last": ["That's your last warning on track limits."]` (the last one fires on the warning that equals `warningsAllowed`). `commentary.json` + `commentaryMapper.ts`: one line each for `penalty_issued` and `penalty_added` for any car ("{code} handed a five-second penalty.").

- [ ] **Step 4: Run**

Run: `npx vitest run tests/ui/penaltyPresentation.test.tsx tests/engine/raceHistory.test.ts tests/ui/lapChart.test.tsx tests/ui/raceResultBold.test.tsx tests/state/commentaryMapper.test.ts tests/state/radioMapper.test.ts tests/ui/timingTowerFlash.test.tsx tests/ui/towerV2.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/StewardToast.tsx src/ui/TimingTower.tsx src/ui/PitPanel.tsx src/ui/PitTimer.tsx src/ui/RaceHUD.tsx src/engine/raceHistory.ts src/ui/LapChart.tsx src/ui/RaceResult.tsx src/state/radioMapper.ts src/state/commentaryMapper.ts src/data/radio.json src/data/commentary.json tests/ui/penaltyPresentation.test.tsx tests/engine/raceHistory.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): penalties -- steward toast, +5 chips, P4 > P6 after +5s, served/added

Spec 2026-10-24 §8.1/§8.3. Warnings in caution, penalties in hot with a heavy
haptic; the tower marks pending penalties and shows the player's position
after them; the pit panel and timer show a penalty being served; the lap chart
and result screen record penalties issued and added.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: 2.0b switched on — fuel, ERS, double-stack, penalties; bands, scenarios, MODEL_SPEC §17.2, phone pass

Same switch-on procedure as Task 12: fuel → ERS → double-stack → penalties, measuring after each.

**Files:**
- Modify: `src/data/tuning.json` (switches; bands), `src/data/validators.ts`, `tests/engine/monteCarloHarness.ts`, `tests/engine/v2Bands.test.ts`, `tests/engine/monteCarlo.test.ts`, `src/data/scenarios.json` (if moved), tests needing `withV2Off`, `MODEL_SPEC.md` §3 and §17.2, `docs/V2-CHECKLIST.md`

**Interfaces:**
- Consumes: Tasks 13–19.
- Produces: `Metrics.doubleStacksPerRace`, `.penaltiesPerRace`, `.unsafeReleasesPerRace`, diagnostics `.trackLimitWarningsPerRace`, `.fuelCriticalPerRace`, `.meanFinalFuelMargin`; bands `doubleStacksPerRace`, `penaltiesPerRace`, `unsafeReleasesPerRace`.

- [ ] **Step 1: Harness metrics**

Add to `Metrics` and `runRaces` (counted from `state.incidents` after each race): `doubleStacksPerRace` (`double_stack`), `penaltiesPerRace` (`penalty_issued`), `unsafeReleasesPerRace` (`unsafe_release`), `trackLimitWarningsPerRace` (`track_limits`), `fuelCriticalPerRace` (`fuel_critical`), and `meanFinalFuelMargin` = mean over running cars of `fuelMarginLaps(car, raceLaps(config))` at the flag (0 when fuel off). Extend the `MEASURE 2.0` console line with `stacks=… pens=… unsafe=… tl=… fuelCrit=… fuelEnd=…`.

- [ ] **Step 2: Failing gates**

Append to `tests/engine/v2Bands.test.ts`:

```ts
  it('2.0b rates are inside their bands, and live', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    for (const k of ['doubleStacksPerRace', 'penaltiesPerRace', 'unsafeReleasesPerRace'] as const) {
      expect(m[k], `${k} must be live`).toBeGreaterThan(0)
      expect(m[k], k).toBeGreaterThanOrEqual(b[k][0])
      expect(m[k], k).toBeLessThanOrEqual(b[k][1])
    }
    expect(m.meanFinalFuelMargin, 'invariant: the AI field is never badly short at the flag').toBeGreaterThanOrEqual(-0.4)
  })
```

Run: `npx vitest run tests/engine/v2Bands.test.ts -t "2.0b rates"` — Expected: FAIL (all zero, bands undefined).

- [ ] **Step 3: One feature at a time**

`MEASURE=1 FEATURE=<name> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.0" --reporter=verbose 2>&1 | grep MEASURE` after each switch, recording four lines:
1. `fuel`: `fuelModel.enabled` → `true`.
2. `ers`: `ers.enabled` → `true` (fallback `attackOvertakeAdv` 0.15 → 0.08).
3. `stack`: `doubleStack.enabled` → `true` (fallback `maxQueueNeutralised.smart` 6 → 4).
4. `penalties`: `penalties.enabled` → `true` (fallback `trackLimits.chancePerLap` 0.012 → 0.006).

Apply the switch-on procedure's band check, fallback and ship-off rule after each. Also run `MEASURE weather` on the showery circuits once at the end (fuel and ERS change pace in the rain). STOP sanity limits as in Task 12, plus `fuelEnd < −0.6`.

- [ ] **Step 4: Bands, well-formedness, gates**

Size `doubleStacksPerRace`, `penaltiesPerRace`, `unsafeReleasesPerRace` by the band rule (a floor that rounds to 0.00 is acceptable for `unsafeReleasesPerRace`: the "live" assertion carries it). Write them to `tuning.json._regressionBands`, `validators.ts`, the `_note` (one sentence: "2.0b: …, MODEL_SPEC §17.2"), and well-formedness asserts in `monteCarlo.test.ts`. Run the full band list from Task 12 Step 4 plus `tests/engine/v2Bands.test.ts`; expected PASS.

- [ ] **Step 5: Other tests, scenarios, golden**

As Task 12 Steps 5–7: `withV2Off` for tests whose subject is not 2.0; re-author scenarios; byteIdentity and v2Foundations pass with the fixture untouched. Also run `npx vitest run tests/state/powerUnitAssist.test.ts tests/ui/raceSetupBold.test.tsx` — the FUEL LOAD case now asserts the control is shown.

- [ ] **Step 6: MODEL_SPEC §17.2 and §3**

Rows for the three new bands (same table shape as Task 12). `### 17.2 2.0b — power and pit lane`: MEASURE lines verbatim per switch, fallbacks/ship-offs with their numbers, the diagnostics (warnings/race, fuel-critical/race, final margin), and one paragraph on the zero-draw construction of track limits and unsafe release (noise2 lower tail; g2 lower tail beside the slow stop's upper tail).

- [ ] **Step 7: Phone feel-test (2.0b)**

Append to `docs/V2-CHECKLIST.md`:

```markdown
### 2.0b: power & pit lane (Tasks 13–20)

Local release APK, not published (ruling A6).

**Phone pass:** FUEL LOAD at setup (LIGHT starts ~1.4 L short at a 56-lap race); the fuel gauge
counts down and SAVE recovers ~0.1 L a lap; going 0.3 L short triggers LIFT & COAST with one
warning haptic and a radio line; a safety car visibly refills the margin; the battery drains on
ATTACK and refills on HARVEST, FLAT reads at 0; ATTACK/DEFEND chips slide in within a second of a
car and respond inside 100 ms; ASSISTED changes modes on its own at lap ends and a manual tap stops
it; both team cars boxing under the SC queue (PitTimer shows QUEUE first; radio "you first"); a
track-limits warning toast, then a 5 s penalty with a heavy haptic, "+5" on the tower and
"P4 ▸ P6 after +5s"; staying out to the flag adds it; boxing serves it (PitTimer PENALTY 5.0); 60 fps
with the PU sheet open over the canvas.

**Calls for Veet after the pass:** fuel margins and SAVE 0.30 s/lap; ERS ±0.30 s and 40%/lap; the
assist default; double-stack limits; track limits 0.012/lap and three warnings; unsafe release 1.5%.
```

- [ ] **Step 8: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts src/data/scenarios.json tests/engine/monteCarloHarness.ts tests/engine/v2Bands.test.ts tests/engine/monteCarlo.test.ts MODEL_SPEC.md docs/V2-CHECKLIST.md
git commit -m "$(cat <<'EOF'
feat(balance): 2.0b switched on -- fuel, ERS, double-stack, penalties

Spec 2026-10-24 §12-§13. Each switched on alone and measured over four n=240
cells; every existing band holds (MODEL_SPEC §17.2 has the lines and any
fallback). New bands doubleStacksPerRace, penaltiesPerRace,
unsafeReleasesPerRace. AI field's final fuel margin >= -0.4 laps. Golden race
unchanged. Scenarios re-authored where moved: (list). withV2Off added to: (list).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Replace both "(list)" with the actual lists before committing (write "none" if empty).

---

# Slice 2.0c — The strategist's tools

### Task 21: Team orders — compliance by hash, swap / hold / yield, lapse, AI team swaps (spec §2.2, rulings T1, T3, T4)

**Files:**
- Create: `src/engine/teamOrders.ts`
- Modify: `src/engine/race.ts` (execute after overtakes; hold pair in `resolveOvertakes`; AI swaps at lap ends; `teamOrder` carried/dropped), `src/engine/playerCalls.ts` (`team_order` call), `src/engine/index.ts`
- Test: `tests/engine/teamOrders.test.ts`

**Interfaces:**
- Consumes: `hash01`, `stringHash` (Task 1), `paceAdvantage` (Task 13), `RaceConfig.teamMateAheadInStandings`.
- Produces:
  - `teamMateOf(state: Pick<RaceState, 'cars'>, driverId: string): CarState | undefined`
  - `complianceChance(config: RaceConfig, state: RaceState, order: 'swap' | 'hold'): number`
  - `applyTeamOrder(config: RaceConfig, state: RaceState, step: number, order: TeamOrderKind): RaceState`
  - `swapTimes(config: RaceConfig, passer: CarState, yielder: CarState): { passer: CarState; yielder: CarState }`
  - `executeTeamOrders(config: RaceConfig, state: RaceState, active: CarState[], lap: number, sector: SectorIndex): { active: CarState[]; teamOrder: TeamOrderState | undefined; events: IncidentEvent[] }`
  - `holdPair(state: RaceState): readonly [string, string] | null`
  - `aiTeamSwaps(config: RaceConfig, active: CarState[], lap: number, sector: SectorIndex): { active: CarState[]; events: IncidentEvent[] }`
  - `PlayerCall` member `{ step: number; kind: 'team_order'; order: TeamOrderKind }`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/teamOrders.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  teamMateOf, complianceChance, applyTeamOrder, swapTimes, executeTeamOrders, holdPair, aiTeamSwaps,
} from '@engine/teamOrders'
import { applyCall } from '@engine/playerCalls'
import { initRace, stepSector } from '@engine/race'
import { hash01, stringHash } from '@engine/hash'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

// The player is Chen (apex #2); his team-mate is Voss.
const cfg = (over = {}, extra: Partial<RaceConfig> = {}): RaceConfig =>
  ({ ...makeConfig({}, 21, 'veloce'), playerDriverId: 'd_chen', allDry: true, tuning: makeDeterministicTuning(over), ...extra })
/** Voss directly ahead of Chen by `gap`, everyone else far away. */
function pair(config: RaceConfig, gap: number, lap = 10): RaceState {
  const s = initRace(config)
  const cars = s.cars.map((c, i) => c.driverId === 'd_voss' ? { ...c, raceTime: 100, lap }
    : c.driverId === 'd_chen' ? { ...c, raceTime: 100 + gap, lap } : { ...c, raceTime: 300 + i * 5, lap })
  return { ...s, lap, cars }
}
/** A step at which the hash says yes (or no) for Voss at probability p. */
const stepWhere = (seed: number, p: number, yes: boolean) => {
  for (let k = 0; k < 500; k++) if ((hash01(seed, k, stringHash('d_voss')) < p) === yes) return k
  throw new Error('no step found')
}

describe('team orders (spec §2.2)', () => {
  it('finds the team-mate', () => {
    const c = cfg()
    expect(teamMateOf(initRace(c), 'd_chen')!.driverId).toBe('d_voss')
  })

  it('compliance: base, minus championship, minus prior swaps, minus late race, clamped', () => {
    const c = cfg()
    const s = pair(c, 0.5)
    expect(complianceChance(c, s, 'swap')).toBeCloseTo(0.85, 12)
    expect(complianceChance({ ...c, teamMateAheadInStandings: true }, s, 'swap')).toBeCloseTo(0.60, 12)
    const swapped = { ...s, incidents: [{ lap: 3, sector: 1 as const, kind: 'team_order_swap' as const, driverId: 'd_voss', timeLoss: 0.2 }] }
    expect(complianceChance(c, swapped, 'swap')).toBeCloseTo(0.70, 12)
    expect(complianceChance(c, { ...s, lap: s.totalLaps - 3 }, 'swap')).toBeCloseTo(0.70, 12)
    expect(complianceChance(c, s, 'hold')).toBeCloseTo(0.92, 12)
  })

  it('obeyed or refused by hash; refusal is logged and sets nothing (ruling T1)', () => {
    const c = cfg()
    const s = pair(c, 0.5)
    const yes = applyTeamOrder(c, s, stepWhere(c.seed, 0.85, true), 'swap')
    expect(yes.teamOrder).toEqual({ order: 'swap', issuedLap: 10, expiresLap: 13 })
    const no = applyTeamOrder(c, s, stepWhere(c.seed, 0.85, false), 'swap')
    expect('teamOrder' in no).toBe(false)
    expect(no.incidents.at(-1)).toMatchObject({ kind: 'team_order_ignored', driverId: 'd_voss' })
    const k = stepWhere(c.seed, 0.85, true)
    expect(applyTeamOrder(c, s, k, 'swap')).toEqual(applyTeamOrder(c, s, k, 'swap'))
  })

  it('swap mechanics: yielder behind the passer by margin − loss', () => {
    const c = cfg()
    const s = pair(c, 0.5)
    const voss = s.cars.find(x => x.driverId === 'd_voss')!, chen = s.cars.find(x => x.driverId === 'd_chen')!
    const r = swapTimes(c, chen, voss)
    expect(r.passer.raceTime).toBeCloseTo(100.5 + 0.20, 12)
    expect(r.yielder.raceTime).toBeCloseTo(100.5 + 0.35, 12)
  })

  it('an obeyed swap executes when adjacent within 1.5 s, and the order is consumed', () => {
    const c = cfg()
    const s = { ...pair(c, 0.8), teamOrder: { order: 'swap' as const, issuedLap: 10, expiresLap: 13 } }
    const active = s.cars.filter(x => !x.retired).sort((a, b) => a.raceTime - b.raceTime)
    const r = executeTeamOrders(c, s, active, 10, 1)
    const t = (id: string) => r.active.find(x => x.driverId === id)!.raceTime
    expect(t('d_chen')).toBeLessThan(t('d_voss'))
    expect(r.teamOrder).toBeUndefined()
    expect(r.events).toEqual([{ lap: 10, sector: 1, kind: 'team_order_swap', driverId: 'd_voss', timeLoss: 0.20 }])
  })

  it('A SWAP THAT NEVER BECOMES ADJACENT LAPSES', () => {
    const c = cfg()
    const s = { ...pair(c, 4.0, 14), teamOrder: { order: 'swap' as const, issuedLap: 10, expiresLap: 13 } }
    const active = s.cars.filter(x => !x.retired).sort((a, b) => a.raceTime - b.raceTime)
    const r = executeTeamOrders(c, s, active, 14, 0)
    expect(r.teamOrder).toBeUndefined()
    expect(r.events.map(e => e.kind)).toEqual(['team_order_lapsed'])
    expect(r.active).toBe(active)
  })

  it('hold: the pair never passes each other while it stands', () => {
    const c = cfg({ overtaking: { base: 0.85, paceGateMin: 0 } })
    let s: RaceState = { ...pair(c, 0.3), teamOrder: { order: 'hold', issuedLap: 10, expiresLap: 1e9 } }
    expect(holdPair(s)).toEqual(['d_chen', 'd_voss'].sort())
    const rng = createRng(4)
    for (let i = 0; i < 60; i++) s = stepSector(c, s, rng)
    expect(s.overtakeEvents.some(e => [e.overtakerId, e.overtakenId].sort().join() === 'd_chen,d_voss')).toBe(false)
  })

  it('no swap under a neutralisation (T4)', () => {
    const c = cfg()
    const s = { ...pair(c, 0.5), safetyCar: { deployedLap: 9, lapsRemaining: 2, cause: 'crash' as const, kind: 'vsc' as const }, teamOrder: { order: 'swap' as const, issuedLap: 10, expiresLap: 13 } }
    const next = stepSector(c, s, createRng(1))
    expect(next.teamOrder).toEqual(s.teamOrder)
  })

  it('yield via the call: always obeyed, the player drops behind', () => {
    const c = cfg()
    const s0 = pair(c, 0.5)
    const s = { ...s0, cars: s0.cars.map(x => x.driverId === 'd_voss' ? { ...x, raceTime: 100.5 } : x.driverId === 'd_chen' ? { ...x, raceTime: 100 } : x) }
    const next = applyCall(c, s, { step: 30, kind: 'team_order', order: 'yield' }, createRng(1))
    expect(next.teamOrder!.order).toBe('yield')
    const freed = applyCall(c, next, { step: 31, kind: 'team_order', order: 'free' }, createRng(1))
    expect('teamOrder' in freed).toBe(false)
  })

  it('AI teams swap a faster car stuck behind its team-mate; never the player team; off at 0', () => {
    const c = cfg({ teamOrders: { aiSwapStuckLaps: 3 } }, { playerDriverId: '__none__' })
    const s = initRace(c)
    // Rossi (pace 96) on fresh tyres behind Haas (84) on 15-lap-old ones: driver edge 0.12 + freshness 0.16 = 0.28 s/lap > 0.25.
    const front = { ...s.cars.find(x => x.driverId === 'd_haas')!, raceTime: 100, tyreAge: 15, strategy: { ...s.cars.find(x => x.driverId === 'd_haas')!.strategy, brain: 'smart' as const } }
    const rear = { ...s.cars.find(x => x.driverId === 'd_rossi')!, raceTime: 100.6, tyreAge: 0, lapsInDirtyAir: 3, strategy: { ...front.strategy } }
    const others = s.cars.filter(x => x.teamId !== 'meridian').map((x, i) => ({ ...x, raceTime: 300 + i }))
    const r = aiTeamSwaps(c, [front, rear, ...others], 12, 2)
    expect(r.events.map(e => e.kind)).toEqual(['team_order_swap'])
    expect(r.active.find(x => x.driverId === 'd_rossi')!.raceTime).toBeLessThan(r.active.find(x => x.driverId === 'd_haas')!.raceTime)
    const off = cfg({}, { playerDriverId: '__none__' })
    expect(aiTeamSwaps(off, [front, rear, ...others], 12, 2).events).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/teamOrders.test.ts`
Expected: FAIL — `@engine/teamOrders` not found.

- [ ] **Step 3: `teamOrders.ts`**

```ts
import type { CarState, IncidentEvent, RaceConfig, RaceState, SectorIndex, TeamOrderKind, TeamOrderState } from './types'
import { hash01, stringHash } from './hash'
import { paceAdvantage } from './pace'

export function teamMateOf(state: Pick<RaceState, 'cars'>, driverId: string): CarState | undefined {
  const me = state.cars.find(c => c.driverId === driverId)
  return me ? state.cars.find(c => c.teamId === me.teamId && c.driverId !== driverId) : undefined
}

/** Spec §2.2. Hidden from the player as a number (ruling T2). */
export function complianceChance(config: RaceConfig, state: RaceState, order: 'swap' | 'hold'): number {
  const k = config.tuning.teamOrders.compliance
  const me = state.cars.find(c => c.isPlayer)!
  const mate = teamMateOf(state, me.driverId)!
  const ahead = config.teamMateAheadInStandings === true
  const clamp = (x: number) => Math.min(k.max, Math.max(k.min, x))
  if (order === 'hold') return clamp(k.holdBase - (ahead && mate.raceTime > me.raceTime ? k.championshipAhead : 0))
  const prior = state.incidents.filter(i => i.kind === 'team_order_swap' && i.driverId === mate.driverId).length
  const late = state.totalLaps - state.lap <= k.lateRaceLaps
  return clamp(k.base - (ahead ? k.championshipAhead : 0) - k.perPriorSwap * prior - (late ? k.lateRace : 0)
    + (paceAdvantage(config, me, mate) >= k.paceBonusAdv ? k.paceBonus : 0))
}

/** The team_order call (no rng; ruling T1). A missing or retired team-mate: the SAME state. */
export function applyTeamOrder(config: RaceConfig, state: RaceState, step: number, order: TeamOrderKind): RaceState {
  const me = state.cars.find(c => c.isPlayer)
  const mate = me ? teamMateOf(state, me.driverId) : undefined
  if (!me || !mate || me.retired || mate.retired) return state
  const { teamOrder: _old, ...rest } = state
  if (order === 'free') return state.teamOrder ? rest : state
  const set = (o: TeamOrderState['order']): RaceState =>
    ({ ...rest, teamOrder: { order: o, issuedLap: state.lap, expiresLap: state.lap + config.tuning.teamOrders.windowLaps } })
  if (order === 'yield') return set('yield')
  const obeyed = hash01(config.seed, step, stringHash(mate.driverId)) < complianceChance(config, state, order)
  if (obeyed) return order === 'hold' ? { ...rest, teamOrder: { order: 'hold', issuedLap: state.lap, expiresLap: Number.MAX_SAFE_INTEGER } } : set('swap')
  return { ...state, incidents: [...state.incidents, { lap: state.lap, sector: state.sector, kind: 'team_order_ignored', driverId: mate.driverId, timeLoss: null }] }
}

export function swapTimes(config: RaceConfig, passer: CarState, yielder: CarState): { passer: CarState; yielder: CarState } {
  const t = config.tuning.teamOrders
  return { passer: { ...passer, raceTime: passer.raceTime + t.swapLoss }, yielder: { ...yielder, raceTime: passer.raceTime + t.swapMargin } }
}

export function holdPair(state: RaceState): readonly [string, string] | null {
  if (state.teamOrder?.order !== 'hold') return null
  const me = state.cars.find(c => c.isPlayer)
  const mate = me ? teamMateOf(state, me.driverId) : undefined
  return me && mate ? ([me.driverId, mate.driverId].sort() as [string, string]) : null
}

function replaceTwo(active: CarState[], a: CarState, b: CarState): CarState[] {
  return active.map(c => (c.driverId === a.driverId ? a : c.driverId === b.driverId ? b : c))
}

/** Swap / yield execution at a sector end, green track only (T4). */
export function executeTeamOrders(config: RaceConfig, state: RaceState, active: CarState[], lap: number, sector: SectorIndex) {
  const order = state.teamOrder
  const none = { active, teamOrder: order, events: [] as IncidentEvent[] }
  if (!order || order.order === 'hold') return none
  if (lap > order.expiresLap) {
    const me = state.cars.find(c => c.isPlayer)!
    return { active, teamOrder: undefined, events: [{ lap, sector, kind: 'team_order_lapsed' as const, driverId: me.driverId, timeLoss: null }] }
  }
  const sorted = [...active].sort((a, b) => a.raceTime - b.raceTime)
  const pi = sorted.findIndex(c => c.isPlayer)
  const me = sorted[pi]
  if (!me) return none
  // swap: the mate is directly ahead and yields; yield: the mate is directly behind and the player yields.
  const other = order.order === 'swap' ? sorted[pi - 1] : sorted[pi + 1]
  if (!other || other.teamId !== me.teamId) return none
  const gap = Math.abs(me.raceTime - other.raceTime)
  if (gap > config.tuning.teamOrders.swapMaxGap) return none
  const [passer, yielder] = order.order === 'swap' ? [me, other] : [other, me]
  const r = swapTimes(config, passer, yielder)
  return {
    active: replaceTwo(active, r.passer, r.yielder),
    teamOrder: undefined,
    events: [{ lap, sector, kind: 'team_order_swap' as const, driverId: yielder.driverId, timeLoss: config.tuning.teamOrders.swapLoss }],
  }
}

/** AI teams' own swaps at a lap end (spec §2.2). Never the player's team. Pure. */
export function aiTeamSwaps(config: RaceConfig, active: CarState[], lap: number, sector: SectorIndex) {
  const t = config.tuning.teamOrders
  const events: IncidentEvent[] = []
  if (t.aiSwapStuckLaps <= 0) return { active, events }
  let cars = active
  const sorted = [...active].sort((a, b) => a.raceTime - b.raceTime)
  for (let i = 1; i < sorted.length; i++) {
    const rear = sorted[i]!, front = sorted[i - 1]!
    if (rear.teamId !== front.teamId || rear.isPlayer || front.isPlayer) continue
    if ((rear.strategy.brain ?? 'naive') === 'naive') continue
    if (rear.raceTime - front.raceTime > config.tuning.traffic.gapThreshold || rear.lapsInDirtyAir < t.aiSwapStuckLaps) continue
    if (paceAdvantage(config, rear, front) < t.aiSwapMinAdv) continue
    const r = swapTimes(config, rear, front)
    cars = replaceTwo(cars, r.passer, r.yielder)
    events.push({ lap, sector, kind: 'team_order_swap', driverId: front.driverId, timeLoss: t.swapLoss })
    i++ // a pair swaps at most once per lap end
  }
  return { active: cars, events }
}
```

Note: player-team check uses `isPlayer`, so with `playerDriverId: '__none__'` (the harness) every team may swap — the field-wide band counts them.

- [ ] **Step 4: Wire the race and the call**

`race.ts` `stepSector`: destructure `teamOrder: prevOrder` out of `state` beside `redFlagTyre` so the returned state only carries a live order. Pass `holdPair(state)` into `resolveOvertakes` (new final parameter `hold: readonly [string, string] | null`), and in its candidate loop `if (hold && [behind.driverId, ahead.driverId].sort().join() === hold.join()) continue`. After `afterOvertakesActive` is computed:

```ts
  let activeNow = afterOvertakesActive
  let teamOrder = prevOrder
  if (safetyCar === null && (teamOrder || (lapCompleted && config.tuning.teamOrders.aiSwapStuckLaps > 0))) {
    if (teamOrder) {
      const r = executeTeamOrders(config, state, activeNow, state.lap, sector)
      activeNow = r.active; teamOrder = r.teamOrder; newIncidents.push(...r.events)
    }
    if (lapCompleted) {
      const r = aiTeamSwaps(config, activeNow, state.lap, sector)
      activeNow = r.active; newIncidents.push(...r.events)
    }
  }
```

then use `activeNow` wherever `afterOvertakesActive` was used below (the `afterOvertakes` concat and the dirty-air sort), and append `...(teamOrder ? { teamOrder } : {})` to the returned state. With no order and `aiSwapStuckLaps` 0 nothing here runs.

`playerCalls.ts`: `| { step: number; kind: 'team_order'; order: TeamOrderKind }` and `case 'team_order': return applyTeamOrder(config, state, call.step, call.order)`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/teamOrders.test.ts tests/engine/byteIdentity.test.ts tests/engine/overtakeRaceTime.test.ts tests/engine/trafficOvertaking.test.ts tests/engine/playerCalls.test.ts tests/engine/replayFidelity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/teamOrders.ts src/engine/race.ts src/engine/playerCalls.ts src/engine/index.ts tests/engine/teamOrders.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): team orders -- swap/hold/yield with hashed compliance, lapse, AI team swaps

Spec 2026-10-24 §2.2, rulings T1/T3/T4. Orders act only on track position,
never on the team-mate's strategy. Compliance depends on championship order,
prior swaps, race phase and pace, and is decided by hash01(seed, step, mate):
no rng draw. Swaps execute at a sector end on a green track when the pair is
adjacent within 1.5 s, else lapse; hold suppresses passes between them. AI
teams swap a faster car stuck 3 laps behind its team-mate (off at 0).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Team orders on screen — TEAM sheet, radio answers, the team-mate's "let him by?" request, standings in the config (spec §2.1, §2.3, ruling T2, T3)

**Files:**
- Create: `src/ui/TeamOrdersSheet.tsx` (exports `TeamOrdersSheet`, `TeamButton`, `orderAvailability`, `orderHints`)
- Modify: `src/state/raceStore.ts` (`issueTeamOrder`, `teamSheetOpen`, `answerRadioRequest` case `yield`), `src/state/radioRequests.ts` (kind `yield`), `src/state/radioMapper.ts` (`requestLine` for `yield`; `V2_RADIO.team_order_ignored`), `src/data/radio.json`, `src/state/buildRaceConfig.ts` (`teamMateAhead` param), `src/state/raceStore.ts` `SeasonRaceOptions.teamMateAheadInStandings`, `src/ui/RaceWatcher.tsx` (computes it from standings), `src/ui/TimingTower.tsx` (team link bracket), `src/ui/RaceHUD.tsx`, `src/state/coachMarks.ts` (`team_orders`)
- Test: `tests/state/teamOrderFlow.test.tsx`, `tests/ui/teamOrdersSheet.test.tsx`

**Interfaces:**
- Consumes: `applyTeamOrder`, `teamMateOf`, `complianceChance` is NOT shown (ruling T2).
- Produces:
  - raceStore `issueTeamOrder(order: TeamOrderKind): void`, `teamSheetOpen: boolean`, `openTeamSheet()`, `closeTeamSheet()`
  - `RadioRequestKind = 'box' | 'push' | 'rain' | 'yield'`; `RequestTracker.yieldLapEnds: number`, `RequestTracker.yieldAsked: number`; `RadioRequest.aheadId` carries the team-mate id for `yield`
  - `orderAvailability(state: RaceState): { swap: boolean; swapReason: string | null; hold: boolean; free: boolean }`
  - `orderHints(config: RaceConfig, state: RaceState): string[]`
  - `buildRaceConfig(..., allDry = false, teamMateAhead = false)` → `config.teamMateAheadInStandings = true` only when true.

- [ ] **Step 1: Write the failing tests**

Create `tests/state/teamOrderFlow.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(), get: vi.fn(async () => ({ value: null })), remove: vi.fn() } }))

import { useRaceStore } from '@state/raceStore'
import { detectRadioRequest, makeRequestTracker } from '@state/radioRequests'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

function load(gap = 0.6) {
  const config = { ...makeConfig({}, 21, 'veloce'), playerDriverId: 'd_chen', allDry: true, tuning: makeDeterministicTuning() }
  const s = initRace(config)
  const cars = s.cars.map((c, i) => c.driverId === 'd_voss' ? { ...c, raceTime: 100, position: 1 } : c.driverId === 'd_chen' ? { ...c, raceTime: 100 + gap, position: 2 } : { ...c, raceTime: 300 + i, position: i + 3 })
  useRaceStore.setState({ phase: 'racing', config, raceState: { ...s, lap: 10, cars }, rng: createRng(1), stepCount: 30, playerCalls: [], hudAlerts: [] })
  return config
}

describe('team orders flow (spec §2.1)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('an order is a logged call and the radio answers it', () => {
    load()
    useRaceStore.getState().issueTeamOrder('swap')
    const st = useRaceStore.getState()
    expect(st.playerCalls).toEqual([{ step: 30, kind: 'team_order', order: 'swap' }])
    const answered = st.raceState!.teamOrder !== undefined || st.raceState!.incidents.some(i => i.kind === 'team_order_ignored')
    expect(answered).toBe(true)
    expect(st.hudAlerts.at(-1)!.message).toMatch(/let you by|says no/i)
  })

  it('the team-mate asks to be let through when faster and stuck behind for two lap ends', () => {
    const config = { ...makeConfig({}, 21, 'veloce'), playerDriverId: 'd_haas', allDry: true, tuning: makeDeterministicTuning() }
    const s = initRace(config)
    const lapState = (lap: number) => ({
      ...s, lap, sector: 0 as const,
      // Rossi is 0.12 s/lap quicker as a driver and on tyres 10 laps fresher (+0.11): 0.23 >= minAdv 0.15.
      cars: s.cars.map((c, i) => c.driverId === 'd_haas' ? { ...c, raceTime: 100, position: 1, lap, tyreAge: 10 }
        : c.driverId === 'd_rossi' ? { ...c, raceTime: 100.6, position: 2, lap, tyreAge: 0 }
        : { ...c, raceTime: 300 + i, position: i + 3, lap }),
    })
    const ctx = { inPit: false, pitPanelOpen: false, pending: false }
    const a = detectRadioRequest(lapState(10), config, makeRequestTracker(), ctx)
    expect(a.request).toBeNull()
    const b = detectRadioRequest(lapState(11), config, a.tracker, ctx)
    expect(b.request).toMatchObject({ kind: 'yield', aheadId: 'd_rossi' })
    const c = detectRadioRequest(lapState(12), config, b.tracker, ctx)
    expect(c.request, 'once per race').toBeNull()
  })

  it('YES to a yield request logs a yield order', () => {
    load()
    useRaceStore.setState({ radioRequest: { kind: 'yield', lap: 10, aheadId: 'd_voss', compound: null, id: 1, line: 'x' } })
    useRaceStore.getState().answerRadioRequest(true)
    expect(useRaceStore.getState().playerCalls.at(-1)).toEqual({ step: 30, kind: 'team_order', order: 'yield' })
  })

  it('standings reach the config only when the team-mate leads (ruling T3)', () => {
    expect('teamMateAheadInStandings' in buildRaceConfig(1, 'd_chen', 'veloce')).toBe(false)
    expect(buildRaceConfig(1, 'd_chen', 'veloce', 'pro', null, null, undefined, false, false, false, true).teamMateAheadInStandings).toBe(true)
  })
})
```

Create `tests/ui/teamOrdersSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamOrdersSheet, TeamButton, orderAvailability, orderHints } from '@ui/TeamOrdersSheet'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

function load(chenBehind = true) {
  const config = { ...makeConfig({}, 21, 'veloce'), playerDriverId: 'd_chen', allDry: true, tuning: makeDeterministicTuning(), teamMateAheadInStandings: true }
  const s = initRace(config)
  const cars = s.cars.map((c, i) => c.driverId === 'd_voss' ? { ...c, raceTime: chenBehind ? 100 : 101, position: chenBehind ? 1 : 2 }
    : c.driverId === 'd_chen' ? { ...c, raceTime: chenBehind ? 100.8 : 100, position: chenBehind ? 2 : 1 } : { ...c, raceTime: 300 + i, position: i + 3 })
  useRaceStore.setState({ phase: 'racing', config, raceState: { ...s, lap: 10, cars }, rng: createRng(1), stepCount: 30, playerCalls: [] })
  return config
}

describe('TEAM sheet (spec §2.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('LET ME THROUGH is available only with the team-mate ahead within 3 s, with a spoken reason otherwise', () => {
    load(true)
    expect(orderAvailability(useRaceStore.getState().raceState!)).toMatchObject({ swap: true, swapReason: null })
    load(false)
    expect(orderAvailability(useRaceStore.getState().raceState!)).toMatchObject({ swap: false, swapReason: 'He is not ahead of you' })
  })

  it('hints name the factors, never a percentage (ruling T2)', () => {
    const config = load(true)
    const hints = orderHints(config, useRaceStore.getState().raceState!)
    expect(hints).toContain('He leads you in the championship')
    expect(hints.join(' ')).not.toMatch(/%/)
  })

  it('the sheet is a labelled dialog with 44px+ orders that log calls', () => {
    load(true)
    render(<><TeamButton /><TeamOrdersSheet /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Team orders' }))
    expect(screen.getByRole('dialog', { name: 'Team orders' })).toBeTruthy()
    const swap = screen.getByRole('button', { name: /let me through/i })
    expect(parseInt(getComputedStyle(swap).minHeight, 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(swap)
    expect(useRaceStore.getState().playerCalls.at(-1)).toMatchObject({ kind: 'team_order', order: 'swap' })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/teamOrderFlow.test.tsx tests/ui/teamOrdersSheet.test.tsx`
Expected: FAIL — `issueTeamOrder`, the `yield` request and the sheet do not exist.

- [ ] **Step 3: Store, request, config**

`raceStore.ts`:

```ts
  issueTeamOrder(order) {
    const { config, raceState, rng, stepCount } = get()
    if (!config || !raceState || !rng) return
    const call = { step: stepCount, kind: 'team_order' as const, order }
    const next = applyCall(config, raceState, call, rng)
    const ignored = next.incidents.length > raceState.incidents.length && next.incidents.at(-1)!.kind === 'team_order_ignored'
    const line = order === 'free' ? 'Copy. Free to race.'
      : order === 'yield' ? 'Copy. Let him by.'
      : ignored ? pickLine('team_order_ignored') : pickLine(order === 'hold' ? 'team_order_hold' : 'team_order_swap')
    set(s => ({
      raceState: next, playerCalls: [...s.playerCalls, call], teamSheetOpen: false,
      hudAlerts: [...s.hudAlerts, { id: `alert-${++alertCounter}`, severity: ignored ? 'caution' as const : 'info' as const, category: 'RADIO', message: line, icon: '📻' }],
    }))
  },
```

(`pickLine(trigger)` = the exported line picker from `radioMapper.ts`; export the existing private `pick` as `pickLine(trigger: string, vars = {})`.) `answerRadioRequest`: `case 'yield': get().issueTeamOrder('yield'); break`. `teamSheetOpen`, `openTeamSheet`, `closeTeamSheet` like the PU sheet.

`radioRequests.ts`: `RadioRequestKind` adds `'yield'`; `makeRequestTracker` adds `lastAskedLap.yield: -1e9`, `yieldLapEnds: 0`, `yieldAsked: 0` (and the `detectRadioRequest` normaliser fills `yieldLapEnds ?? 0`, `yieldAsked ?? 0` for old trackers). Before `if (t.asked >= rr.maxPerRace)` add:

```ts
  // The team-mate asks to be let through (spec §2.1): faster, stuck behind, two lap ends.
  const yr = config.tuning.teamOrders.yieldRequest
  const mate = teamMateOf(state, player.driverId)
  const behind = state.cars.find(c => !c.retired && c.position === player.position + 1) ?? null
  const stuck = !!mate && !!behind && behind.driverId === mate.driverId && kind === null && consecutive &&
    mate.raceTime - player.raceTime <= yr.gap && paceAdvantage(config, mate, player) >= yr.minAdv
  t.yieldLapEnds = stuck ? t.yieldLapEnds + 1 : 0
  if (stuck && t.yieldLapEnds >= yr.lapEnds && t.yieldAsked < yr.maxPerRace && lapsLeft > yr.minLapsLeft && !state.teamOrder) {
    t.yieldAsked++
    t.lastAskedLap.yield = state.lap
    return { request: { kind: 'yield', lap: state.lap, aheadId: mate!.driverId, compound: null }, tracker: t }
  }
```

(Move the `lapsLeft` declaration above this block. A yield request does not count against `rr.maxPerRace`: it is the team-mate asking, not the driver.)

`radioMapper.ts` `requestLine`: `case 'yield': return pickLine('request_yield', { mate: code(aheadId) })`. `radio.json`: `"request_yield": ["{mate} is faster and stuck behind you. Let him through?"], "team_order_swap": ["Copy. He'll let you by.", "Message received. He's moving over."], "team_order_hold": ["Copy. Holding positions."], "team_order_ignored": ["He says no. He wants to race.", "He's not having it."]`; `V2_RADIO.team_order_lapsed = 'team_order_lapsed'` with `"team_order_lapsed": ["He never got close enough. Order's off."]`.

`buildRaceConfig.ts`: add the final parameter `teamMateAhead = false` and `if (teamMateAhead) config.teamMateAheadInStandings = true`. `SeasonRaceOptions` gains `teamMateAheadInStandings?: boolean`, passed through in `startSeasonRace`. `RaceWatcher.tsx` computes it from `useSeasonStore.getState().standings` (the player's team-mate has more points than the player) and passes it in the options object.

- [ ] **Step 4: Sheet and tower**

`src/ui/TeamOrdersSheet.tsx`:

```tsx
export function orderAvailability(state: RaceState) {
  const me = state.cars.find(c => c.isPlayer)
  const mate = me ? teamMateOf(state, me.driverId) : undefined
  const live = !!me && !!mate && !me.retired && !mate.retired
  const ahead = live && mate!.raceTime < me!.raceTime
  const near = live && Math.abs(me!.raceTime - mate!.raceTime) <= 3.0
  return {
    swap: live && ahead && near,
    swapReason: !live ? 'Your team-mate is out' : !ahead ? 'He is not ahead of you' : !near ? 'He is more than 3 seconds ahead' : null,
    hold: live && state.teamOrder?.order !== 'hold',
    free: !!state.teamOrder,
  }
}

export function orderHints(config: RaceConfig, state: RaceState): string[] {
  const out: string[] = []
  const k = config.tuning.teamOrders.compliance
  if (config.teamMateAheadInStandings) out.push('He leads you in the championship')
  if (state.totalLaps - state.lap <= k.lateRaceLaps) out.push('Late in the race')
  if (state.incidents.some(i => i.kind === 'team_order_swap' && i.driverId !== state.cars.find(c => c.isPlayer)?.driverId)) out.push('He has already moved over once')
  return out
}
```

`TeamButton`: 48 px slanted grape button `aria-label="Team orders"`, label `TEAM`, rendered when the player has a running team-mate. `TeamOrdersSheet`: a bottom sheet (`role="dialog"`, `aria-label="Team orders"`, focus moves to the first enabled order, Escape/back closes) with three 56 px slanted buttons: `LET ME THROUGH` (volt fill, ink text when available; grape with `aria-disabled` and the reason as `aria-description` and visible lilac-dim text otherwise), `HOLD POSITIONS`, `FREE TO RACE` (shown only when an order stands); hints in lilac-dim Barlow below. Each tap: Light haptic, `issueTeamOrder(...)`. Enter/exit like the PU sheet.

`TimingTower.tsx`: while `raceState.teamOrder` stands, a 2 px bracket in the team colour joins the player's and team-mate's rows (`aria-hidden`; both rows' labels gain ", team order: swap/hold"). A `team_order_swap` this step flashes both rows gain (the existing flash path); a `team_order_ignored` flashes the player's row hot.

`RaceHUD.tsx`: `<TeamButton />` in the lever row's overflow position (left of PU); `<TeamOrdersSheet />` beside the other sheets. Coach mark `team_orders` appended to `NEW_COACH_MARKS`, requested the first time the team-mate is directly ahead within 1.5 s: "Your team-mate is holding you up? TEAM → LET ME THROUGH. He may say no."

- [ ] **Step 5: Run**

Run: `npx vitest run tests/state/teamOrderFlow.test.tsx tests/ui/teamOrdersSheet.test.tsx tests/state/radioRequests.test.ts tests/state/radioRequestFlow.test.tsx tests/ui/pitButtonWithRequest.test.tsx tests/ui/newCoachMarks.test.tsx tests/state/buildRaceConfigSetups.test.ts tests/ui/raceHudBold.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TeamOrdersSheet.tsx src/state/raceStore.ts src/state/radioRequests.ts src/state/radioMapper.ts src/data/radio.json src/state/buildRaceConfig.ts src/ui/RaceWatcher.tsx src/ui/TimingTower.tsx src/ui/RaceHUD.tsx src/state/coachMarks.ts tests/state/teamOrderFlow.test.tsx tests/ui/teamOrdersSheet.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): team orders -- TEAM sheet, radio answers, the team-mate's yield request

Spec 2026-10-24 §2.1/§2.3, rulings T2/T3. LET ME THROUGH / HOLD POSITIONS /
FREE TO RACE as logged calls; the answer arrives on the radio; factors are
named, never a percentage. The AI team-mate asks to be let through when faster
and stuck behind for two lap ends (once a race). Season standings reach the
config only when the team-mate leads.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: The planner in the engine — sanitize, apply a re-plan, preview two plans with common random numbers (spec §6.2, rulings P2–P4)

**Files:**
- Create: `src/engine/planner.ts` (`sanitizeStops`, `applyReplan`), `src/engine/planPreview.ts` (`planPreview` — a separate module because it needs `simulate` from `debrief.ts`, which imports `playerCalls.ts`, which imports `planner.ts`; keeping the preview out of `planner.ts` avoids that import cycle)
- Modify: `src/engine/race.ts` (plan executes when `state.replanned`), `src/engine/redFlag.ts` (`restartTyre` honours a re-plan), `src/engine/playerCalls.ts` (`replan` call), `src/engine/debrief.ts` (export `finishPositionOf`), `src/engine/index.ts`
- Test: `tests/engine/planner.test.ts`

**Interfaces:**
- Consumes: `raceLaps` (Task 13), `resolveAllocatedCompound`, `consumeTyreSet`, `simulate`, `futureSeed`.
- Produces:
  - `sanitizeStops(config: RaceConfig, state: RaceState, stops: readonly PitStop[]): PitStop[]`
  - `applyReplan(config: RaceConfig, state: RaceState, stops: readonly PitStop[]): RaceState`
  - `interface PlanPreview { current: number[]; proposed: number[] }`
  - `planPreview(config: RaceConfig, state: RaceState, step: number, stops: readonly PitStop[], futures?: number): PlanPreview` (in `planPreview.ts`)
  - `finishPositionOf(state: RaceState): number` (debrief's `finishPosition`, exported)
  - `PlayerCall` member `{ step: number; kind: 'replan'; stops: PitStop[] }`
  - `restartTyre(config, car, weather, lapsLeft, chosen?, replanned?: boolean)`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/planner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeStops, applyReplan } from '@engine/planner'
import { planPreview } from '@engine/planPreview'
import { applyCall, applyPlanHold } from '@engine/playerCalls'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig, RaceState } from '@engine/types'

const cfg = (): RaceConfig => ({ ...makeConfig({}, 12, 'veloce'), playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning() })
function at(config: RaceConfig, laps: number): { s: RaceState; step: number } {
  let s = initRace(config)
  const rng = createRng(config.seed)
  for (let i = 0; i < laps * 3; i++) s = stepSector(config, s, rng)
  return { s, step: laps * 3 }
}

describe('planner (spec §6.2)', () => {
  it('sanitize: sorts, clamps to the future, enforces stint gaps, caps the count, resolves sets', () => {
    const c = cfg()
    const { s } = at(c, 10)
    const out = sanitizeStops(c, s, [{ lap: 30, compound: 'S' }, { lap: 14, compound: 'H' }, { lap: 16, compound: 'M' }, { lap: 22, compound: 'M' }, { lap: 26, compound: 'S' }])
    expect(out).toEqual([{ lap: 14, compound: 'H' }, { lap: 22, compound: 'M' }, { lap: 26, compound: 'S' }])
  })

  it('A REPLAN IN THE PAST IS CLAMPED, NEVER THROWS', () => {
    const c = cfg()
    const { s } = at(c, 20)
    expect(sanitizeStops(c, s, [{ lap: 2, compound: 'M' }])).toEqual([{ lap: 21, compound: 'M' }])
    expect(sanitizeStops(c, { ...s, lap: s.totalLaps - 1 }, [{ lap: 2, compound: 'M' }])).toEqual([{ lap: s.totalLaps - 1, compound: 'M' }])
    expect(() => applyReplan(c, { ...s, lap: s.totalLaps }, [{ lap: 2, compound: 'M' }])).not.toThrow()
  })

  it('a re-plan executes at its lap even without a race-setup plan, and keeps the executed prefix', () => {
    const c = cfg()
    const { s } = at(c, 10)
    const me0 = s.cars.find(x => x.isPlayer)!
    const r = applyReplan(c, s, [{ lap: 12, compound: 'H' }])
    expect(r.replanned).toBe(true)
    const me = r.cars.find(x => x.isPlayer)!
    expect(me.strategy.plannedStops.slice(me0.pitsDone)).toEqual([{ lap: 12, compound: 'H' }])
    let st = r
    const rng = createRng(3)
    for (let i = 0; i < 9 && st.cars.find(x => x.isPlayer)!.pitsDone === me0.pitsDone; i++) st = stepSector(c, st, rng)
    expect(st.cars.find(x => x.isPlayer)!.pitsDone).toBe(me0.pitsDone + 1)
    expect(st.cars.find(x => x.isPlayer)!.compound).toBe('H')
  })

  it('a held plan does not fire until released (1.6.2 hold still wins)', () => {
    const c = cfg()
    const { s } = at(c, 10)
    let st = applyPlanHold(applyReplan(c, s, [{ lap: 11, compound: 'H' }]), true)
    const before = st.cars.find(x => x.isPlayer)!.pitsDone
    const rng = createRng(3)
    for (let i = 0; i < 6; i++) st = stepSector(c, st, rng)
    expect(st.cars.find(x => x.isPlayer)!.pitsDone).toBe(before)
  })

  it('the replan call goes through applyCall', () => {
    const c = cfg()
    const { s, step } = at(c, 10)
    const r = applyCall(c, s, { step, kind: 'replan', stops: [{ lap: 15, compound: 'M' }] }, createRng(1))
    expect(r.replanned).toBe(true)
  })

  it('preview: deterministic, common random numbers, never touches the live state', () => {
    const c = cfg()
    const { s, step } = at(c, 10)
    const frozen = JSON.stringify(s)
    const a = planPreview(c, s, step, [{ lap: 14, compound: 'H' }], 4)
    const b = planPreview(c, s, step, [{ lap: 14, compound: 'H' }], 4)
    expect(a).toEqual(b)
    expect(a.current).toHaveLength(4)
    expect(JSON.stringify(s)).toBe(frozen)
    const same = planPreview(c, applyReplan(c, s, [{ lap: 14, compound: 'H' }]), step, [{ lap: 14, compound: 'H' }], 4)
    expect(same.proposed, 'same plan, same dice: same finishes').toEqual(same.current)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/planner.test.ts`
Expected: FAIL — `@engine/planner` not found.

- [ ] **Step 3: `planner.ts`**

```ts
import type { PitStop, RaceConfig, RaceState } from './types'
import { raceLaps } from './fuel'
import { resolveAllocatedCompound, consumeTyreSet, UNLIMITED_TYRE_ALLOCATION } from './tyres'

/** Spec §6.2. Pure; never throws for a stale or out-of-range request. */
export function sanitizeStops(config: RaceConfig, state: RaceState, stops: readonly PitStop[]): PitStop[] {
  const p = config.tuning.planner
  const last = raceLaps(config) - 1
  const first = Math.min(last, state.lap + 1)
  const me = state.cars.find(c => c.isPlayer)
  let alloc = me ? { ...me.tyreAllocation } : { ...UNLIMITED_TYRE_ALLOCATION }
  const out: PitStop[] = []
  const sorted = stops.map(s => ({ lap: Math.min(last, Math.max(first, Math.round(s.lap))), compound: s.compound }))
    .sort((a, b) => a.lap - b.lap)
  for (const s of sorted) {
    if (out.length >= p.maxStops) break
    const prev = out[out.length - 1]
    if (prev && s.lap - prev.lap < p.minStintLaps) continue
    const c = resolveAllocatedCompound(s.compound, alloc)
    if (!c) continue
    alloc = consumeTyreSet(alloc, c)
    out.push({ lap: s.lap, compound: c })
  }
  return out
}

/** The replan call: the executed prefix stays, the rest is replaced (ruling P2). */
export function applyReplan(config: RaceConfig, state: RaceState, stops: readonly PitStop[]): RaceState {
  const me = state.cars.find(c => c.isPlayer)
  if (!me || me.retired) return state
  const done = me.strategy.plannedStops.slice(0, me.pitsDone)
  while (done.length < me.pitsDone) done.push({ lap: 0, compound: me.compound })   // index-aligned with pitsDone
  const plannedStops = [...done, ...sanitizeStops(config, state, stops)]
  return {
    ...state,
    cars: state.cars.map(c => c.isPlayer ? { ...c, strategy: { ...c.strategy, plannedStops } } : c),
    replanned: true,
  }
}

```

`src/engine/planPreview.ts`:

```ts
import type { PitStop, RaceConfig, RaceState } from './types'
import { applyReplan } from './planner'
import { simulate, futureSeed, finishPositionOf } from './debrief'
import { createRng } from './rng'

export interface PlanPreview { current: number[]; proposed: number[] }

/** Both plans over the same futures (CRN), to the flag, from `state` (spec §6.2, ruling P3). */
export function planPreview(config: RaceConfig, state: RaceState, step: number, stops: readonly PitStop[], futures = config.tuning.planner.previewFutures): PlanPreview {
  const salt = config.tuning.planner.previewSeedSalt
  const proposedStart = applyReplan(config, state, stops)
  const current: number[] = []
  const proposed: number[] = []
  for (let k = 0; k < futures; k++) {
    const seed = futureSeed((config.seed ^ salt) >>> 0, step, k)
    current.push(finishPositionOf(simulate(config, { state, step }, createRng(seed), []).state))
    proposed.push(finishPositionOf(simulate(config, { state: proposedStart, step }, createRng(seed), []).state))
  }
  return { current, proposed }
}
```

(`simulate` never mutates its input — engine states are immutable in practice, the same assumption `judgeCalls` already makes for its shared past.)

- [ ] **Step 4: Wire it**

`debrief.ts`: rename `finishPosition` to exported `finishPositionOf` (update its two internal uses). `race.ts`: the player-plan branch condition becomes `} else if ((config.playerStrategyOverride || state.replanned) && !state.planHold) {`. `redFlag.ts` `restartTyre`: add the parameter `replanned = false` and change the first line to `const plan = car.isPlayer && !config.playerStrategyOverride && !replanned ? [] : car.strategy.plannedStops`; `applyRedFlagRestart` gains `replanned = false` and passes it; `race.ts` passes `state.replanned === true`; `defaultRestartCompound` passes `state.replanned === true`. `playerCalls.ts`: `| { step: number; kind: 'replan'; stops: PitStop[] }`, `case 'replan': return applyReplan(config, state, call.stops)`. Export from `index.ts`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/planner.test.ts tests/engine/playerPlan.test.ts tests/engine/redFlag.test.ts tests/engine/redFlagCalls.test.ts tests/engine/debriefJudge.test.ts tests/engine/whatIf.test.ts tests/engine/byteIdentity.test.ts tests/state/planHold.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/planner.ts src/engine/planPreview.ts src/engine/race.ts src/engine/redFlag.ts src/engine/playerCalls.ts src/engine/debrief.ts src/engine/index.ts tests/engine/planner.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): mid-race re-plan -- sanitized stops, the replan call, a CRN preview

Spec 2026-10-24 §6.2, rulings P2-P4. A re-plan replaces the player's remaining
stops (executed prefix kept, index-aligned with pitsDone) and makes the engine
execute the player's plan from then on; stale or out-of-range stops are
clamped, never thrown. planPreview runs the current and proposed plans to the
flag over the same futures without touching the live race.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: The STRATEGY planner on screen — pause and hold, timeline, worker preview, confirm (spec §6.1, §6.3, ruling P1)

**Files:**
- Create: `src/state/plannerStore.ts`, `src/ui/StrategyPlanner.tsx` (exports `StrategyPlanner`, `PlanButton`, `previewText`)
- Modify: `src/state/debriefRunner.ts` (`DebriefMessage` `planPreview`; `DebriefRunner.planPreview?`; in-process implementation), `src/state/debriefWorkerRunner.ts`, `src/workers/debrief.worker.ts`, `src/state/debriefStore.ts` (export `currentDebriefRunner()`), `src/state/raceStore.ts` (`submitReplan`), `src/ui/RaceHUD.tsx`
- Test: `tests/state/plannerStore.test.ts`, `tests/ui/strategyPlanner.test.tsx`

**Interfaces:**
- Consumes: `planPreview`, `sanitizeStops` (Task 23), `outLapCost` (Task 7), `useLapOutlook` (Task 11), `applyPlanHold`.
- Produces:
  - `DebriefRunner.planPreview?(job: PlanPreviewJob, on: { done(r: PlanPreview): void; failed(reason: string): void }): DebriefHandle` with `interface PlanPreviewJob { config: RaceConfig; state: RaceState; step: number; stops: PitStop[] }`
  - `currentDebriefRunner(): DebriefRunner` (debriefStore)
  - plannerStore: `{ open: boolean; draft: PitStop[]; preview: PlanPreview | null; previewing: boolean; openPlanner(): void; setDraft(stops: PitStop[]): void; confirm(): void; cancel(): void }`
  - raceStore `submitReplan(stops: PitStop[]): void`
  - `previewText(p: PlanPreview): { now: string; next: string; better: string; betterCount: number }`

- [ ] **Step 1: Write the failing tests**

Create `tests/state/plannerStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(), get: vi.fn(async () => ({ value: null })), remove: vi.fn() } }))

import { usePlannerStore } from '@state/plannerStore'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

function load() {
  const config = { ...makeConfig({}, 12, 'veloce'), playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(),
    playerStrategyOverride: { teamId: 'apex', startCompound: 'M' as const, plannedStops: [{ lap: 16, compound: 'H' as const }] } }
  useRaceStore.setState({ phase: 'racing', config, raceState: { ...initRace(config), lap: 8 }, rng: createRng(12), stepCount: 24, playerCalls: [] })
  useClockStore.setState({ speed: 2 })
}

describe('planner store (spec §6.1, ruling P1)', () => {
  beforeEach(() => { useRaceStore.getState().resetRace(); usePlannerStore.getState().cancel() })

  it('opening pauses the clock, holds the due plan and starts from the current plan', () => {
    load()
    usePlannerStore.getState().openPlanner()
    expect(useClockStore.getState().speed).toBe(0)
    expect(useRaceStore.getState().raceState!.planHold).toBe(true)
    expect(usePlannerStore.getState().draft).toEqual([{ lap: 16, compound: 'H' }])
  })

  it('confirm logs one replan call, releases the hold and restores the speed', () => {
    load()
    usePlannerStore.getState().openPlanner()
    usePlannerStore.getState().setDraft([{ lap: 14, compound: 'H' }, { lap: 26, compound: 'S' }])
    usePlannerStore.getState().confirm()
    const calls = useRaceStore.getState().playerCalls
    expect(calls.filter(c => c.kind === 'replan')).toEqual([{ step: 24, kind: 'replan', stops: [{ lap: 14, compound: 'H' }, { lap: 26, compound: 'S' }] }])
    expect(calls.at(-1)).toEqual({ step: 24, kind: 'hold_plan', hold: false })
    expect(useClockStore.getState().speed).toBe(2)
    expect(useRaceStore.getState().raceState!.replanned).toBe(true)
  })

  it('cancel changes nothing but the hold, and restores the speed', () => {
    load()
    usePlannerStore.getState().openPlanner()
    usePlannerStore.getState().cancel()
    expect(useRaceStore.getState().playerCalls.map(c => c.kind)).toEqual(['hold_plan', 'hold_plan'])
    expect(useClockStore.getState().speed).toBe(2)
  })

  it('a draft change asks for a preview (in-process runner in tests) and stores it', async () => {
    load()
    usePlannerStore.getState().openPlanner()
    usePlannerStore.getState().setDraft([{ lap: 14, compound: 'H' }])
    await vi.waitFor(() => expect(usePlannerStore.getState().preview).not.toBeNull(), { timeout: 20_000 })
    expect(usePlannerStore.getState().preview!.current).toHaveLength(4)
  })
})
```

Create `tests/ui/strategyPlanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(), get: vi.fn(async () => ({ value: null })), remove: vi.fn() } }))
import { render, screen, fireEvent } from '@testing-library/react'
import { StrategyPlanner, previewText } from '@ui/StrategyPlanner'
import { usePlannerStore } from '@state/plannerStore'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

describe('STRATEGY planner (spec §6.3)', () => {
  beforeEach(() => {
    const config = { ...makeConfig({}, 12, 'veloce'), playerDriverId: 'd_voss', allDry: true, tuning: makeDeterministicTuning(),
      playerStrategyOverride: { teamId: 'apex', startCompound: 'M' as const, plannedStops: [{ lap: 16, compound: 'H' as const }] } }
    useRaceStore.setState({ phase: 'racing', config, raceState: { ...initRace(config), lap: 8 }, rng: createRng(12), stepCount: 24, playerCalls: [] })
    usePlannerStore.getState().openPlanner()
  })

  it('preview text: typical finish and range, better-in count with an arrow', () => {
    expect(previewText({ current: [6, 5, 8, 6], proposed: [5, 4, 7, 6] })).toEqual({ now: 'P6 (P5–P8)', next: 'P5 (P4–P7)', better: '▲ better in 3 of 4', betterCount: 3 })
  })

  it('stop pins are 44px sliders moved by keyboard, one lap per press', () => {
    render(<StrategyPlanner />)
    const pin = screen.getByRole('slider', { name: /stop 1/i })
    expect(parseInt(getComputedStyle(pin).minWidth, 10)).toBeGreaterThanOrEqual(44)
    expect(pin.getAttribute('aria-valuetext')).toBe('Stop 1, lap 16, hards')
    fireEvent.keyDown(pin, { key: 'ArrowLeft' })
    expect(usePlannerStore.getState().draft[0]!.lap).toBe(15)
  })

  it('+ STOP adds a legal stop; CONFIRM is volt and commits', () => {
    render(<StrategyPlanner />)
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    expect(usePlannerStore.getState().draft).toHaveLength(2)
    const confirm = screen.getByRole('button', { name: /confirm plan/i })
    expect(confirm.style.background).toBe('var(--volt)')
    fireEvent.click(confirm)
    expect(useRaceStore.getState().playerCalls.some(c => c.kind === 'replan')).toBe(true)
  })
})
```

(Medians are the lower middle of the sorted futures: `[5,6,6,8]` → P6, `[4,5,6,7]` → P5.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state/plannerStore.test.ts tests/ui/strategyPlanner.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Runner plumbing**

`debriefRunner.ts`:

```ts
export interface PlanPreviewJob { config: RaceConfig; state: RaceState; step: number; stops: PitStop[] }
export type DebriefMessage =
  | { type: 'debrief'; job: DebriefJob }
  | { type: 'whatIf'; job: DebriefJob; edit: WhatIfEdit }
  | { type: 'planPreview'; job: PlanPreviewJob }
```

`DebriefRunner` gains optional `planPreview?(job, on)`. `inProcessRunner.planPreview` mirrors `whatIf` (setTimeout 0, `planPreview(job.config, job.state, job.step, job.stops)`). The worker handles `msg.type === 'planPreview'` by posting `{ type: 'planPreview-done', result }` or `failed`; `workerRunner.planPreview` mirrors `workerRunner.whatIf` with that message. `debriefStore.ts` exports `export function currentDebriefRunner(): DebriefRunner { return runner }`.

- [ ] **Step 4: Stores**

`raceStore.ts`:

```ts
  submitReplan(stops) {
    const { config, raceState, rng, stepCount } = get()
    if (!config || !raceState || !rng) return
    const call = { step: stepCount, kind: 'replan' as const, stops }
    set(s => ({ raceState: applyCall(config, raceState, call, rng), playerCalls: [...s.playerCalls, call] }))
  },
```

`src/state/plannerStore.ts`:

```ts
import { create } from 'zustand'
import type { PitStop } from '@engine/types'
import type { PlanPreview } from '@engine/planPreview'
import { useRaceStore } from './raceStore'
import { useClockStore, type GameSpeed } from './clockStore'
import { currentDebriefRunner } from './debriefStore'
import type { DebriefHandle } from './debriefRunner'
import { applyPlanHold } from '@engine/index'

let resumeSpeed: GameSpeed = 1
let handle: DebriefHandle | null = null
let debounce: ReturnType<typeof setTimeout> | null = null
const stopPreview = () => { handle?.cancel(); handle = null; if (debounce) { clearTimeout(debounce); debounce = null } }

function setHold(hold: boolean) {
  const r = useRaceStore.getState()
  if (!r.raceState || !!r.raceState.planHold === hold) return
  useRaceStore.setState(s => ({
    raceState: applyPlanHold(s.raceState!, hold),
    playerCalls: [...s.playerCalls, { step: s.stepCount, kind: 'hold_plan' as const, hold }],
  }))
}

interface PlannerStore {
  open: boolean; draft: PitStop[]; preview: PlanPreview | null; previewing: boolean
  openPlanner(): void; setDraft(stops: PitStop[]): void; confirm(): void; cancel(): void
}

/** Spec §6.1: opening pauses the clock (P1) and holds a due plan stop (the 1.6.2 hold). */
export const usePlannerStore = create<PlannerStore>((set, get) => ({
  open: false, draft: [], preview: null, previewing: false,
  openPlanner() {
    const r = useRaceStore.getState()
    const me = r.raceState?.cars.find(c => c.isPlayer)
    if (!r.raceState || !me || me.retired || r.phase !== 'racing') return
    resumeSpeed = useClockStore.getState().speed || 1
    useClockStore.getState().setSpeed(0)
    setHold(true)
    set({ open: true, draft: me.strategy.plannedStops.slice(me.pitsDone), preview: null, previewing: false })
  },
  setDraft(stops) {
    set({ draft: stops, previewing: true })
    stopPreview()
    debounce = setTimeout(() => {
      const r = useRaceStore.getState()
      const runner = currentDebriefRunner()
      if (!r.config || !r.raceState || !runner.planPreview) { set({ previewing: false }); return }
      handle = runner.planPreview({ config: r.config, state: r.raceState, step: r.stepCount, stops }, {
        done: p => set({ preview: p, previewing: false }),
        failed: () => set({ previewing: false }),
      })
    }, 300)
  },
  confirm() {
    if (!get().open) return
    stopPreview()
    useRaceStore.getState().submitReplan(get().draft)
    setHold(false)
    useClockStore.getState().setSpeed(resumeSpeed)
    set({ open: false, preview: null, previewing: false })
  },
  cancel() {
    stopPreview()
    if (get().open) { setHold(false); useClockStore.getState().setSpeed(resumeSpeed) }
    set({ open: false, preview: null, previewing: false })
  },
}))
```

The `step()` red-flag path already releases a hold; also make `raceStore.step` call `usePlannerStore.getState().cancel()` when a red flag goes pending (import lazily to avoid a cycle: `void import('./plannerStore').then(m => m.usePlannerStore.getState().cancel())`).

- [ ] **Step 5: The planner UI**

`src/ui/StrategyPlanner.tsx`:
- `previewText(p)`: `median = sorted[(n − 1) >> 1]`, `now: P{median} (P{min}–P{max})`, same for `next`, `betterCount = p.proposed.filter((x, k) => x < p.current[k]!).length`, `better = (betterCount * 2 >= n ? '▲' : '▼') + ' better in ' + betterCount + ' of ' + n`.
- `PlanButton`: 48 px grape slanted `aria-label="Strategy planner"`, label `PLAN`, calls `openPlanner`.
- `StrategyPlanner` (renders when `open`): full-height sheet on `--ink`, slanted grape header `STRATEGY — LAP {lap}/{laps}`. A timeline row: the current stint bar from `lap` to the first stop, then a bar per stint, each filled with its `--tyre-*` token and its letter (`TyreChip`), widths proportional to laps. Each stop is a pin: `role="slider"`, `aria-label="Stop {i}"`, `aria-valuemin={lap+1}`, `aria-valuemax={laps-1}`, `aria-valuenow`, `aria-valuetext="Stop {i}, lap {n}, {compound word}"`, `minWidth: 44, minHeight: 44` hit area with a 4 px visual stem; pointer drag snaps to whole laps (`Light` haptic per lap via `useUiTap`), ←/→ move one lap; every change goes through `setDraft(sanitizeStops(config, raceState, next))` so the draft is always legal. Under each stint a compound `Segmented` limited to compounds with sets left. Buttons `+ STOP` (`aria-label="Add stop"`; adds a stop at the midpoint of the longest stint, disabled at `planner.maxStops`) and `− STOP` (`aria-label="Remove last stop"`). Notes: caution "Two-compound rule not met yet" when `mandatoryTwoCompound` and the plan's dry compounds plus `compoundsUsed` are one; lilac-dim "Out-lap +0.42s" per stop from `outLapCost`; hot "Serves +5s penalty at lap {n}" when a penalty is pending; `SC chance next 5 laps: 24%` from `useLapOutlook()`.
- Preview card: two `useCountUp` finishes `NOW P6 (P5–P8)` / `NEW P5 (P4–P7)` and the `better` line in gain (▲) or hot (▼); while `previewing`, a thin formation-lap shimmer bar (opacity animation; static under reduced motion).
- Footer: `CANCEL` (grape) and `CONFIRM` (`aria-label="Confirm plan"`, volt fill, ink text; `Success` haptic; the sheet exits sliding down 220 ms on `EASE`, opacity-only under reduced motion).
- Android back and Escape call `cancel`.

`RaceHUD.tsx`: `<PlanButton />` next to `TeamButton`; `<StrategyPlanner />` above the other sheets.

- [ ] **Step 6: Run**

Run: `npx vitest run tests/state/plannerStore.test.ts tests/ui/strategyPlanner.test.tsx tests/state/planHold.test.ts tests/state/debriefStore.test.ts tests/state/whatIfStore.test.ts tests/ui/raceHudBold.test.tsx tests/ui/backgroundPause.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/plannerStore.ts src/ui/StrategyPlanner.tsx src/state/debriefRunner.ts src/state/debriefWorkerRunner.ts src/workers/debrief.worker.ts src/state/debriefStore.ts src/state/raceStore.ts src/ui/RaceHUD.tsx tests/state/plannerStore.test.ts tests/ui/strategyPlanner.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): STRATEGY planner -- pause and hold, drag the remaining stops, worker preview

Spec 2026-10-24 §6.1/§6.3, ruling P1. Opening the planner pauses the clock and
holds a due plan stop; the timeline's pins are keyboard-operable 44 px sliders
and every edit is sanitized by the engine. A debounced, cancellable preview runs
current vs proposed over four common-random-number futures in the debrief
worker. CONFIRM logs one replan call.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Every 2.0 call in replay, the debrief, what-if and the lap chart (spec §1.8, §2.4, §6.4, §11, ruling E4)

**Files:**
- Modify: `src/engine/types.ts` (`JudgedCall`, `Alternative`), `src/engine/debrief.ts` (`judgeCalls`, `playerStops`, `whatIfInputs`, `PlayerStop.source`), `src/engine/raceHistory.ts` (`swapLaps`), `src/ui/DebriefCard.tsx`, `src/ui/LapChart.tsx`, `src/ui/WhatIfPanel.tsx` (labels a re-planned stop)
- Test: `tests/engine/v2Calls.test.ts`, `tests/ui/debriefV2.test.tsx`

**Interfaces:**
- Consumes: every call kind from Tasks 13, 14, 21, 23.
- Produces:
  - `JudgedCall` adds `| { kind: 'fuel'; lap: number; mode: FuelMode } | { kind: 'ers'; lap: number; mode: ErsMode } | { kind: 'order'; lap: number; order: TeamOrderKind } | { kind: 'replan'; lap: number; stops: PitStop[] }`
  - `Alternative` adds `| { kind: 'fuel'; lap: number; mode: FuelMode } | { kind: 'ers'; lap: number; mode: ErsMode } | { kind: 'fuel-none' } | { kind: 'ers-none' } | { kind: 'order-none' } | { kind: 'order'; lap: number; order: TeamOrderKind } | { kind: 'replan-none' } | { kind: 'replan-shift'; lap: number; delta: number }`
  - `PlayerStop.source` adds `| { kind: 'replan'; index: number; stop: number }`
  - `resourceCallsToJudge(calls: readonly PlayerCall[], max: number, lastStep: number): Set<number>` (indices; exported from `debrief.ts`)
  - `CarHistory.swapLaps: number[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/v2Calls.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { applyCall, type PlayerCall } from '@engine/playerCalls'
import { replay, judgeCalls, playerStops, whatIfInputs, resourceCallsToJudge } from '@engine/debrief'
import { lapHistory } from '@engine/raceHistory'
import { createRng } from '@engine/rng'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig } from '@engine/types'

/** Every 2.0 feature on, a short race, Chen (apex #2) so a team-mate exists. */
function cfg(): RaceConfig {
  const t = makeTuning({
    trackEvolution: { wash: { DAMP: 0.35, WET: 0.8 } }, fuelModel: { enabled: true }, ers: { enabled: true },
    tyreTemp: { enabled: true }, drs: { enabled: true }, doubleStack: { enabled: true }, penalties: { enabled: true },
    teamOrders: { aiSwapStuckLaps: 3 }, incidents: { circuitRiskWeight: 1 }, ai: { scGambleMaxDelay: 3 },
    debrief: { futures: 2 },
  })
  return { ...makeConfig({}, 31, 'veloce'), tuning: t, playerDriverId: 'd_chen',
    playerStrategyOverride: { teamId: 'apex', startCompound: 'M', plannedStops: [{ lap: 16, compound: 'H' }] } }
}
const CALLS: PlayerCall[] = [
  { step: 3, kind: 'fuel', mode: 'rich' },
  { step: 6, kind: 'ers', mode: 'attack' },
  { step: 15, kind: 'team_order', order: 'swap' },
  { step: 30, kind: 'replan', stops: [{ lap: 14, compound: 'H' }, { lap: 26, compound: 'S' }] },
  { step: 45, kind: 'ers', mode: 'harvest' },
  { step: 60, kind: 'team_order', order: 'free' },
  { step: 75, kind: 'fuel', mode: 'save' },
]

/** The live loop exactly as raceStore runs it: calls between steps, one rng. */
function live(config: RaceConfig, calls: readonly PlayerCall[]) {
  let s = initRace(config)
  const rng = createRng(config.seed)
  const MAX_STEPS = config.circuit.laps * 3
  let step = 0
  for (; step < MAX_STEPS; step++) {
    for (const c of calls) if (c.step === step) s = applyCall(config, s, c, rng)
    s = stepSector(config, s, rng)
  }
  expect(s.lap).toBe(s.totalLaps)
  return s
}

describe('2.0 calls (spec §11)', () => {
  it('REPLAY REPRODUCES A RACE WITH EVERY 2.0 CALL', () => {
    const c = cfg()
    expect(JSON.stringify(replay(c, c.seed, CALLS).state)).toBe(JSON.stringify(live(c, CALLS)))
  }, 60_000)

  it('stops from a re-plan are attributed to it, and what-if edits the call', () => {
    const c = cfg()
    const stops = playerStops(c, c.seed, CALLS)
    const fromReplan = stops.filter(s => s.source.kind === 'replan')
    expect(fromReplan.length).toBeGreaterThan(0)
    const i = stops.indexOf(fromReplan[0]!)
    const ed = whatIfInputs(c, c.seed, CALLS, { kind: 'stop', stop: i, lap: fromReplan[0]!.lap + 1, compound: 'M' })
    const call = ed.calls.find(x => x.kind === 'replan')!
    expect(call.kind === 'replan' && call.stops.some(s => s.lap === fromReplan[0]!.lap + 1 && s.compound === 'M')).toBe(true)
  }, 60_000)

  it('at most maxResourceVerdicts fuel/ERS calls are judged — the longest in effect (E4)', () => {
    const many: PlayerCall[] = Array.from({ length: 10 }, (_, k) => ({ step: 3 + k * 9, kind: 'ers' as const, mode: k % 2 ? 'attack' as const : 'balanced' as const }))
    const picked = resourceCallsToJudge(many, 4, 102)
    expect(picked.size).toBe(4)
    expect(picked.has(9), 'the last call lasts to the flag').toBe(true)
  })

  it('judgeCalls returns verdicts for the new kinds without throwing', () => {
    const c = cfg()
    const r = judgeCalls(c, c.seed, CALLS)
    const kinds = new Set(r.verdicts.map(v => v.call.kind))
    for (const k of ['fuel', 'ers', 'order', 'replan']) expect(kinds.has(k as never)).toBe(true)
  }, 120_000)

  it('the lap chart records swaps', () => {
    const c = cfg()
    const h = lapHistory(c, c.seed, CALLS)
    for (const car of h.cars) for (const l of car.swapLaps) expect(l).toBeGreaterThanOrEqual(1)
  }, 60_000)
})
```

Create `tests/ui/debriefV2.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { describeCall, describeAlternative } from '@ui/DebriefCard'

describe('debrief labels for 2.0 calls', () => {
  it('names every new call and alternative', () => {
    expect(describeCall({ kind: 'fuel', lap: 12, mode: 'save' })).toBe('FUEL → SAVE L12')
    expect(describeCall({ kind: 'ers', lap: 20, mode: 'attack' })).toBe('ERS → ATTACK L20')
    expect(describeCall({ kind: 'order', lap: 18, order: 'swap' })).toBe('TEAM ORDER · LET ME THROUGH L18')
    expect(describeCall({ kind: 'replan', lap: 11, stops: [{ lap: 14, compound: 'H' }] })).toBe('RE-PLAN L11 · PIT L14 → HARD')
    expect(describeAlternative({ kind: 'fuel-none' })).toBe('no fuel change')
    expect(describeAlternative({ kind: 'ers-none' })).toBe('no ERS change')
    expect(describeAlternative({ kind: 'order-none' })).toBe('no team order')
    expect(describeAlternative({ kind: 'replan-none' })).toBe('keep the old plan')
    expect(describeAlternative({ kind: 'replan-shift', lap: 13, delta: -2 })).toBe('the new plan 2 laps earlier')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/v2Calls.test.ts tests/ui/debriefV2.test.tsx`
Expected: FAIL — new kinds not judged/attributed; labels missing; `resourceCallsToJudge` missing. (The replay test may already pass — it pins the property.)

- [ ] **Step 3: Types and labels**

Add the `JudgedCall`/`Alternative` members (Interfaces). `DebriefCard.tsx`:

```ts
const ORDER: Record<TeamOrderKind, string> = { swap: 'LET ME THROUGH', hold: 'HOLD POSITIONS', free: 'FREE TO RACE', yield: 'LET HIM THROUGH' }
// describeCall:
    case 'fuel': return `FUEL → ${c.mode.toUpperCase()} L${c.lap}`
    case 'ers': return `ERS → ${c.mode.toUpperCase()} L${c.lap}`
    case 'order': return `TEAM ORDER · ${ORDER[c.order]} L${c.lap}`
    case 'replan': return `RE-PLAN L${c.lap} · ${c.stops.map(s => `PIT L${s.lap} → ${TYRE[s.compound]}`).join(', ') || 'NO STOPS'}`
// describeAlternative:
    case 'fuel': return `${a.mode.toUpperCase()} fuel at L${a.lap}`
    case 'ers': return `${a.mode.toUpperCase()} ERS at L${a.lap}`
    case 'fuel-none': return 'no fuel change'
    case 'ers-none': return 'no ERS change'
    case 'order-none': return 'no team order'
    case 'order': return `${ORDER[a.order].toLowerCase()} at L${a.lap}`
    case 'replan-none': return 'keep the old plan'
    case 'replan-shift': return `the new plan ${Math.abs(a.delta)} lap${Math.abs(a.delta) === 1 ? '' : 's'} ${a.delta < 0 ? 'earlier' : 'later'}`
```

- [ ] **Step 4: Judging**

In `debrief.ts`:

```ts
/**
 * Which fuel/ERS calls to judge (spec ruling E4): the `max` that stay in effect
 * longest (until the next call of the same kind, or the flag). Ties: earlier first.
 */
export function resourceCallsToJudge(calls: readonly PlayerCall[], max: number, lastStep: number): Set<number> {
  const dur: { i: number; d: number }[] = []
  calls.forEach((c, i) => {
    if (c.kind !== 'fuel' && c.kind !== 'ers') return
    const next = calls.find((x, j) => j > i && x.kind === c.kind && x.step > c.step)
    dur.push({ i, d: (next?.step ?? lastStep) - c.step })
  })
  return new Set(dur.sort((a, b) => b.d - a.d || a.i - b.i).slice(0, max).map(x => x.i))
}
```

In `judgeCalls`'s `calls.forEach`, compute `const judged = resourceCallsToJudge(calls, config.tuning.debrief.maxResourceVerdicts, 3 * actualRun.state.totalLaps)` once above, then branch by kind (the existing `pit`/`pace` branch unchanged):

```ts
    if ((call.kind === 'fuel' || call.kind === 'ers') && !judged.has(idx)) return
    if (call.kind === 'fuel' || call.kind === 'ers') {
      const MODES = call.kind === 'fuel' ? (['rich', 'standard', 'save'] as const) : (['harvest', 'balanced', 'attack', 'defend'] as const)
      const timing = lapOffsets.filter(d => lap + d >= 0 && lap + d <= lastLap).map(d => ({
        alternative: { kind: call.kind, lap: lap + d + 1, mode: call.mode } as Alternative, config, calls: [...others, moved(d)] }))
      const modes = (MODES as readonly string[]).filter(m => m !== call.mode).map(m => ({
        alternative: { kind: call.kind, lap: lap + 1, mode: m } as Alternative, config, calls: [...others, { ...call, mode: m } as PlayerCall] }))
      const none = { alternative: { kind: call.kind === 'fuel' ? 'fuel-none' : 'ers-none' } as Alternative, config, calls: others }
      groups.push({ call: { kind: call.kind, lap: lap + 1, mode: call.mode } as JudgedCall, branchLap: lap + minOffset,
        options: [{ alternative: null, config, calls }, ...timing, ...modes, none] })
      return
    }
    if (call.kind === 'team_order') {
      const timing = lapOffsets.filter(d => lap + d >= 0 && lap + d <= lastLap).map(d => ({
        alternative: { kind: 'order', lap: lap + d + 1, order: call.order } as Alternative, config, calls: [...others, moved(d)] }))
      groups.push({ call: { kind: 'order', lap: lap + 1, order: call.order }, branchLap: lap + minOffset,
        options: [{ alternative: null, config, calls }, ...timing, { alternative: { kind: 'order-none' }, config, calls: others }] })
      return
    }
    if (call.kind === 'replan') {
      const shifts = lapOffsets.map(d => ({
        alternative: { kind: 'replan-shift', lap: lap + 1, delta: d } as Alternative, config,
        calls: [...others, { ...call, stops: call.stops.map(s => ({ ...s, lap: s.lap + d })) }] }))
      groups.push({ call: { kind: 'replan', lap: lap + 1, stops: call.stops }, branchLap: lap + minOffset,
        options: [{ alternative: null, config, calls }, ...shifts, { alternative: { kind: 'replan-none' }, config, calls: others }] })
      return
    }
```

(The existing `const moved = (d) => ({ ...call, step: call.step + 3 * d })` works for every kind. Shifted re-plan stops are re-sanitized by `applyReplan`, so an out-of-range shift is clamped, never thrown.)

In the plan-stop detection walk inside `judgeCalls`, skip attributing a stop to `config.playerStrategyOverride` when `state.replanned` (those stops belong to the re-plan call, judged above): `if (now.pitsDone > pitsBefore && !state.replanned) { … }`.

`playerStops`: track `lastReplan: { index: number; prefix: number } | null` — when a `replan` call is applied, `lastReplan = { index, prefix: me(state).pitsDone }`. When `pitsDone` rises across a step and `state.replanned && lastReplan`, push `{ lap: me(state).strategy.plannedStops[pitsBefore]!.lap, compound: me(state).compound, source: { kind: 'replan', index: lastReplan.index, stop: pitsBefore - lastReplan.prefix }, step }`. `whatIfInputs`: a `replan` source rewrites that call's `stops[stop]` to `{ lap, compound: edit.compound }` (clamped like a plan stop) and sets `changeStep = Math.min(call.step, 3 * lap)`.

`raceHistory.ts`: `swapLaps` per car from `team_order_swap` incidents (both the yielder and the passer — the passer is the car directly ahead after the swap; record it for the yielder only, and the LapChart draws the "⇅" marker on the yielder's line, which is unambiguous). `LapChart.tsx`: draw "⇅" (lilac, 10 px) at each `swapLaps` lap; text summary "Team order on lap N". `WhatIfPanel.tsx`: a re-planned stop's label reads `RE-PLAN · STOP {n}`.

- [ ] **Step 5: Run**

Run: `npx vitest run tests/engine/v2Calls.test.ts tests/ui/debriefV2.test.tsx tests/engine/debriefJudge.test.ts tests/engine/whatIf.test.ts tests/engine/raceHistory.test.ts tests/engine/replayFidelity.test.ts tests/ui/debriefCard.test.tsx tests/ui/whatIfPanel.test.tsx tests/ui/lapChart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/debrief.ts src/engine/raceHistory.ts src/ui/DebriefCard.tsx src/ui/LapChart.tsx src/ui/WhatIfPanel.tsx tests/engine/v2Calls.test.ts tests/ui/debriefV2.test.tsx
git commit -m "$(cat <<'EOF'
feat(debrief): judge fuel, ERS, team-order and re-plan calls; what-if edits re-planned stops

Spec 2026-10-24 §1.8/§2.4/§6.4/§11, ruling E4. Every 2.0 call replays
byte-identically (pinned with all features on). The debrief judges fuel/ERS
calls like pace calls but only the four longest-lasting; team orders against
"no order" and timing; a re-plan against "keep the old plan" and the whole plan
shifted. what-if attributes and edits stops that came from a re-plan; the lap
chart marks swaps.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: 2.0c switched on — AI team swaps; the full sweep; debrief budget; MODEL_SPEC §17.3; phone pass

**Files:**
- Modify: `src/data/tuning.json` (`teamOrders.aiSwapStuckLaps` 0 → 3; band), `src/data/validators.ts`, `tests/engine/monteCarloHarness.ts`, `tests/engine/v2Bands.test.ts`, `tests/engine/monteCarlo.test.ts`, `src/data/scenarios.json` (if moved), tests needing `withV2Off`, `MODEL_SPEC.md` (§3, §17.3, §12 note), `docs/V2-CHECKLIST.md`
- Test: `tests/engine/debriefBudget.test.ts` (new, simulation project)

**Interfaces:**
- Consumes: Tasks 21–25.
- Produces: `Metrics.aiTeamSwapsPerRace`; band `aiTeamSwapsPerRace`.

- [ ] **Step 1: Metric and failing gate**

Harness: `aiTeamSwapsPerRace` = `team_order_swap` incidents per race (all cars are AI in the harness). Add `swaps=…` to the MEASURE line. Append to `v2Bands.test.ts`:

```ts
  it('2.0c: AI team swaps are inside their band, and live', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    expect(m.aiTeamSwapsPerRace).toBeGreaterThan(0)
    expect(m.aiTeamSwapsPerRace).toBeGreaterThanOrEqual(b.aiTeamSwapsPerRace[0])
    expect(m.aiTeamSwapsPerRace).toBeLessThanOrEqual(b.aiTeamSwapsPerRace[1])
  })
```

Run: `npx vitest run tests/engine/v2Bands.test.ts -t "2.0c"` — Expected: FAIL.

- [ ] **Step 2: Switch on and measure**

Set `teamOrders.aiSwapStuckLaps` → `3`. `MEASURE=1 FEATURE=swaps …` (four lines). Band check; fallback `aiSwapStuckLaps` 3 → 5; ship-off rule.

- [ ] **Step 3: The full sweep at the shipped 2.0 tuning**

With every 2.0 switch at its final value, run `MEASURE=1 FEATURE=shipped-2.0 …` and the showery `MEASURE weather` cell, plus the all-12-circuit team-identity gate in `tests/engine/monteCarlo.test.ts` (it runs the whole calendar). Record every MEASURE line. Then the complete gate list: `npx vitest run tests/engine/v2Bands.test.ts tests/engine/monteCarlo.test.ts tests/engine/neutralisationBands.test.ts tests/engine/race16Bands.test.ts tests/engine/setupBalance.test.ts tests/engine/circuitDifferentiation.test.ts tests/engine/qualifyingBands.test.ts tests/engine/overtakeRaceTime.test.ts tests/engine/mechanicalFailure.test.ts tests/engine/strategy.test.ts` — Expected: PASS.

- [ ] **Step 4: Debrief budget**

Add `'tests/engine/debriefBudget.test.ts'` to `SIMULATION_SUITES` and create it:

```ts
import { describe, it, expect } from 'vitest'
import { judgeCalls } from '@engine/debrief'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { PlayerCall } from '@engine/playerCalls'

describe('debrief budget with 2.0 calls (spec §11)', () => {
  it('a worst-case race (60 laps, many PU toggles, orders, a re-plan) judges inside debrief.timeoutMs on this machine', () => {
    const config = buildRaceConfig(4242, 'd_chen', 'harbour_lights', 'pro', { startCompound: 'M', plannedStops: [{ lap: 25, compound: 'H' }] })
    const calls: PlayerCall[] = [
      ...Array.from({ length: 30 }, (_, k) => ({ step: 6 + k * 5, kind: 'ers' as const, mode: (k % 2 ? 'attack' : 'harvest') as 'attack' | 'harvest' })),
      ...Array.from({ length: 10 }, (_, k) => ({ step: 9 + k * 15, kind: 'fuel' as const, mode: (k % 2 ? 'save' : 'rich') as 'save' | 'rich' })),
      { step: 40, kind: 'team_order', order: 'swap' }, { step: 90, kind: 'team_order', order: 'free' },
      { step: 60, kind: 'replan', stops: [{ lap: 28, compound: 'H' }, { lap: 45, compound: 'M' }] },
      { step: 20, kind: 'pace', mode: 'push' }, { step: 75, kind: 'pit', compound: 'H' },
    ].sort((a, b) => a.step - b.step) as PlayerCall[]
    const t0 = performance.now()
    judgeCalls(config, 4242, calls)
    const ms = performance.now() - t0
    // eslint-disable-next-line no-console
    console.log(`MEASURE debriefBudget ms=${ms.toFixed(0)} budget=${config.tuning.debrief.timeoutMs}`)
    expect(ms).toBeLessThan(config.tuning.debrief.timeoutMs)
  }, 300_000)
})
```

Run: `npx vitest run tests/engine/debriefBudget.test.ts --reporter=verbose`. Expected: PASS. A desktop time above 40% of the budget is a STOP-and-report (phones are ~3–5× slower; the device check in Task 27 confirms).

- [ ] **Step 5: Bands, other tests, scenarios, golden**

Size `aiTeamSwapsPerRace` by the band rule; write it to `tuning.json`, `validators.ts`, the `_note` ("2.0c: …, MODEL_SPEC §17.3"), and well-formedness. `withV2Off` for tests whose subject is not 2.0 (as Task 12 Step 5). Scenario re-authoring procedure. `npx vitest run tests/engine/byteIdentity.test.ts tests/engine/v2Foundations.test.ts` — PASS, fixture untouched. Then the full suite `npx vitest run` and `npx tsc --noEmit -p tsconfig.json` — all pass.

- [ ] **Step 6: MODEL_SPEC**

§3: the `aiTeamSwapsPerRace` row. `### 17.3 2.0c — the strategist's tools`: MEASURE lines for `swaps` and `shipped-2.0` verbatim; the showery and all-12 lines; the debrief budget line; a closing table "2.0 shipped vs 1.6.2" for every §3 metric (1.6.2 baseline from Task 12's `baseline` lines, 2.0 from `shipped-2.0`), with the tightest margins named; and the OPTIMAL-gain diagnostic re-run at shipped 2.0 (Task 12 Step 7 command) with one sentence for §9.4. Update §12 "How to re-measure" with: "2.0 features are switched by `v2Off()`; a measurement of a 1.x mechanism under shipped 2.0 tuning must say so."

- [ ] **Step 7: Phone feel-test (2.0c)**

Append to `docs/V2-CHECKLIST.md`:

```markdown
### 2.0c: the strategist's tools (Tasks 21–26)

Local release APK, not published until Task 27 (ruling A6).

**Phone pass:** TEAM → LET ME THROUGH with the team-mate ahead: the answer within a lap, the swap
at a sector end, both rows flash; asked again later he is likelier to refuse, and in a season where
he leads the standings the hint says so; HOLD POSITIONS stops the two cars racing; the team-mate's
"let him through?" card appears when he is faster and stuck behind, YES drops you behind him;
PLAN pauses the race and holds a due stop, pins drag lap by lap with a tick, the preview answers in
under a second on this phone and reads "better in N of 4", CONFIRM resumes at the previous speed and
the stint bar updates, CANCEL changes nothing; the debrief names fuel/ERS/order/re-plan verdicts
and finishes inside its budget after a busy race; TRY ANOTHER PLAN can move a re-planned stop.

**Calls for Veet after the pass:** compliance numbers (0.85 base, −0.25 championship, −0.15 per
swap); AI swaps after 3 stuck laps; planner pause (P1) and 4 preview futures; the debrief's 4
resource verdicts.
```

- [ ] **Step 8: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts src/data/scenarios.json tests/engine/monteCarloHarness.ts tests/engine/v2Bands.test.ts tests/engine/monteCarlo.test.ts tests/engine/debriefBudget.test.ts vite.config.ts MODEL_SPEC.md docs/V2-CHECKLIST.md
git commit -m "$(cat <<'EOF'
feat(balance): 2.0c switched on -- AI team swaps; full 2.0 sweep; debrief budget

Spec 2026-10-24 §12-§13. AI teams swap a faster car stuck behind its
team-mate; new band aiTeamSwapsPerRace. Every existing band re-measured at the
shipped 2.0 tuning (MODEL_SPEC §17.3 has the 1.6.2-vs-2.0 table). A worst-case
debrief with many 2.0 calls fits its budget. Golden race unchanged. Scenarios
re-authored where moved: (list). withV2Off added to: (list).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Replace both "(list)" with the actual lists ("none" if empty).

---

## Release

### Task 27: 2.0 / versionCode 10, the release checklist and the phone feel-test (spec §13, ruling A6)

**Files:**
- Modify: `tests/data/appVersion.test.ts`, `package.json`, `android/app/build.gradle`, `docs/V2-CHECKLIST.md`, `docs/store/listing-copy.md` (a `## What's new — 2.0` section above `## What's new — 1.3`, ≤ 500 characters)

**Interfaces:** none (release metadata and documentation).

- [ ] **Step 1: Write the failing test**

In `tests/data/appVersion.test.ts` change the versionCode assertion and the release test:

```ts
    // 1.6.2 is versionCode 9; 2.0 must be 10+.
    expect(Number(m![1])).toBeGreaterThanOrEqual(10)
```

```ts
  it('this release is 2.0', () => {
    expect(pkg.version).toBe('2.0')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/data/appVersion.test.ts`
Expected: FAIL — versionCode 9 and version "1.6.2".

- [ ] **Step 3: Bump**

`package.json`: `"version": "2.0",`. `android/app/build.gradle`: extend the versionCode comment to end "… 1.6.1 is 8, 1.6.2 is 9, so 2.0 is 10.", set `versionCode 10`, add `// 2.0: deeper race strategy (fuel and ERS, team orders, DRS trains, track evolution, tyre temperature, mid-race re-plan, double stacks, penalties, SC outlook).`, set `versionName "2.0"`.

- [ ] **Step 4: The checklist and the device pass**

Append to `docs/V2-CHECKLIST.md`:

```markdown
### 2.0 release (spec 2026-10-24, plan 2026-10-24-v2-deeper-race-strategy)

Ships as 2.0 / versionCode 10. Slices 2.0a/b/c were feel-tested as local builds (sections above).

**Before the release build:** `npx cap sync android` from the repo root (never a worktree). No new
plugin or permission was added; `tests/data/androidManifest.test.ts` must still pass unchanged.

**Device pass on the RELEASE build** (`docs/DEVICE-CHECKLIST.md` §1 to build and install; run every
item on a mid-range phone as well as the Pixel):

1. Cold start → main menu → continue an old 1.6.2 season save: it loads, FUEL LOAD defaults to
   TARGET at setup, nothing else changed in the save.
2. A full Grand Prix at 1×: 60 fps on the frame meter with the tower showing a DRS train, the PU
   sheet open, and the SC meter pulsing HIGH (Harbour Lights in rain if possible).
3. Every new control is reachable one-handed in portrait and is ≥ 44 px (PU, TEAM, PLAN, battle
   chips, SC meter, planner pins); TalkBack reads each with a sensible label.
4. Reduced motion (system setting): battle chips, steward toast, PU sheet, planner and SC meter
   appear without slides or pulses.
5. Haptics on: battle chip Medium, penalty Heavy, planner lap ticks Light, confirm Success; all
   silent with haptics off.
6. Background the app during the planner (it stays paused on return) and during a double stack (the
   timer resumes correctly).
7. The debrief after a busy race (many ERS taps, an order, a re-plan) finishes within its
   budget on the mid-range phone; note the time.
8. A sprint weekend: fuel loads scale to the sprint; the planner works on sprint distance.
9. A red-flag race (scenario Red Flag Restart): tyres at 85 °C, battery full on the restart, any
   pending penalty still shown.

**Calls for Veet after the pass:** everything listed under 2.0a/b/c, plus whether ASSISTED should
stay the default for returning players.
```

Add to `docs/store/listing-copy.md`, above `## What's new — 1.3`:

```markdown
## What's new — 2.0

Deeper race strategy. Manage fuel and the battery: lift and coast, ATTACK and DEFEND. Order your
team-mate to let you through — he might say no. DRS trains, a track that rubbers in and washes out
in the rain, tyres that run cold, overheat and grain. Re-plan your stops mid-race and see what it's
worth. Double-stacked stops, track-limits penalties, and a live safety-car meter.
```

(Count it: it must stay ≤ 500 characters.)

- [ ] **Step 5: Full suite and types**

Run: `npx vitest run`, then `npx tsc --noEmit -p tsconfig.json`. Never two `vitest run`s at once.
Expected: all pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add tests/data/appVersion.test.ts package.json android/app/build.gradle docs/V2-CHECKLIST.md docs/store/listing-copy.md
git commit -m "$(cat <<'EOF'
chore(release): 2.0 / versionCode 10; 2.0 release checklist and device pass

package.json and the Android versionName move to 2.0, versionCode 9 -> 10
(pinned by appVersion.test.ts). V2-CHECKLIST records the release device pass
and the build note; Play release notes gain the 2.0 entry.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Rulings recorded for Veet (collected)

The design rulings (A1–A6, F1–F3, E1–E4, T1–T4, D1–D3, R1–R2, H1–H5, P1–P4, S1–S2, N1–N3, O1–O3, I1) are stated with why and cost-if-wrong in the spec (§16 index). Rulings this plan adds while turning the spec into code:

1. **PR1 — `paceAdvantage` moves to `src/engine/pace.ts` unchanged (Task 13)** — why: the AI resource policy, team orders and the yield request need the same pace edge the overtake roll uses; a copy would drift — cost if wrong: none (byte-identical; `trafficOvertaking` runs in that task).
2. **PR2 — the projection stops at the flag and records the fitted compound (Task 2)** — why: two latent defects found while consolidating stops (a phantom two-compound penalty, charged on every boundary past the flag) — cost if wrong: projection numbers near the end of a race change; that is the fix.
3. **PR3 — `planPreview` lives in its own module (Task 23)** — why: `planner → debrief → playerCalls → planner` is an import cycle — cost if wrong: none.
4. **PR4 — `withV2Off()` is the only way a non-2.0 test opts out (Task 12)** — why: a shallow spread drops nested keys (the 2026-08 NaN defect) — cost if wrong: none.
5. **PR5 — one per-tick tower derivation, `towerV2` (Task 9)** — why: DRS, trains, penalties and cold tyres would otherwise be recomputed per row per render — cost if wrong: none.
6. **PR6 — one table `V2_RADIO` maps the player's new incidents to radio triggers (Task 7)** — why: five features add radio; one loop with a cursor (`prevPlayerIncidents`) cannot double-fire — cost if wrong: none.
7. **PR7 — the team-mate's "let him through?" request does not count against `radioRequests.maxPerRace` (Task 22)** — why: it is the team-mate asking, not the driver, and it is capped at one per race on its own — cost if wrong: one extra card in a busy race.
8. **PR8 — a re-plan also governs the red-flag free change (Task 23)** — why: otherwise a player who re-planned without a race-setup plan would have the restart ignore the plan they just made — cost if wrong: none.
9. **PR9 — the harness has no player, so AI team swaps can involve every team there (Task 21)** — why: the band measures the field; in a real race the player's team is excluded by `isPlayer` — cost if wrong: the band slightly over-counts against live races; documented in MODEL_SPEC §17.3.
10. **PR10 — the planner's draft is always the engine's sanitized plan (Task 24)** — why: the UI can never show a plan the engine would execute differently — cost if wrong: a drag may "snap back" when it breaks a stint gap; that is the rule made visible.

## Self-review (done at writing time)

**Spec coverage.**
- §0 cross-cutting: zero draws (A1) → Tasks 1, 18 (`draws` counted in `penalties.test.ts`), Task 2 (`executeStop` draws exactly 2); switches pinned (A3) → Task 1 `v2Off`, every engine task re-runs byteIdentity; state shape (A2) → Task 1, presence asserted in `V2OFF REPRODUCES THE GOLDEN RACE`; one stop path (A4) → Task 2 (+5, 17, 18 extend it); calls (§0.5) → Tasks 13, 14, 21, 23, 25; sector context (§0.6) → Task 3; config fields (§0.7) → Tasks 15, 22; fallback ladder (A5) → Conventions + Tasks 12, 20, 26; single bump (A6) → Task 27.
- §1 fuel/ERS → Tasks 13 (fuel), 14 (ERS), 15 (fuel load), 16 (UI, assist, battle chips, coach mark); debrief cap E4 → Task 25; invariant → Tasks 13, 20.
- §2 team orders → Tasks 21 (engine, AI swaps), 22 (UI, yield request, standings), 25 (debrief, lap chart); band → Task 26.
- §3 DRS → Tasks 8 (engine, AI escape), 9 (UI); band → Task 12.
- §4 track evolution → Tasks 3 (engine), 4 (UI); graining link → Task 6.
- §5 tyre temperature → Tasks 5, 6 (engine, AI), 7 (UI, out-lap price, radio, coach mark); band → Task 12.
- §6 planner → Tasks 23 (engine), 24 (UI, worker, pause/hold), 25 (debrief, what-if).
- §7 double-stack → Task 17; unsafe-release coupling → Task 18; band → Task 20.
- §8 penalties → Tasks 18 (engine), 19 (UI, lap chart, result); bands → Task 20.
- §9 SC outlook → Tasks 10 (risk inputs, outlook, gamble, calibration gate), 11 (UI, pit panel line); planner line → Task 24.
- §10 interactions: fuel×heat (Task 5 `thermalTarget` reads fuel mode; Task 6 wear multipliers), fuel×SC (Task 13 burn test), ERS×DRS (Task 14 `resolveOvertakes` multiplies both), team orders×neutralisation (Task 21 T4 test), rubber×graining (Task 6), thermal×projection (Task 5), double-stack×unsafe (Task 18 stacked factor), penalties×projection/planner (Tasks 18, 24), outlook×AI/planner (Tasks 10, 24), red flag×all (Tasks 5, 14, 18, 23), sprint×fuel (Task 13 distance fractions), scenarios (Tasks 12, 20, 26).
- §11 saves/replay/debrief → Tasks 15 (season schema), 16 (setting), 7/16/22 (coach marks), 25 (replay of every call, debrief, what-if, lap chart), 26 (budget).
- §12 bands → Tasks 10, 12, 20, 26; §13 order and slicing → the three slice headings; §14 risks → Review Focus and the switch-on procedure.

**Placeholder scan.** The only values not written in advance are measured ones — band endpoints, MEASURE lines, scenario seeds/laps/goals, and the lists of re-authored scenarios and `withV2Off` files in three commit messages — each with an exact command and rule. No "TBD", no "handle edge cases", no step without code or a command.

**Type consistency (checked by name across tasks).** `FuelMode`, `FuelLoad`, `ErsMode`, `TeamOrderKind`, `FuelState`, `ErsState`, `ThermalState`, `PenaltyState`, `TeamOrderState` (1 → all). `SectorContext`, `NO_CTX` (3 → 8, 14). `PitStopCost { total, slow, stationary, releaseDraw }`, `StopContext`, `StopOutcome`, `fitTyres`, `executeStop` (2 → 5, 17, 18). `rubberLaps`, `rubberLapsFor`, `trackGrip`, `trackPaceDelta`, `trackTemp` (3 → 4, 5, 6). `initThermal`, `outLapThermal`, `thermalTarget`, `thermalWindow`, `thermalPace`, `thermalAfterSector`, `thermalAtLapEnd`, `thermalStatus`, `aiThermalPaceMode`, `outLapCost` (5–7 → 9, 18, 24). `greenSinceLap`, `drsOpenSet`, `drsOvertakeFactor`, `drsTrains`, `inTrainBehindHead` (8 → 9, 12). `incidentRiskFactor`, `neutralisationOutlook`, `NeutralisationOutlook`, `OutlookReason`, `buildHarnessConfig` (10 → 11, 12, 24). `raceLaps`, `initFuel`, `effectiveFuelMode`, `fuelPace`, `fuelWeightDelta`, `burnSector`, `fuelMarginLaps`, `fuelAtLapEnd`, `aiResourceModes`, `paceAdvantage` (13 → 14, 16, 20, 21, 22, 23). `initErs`, `ersSector`, `ersOvertakeAdjust` (14 → 16). `boxQueueEstimate`, `deferForBusyBox` (17 → 18). `initPenalty`, `trackLimitsChance`, `recordTrackLimits`, `unsafeReleaseChance`, `addPendingAtFlag`, `effectiveOrder`, `aiPenaltyCoverPace` (18 → 19). `teamMateOf`, `complianceChance`, `applyTeamOrder`, `swapTimes`, `executeTeamOrders`, `holdPair`, `aiTeamSwaps` (21 → 22). `sanitizeStops`, `applyReplan`, `PlanPreview`, `planPreview`, `finishPositionOf` (23 → 24, 25). `assistedPuCalls`, `setFuelMode`, `setErsMode`, `issueTeamOrder`, `submitReplan`, `usePlannerStore`, `currentDebriefRunner`, `PlanPreviewJob` (16, 22, 24). `towerV2`, `TowerV2Row`, `V2_RADIO`, `pickLine`, `withV2Off` (7, 9, 12, 22). `resourceCallsToJudge` (25).

**Review Focus.** (1) Task 1 `V2OFF REPRODUCES THE GOLDEN RACE`, re-run in every engine task. (2) Task 2 `A PROJECTION THAT REACHES THE FLAG RECORDS THE NEW COMPOUND`, Task 5 `OUT-LAP COST IS IN THE STOP PATH THE PROJECTION USES`, Task 17 `THE PROJECTION INCLUDES THE QUEUE`, Task 18 `A PENDING PENALTY IS SERVED IN THE PROJECTED STOP`. (3) Task 25 `REPLAY REPRODUCES A RACE WITH EVERY 2.0 CALL`, Task 21 `A SWAP THAT NEVER BECOMES ADJACENT LAPSES`, Task 23 `A REPLAN IN THE PAST IS CLAMPED, NEVER THROWS`. (4) Task 10 `OUTLOOK IS CALIBRATED`. (5) Tasks 12, 20, 26 switch-on procedure with per-feature MEASURE lines.

**Known judgement calls left to measurement.** Whether every 2.0 feature fits inside the |Δpos| ≤ 4.0 / ρ ≥ 0.60 headroom is unknowable before measuring; the plan's answer is one pre-authorised fallback per feature and shipping a feature off rather than widening a band (MODEL_SPEC §4: "a band may only ever be advanced to its §3 target, never past it").
