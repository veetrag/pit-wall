# Scenario Mode UI + Guided First Race — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the UI layer of scenario mode (picker, briefing, goal-evaluated result) on top of the existing `src/engine/scenario.ts` foundation, then add coach marks to the player's first race.

**Architecture:** Scenario mode reuses the whole race stack but enters it mid-race via `startScenario()`. It is kept off the season's code path by a *distinct* set of `SeasonPhase` values, so a scenario can never write championship points. Coach marks are a small non-modal overlay driven by a Preferences-backed "seen it" flag.

**Tech Stack:** TypeScript strict, React + framer-motion, Zustand, zod, Capacitor Preferences, Vitest.

**Spec:** No separate spec doc. The engine contract is `src/engine/scenario.ts`; its header comment is the authority for *why* scenarios are seed+lap rather than authored state.

## Global Constraints

- `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`, `hooks/` (CLAUDE.md §3). No new engine files are needed in this plan; do not add any.
- No `Math.random()` anywhere in `engine/`. All randomness via the injected seeded RNG.
- TypeScript strict; `noUncheckedIndexedAccess` is on. No `any` — use `unknown` + narrowing.
- `vitest` does NOT typecheck. Every task must run BOTH `npx vitest run` and `npx tsc --noEmit`.
- All colour via tokens in `src/styles/tokens.css`. No raw hex in components.
- `color-mix()` is BANNED — minSdk 24 ships Chromium versions without it. Use literal `rgba()`.
- Respect `prefers-reduced-motion` via `useSettingsStore(s => s.reducedMotion)` everywhere motion is added.
- All live-updating numbers use `fontVariantNumeric: 'tabular-nums'`.
- Contrast: text must clear AA (4.5:1) against its actual background.
- Data lives in `src/data/*.json` with a zod validator in `src/data/validators.ts`. Never bury balance numbers in logic.
- Commit after each task. Message describes *what* and *why*, referencing the layer.

---

## THE FINDING THIS PLAN IS BUILT AROUND

`scripts/find-scenarios.ts` builds its `RaceConfig` by hand. `buildConfig()` in
`src/state/raceStore.ts` builds a *different* one at play time: it scales every
strategy's planned-stop laps by `circuit.laps / 30`, applies a difficulty brain
profile, and sets `tyreAllocationBase` / `mandatoryTwoCompound` /
`coverReactionScale` / `paceModeAggression`. The search config sets none of these.

Measured, on this branch, with `startScenario` at the seeds the search printed:

| Brief | Search config | Runtime config |
|---|---|---|
| "Recovery drive" bengaluru seed 2 lap 40 | P8 · H8 · +1.1s | **P1 · H7 · leading** |
| "Safety car gamble" veloce seed 17 lap 14 | P4 · M12 · +0.5s · SC | P4 · M12 · +0.5s · SC |
| "Cliff edge" harbour_lights seed 73 lap 46 | P3 · W29 · +1.0s | **P5 · W13 · +3.0s** |

A scenario authored from the search output would ship a brief that says "buried
in the pack" over a race the player is *leading*. `scenario.ts` makes an illegal
*state* unrepresentable; the *config* was an unguarded back door around that.

Task 1 closes it (one shared builder). Task 2's `expect` block and its test keep
it closed — every shipped scenario is re-derived from the engine on every test
run, so any future tuning, balance or config change that moves a scenario fails
the suite loudly instead of silently rewriting the brief.

---

## File Structure

**Created:**
- `src/state/buildRaceConfig.ts` — `buildRaceConfig()` (moved out of raceStore) + `buildScenarioConfig()`. The single path to a `RaceConfig`.
- `src/data/scenarios.json` — the shipped scenarios, each with its `expect` block.
- `src/state/scenarioStore.ts` — active spec + outcome.
- `src/ui/ScenarioSelect.tsx` — picker; selected card expands into the briefing.
- `src/ui/ScenarioResult.tsx` — goal-evaluated outcome.
- `src/state/coachStore.ts` — which coach mark is showing, which are done.
- `src/ui/CoachMark.tsx` — the coach-mark primitive.
- Tests: `tests/state/scenarioConfig.test.ts`, `tests/data/scenarios.test.ts`, `tests/state/scenarioStore.test.ts`, `tests/ui/scenarioSelect.test.tsx`, `tests/ui/scenarioResult.test.tsx`, `tests/ui/coachMark.test.tsx`, `tests/state/coachStore.test.ts`.

**Modified:**
- `src/state/raceStore.ts` — import `buildRaceConfig`; add `startScenarioRace`.
- `src/state/seasonStore.ts` — three new `SeasonPhase` values + entry/exit actions.
- `src/state/seasonPersistence.ts` — map the new phases to `null` in `RESUME_PHASE`.
- `src/data/validators.ts` — `ScenarioSchema`, `scenarios` on `GameData`.
- `src/ui/MainMenu.tsx` — SCENARIOS entry.
- `src/ui/RaceWatcher.tsx` — scenario start + scenario finish, kept off the season path.
- `src/App.tsx` — route the new phases.
- `scripts/find-scenarios.ts` — use `buildScenarioConfig`.
- `src/state/settingsStore.ts` — `coachMarksSeen`.
- `src/ui/SettingsPanel.tsx` — "Replay tutorial" control.
- `src/ui/TelemetryZone.tsx`, `src/ui/PitPanel.tsx`, `src/ui/RaceHUD.tsx` — coach-mark anchors/host.

---

## PART A — SCENARIO MODE UI

### Task 1: One config builder, shared by the search tool and the game

**Files:**
- Create: `src/state/buildRaceConfig.ts`
- Modify: `src/state/raceStore.ts`
- Modify: `scripts/find-scenarios.ts`
- Test: `tests/state/scenarioConfig.test.ts`

**Interfaces:**
- Produces: `buildRaceConfig(seed, playerDriverId, circuitId?, difficulty?, playerStrategy?, upgrades?): RaceConfig` — the function currently named `buildConfig` in `raceStore.ts`, moved verbatim.
- Produces: `buildScenarioConfig(spec: { circuitId: string; seed: number; playerDriverId: string }): RaceConfig`
- Produces: `SCENARIO_DIFFICULTY: Difficulty`

- [ ] **Step 1: Move `buildConfig` into its own module**

Cut the `BRAIN_ORDER` const, `applyBrainProfile` function and the whole
`buildConfig` function (including every comment) out of `src/state/raceStore.ts`
and into a new `src/state/buildRaceConfig.ts`. Rename the exported function to
`buildRaceConfig`. Keep `applyBrainProfile` and `BRAIN_ORDER` module-private.
The imports it needs: `loadGameData` from `@data/validators`, the engine types,
`applyUpgrades`/`UpgradeOverlayInput` from `./upgradeOverlay`, and type-only
`Difficulty` from `./settingsStore` and `PlayerStrategyChoice` from `./seasonStore`.

In `raceStore.ts`, replace the removed code with:

```ts
import { buildRaceConfig } from './buildRaceConfig'
```

and change the three call sites (`startRace`, `startSeasonRace`,
`initForStartSequence`) from `buildConfig(...)` to `buildRaceConfig(...)`.

`CIRCUIT_ORDER` STAYS exported from `raceStore.ts` — `seasonStore` imports it
from there as a value and moving it would change that import for no reason.

- [ ] **Step 2: Add the scenario config builder**

Append to `src/state/buildRaceConfig.ts`:

```ts
/**
 * Scenarios are pinned to ONE difficulty, deliberately.
 *
 * A scenario is a seed plus a lap, and that pair only reproduces the authored
 * situation if the config is identical too. Difficulty is not cosmetic here: it
 * changes strategy brains, tyre allocation, the mandatory-two-compound rule,
 * cover reaction and AI pace-mode aggression -- so reading it from settings
 * would hand two players with different settings two different races under one
 * brief. See the table in the plan doc: an unshared config turned "buried in
 * the pack, P8" into leading the race.
 */
export const SCENARIO_DIFFICULTY: Difficulty = 'rookie'

/**
 * The ONLY way to build a scenario's RaceConfig.
 *
 * Both scripts/find-scenarios.ts (authoring) and raceStore (play) call this, so
 * the situation the search prints is the situation the player is handed. Note
 * the player id passed to buildRaceConfig is the REAL one: startScenario swaps
 * in its own autopilot id for the fast-forward and hands the car back after.
 */
export function buildScenarioConfig(
  spec: { circuitId: string; seed: number; playerDriverId: string },
): RaceConfig {
  return buildRaceConfig(
    spec.seed, spec.playerDriverId, spec.circuitId, SCENARIO_DIFFICULTY,
    null,   // no pre-race strategy: the player takes over mid-race
    null,   // no season upgrades: a scenario must not vary with save state
  )
}
```

- [ ] **Step 3: Point the search script at it**

In `scripts/find-scenarios.ts`, delete the local `configFor` function entirely
and replace its two usages with `buildScenarioConfig({ circuitId, seed, playerDriverId: PLAYER })`.
Import it from `../src/state/buildRaceConfig`. Delete the now-stale comment
block inside `configFor` about `'__none__'` — `startScenario` owns that, and the
script should now call `startScenario` rather than `initRace`/`stepSector`
directly. Rework the search loop to:

```ts
const config = buildScenarioConfig({ circuitId: brief.circuitId, seed, playerDriverId: PLAYER })
for (let lap = from; lap <= to && hits.length < 3; lap++) {
  const { state } = startScenario(config, lap)
  const sit = describeSituation(state, PLAYER)
  if (!sit) break
  if (brief.match(sit, state)) { /* push hit, break */ }
}
```

Import `startScenario` alongside `describeSituation` from `../src/engine/scenario`.
Drop the now-unused `initRace`/`stepSector`/`createRng` imports.

- [ ] **Step 4: Write the test that would have caught the defect**

Create `tests/state/scenarioConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation } from '@engine/scenario'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()
const PLAYER = 'd_voss'

/** The config the search script used to build by hand, before Task 1. */
function naiveConfig(circuitId: string, seed: number): RaceConfig {
  return {
    circuit: DATA.circuits[circuitId]!, tuning: DATA.tuning, compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: PLAYER, seed,
  }
}

describe('buildScenarioConfig', () => {
  it('APPLIES THE SETTINGS A HAND-BUILT CONFIG FORGETS', () => {
    /*
     * THE REGRESSION GUARD FOR THIS WHOLE FEATURE.
     *
     * A scenario is a seed plus a lap; that only reproduces the authored
     * situation if the config matches too. When the search tool built its own
     * config, bengaluru seed 2 lap 40 was P8 "buried in the pack" during
     * authoring and P1 LEADING at play time. This asserts the shared builder
     * actually carries the fields the hand-built one dropped.
     */
    const config = buildScenarioConfig({ circuitId: 'bengaluru', seed: 2, playerDriverId: PLAYER })
    expect(config.tyreAllocationBase, 'allocation must be set').toBeDefined()
    expect(config.mandatoryTwoCompound).toBeDefined()
    expect(config.coverReactionScale).toBeDefined()
    expect(config.paceModeAggression).toBeDefined()
    // Planned stops are scaled to the circuit, not left on the 30-lap reference.
    const laps = DATA.circuits['bengaluru']!.laps
    const raw = DATA.strategies.defaults[0]!.plannedStops[0]!.lap
    expect(config.strategies[0]!.plannedStops[0]!.lap).toBe(Math.round((raw / 30) * laps))
  })

  it('produces a DIFFERENT race than the hand-built config did', () => {
    // Proves the two paths were genuinely divergent -- if this ever passes
    // trivially, the naive config has drifted into agreement and the guard
    // above is carrying the weight alone.
    const shared = describeSituation(startScenario(buildScenarioConfig({ circuitId: 'bengaluru', seed: 2, playerDriverId: PLAYER }), 40).state, PLAYER)
    const naive = describeSituation(startScenario(naiveConfig('bengaluru', 2), 40).state, PLAYER)
    expect(shared).not.toEqual(naive)
  }, 60_000)

  it('does not vary with season upgrades or a pre-race strategy', () => {
    // Two calls with identical spec must be identical configs; a scenario that
    // moved with the player's save state would not be a fixed challenge.
    const a = buildScenarioConfig({ circuitId: 'veloce', seed: 17, playerDriverId: PLAYER })
    const b = buildScenarioConfig({ circuitId: 'veloce', seed: 17, playerDriverId: PLAYER })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.playerStrategyOverride, 'no pre-race plan in a mid-race takeover').toBeUndefined()
  })
})
```

- [ ] **Step 5: Keep the store-boundary test honest**

`tests/state/storeBoundaries.test.ts` asserts that `raceStore.ts` imports
`seasonStore` type-only, and guards its own regex against rot with
`expect(imports.length).toBeGreaterThan(0)`. Step 1 moves that import OUT of
raceStore and into `buildRaceConfig.ts`, so that rot-guard will fail — the test
would be protecting a file that no longer has the hazard while the file that now
does goes unchecked.

Change the first test to check BOTH files. Replace `const text = src('raceStore.ts')`
with a loop over `['raceStore.ts', 'buildRaceConfig.ts']`, collecting matches
from each, and assert:

- the COMBINED match count is `> 0` (the rot-guard, now satisfied by whichever
  file carries the import)
- NO file has a value import

Update the failure message to name `buildRaceConfig.ts` as the module that now
holds `buildConfig` and must keep `PlayerStrategyChoice` type-only. The cycle it
describes is unchanged: `seasonStore` still imports `CIRCUIT_ORDER` from
`raceStore` as a value.

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/state/scenarioConfig.test.ts tests/state/storeBoundaries.test.ts && npx tsc --noEmit && npx vitest run`
Expected: new tests pass, whole suite still green (46 files / 375 passed / 1 skipped baseline).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "fix(state): one config builder for scenarios, shared with the search tool"
```

---

### Task 2: The scenario data file, validated and pinned to the engine

**Files:**
- Create: `src/data/scenarios.json`
- Modify: `src/data/validators.ts`
- Test: `tests/data/scenarios.test.ts`

**Interfaces:**
- Consumes: `buildScenarioConfig` (Task 1)
- Produces: `ScenarioSpecData` type, `loadGameData().scenarios`

- [ ] **Step 1: Re-run the search with the fixed config**

Run: `SEEDS=400 npx vite-node scripts/find-scenarios.ts`

The seeds it prints NOW are the real ones. **Do not reuse the seeds quoted in
this plan's finding table — those were produced by the broken config and are
recorded there only as evidence.** Take the printed hits for the authored file.

- [ ] **Step 2: Author the data file**

Create `src/data/scenarios.json` with the hits from Step 1. Shape, one entry per
scenario (fill `seed`/`startLap`/`expect` from the *actual* search output):

```json
{
  "scenarios": [
    {
      "id": "recovery_drive",
      "name": "Recovery Drive",
      "blurb": "Buried in the midfield with the tyres to make it back. Track position is gone -- go and take it.",
      "circuitId": "bengaluru",
      "seed": 0,
      "playerDriverId": "d_voss",
      "startLap": 0,
      "goal": { "position": 5 },
      "expect": { "position": 0, "lapsRemaining": 0, "compound": "H", "tyreAge": 0 }
    }
  ]
}
```

Author THREE scenarios, one per brief in `scripts/find-scenarios.ts`
(`recovery_drive`, `safety_car_gamble`, `cliff_edge`).

**Set `goal.position` from PAR, not from the handover position.** Par is where
the car finishes when the AI drives it to the flag: build the config with
`playerDriverId: '__none__'`, `startScenario` to `startLap`, then `stepSector`
to the end. Rules: reject a candidate whose par is a RETIREMENT (the outcome is
then a mechanical-failure roll the player cannot influence); reject a candidate
whose par is P1 (no room for a goal above it); otherwise
`goal.position = par - 1`.

This replaces an earlier rule of "three places better than the handover", which
was wrong and shipped two broken scenarios before being caught. A mid-race
handover position says nothing about where the strategy cycle is already
carrying the car — one candidate handed the player P10 "buried in the midfield"
with a par finish of **P1**, so its goal was met by never touching the controls.
Record the measured par in `expect.par`. Write
the `expect` block to match the search output EXACTLY — it is the anti-drift
record, not decoration. `gapAhead` is deliberately NOT in `expect`: it is a
float and would make the test brittle without adding brief-bearing information.

- [ ] **Step 3: Validate it**

In `src/data/validators.ts`, add the import `import scenariosJson from './scenarios.json'`
and the schema, placed next to the other wrapper schemas:

```ts
const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  blurb: z.string().min(1),
  circuitId: z.string().min(1),
  seed: z.number().int().nonnegative(),
  playerDriverId: z.string().min(1),
  // .positive(): a scenario IS a mid-race takeover. startLap 0 is a normal race
  // from the grid, which is what the season mode is for.
  startLap: z.number().int().positive(),
  goal: z.object({ position: z.number().int().positive() }),
  // The situation the engine produced when this scenario was authored. A test
  // re-derives it on every run, so a tuning or balance change that moves the
  // scenario fails loudly instead of silently rewriting the brief.
  expect: z.object({
    position: z.number().int().positive(),
    lapsRemaining: z.number().int().nonnegative(),
    compound: z.string().min(1),
    tyreAge: z.number().int().nonnegative(),
  }),
})
const ScenariosWrapperSchema = z.object({ scenarios: z.array(ScenarioSchema).nonempty() })
export type ScenarioSpecData = z.infer<typeof ScenarioSchema>
```

Add `scenarios: ScenarioSpecData[]` to the `GameData` interface, parse it in
`loadGameData()` (`const scenarios = ScenariosWrapperSchema.parse(scenariosJson)`),
return `scenarios: scenarios.scenarios`, and add referential-integrity checks
beside the existing ones:

```ts
for (const s of scenarios.scenarios) {
  if (!circuitsWrapper.circuits[s.circuitId]) throw new Error(`Scenario ${s.id} references unknown circuitId "${s.circuitId}"`)
  if (!driverIds.has(s.playerDriverId)) throw new Error(`Scenario ${s.id} references unknown playerDriverId "${s.playerDriverId}"`)
}
```

Note: `driverIds` is declared partway down `loadGameData()` — put the scenario
loop AFTER that declaration.

- [ ] **Step 4: Write the anti-drift test**

Create `tests/data/scenarios.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation, goalMet } from '@engine/scenario'

const { scenarios, circuits } = loadGameData()

describe('every shipped scenario', () => {
  it('ships at least one', () => { expect(scenarios.length).toBeGreaterThan(0) })

  it('has a unique id', () => {
    expect(new Set(scenarios.map(s => s.id)).size).toBe(scenarios.length)
  })

  for (const s of scenarios) {
    it(`${s.id}: STILL PRODUCES THE SITUATION ITS BRIEF PROMISES`, () => {
      /*
       * THE LOAD-BEARING DATA TEST.
       *
       * The blurb says "buried in the midfield" or "podium in hand"; the goal is
       * calibrated against that. Both are only true while the engine keeps
       * producing the situation this scenario was authored from. A tuning edit,
       * a balance change to drivers.json, or a config regression would silently
       * turn the brief into a lie -- exactly what happened once already, when
       * the search tool and the runtime built different configs and "P8, buried
       * in the pack" was really P1 leading the race.
       *
       * If this fails, the fix is to RE-AUTHOR the scenario from a fresh search,
       * not to loosen the assertion.
       */
      const config = buildScenarioConfig(s)
      const { state } = startScenario(config, s.startLap)
      const sit = describeSituation(state, s.playerDriverId)
      expect(sit, 'the player must be in this race').not.toBeNull()
      expect({
        position: sit!.position, lapsRemaining: sit!.lapsRemaining,
        compound: sit!.compound, tyreAge: sit!.tyreAge,
      }).toEqual(s.expect)
    }, 60_000)

    it(`${s.id}: starts inside the race and is not already won`, () => {
      const laps = circuits[s.circuitId]!.laps
      expect(s.startLap, 'a takeover must leave laps to race').toBeLessThan(laps)
      expect(s.expect.lapsRemaining).toBeGreaterThan(0)
      // A goal already met at the handover is not a challenge, it is a formality.
      const { state } = startScenario(buildScenarioConfig(s), s.startLap)
      expect(goalMet(state, s.playerDriverId, s.goal),
        'the goal must not already be satisfied at handover').toBe(false)
    }, 60_000)
  }
})
```

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/data/scenarios.test.ts && npx tsc --noEmit`
Expected: PASS. If a scenario fails the situation assertion, the `expect` block
was mis-transcribed from the search output — fix the data, never the test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(data): three scenarios, each pinned to the situation it promises"
```

---

### Task 3: Phases, stores and race wiring

**Files:**
- Modify: `src/state/seasonStore.ts`, `src/state/seasonPersistence.ts`, `src/state/raceStore.ts`, `src/ui/RaceWatcher.tsx`
- Create: `src/state/scenarioStore.ts`
- Test: `tests/state/scenarioStore.test.ts`

**Interfaces:**
- Consumes: `buildScenarioConfig` (Task 1), `loadGameData().scenarios` (Task 2)
- Produces: `useScenarioStore` with `{ active, outcome, select, recordOutcome, exit }`; `SeasonPhase` gains `'scenario_select' | 'scenario_racing' | 'scenario_result'`; `raceStore.startScenarioRace(spec)`

- [ ] **Step 1: Add the phases**

In `src/state/seasonStore.ts` extend the union:

```ts
export type SeasonPhase = 'menu' | 'grid' | 'team_select' | 'driver_select' | 'development' | 'race_setup' | 'racing' | 'result' | 'championship' | 'how_to_play' | 'settings' | 'scenario_select' | 'scenario_racing' | 'scenario_result'
```

Add to the store interface and implementation:

```ts
  viewScenarios: () => void
  exitScenarios: () => void
  startScenarioPhase: () => void
  toScenarioResult: () => void
```
```ts
  viewScenarios() { set({ phase: 'scenario_select' }) },
  exitScenarios() { set({ phase: 'menu' }) },
  // Every scenario phase transition is an ACTION, never a setState from a
  // component. RaceWatcher and the screens below all go through these, so the
  // set of reachable phases stays readable from this file alone.
  startScenarioPhase() { set({ phase: 'scenario_racing' }) },
  toScenarioResult() { set({ phase: 'scenario_result' }) },
```

- [ ] **Step 2: Keep scenarios out of the save**

`RESUME_PHASE` in `src/state/seasonPersistence.ts` is a `Record<SeasonPhase, ResumePhase | null>`, so Step 1 has just made it a compile error. Add:

```ts
  // A scenario is not a season. It has no standings, no development and no
  // round, so there is nothing to resume INTO -- and mapping any of these to a
  // real phase would let a scenario overwrite a championship in progress.
  scenario_select: null, scenario_racing: null, scenario_result: null,
```

- [ ] **Step 3: The scenario store**

Create `src/state/scenarioStore.ts`:

```ts
import { create } from 'zustand'
import type { ScenarioSpecData } from '@data/validators'

export interface ScenarioOutcome {
  met: boolean
  position: number
  retired: boolean
}

interface ScenarioStore {
  active: ScenarioSpecData | null
  outcome: ScenarioOutcome | null
  select: (spec: ScenarioSpecData) => void
  recordOutcome: (outcome: ScenarioOutcome) => void
  exit: () => void
}

/**
 * Scenario mode's own state, deliberately NOT part of seasonStore.
 *
 * A scenario has no standings, no development points and no round, and season
 * state is what gets persisted -- keeping them apart means a scenario can never
 * write into a saved championship. seasonStore.phase still does the routing.
 */
export const useScenarioStore = create<ScenarioStore>((set) => ({
  active: null,
  outcome: null,
  select: (spec) => set({ active: spec, outcome: null }),
  recordOutcome: (outcome) => set({ outcome }),
  exit: () => set({ active: null, outcome: null }),
}))
```

- [ ] **Step 4: Start a scenario race**

In `src/state/raceStore.ts` add to the `RaceStore` interface:

```ts
  startScenarioRace: (spec: { circuitId: string; seed: number; playerDriverId: string; startLap: number }) => void
```

and the implementation, beside `startSeasonRace`:

```ts
  /**
   * Enters a race already in progress.
   *
   * Goes straight to 'racing', not 'starting': there are no start lights
   * halfway through a grand prix. The rng comes from startScenario and MUST be
   * the one stored -- it carries the draw sequence forward from the handover,
   * and a fresh one would fork the race off the branch the scenario was
   * authored on. See src/engine/scenario.ts.
   */
  startScenarioRace(spec) {
    const config = buildScenarioConfig(spec)
    const { state, rng } = startScenario(config, spec.startLap)
    set({ phase: 'racing', config, raceState: state, rng, projectionResult: null, pitPanelOpen: false, playerInPit: false, pitEndTime: 0, hudAlerts: [], radioState: makeRadioState() })
  },
```

Imports to add: `buildScenarioConfig` from `./buildRaceConfig`, `startScenario` from `@engine/scenario`.

- [ ] **Step 5: Wire the watcher**

In `src/ui/RaceWatcher.tsx` add subscriptions and two effects. The existing
season effects are gated on `seasonPhase === 'racing'` and must be left exactly
as they are — `scenario_racing` is a different value, so they will not fire.

```ts
  const startScenarioRace = useRaceStore(s => s.startScenarioRace)
  const activeScenario = useScenarioStore(s => s.active)
  const recordScenarioOutcome = useScenarioStore(s => s.recordOutcome)
  const toScenarioResult = useSeasonStore(s => s.toScenarioResult)
```

```ts
  const scenarioFiredRef = useRef(false)

  useEffect(() => {
    if (seasonPhase === 'scenario_racing' && racePhase === 'idle' && activeScenario) {
      scenarioFiredRef.current = false
      startScenarioRace(activeScenario)
    }
  }, [seasonPhase, racePhase, activeScenario]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (seasonPhase !== 'scenario_racing') return
    if (racePhase !== 'finished' || !raceState || scenarioFiredRef.current) return
    scenarioFiredRef.current = true
    setSpeed(0)
    const spec = activeScenario
    if (!spec) return
    const car = raceState.cars.find(c => c.driverId === spec.playerDriverId)
    recordScenarioOutcome({
      met: goalMet(raceState, spec.playerDriverId, spec.goal),
      position: car?.position ?? 0,
      retired: car?.retired ?? false,
    })
    toScenarioResult()
    setTimeout(() => resetRace(), 1500)
  }, [racePhase, seasonPhase]) // eslint-disable-line react-hooks/exhaustive-deps
```

Import `goalMet` from `@engine/scenario` and `useScenarioStore` from `@state/scenarioStore`.

- [ ] **Step 6: Write the separation test**

Create `tests/state/scenarioStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'
import { useRaceStore } from '@state/raceStore'
import { loadGameData } from '@data/validators'
import { snapshotFrom } from '@state/seasonPersistence'

const SPEC = loadGameData().scenarios[0]!

beforeEach(() => {
  useScenarioStore.setState({ active: null, outcome: null })
  useSeasonStore.setState({ phase: 'menu', playerDriverId: null, standings: [], raceIndex: 0 })
  useRaceStore.getState().resetRace()
})

describe('scenario mode stays out of the season', () => {
  it('NEVER PRODUCES A SAVE SNAPSHOT', () => {
    /*
     * THE SEPARATION GUARD.
     *
     * Scenario mode borrows seasonStore.phase for routing, so a player with a
     * championship in progress who plays a scenario has a live season in the
     * store the whole time. If any scenario phase mapped to a resume target,
     * the autosave would overwrite their championship with a snapshot that says
     * they are sitting in a scenario -- and on resume they would land there
     * with the season behind them gone.
     */
    for (const phase of ['scenario_select', 'scenario_racing', 'scenario_result'] as const) {
      useSeasonStore.setState({ playerDriverId: 'd_voss', phase, raceIndex: 4 })
      expect(snapshotFrom(useSeasonStore.getState()), phase).toBeNull()
    }
  })

  it('a finished scenario does not award championship points', () => {
    // recordRaceResult is the only thing that writes standings, and the
    // scenario finish path must never reach it.
    useScenarioStore.getState().select(SPEC)
    useScenarioStore.getState().recordOutcome({ met: true, position: 1, retired: false })
    expect(useSeasonStore.getState().standings).toEqual([])
  })
})

describe('startScenarioRace', () => {
  it('drops the player into a race already in progress, not onto the grid', () => {
    useRaceStore.getState().startScenarioRace(SPEC)
    const s = useRaceStore.getState()
    expect(s.phase, 'no start lights mid-race').toBe('racing')
    expect(s.raceState!.lap, 'must be at the handover lap').toBe(SPEC.startLap)
    expect(s.rng, 'the live rng must be carried forward').not.toBeNull()
    const player = s.raceState!.cars.find(c => c.isPlayer)
    expect(player?.driverId).toBe(SPEC.playerDriverId)
    // NOT asserting pitsDone > 0 here: that is a property of the handover
    // itself, already covered by the "HANDS OVER A MANAGED CAR" test in
    // tests/engine/scenario.test.ts, and it would be a false failure for any
    // scenario authored with an early startLap.
  }, 60_000)

  it('is the situation the data file promises', () => {
    useRaceStore.getState().startScenarioRace(SPEC)
    const car = useRaceStore.getState().raceState!.cars.find(c => c.isPlayer)!
    expect(car.position).toBe(SPEC.expect.position)
    expect(car.tyreAge).toBe(SPEC.expect.tyreAge)
  }, 60_000)
})
```

- [ ] **Step 7: Verify**

Run: `npx vitest run tests/state/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(state): scenario phases and race wiring, kept off the season path"
```

---

### Task 4: The picker, with the briefing folded into it

**Files:**
- Create: `src/ui/ScenarioSelect.tsx`
- Modify: `src/ui/MainMenu.tsx`, `src/App.tsx`
- Test: `tests/ui/scenarioSelect.test.tsx`

**Interfaces:**
- Consumes: `useScenarioStore`, `loadGameData().scenarios`, `useSeasonStore.viewScenarios/exitScenarios`

**Design note (a deliberate departure worth knowing):** the briefing is NOT a
separate screen. Tapping a scenario card expands it in place to show the
situation and the goal, with the confirm button inside the expanded card. The
briefing is four facts; a whole screen transition to deliver four facts is a
worse mobile experience than an inline expand, and it removes a phase.

- [ ] **Step 1: Build the screen**

Create `src/ui/ScenarioSelect.tsx`. Requirements, all of which the test asserts:

- Reads `loadGameData().scenarios` once (module scope, not per render).
- Header "SCENARIOS" with a sub-line "Drop into a race already in progress."
- A back control labelled `BACK` calling `exitScenarios()`.
- One card per scenario showing `name` and the circuit's display name.
- Tapping a card selects it (local `useState<string | null>`), expanding it to show:
  - the blurb
  - a situation readout derived from `spec.expect`, NOT re-simulated: `P{position}` · `{lapsRemaining} LAPS LEFT` · `{compound}{tyreAge}`. Deriving the display from `expect` keeps this screen instant; Task 2's test is what guarantees `expect` is true.
  - the goal, rendered as the literal text `FINISH P{goal.position} OR BETTER`
  - a button with the literal text `TAKE OVER` which calls `uiTap()`, then `select(spec)`, then `startScenarioPhase()` (the seasonStore action added in Task 3). Never `useSeasonStore.setState` from a component.
- Tapping the selected card again collapses it.
- Every tappable element uses `whileTap={{ scale: 0.97 }}` and `useUiTap()`.
- Numbers use `fontVariantNumeric: 'tabular-nums'` and `var(--font-mono)`.
- Motion: wrap card expansion in `AnimatePresence`; when `reducedMotion` is true use `initial={false}` and no height animation.
- Follow the visual language of `src/ui/Development.tsx` — read it first for panel/card/token conventions.

- [ ] **Step 2: Route it**

In `src/App.tsx` add the import and the route line beside the others:

```tsx
{phase === 'scenario_select' && <ScenarioSelect key="scenario_select" />}
{phase === 'scenario_racing' && <RaceHUD key="scenario_race" />}
{phase === 'scenario_result' && <ScenarioResult key="scenario_result" />}
```

`ScenarioResult` arrives in Task 5 — create a one-line placeholder component in
Task 4 only if needed to compile, and replace it fully in Task 5.

- [ ] **Step 3: Menu entry**

In `src/ui/MainMenu.tsx` add to `BROWSE_ITEMS`, as the FIRST entry:

```ts
  { id: 'scenarios', label: 'SCENARIOS',     sub: 'Drop into a race in progress', primary: false },
```

and in `handleAction`: `else if (id === 'scenarios') viewScenarios()`, with
`const viewScenarios = useSeasonStore(s => s.viewScenarios)` alongside the others.

- [ ] **Step 4: Test**

Create `tests/ui/scenarioSelect.test.tsx`, following the setup style of
`tests/ui/mainMenuContinue.test.tsx` (it shows the Preferences mock this suite
needs). Assert:

1. every scenario in `loadGameData().scenarios` has its `name` rendered
2. the goal and situation are hidden until the card is tapped
3. tapping a card reveals `FINISH P{n} OR BETTER` and the situation readout
4. `TAKE OVER` sets `useScenarioStore.getState().active` to that spec AND sets `useSeasonStore.getState().phase` to `'scenario_racing'` — assert BOTH; setting the spec without moving the phase is the same class of dead-end as the save/resume bug that shipped `phase` unset
5. `BACK` returns the phase to `'menu'`

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/ui/scenarioSelect.test.tsx && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): scenario picker with an inline briefing"
```

---

### Task 5: The result screen, judged against the goal

**Files:**
- Create: `src/ui/ScenarioResult.tsx`
- Test: `tests/ui/scenarioResult.test.tsx`

**Interfaces:**
- Consumes: `useScenarioStore` (`active`, `outcome`, `exit`), `useSeasonStore` (`backToMenu`, `startScenarioPhase` from Task 4)

- [ ] **Step 1: Build the screen**

Create `src/ui/ScenarioResult.tsx`. Read `src/ui/RaceResult.tsx` first and
follow its visual language. Requirements:

- Reads `active` and `outcome` from `useScenarioStore`. If either is null, render nothing (`return null`) — a defensive guard, since the route can only be reached with both set.
- A verdict line, literal text: `GOAL MET` when `outcome.met`, otherwise `GOAL MISSED`. Coloured `var(--positive)` / `var(--accent-warm)`.
- **Colour is never the only signal** (CLAUDE.md §6.3): prefix the verdict with `✓` or `✗` and give the container `role="status"`.
- A line showing what was asked and what happened: `TARGET P{goal.position}` and `FINISHED P{outcome.position}`, or the literal `RETIRED` when `outcome.retired`.
- `TRY AGAIN` — calls `useRaceStore.getState().resetRace()`, then `startScenarioPhase()`. It must NOT clear `active`.
- `BACK TO MENU` — calls `exit()` then `backToMenu()`.
- Both buttons use `useUiTap()`.

- [ ] **Step 2: Test**

Create `tests/ui/scenarioResult.test.tsx`. Assert:

1. `GOAL MET` with `outcome.met: true`; `GOAL MISSED` when false
2. the verdict carries a non-colour signal (`✓` / `✗` present in the text)
3. a retired player shows `RETIRED` rather than a finishing position — set `{ met: false, position: 12, retired: true }` and assert the literal `RETIRED` renders and `FINISHED P12` does not
4. `TRY AGAIN` leaves `useScenarioStore.getState().active` set and moves the phase to `'scenario_racing'` — replaying must not need re-picking the scenario
5. `BACK TO MENU` clears `active` and sets phase `'menu'`

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: full suite green, build clean.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): scenario result, judged against the authored goal"
```

---

## PART B — GUIDED FIRST RACE

### Task 6: The "seen it" flag and the coach store

**Files:**
- Modify: `src/state/settingsStore.ts`, `src/ui/SettingsPanel.tsx`
- Create: `src/state/coachStore.ts`
- Test: `tests/state/coachStore.test.ts`, extend `tests/state/settingsStore.test.ts`

**Interfaces:**
- Produces: `settingsStore.coachMarksSeen: boolean` + `setCoachMarksSeen(v)`; `useCoachStore` with `{ active, done, request(id), dismiss(id), reset() }`
- Produces: `CoachMarkId = 'tyre_cliff' | 'projection'`

- [ ] **Step 1: The flag**

In `src/state/settingsStore.ts` add `coachMarksSeen: boolean` to `SettingsState`
(default `false`), `setCoachMarksSeen: (v: boolean) => void`, a key
`coachMarksSeen: 'settings.coachMarksSeen'` in `K`, the setter following the
exact pattern of the others, and the load line:

```ts
      coachMarksSeen:    coachMarksSeen != null ? coachMarksSeen === 'true' : false,
```

The destructure of `results.map(r => r.value)` is positional — add the new name
in the SAME position as its key in `K`. Getting this wrong silently shifts every
setting by one, so put the key LAST in `K` and the name LAST in the destructure.

- [ ] **Step 2: The store**

Create `src/state/coachStore.ts`:

```ts
import { create } from 'zustand'

export type CoachMarkId = 'tyre_cliff' | 'projection'

interface CoachStore {
  /** At most one mark is ever on screen. */
  active: CoachMarkId | null
  done: Record<string, boolean>
  request: (id: CoachMarkId) => void
  dismiss: (id: CoachMarkId) => void
  reset: () => void
}

/**
 * Coach marks are request-driven, not scripted: the UI asks for a mark at the
 * moment the thing it explains actually happens (the cliff approaching, the
 * pit panel opening), and this store decides whether it is still owed.
 *
 * `done` makes a mark idempotent within a session, so a condition that stays
 * true across many sim ticks -- which is exactly what "the cliff is coming"
 * does -- cannot re-raise it on every tick.
 */
export const useCoachStore = create<CoachStore>((set, get) => ({
  active: null,
  done: {},
  request(id) {
    // Never interrupt a mark already up, and never repeat a finished one.
    if (get().active !== null || get().done[id]) return
    set({ active: id })
  },
  dismiss(id) {
    set(s => ({ active: s.active === id ? null : s.active, done: { ...s.done, [id]: true } }))
  },
  reset() { set({ active: null, done: {} }) },
}))
```

- [ ] **Step 3: Settings control**

In `src/ui/SettingsPanel.tsx`, add a control in the same style as the existing
toggles labelled `REPLAY TUTORIAL` with sub-text `Show the first-race coaching again`.
Read the file first and match its row component exactly. Activating it calls
`setCoachMarksSeen(false)` and `useCoachStore.getState().reset()`. If the panel's
rows are all boolean toggles, render this as a toggle bound to `!coachMarksSeen`
so it fits the existing row component rather than introducing a button variant.

- [ ] **Step 4: Tests**

Create `tests/state/coachStore.test.ts` asserting:

1. `request('tyre_cliff')` sets `active`
2. a second `request` for a DIFFERENT id while one is active does nothing — `active` stays on the first. *This is the guard that matters*: the cliff and the pit panel can both become true in the same tick, and two stacked overlays would trap the player.
3. `dismiss` clears `active` and marks `done`
4. `request` after `dismiss` does NOT re-raise — assert this by requesting the same id twice with a dismiss between. The cliff condition stays true for many sim ticks, so without `done` the mark would reappear on every tick and be unclosable.
5. `reset()` clears both

Extend `tests/state/settingsStore.test.ts` with a round-trip for `coachMarksSeen`
(save → load → still false/true), following the existing tests' Preferences mock.
Add an assertion that loading with NO stored value yields `false` — a new player
must get the tutorial.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/state/ && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(state): coach-mark flag and one-at-a-time mark store"
```

---

### Task 7: The coach-mark primitive

**Files:**
- Create: `src/ui/CoachMark.tsx`
- Test: `tests/ui/coachMark.test.tsx`

**Interfaces:**
- Consumes: `useCoachStore`, `useSettingsStore` (`reducedMotion`), `useClockStore`
- Produces: `<CoachMark id title body />` — renders only when it is the active mark

- [ ] **Step 1: Build it**

Create `src/ui/CoachMark.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCoachStore, type CoachMarkId } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { useUiTap } from '@hooks/useUiTap'

interface Props { id: CoachMarkId; title: string; body: string }

/**
 * A single piece of first-race coaching.
 *
 * PAUSES THE RACE while it is up. A coach mark explains something that is
 * happening right now -- the cliff arriving, the projection appearing -- and a
 * race that keeps running while the player reads would make the explanation
 * describe a moment that has already passed. The previous speed is restored on
 * dismiss, so a player watching at 4x is not silently dropped to 1x.
 *
 * Deliberately NOT a modal dialog: it explains the screen behind it, so
 * covering that screen would defeat it. It is a labelled region with its own
 * dismiss control, announced politely rather than seizing focus, so a
 * screen-reader user is told about it without being yanked out of the race.
 */
export function CoachMark({ id, title, body }: Props) {
  const active = useCoachStore(s => s.active)
  const dismiss = useCoachStore(s => s.dismiss)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const setSpeed = useClockStore(s => s.setSpeed)
  const uiTap = useUiTap()
  const showing = active === id
  const restoreRef = useRef<GameSpeed | null>(null)

  useEffect(() => {
    if (!showing) return
    restoreRef.current = useClockStore.getState().speed
    setSpeed(0)
    return () => {
      // Restore on unmount too, not only on dismiss -- a mark that is still up
      // when the race ends must not leave the clock paused forever.
      if (restoreRef.current !== null) setSpeed(restoreRef.current)
      restoreRef.current = null
    }
  }, [showing]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {showing && (
        <motion.div
          role="region"
          aria-live="polite"
          aria-label={`Tip: ${title}`}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ /* see Step 2 */ }}
        >
          {/* title, body, and a DISMISS button calling uiTap() then dismiss(id) */}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

Complete the styling in Step 2. The dismiss button's accessible name must be the
literal `GOT IT`.

- [ ] **Step 2: Style it**

Position it fixed near the bottom, above the safe-area inset, full width minus a
16px gutter, `zIndex` above the HUD but below any existing modal. Use
`var(--bg-elevated)` background, a `1px solid var(--accent)` border, `borderRadius: 12`,
and a soft accent glow via `boxShadow: '0 8px 32px rgba(0,229,208,0.15)'`. Title in
`var(--font-display)` at 12px, `letterSpacing: '0.12em'`, `var(--accent)`. Body in
`var(--font-body)` at 13px, `var(--text-hi)`, `lineHeight: 1.5`. Verify the body
text clears 4.5:1 against `--bg-elevated` and state the measured ratio in a comment.

- [ ] **Step 3: Test**

Create `tests/ui/coachMark.test.tsx` asserting:

1. renders nothing when it is not the active mark
2. renders title and body when it is
3. `GOT IT` dismisses it and marks it done in `coachStore`
4. **it pauses the race while up and RESTORES the previous speed on dismiss** — set clock speed to 4, request the mark, assert speed is 0, dismiss, assert speed is back to 4. *This is the one that bites*: restoring to a hardcoded 1 instead of the captured value is the natural mistake and is invisible without this assertion.
5. unmounting while still showing also restores the speed
6. with `reducedMotion: true` it still renders its text (motion degrades, content does not)

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/ui/coachMark.test.tsx && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): coach-mark primitive that pauses the race it explains"
```

---

### Task 8: Fire the two marks on the first race

**Files:**
- Modify: `src/ui/RaceHUD.tsx`, `src/ui/TelemetryZone.tsx`, `src/ui/PitPanel.tsx`
- Test: `tests/ui/coachMarkFiring.test.tsx`

**Interfaces:**
- Consumes: `useCoachStore.request`, `settingsStore.coachMarksSeen`, `useSeasonStore.phase`

- [ ] **Step 1: A single gate for "is the player being coached"**

Create `src/hooks/useCoachingActive.ts` (NOT in `state/` — it composes two
stores for the UI's benefit, which is exactly what `src/hooks/useSafetyCar.ts`
already does, and it keeps `coachStore` free of store-to-store imports):

```ts
/**
 * Coaching runs on a season race only, and only until the player has seen it.
 *
 * Scenario mode is excluded deliberately: a scenario drops the player into lap
 * 40 of a race that is already half-run, which is the worst possible moment to
 * meet the tyre cliff for the first time.
 */
export function useCoachingActive(): boolean {
  const seen = useSettingsStore(s => s.coachMarksSeen)
  const phase = useSeasonStore(s => s.phase)
  return !seen && phase === 'racing'
}
```

Import `useSettingsStore` from `@state/settingsStore` and `useSeasonStore` from
`@state/seasonStore`. Both are plain value imports; `hooks/` sits above `state/`
so this introduces no cycle and is outside everything
`tests/state/storeBoundaries.test.ts` constrains.

- [ ] **Step 2: Fire the cliff mark**

In `src/ui/TelemetryZone.tsx`, `cliffIn` and `pastCliff` are already computed
around line 190. Add:

```tsx
  const coaching = useCoachingActive()
  const request = useCoachStore(s => s.request)
  const approaching = cliffIn !== null && cliffIn <= 5 && !pastCliff
  useEffect(() => {
    if (coaching && approaching) request('tyre_cliff')
  }, [coaching, approaching]) // eslint-disable-line react-hooks/exhaustive-deps
```

`request` is already idempotent via `done`, so firing on a condition that stays
true across many ticks is safe — that is exactly why the store owns that guard
rather than this component.

- [ ] **Step 3: Fire the projection mark**

In `src/ui/PitPanel.tsx`, the panel body already renders `{projectionResult && <ProjectionCard .../>}`
around line 199. Add an effect in that component:

```tsx
  useEffect(() => {
    if (coaching && projectionResult) request('projection')
  }, [coaching, projectionResult]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Host the marks and retire the tutorial**

In `src/ui/RaceHUD.tsx`, render both marks inside the HUD root (they position
themselves), with this copy verbatim:

```tsx
<CoachMark
  id="tyre_cliff"
  title="THE CLIFF IS COMING"
  body="Tyre pace falls away gently, then collapses. That gauge is counting down the laps until it does — once you are past it you lose far more than a pit stop costs."
/>
<CoachMark
  id="projection"
  title="WHAT PITTING COSTS YOU"
  body="This is where you would rejoin if you boxed right now, traffic included. Compare it with where you are before you commit."
/>
```

Then retire the tutorial once both are done:

```tsx
  const done = useCoachStore(s => s.done)
  const setCoachMarksSeen = useSettingsStore(s => s.setCoachMarksSeen)
  useEffect(() => {
    if (done.tyre_cliff && done.projection) setCoachMarksSeen(true)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Test**

Create `tests/ui/coachMarkFiring.test.tsx` asserting:

1. with `coachMarksSeen: true`, requesting a mark from a coached surface leaves `active` null — a returning player is never coached
2. with `seasonPhase: 'scenario_racing'`, `useCoachingActive()` is false
3. once both marks are dismissed, `coachMarksSeen` becomes true
4. a mark dismissed in one race does not return in the next within the same session

Test `useCoachingActive` by rendering a trivial probe component rather than
mounting the whole HUD — mounting `RaceHUD` drags in PixiJS, which jsdom cannot
render. If asserting point 3 requires the HUD, extract the "retire the tutorial"
effect into a tiny exported hook and test that instead.

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx vite build`
Expected: full suite green, build clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(ui): coach marks on the first race -- the cliff and the projection"
```
