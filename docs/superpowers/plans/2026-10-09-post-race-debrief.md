# Post-Race Debrief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every season race, judge each call the player made (pit stops, pace changes, the pre-race plan) by replaying the race with that call done differently, and show the verdicts on the result screen. Prerequisite: the pre-race plan actually executes.

**Architecture:** In-race calls move into pure engine functions and are logged by step. A pure `engine/debrief.ts` replays the race up to a branch point (shared past), then runs the actual call and each alternative through the same K seeded futures, and reports the best alternative only when it clears two thresholds. It runs in a Web Worker behind a `DebriefRunner` interface; a card on the result screen shows progress and verdicts.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vite module Web Workers, Capacitor Android, Zustand, zod, Vitest, React + Framer Motion.

**Spec:** `docs/superpowers/specs/2026-10-09-post-race-debrief-design.md`

## Global Constraints

- `src/engine/` stays pure: no imports from `state/`, `ui/`, `canvas/`, `workers/`; no `Math.random()`, no `Date.now()`. All randomness through `createRng` from `src/engine/rng.ts`.
- Engine regression oracles must not change: `tests/engine/byteIdentity.test.ts`, `tests/engine/monteCarlo.test.ts`, `tests/engine/scenario.test.ts`, and every other `tests/engine/*` test must pass **without edits**. If one fails, stop and report — do not edit it.
- Tuning lives in `src/data/tuning.json` under `debrief`, zod-validated in `src/data/validators.ts` and typed in `TuningConstants` (`src/engine/types.ts`): `futures 8`, `lapOffsets [-3, -2, -1, 1, 2, 3]`, `minGain 1.0`, `minShare 0.67`, `timeoutMs 20000`.
- A retirement counts as finishing position `cars.length + 1` (P21 on a 20-car grid).
- The file that constructs the Worker (`src/state/debriefWorkerRunner.ts`) is imported only by `src/App.tsx`. Nothing re-exports it.
- UI: colours via tokens only; ▲ amber (`--tyre-medium`) = a better alternative existed, ✓ teal (`--accent`) = good call, symbol always present with colour; numbers in `--font-mono` with `font-variant-numeric: tabular-nums`; honour `reducedMotion`; no haptic and no sound on the card; copy says "Better: …", never "you should have".
- Displayed lap numbers use the HUD's convention: `state.lap + 1` (`src/ui/RaceHUD.tsx`).
- Run `npx vitest run` and `npx tsc --noEmit -p .` before every commit; both clean.
- Commit messages end with a `Co-Authored-By:` trailer naming the model that wrote the commit.

## Rulings against the spec

- **The plan auto-executes only when `config.playerStrategyOverride` is set.** Without an override the player's car inherits its team's default strategy (`src/engine/race.ts` `initRace`); executing that would change every engine regression oracle. Season races always carry the player's chosen plan, so players get the fix and the oracles stay byte-identical. Cost if wrong: quick-race/test configs keep the old behaviour.
- **The two-compound rule is not used to filter alternatives.** In this engine it is a time penalty applied at the flag (`src/engine/race.ts`, `twoCompoundPenaltySec`), not a legality rule, so an alternative that breaks it is simply penalised in its replay. Alternatives are filtered by tyre allocation only. Cost if wrong: a few wasted replays.
- **Branch point** is `max(0, 3 × (earliestAlternativeLap − 2))` — a conservatively early branch. An earlier branch is always valid (the shared past is just shorter); it removes any off-by-one between "lap a stop triggers" and "step a lap begins". Cost if wrong: slightly more future noise.

---

## File map

| file | change | responsibility |
|---|---|---|
| `src/engine/pitStop.ts` | **create** | one stop-time model for every stop (AI, plan, manual) |
| `src/engine/race.ts` | modify | AI uses `pitStopTime`; player's plan auto-executes |
| `src/engine/playerCalls.ts` | **create** | `PlayerCall`, `applyPlayerPit`, `applyPlayerPace`, `applyCall` |
| `src/engine/debrief.ts` | **create** | `simulate`, `replay`, `actualTimeline`, `judgeCalls`, verdict |
| `src/engine/types.ts` | modify | `TuningConstants.debrief`; debrief result types |
| `src/engine/index.ts` | modify | export the new engine API |
| `src/data/tuning.json`, `src/data/validators.ts` | modify | `debrief` block |
| `src/state/raceStore.ts` | modify | use engine call functions; log `playerCalls`; react to auto stops |
| `src/state/debriefRunner.ts` | **create** | `DebriefRunner` interface, in-process runner |
| `src/state/debriefStore.ts` | **create** | status, progress, result, lifecycle |
| `src/state/debriefWorkerRunner.ts` | **create** | the only Worker constructor |
| `src/workers/debrief.worker.ts` | **create** | thin shell around `judgeCalls` |
| `src/workers/ping.worker.ts` | **create** (Task 1) | device spike; deleted at the end of Task 1 |
| `src/ui/RaceWatcher.tsx` | modify | start the debrief at the flag |
| `src/ui/RaceResult.tsx` | modify | mount the card; cancel on leave |
| `src/ui/DebriefCard.tsx` | **create** | the card |
| `src/App.tsx` | modify | install the worker runner |
| tests | create | per task below |

---

### Task 1: Prove a module Web Worker runs on the phone

**Files:**
- Create (temporary): `src/workers/ping.worker.ts`
- Modify (temporary): `src/App.tsx`
- Record: `docs/V2-CHECKLIST.md`

**Interfaces:** Consumes nothing. Produces a recorded yes/no — the rest of this plan assumes yes.

This is a spike. Its code is deleted at the end of the task; only the finding is committed.

- [ ] **Step 1: Write the ping worker**

```ts
// src/workers/ping.worker.ts
self.onmessage = (e: MessageEvent<number>) => {
  let x = 0
  for (let i = 0; i < e.data; i++) x = (x + i) % 9973
  ;(self as unknown as Worker).postMessage({ ok: true, x })
}
```

- [ ] **Step 2: Call it once at app start, logging to the console**

In `src/App.tsx`, inside the existing top-level `useEffect` that calls `loadSettings`, add:

```ts
    // TEMP Task 1 spike -- delete before committing.
    try {
      const w = new Worker(new URL('./workers/ping.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e) => { console.log('PITWALL_WORKER_OK', JSON.stringify(e.data)); w.terminate() }
      w.onerror = (e) => console.log('PITWALL_WORKER_ERR', e.message)
      w.postMessage(1_000_000)
    } catch (err) {
      console.log('PITWALL_WORKER_THROW', String(err))
    }
```

- [ ] **Step 3: Build and check the web bundle emitted a worker chunk**

Run: `npm run build && ls dist/assets | grep -i ping`
Expected: one `ping.worker-*.js` file.

- [ ] **Step 4: Run on the device and read the log**

Capacitor release builds do not forward the WebView console to logcat, so build a temporary APK with console logging on. In `capacitor.config.ts` add, temporarily, `loggingBehavior: 'production',` at the top level of `config`. Then:

```bash
npx cap sync android
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleRelease
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
/opt/homebrew/share/android-commandlinetools/platform-tools/adb logcat -c
/opt/homebrew/share/android-commandlinetools/platform-tools/adb shell monkey -p com.veetrag.pitwall -c android.intent.category.LAUNCHER 1
sleep 6
/opt/homebrew/share/android-commandlinetools/platform-tools/adb logcat -d | grep PITWALL_WORKER
```

Expected: a `PITWALL_WORKER_OK` line. If you see `PITWALL_WORKER_ERR` or `PITWALL_WORKER_THROW`, or nothing, STOP and report BLOCKED with the output — the plan's architecture depends on this.

- [ ] **Step 5: Revert the spike and record the finding**

Delete `src/workers/ping.worker.ts`; revert the `App.tsx` and `capacitor.config.ts` edits (`git checkout -- src/App.tsx capacitor.config.ts`). Rebuild and reinstall the normal APK (same commands without the config edit). Confirm `git status --short` shows only `docs/V2-CHECKLIST.md` changed after you append:

```markdown
## 2026-10-09: module Web Workers on device

Spike for the post-race debrief: a Vite module worker
(`new Worker(new URL(..., import.meta.url), { type: 'module' })`) loaded and
replied inside the Capacitor WebView on the Pixel 10 Pro XL
(PITWALL_WORKER_OK). Spike code removed.
```

- [ ] **Step 6: Commit**

```bash
git add docs/V2-CHECKLIST.md
git commit -m "docs: module Web Workers run in the Capacitor WebView (debrief spike)"
```

---

### Task 2: One stop-time model, and the plan executes

**Files:**
- Create: `src/engine/pitStop.ts`
- Modify: `src/engine/race.ts` (AI pit block ~`:362-389`; add the player branch)
- Modify: `src/state/raceStore.ts` (`pitNow` stop time; `step` reacts to automatic stops)
- Test: `tests/engine/playerPlan.test.ts`, `tests/state/autoPlanStop.test.ts`

**Interfaces:**
- Produces: `pitStopTime(config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng): number` in `src/engine/pitStop.ts`.

- [ ] **Step 1: Write the failing engine tests**

Create `tests/engine/playerPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig, RaceState } from '@engine/types'

function runToEnd(config: RaceConfig): RaceState {
  let s = initRace(config)
  const rng = createRng(config.seed)
  while (!(s.lap >= s.totalLaps && s.sector === 0)) s = stepSector(config, s, rng)
  return s
}
const player = (s: RaceState) => s.cars.find(c => c.isPlayer)!

describe("the player's pre-race plan", () => {
  it('EXECUTES: the car pits at the planned lap onto the planned tyre', () => {
    const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 20, compound: 'H' }] }, null, undefined, true)
    const end = player(runToEnd(config))
    expect(end.pitsDone).toBeGreaterThanOrEqual(1)
    expect(end.compoundsUsed.slice(0, 2)).toEqual(['M', 'H'])
  })

  it('does nothing when no plan was chosen -- the engine oracles depend on it', () => {
    // No playerStrategyOverride: the player car carries its team's default
    // strategy, which the engine has never executed for the player.
    const end = player(runToEnd(buildRaceConfig(4242, 'd_voss')))
    expect(end.pitsDone).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/playerPlan.test.ts`
Expected: the first test FAILS (`pitsDone` 0); the second PASSES.

- [ ] **Step 3: Extract the stop-time model**

Create `src/engine/pitStop.ts`, moving the AI's model out of `race.ts` verbatim:

```ts
import type { RaceConfig, RaceState } from './types'
import { gaussianPair, type Rng } from './rng'
import { effectivePitLaneLoss } from './incidents'

/**
 * The time one pit stop costs, for ANY stop: an AI decision, the player's
 * plan, or the player's PIT button. One model, so a player's pit crew counts
 * however the stop is called. Draws exactly one gaussianPair from `rng`.
 */
export function pitStopTime(
  config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng,
): number {
  const [stopNoise] = gaussianPair(rng)
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  const effectiveStopMean = config.tuning.pit.stopMean - crewFactor * config.tuning.pit.pitCrewMeanRelief
  const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
  // Under yellow this is laneTimeLossUnderSc, not the circuit value.
  return effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) +
    effectiveStopMean + stopNoise * effectiveStopSigma
}
```

In `src/engine/race.ts`, replace the AI block's inline computation (the lines from `const [stopNoise] = gaussianPair(rng)` through the `const stopTime = ...` expression) with:

```ts
          const stopTime = pitStopTime(config, car.teamId, safetyCar, rng)
```

and import `pitStopTime` from `./pitStop`. Run `npx vitest run tests/engine` — every engine test must still pass unchanged (the draws are identical, only moved).

- [ ] **Step 4: Execute the player's plan**

In the same `finalCars` map in `race.ts`, the AI block is guarded by `if (!updated.isPlayer) { ... }`. Add an `else` branch:

```ts
      } else if (config.playerStrategyOverride) {
        // The player's own plan, executed exactly as the race setup screen
        // promises ("You can override this live during the race"). Indexed
        // by pitsDone like the AI's plannedStops, so a manual stop taken
        // earlier consumes the next planned one instead of adding a second.
        // Only when the player CHOSE a plan: without an override the car
        // carries its team's default strategy, which the engine has never
        // executed for the player -- and the regression oracles rely on that.
        const nextStop = updated.strategy.plannedStops[updated.pitsDone]
        if (nextStop && updated.lap >= nextStop.lap) {
          const compound = resolveAllocatedCompound(nextStop.compound, updated.tyreAllocation)
          if (compound) {
            const stopTime = pitStopTime(config, car.teamId, safetyCar, rng)
            updated = {
              ...updated,
              raceTime: updated.raceTime + stopTime,
              compound,
              tyreAge: 0,
              pitsDone: updated.pitsDone + 1,
              tyreAllocation: consumeTyreSet(updated.tyreAllocation, compound),
              compoundsUsed: [...updated.compoundsUsed, compound],
            }
          }
        }
      }
```

Import `resolveAllocatedCompound` from `./tyres` if `race.ts` does not already.

- [ ] **Step 5: Run the engine tests**

Run: `npx vitest run tests/engine`
Expected: all pass, including `playerPlan.test.ts` and, unchanged, `byteIdentity`, `monteCarlo`, `scenario`. If any oracle test fails, STOP and report it.

- [ ] **Step 6: Write the failing store test**

Create `tests/state/autoPlanStop.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

describe('an automatic plan stop on the HUD', () => {
  beforeEach(() => {
    useRaceStore.getState().resetRace()
    useRaceStore.getState().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 3, compound: 'H' }] }, null, undefined, true)
    useRaceStore.setState({ phase: 'racing' })
  })

  it('shows the car in the pit lane, like a manual stop', () => {
    let sawPit = false
    for (let i = 0; i < 30 && !sawPit; i++) {
      useRaceStore.getState().step()
      sawPit = useRaceStore.getState().playerInPit
    }
    expect(sawPit).toBe(true)
  })
})
```

Run: `npx vitest run tests/state/autoPlanStop.test.ts` — Expected: FAIL.

- [ ] **Step 7: Make `pitNow` use the shared model, and `step` react to automatic stops**

In `src/state/raceStore.ts` `pitNow`, replace the stop-time computation (`const { stopMean, stopSigma } = ...` and `const stopTime = ...`) with:

```ts
    const stopTime = pitStopTime(config, player.teamId, raceState.safetyCar, rng)
```

importing `pitStopTime` from `@engine/pitStop`.

In `step()`, after `const nextState = stepSector(...)`, detect a stop the engine made for the player:

```ts
    const before = raceState.cars.find(c => c.isPlayer)
    const after = nextState.cars.find(c => c.isPlayer)
    const autoStopped = !!before && !!after && after.pitsDone > before.pitsDone
```

and fold it into the existing `set(...)`: when `autoStopped`, set `playerInPit: true`, `pitEndTime: after.raceTime`, and append a caution alert `{ category: 'RADIO', icon: '📻', message: 'Box box -- plan stop.' }` (same shape and id scheme as `pitNow`'s alert). Keep the existing `stillInPit` logic for the non-auto case.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/state/autoPlanStop.test.ts tests/state/raceStore.test.ts tests/engine`
Expected: PASS. If a `raceStore.test.ts` case asserted the old uniform stop-time model, report it in your concerns with the output rather than editing its expected value.
Then full suite + tsc.

- [ ] **Step 9: Commit**

```bash
git add src/engine/pitStop.ts src/engine/race.ts src/state/raceStore.ts tests/engine/playerPlan.test.ts tests/state/autoPlanStop.test.ts
git commit -m "fix(race): the pre-race plan executes, with one stop-time model

The player's plan was only ever displayed: a player who did not tap PIT
ran one set of tyres to the cliff and retired, dry or wet, while the
setup screen promised the plan would run. It now executes when the
player chose one; without a chosen plan nothing changes, so the engine
regression oracles are byte-identical.

Every stop -- AI, plan, PIT button -- now costs time from one model,
including the team's pit crew, which the PIT button used to ignore."
```

---

### Task 3: Calls become engine functions and are logged

**Files:**
- Create: `src/engine/playerCalls.ts`
- Modify: `src/state/raceStore.ts` (`pitNow`, `setPaceMode`, `step`, start/reset)
- Test: `tests/engine/playerCalls.test.ts`, `tests/state/callLog.test.ts`

**Interfaces:**
- Consumes: `pitStopTime` (Task 2).
- Produces, in `src/engine/playerCalls.ts`:
  - `type PlayerCall = { step: number; kind: 'pit'; compound: Compound } | { step: number; kind: 'pace'; mode: PaceMode }`
  - `applyPlayerPit(config: RaceConfig, state: RaceState, compound: Compound, rng: Rng): RaceState | null` — `null` when no tyres of any type remain (draws nothing in that case)
  - `applyPlayerPace(state: RaceState, mode: PaceMode): RaceState`
  - `applyCall(config: RaceConfig, state: RaceState, call: PlayerCall, rng: Rng): RaceState` — a `null` pit returns `state` unchanged
- Produces, on `useRaceStore`: `playerCalls: PlayerCall[]`, `stepCount: number`.

- [ ] **Step 1: Write characterisation tests first**

Create `tests/engine/playerCalls.test.ts`. They pin what `raceStore.pitNow` / `setPaceMode` do to `RaceState` today, so the move cannot change behaviour:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { applyPlayerPit, applyPlayerPace } from '@engine/playerCalls'
import { buildRaceConfig } from '@state/buildRaceConfig'

const config = buildRaceConfig(777, 'd_voss', 'bengaluru', 'rookie',
  { startCompound: 'M', plannedStops: [] }, null, undefined, true)
function at(steps: number) {
  let s = initRace(config); const rng = createRng(config.seed)
  for (let i = 0; i < steps; i++) s = stepSector(config, s, rng)
  return { s, rng }
}

describe('applyPlayerPit', () => {
  it('fits the tyre, resets age, counts the stop, consumes a set, adds time', () => {
    const { s, rng } = at(30)
    const before = s.cars.find(c => c.isPlayer)!
    const next = applyPlayerPit(config, s, 'H', rng)!
    const p = next.cars.find(c => c.isPlayer)!
    expect(p.compound).toBe('H')
    expect(p.tyreAge).toBe(0)
    expect(p.pitsDone).toBe(before.pitsDone + 1)
    expect(p.tyreAllocation.H).toBe(before.tyreAllocation.H - 1)
    expect(p.compoundsUsed.at(-1)).toBe('H')
    expect(p.raceTime).toBeGreaterThan(before.raceTime)
    // Only the player changes.
    expect(next.cars.filter(c => !c.isPlayer)).toEqual(s.cars.filter(c => !c.isPlayer))
  })

  it('returns null and draws nothing when no tyres remain', () => {
    const { s } = at(30)
    const empty = { ...s, cars: s.cars.map(c => c.isPlayer
      ? { ...c, tyreAllocation: { S: 0, M: 0, H: 0, I: 0, W: 0 } } : c) }
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    expect(applyPlayerPit(config, empty, 'H', counting)).toBeNull()
    expect(draws).toBe(0)
  })

  it('does not mutate its input', () => {
    const { s, rng } = at(30)
    const frozen = JSON.stringify(s)
    applyPlayerPit(config, s, 'S', rng)
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('applyPlayerPace', () => {
  it("changes only the player's pace mode", () => {
    const { s } = at(10)
    const next = applyPlayerPace(s, 'push')
    expect(next.cars.find(c => c.isPlayer)!.paceMode).toBe('push')
    expect(next.cars.filter(c => !c.isPlayer)).toEqual(s.cars.filter(c => !c.isPlayer))
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`Failed to resolve import "@engine/playerCalls"`).

- [ ] **Step 3: Implement `src/engine/playerCalls.ts`**

```ts
import type { RaceConfig, RaceState, Compound, PaceMode } from './types'
import type { Rng } from './rng'
import { resolveAllocatedCompound, consumeTyreSet } from './tyres'
import { pitStopTime } from './pitStop'

/**
 * A call the player made during a race. `step` is the number of stepSector
 * calls completed before it; calls land between steps, so this pins each one
 * exactly and makes a race reproducible from (config, seed, calls).
 */
export type PlayerCall =
  | { step: number; kind: 'pit'; compound: Compound }
  | { step: number; kind: 'pace'; mode: PaceMode }

/** The PIT button. Null when no tyres of any type remain; draws nothing then. */
export function applyPlayerPit(
  config: RaceConfig, state: RaceState, compound: Compound, rng: Rng,
): RaceState | null {
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return null
  const resolved = resolveAllocatedCompound(compound, player.tyreAllocation)
  if (!resolved) return null
  const stopTime = pitStopTime(config, player.teamId, state.safetyCar, rng)
  return {
    ...state,
    cars: state.cars.map(car => car.isPlayer
      ? {
          ...car,
          raceTime: car.raceTime + stopTime,
          compound: resolved,
          tyreAge: 0,
          pitsDone: car.pitsDone + 1,
          tyreAllocation: consumeTyreSet(car.tyreAllocation, resolved),
          compoundsUsed: [...car.compoundsUsed, resolved],
        }
      : car),
  }
}

export function applyPlayerPace(state: RaceState, mode: PaceMode): RaceState {
  return { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, paceMode: mode } : c) }
}

export function applyCall(config: RaceConfig, state: RaceState, call: PlayerCall, rng: Rng): RaceState {
  switch (call.kind) {
    case 'pit': return applyPlayerPit(config, state, call.compound, rng) ?? state
    case 'pace': return applyPlayerPace(state, call.mode)
    default: { const never: never = call; return never }
  }
}
```

Export `PlayerCall`, `applyPlayerPit`, `applyPlayerPace`, `applyCall` from `src/engine/index.ts`.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Write the failing log test**

Create `tests/state/callLog.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

beforeEach(() => {
  useRaceStore.getState().resetRace()
  useRaceStore.getState().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [] }, null, undefined, true)
  useRaceStore.setState({ phase: 'racing' })
})

describe('the call log', () => {
  it('counts steps and logs each call at the step it was made', () => {
    const r = () => useRaceStore.getState()
    for (let i = 0; i < 7; i++) r().step()
    r().setPaceMode('push')
    for (let i = 0; i < 5; i++) r().step()
    r().pitNow('H')
    expect(r().stepCount).toBe(12)
    expect(r().playerCalls).toEqual([
      { step: 7, kind: 'pace', mode: 'push' },
      { step: 12, kind: 'pit', compound: 'H' },
    ])
  })

  it('a refused pit (no tyres) is not logged', () => {
    const s = useRaceStore.getState().raceState!
    useRaceStore.setState({ raceState: { ...s, cars: s.cars.map(c => c.isPlayer
      ? { ...c, tyreAllocation: { S: 0, M: 0, H: 0, I: 0, W: 0 } } : c) } })
    useRaceStore.getState().pitNow('H')
    expect(useRaceStore.getState().playerCalls).toEqual([])
  })

  it('a new race starts an empty log', () => {
    useRaceStore.getState().setPaceMode('push')
    useRaceStore.getState().resetRace()
    useRaceStore.getState().startSeasonRace('d_voss', 1, 'bengaluru')
    expect(useRaceStore.getState().playerCalls).toEqual([])
    expect(useRaceStore.getState().stepCount).toBe(0)
  })
})
```

Run — expect FAIL.

- [ ] **Step 6: Wire `raceStore`**

- Add `playerCalls: PlayerCall[]` and `stepCount: number` to the interface; initial `[]` and `0`; reset to `[]`/`0` in `resetRace`, `startRace`, `startSeasonRace`, `startScenarioRace`, `initForStartSequence`.
- `step()`: increment `stepCount` in the same `set` as the new `raceState`.
- `pitNow(compound)`: call `applyPlayerPit(config, raceState, compound, rng)`. If it returns `null`, keep today's "No tyres left" alert path and do not log. Otherwise set `raceState` to the result, keep today's UI fields (`pitPanelOpen: false`, `playerInPit: true`, `pitEndTime` = the player's new `raceTime`, the "Box box box" alert), and append `{ step: stepCount, kind: 'pit', compound }`.
- `setPaceMode(mode)`: `applyPlayerPace`, and append `{ step: stepCount, kind: 'pace', mode }`.

- [ ] **Step 7: Run** `npx vitest run tests/state/callLog.test.ts tests/state/raceStore.test.ts tests/engine/playerCalls.test.ts` — PASS; then full suite + tsc.

- [ ] **Step 8: Commit**

```bash
git add src/engine/playerCalls.ts src/engine/index.ts src/state/raceStore.ts tests/engine/playerCalls.test.ts tests/state/callLog.test.ts
git commit -m "feat(race): player calls are engine functions, logged by step

pitNow and setPaceMode now apply pure engine functions and record each
call with the step it was made at -- the input a replay needs."
```

---

### Task 4: Replay reproduces the race — the foundation

**Files:**
- Create: `src/engine/debrief.ts` (replay half)
- Test: `tests/engine/replayFidelity.test.ts`

**Interfaces:**
- Consumes: `applyCall`, `PlayerCall` (Task 3).
- Produces, in `src/engine/debrief.ts`:
  - `isFinished(state: RaceState): boolean`
  - `simulate(config: RaceConfig, start: { state: RaceState; step: number }, rng: Rng, calls: readonly PlayerCall[], untilStep?: number): { state: RaceState; step: number }` — applies calls whose `step` ≥ `start.step` at their step; stops at `untilStep` (before applying calls at that step) or the flag.
  - `replay(config: RaceConfig, seed: number, calls: readonly PlayerCall[], untilStep?: number): { state: RaceState; step: number; rng: Rng }`

- [ ] **Step 1: Write the fidelity test**

Create `tests/engine/replayFidelity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useRaceStore } from '@state/raceStore'
import { replay } from '@engine/debrief'
import { createRng } from '@engine/rng'

/*
 * THE foundation of the debrief. Drive real races through the real store
 * actions, with calls at random moments, and require that replaying the log
 * reproduces the live race exactly. If this fails, nothing the debrief says
 * can be trusted.
 */
describe('replay reproduces the live race', () => {
  for (const seed of [11, 42, 777, 2024, 31337, 90001]) {
    it(`seed ${seed}`, () => {
      const pick = createRng(seed ^ 0x5eed)            // decides WHEN to call; not the race rng
      const r = () => useRaceStore.getState()
      r().resetRace()
      r().startSeasonRace('d_voss', seed, 'bengaluru', 'rookie',
        { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, false)
      useRaceStore.setState({ phase: 'racing' })
      const compounds = ['S', 'M', 'H', 'I'] as const
      const modes = ['push', 'neutral', 'conserve'] as const
      while (r().phase === 'racing') {
        const u = pick()
        if (u < 0.01) r().pitNow(compounds[Math.floor(pick() * 4)]!)
        else if (u < 0.03) r().setPaceMode(modes[Math.floor(pick() * 3)]!)
        r().step()
      }
      const live = r().raceState!
      const replayed = replay(r().config!, seed, r().playerCalls).state
      expect(replayed).toEqual(live)
    })
  }
})
```

- [ ] **Step 2: Run — expect FAIL** (no `@engine/debrief`).

- [ ] **Step 3: Implement the replay half of `src/engine/debrief.ts`**

```ts
import type { RaceConfig, RaceState } from './types'
import { initRace, stepSector } from './race'
import { createRng, type Rng } from './rng'
import { applyCall, type PlayerCall } from './playerCalls'

/** The same finish condition raceStore.step uses. */
export function isFinished(state: RaceState): boolean {
  return state.lap >= state.totalLaps && state.sector === 0
}

/**
 * Runs a race forward from `start`, applying every call whose step is at or
 * after start.step at exactly that step (before the step is simulated), until
 * `untilStep` (exclusive of calls at that step) or the flag.
 */
export function simulate(
  config: RaceConfig,
  start: { state: RaceState; step: number },
  rng: Rng,
  calls: readonly PlayerCall[],
  untilStep = Number.POSITIVE_INFINITY,
): { state: RaceState; step: number } {
  const pending = calls.filter(c => c.step >= start.step).slice().sort((a, b) => a.step - b.step)
  let { state, step } = start
  let i = 0
  for (;;) {
    if (step >= untilStep) break
    while (i < pending.length && pending[i]!.step === step) {
      state = applyCall(config, state, pending[i]!, rng)
      i++
    }
    if (isFinished(state)) break
    state = stepSector(config, state, rng)
    step++
  }
  return { state, step }
}

/** The race as it happened: (config, seed, calls) -> identical state. */
export function replay(
  config: RaceConfig, seed: number, calls: readonly PlayerCall[], untilStep?: number,
): { state: RaceState; step: number; rng: Rng } {
  const rng = createRng(seed)
  const out = simulate(config, { state: initRace(config), step: 0 }, rng, calls, untilStep)
  return { ...out, rng }
}
```

Note: `Array.prototype.sort` is stable, so two calls at the same step keep their logged order.

- [ ] **Step 4: Run — expect PASS for all six seeds.** If a seed fails, diff the first differing car field and report it — do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add src/engine/debrief.ts tests/engine/replayFidelity.test.ts
git commit -m "feat(debrief): replay reproduces a live race from its call log

The foundation: six seeds driven through the real store actions with
random calls replay to a deep-equal final state."
```

---

### Task 5: Judging calls

**Files:**
- Modify: `src/engine/debrief.ts` (judging half)
- Modify: `src/engine/types.ts` (`TuningConstants.debrief`, result types), `src/data/tuning.json`, `src/data/validators.ts`, `src/engine/index.ts`
- Test: `tests/engine/debriefJudge.test.ts`

**Interfaces:**
- Consumes: `simulate`, `replay`, `isFinished` (Task 4); `applyCall`, `PlayerCall` (Task 3).
- Produces, in `src/engine/types.ts`:

```ts
export type JudgedCall =
  | { kind: 'start'; compound: Compound }
  | { kind: 'plan'; lap: number; compound: Compound }     // display lap (state.lap + 1)
  | { kind: 'pit'; lap: number; compound: Compound }
  | { kind: 'pace'; lap: number; mode: PaceMode }

export type Alternative =
  | { kind: 'start'; compound: Compound }
  | { kind: 'plan' | 'pit'; lap: number; compound: Compound }
  | { kind: 'pace'; lap: number; mode: PaceMode }
  | { kind: 'pace-none' }

export interface OptionOutcome { meanPosition: number; positions: number[] }

export interface CallVerdict {
  call: JudgedCall
  actual: OptionOutcome
  better: (OptionOutcome & { alternative: Alternative; betterShare: number }) | null
}

export interface DebriefResult {
  futures: number
  verdicts: CallVerdict[]          // sorted by places left on the table, largest first
  retired: { lap: number; cause: 'tyre' | 'mechanical' | 'crash' } | null
}
```

- Produces, in `src/engine/debrief.ts`:
  - `futureSeed(seed: number, branchStep: number, k: number): number`
  - `pickBetter(actual: OptionOutcome, candidates: { alternative: Alternative; outcome: OptionOutcome }[], minGain: number, minShare: number): CallVerdict['better']`
  - `judgeCalls(config: RaceConfig, seed: number, calls: readonly PlayerCall[], onProgress?: (done: number, total: number) => void): DebriefResult`

- [ ] **Step 1: Add the tuning**

`src/data/tuning.json` top level:

```json
  "debrief": {
    "futures": 8,
    "lapOffsets": [-3, -2, -1, 1, 2, 3],
    "minGain": 1.0,
    "minShare": 0.67,
    "timeoutMs": 20000
  }
```

`TuningConstants` in `src/engine/types.ts`:

```ts
  // Post-race debrief (docs/superpowers/specs/2026-10-09-post-race-debrief-design.md).
  debrief: {
    futures: number
    lapOffsets: number[]
    minGain: number
    minShare: number
    timeoutMs: number
  }
```

and the matching zod object in `src/data/validators.ts` beside the others:

```ts
  debrief: z.object({
    futures: z.number().int().min(1),
    lapOffsets: z.array(z.number().int()).min(1),
    minGain: z.number().min(0),
    minShare: z.number().min(0).max(1),
    timeoutMs: z.number().int().positive(),
  }),
```

Add the result types above to `src/engine/types.ts`. Any test helper that builds a full `TuningConstants` literal (e.g. `makeDeterministicTuning`) must gain a `debrief` entry; add one with the values above — data only.

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/debriefJudge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { judgeCalls, pickBetter, futureSeed, replay } from '@engine/debrief'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig } from '@engine/types'

const o = (positions: number[]) => ({ positions, meanPosition: positions.reduce((a, b) => a + b, 0) / positions.length })

describe('pickBetter', () => {
  const actual = o([6, 6, 6, 6, 6, 6])
  it('reports an alternative a full place better in at least two-thirds of futures', () => {
    const r = pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 5, 6, 4]) }], 1.0, 0.67)
    expect(r?.meanPosition).toBe(5)
    expect(r?.betterShare).toBeCloseTo(5 / 6)
  })
  it('rejects one under minGain', () => {
    expect(pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 6, 6, 6]) }], 1.0, 0.67)).toBeNull()
  })
  it('rejects one better on average but in too few futures', () => {
    // mean 4.67 (gain 1.33) but better in only 2/6
    expect(pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([1, 1, 7, 7, 6, 6]) }], 1.0, 0.67)).toBeNull()
  })
  it('picks the best of several qualifying alternatives', () => {
    const r = pickBetter(actual, [
      { alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 5, 5, 5]) },
      { alternative: { kind: 'pit', lap: 20, compound: 'M' }, outcome: o([3, 3, 3, 3, 3, 3]) },
    ], 1.0, 0.67)
    expect(r?.alternative).toEqual({ kind: 'pit', lap: 20, compound: 'M' })
  })
})

describe('futureSeed', () => {
  it('is deterministic and distinct across k', () => {
    expect(futureSeed(42, 30, 1)).toBe(futureSeed(42, 30, 1))
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(k => futureSeed(42, 30, k))).size).toBe(8)
  })
})

describe('judgeCalls', () => {
  const plan = { startCompound: 'M' as const, plannedStops: [{ lap: 24, compound: 'H' as const }] }
  const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', plan, null, undefined, true)

  it('judges the start, the plan stop and each logged call', () => {
    const calls = [{ step: 90, kind: 'pace' as const, mode: 'push' as const }]
    const r = judgeCalls(config, 4242, calls)
    const kinds = r.verdicts.map(v => v.call.kind).sort()
    expect(kinds).toEqual(['pace', 'plan', 'start'])
    expect(r.futures).toBe(config.tuning.debrief.futures)
    for (const v of r.verdicts) expect(v.actual.positions).toHaveLength(r.futures)
  })

  it('is deterministic', () => {
    expect(judgeCalls(config, 4242, [])).toEqual(judgeCalls(config, 4242, []))
  })

  it('reports progress up to its total', () => {
    const seen: [number, number][] = []
    judgeCalls(config, 4242, [], (d, t) => seen.push([d, t]))
    const last = seen.at(-1)!
    expect(last[0]).toBe(last[1])
    expect(last[1]).toBeGreaterThan(0)
  })

  it('finds the earlier stop that avoids a certain tyre failure', () => {
    // Make failure certain once past the cliff threshold, then find the
    // first planned-stop lap at which the player's Mediums fail. Stopping
    // three laps earlier must then avoid it -- and the debrief must say so.
    const certain = (c: RaceConfig): RaceConfig => ({
      ...c, tuning: { ...c.tuning, tyreFailure: { ...c.tuning.tyreFailure, chancePerLapOverThreshold: 1e6, maxChancePerLap: 3 } },
    })
    let failing: RaceConfig | null = null
    let failLap = 0
    for (let lap = 8; lap < 50 && !failing; lap++) {
      const c = certain(buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
        { startCompound: 'S', plannedStops: [{ lap, compound: 'H' }] }, null, undefined, true))
      const p = replay(c, 4242, []).state.cars.find(x => x.isPlayer)!
      if (p.retired && p.retiredCause === 'tyre') { failing = c; failLap = lap }
    }
    expect(failing, 'some planned lap must fail').not.toBeNull()
    const r = judgeCalls(failing!, 4242, [])
    expect(r.retired?.cause).toBe('tyre')
    const planVerdict = r.verdicts.find(v => v.call.kind === 'plan')!
    expect(planVerdict.better).not.toBeNull()
    const alt = planVerdict.better!.alternative
    expect(alt.kind).toBe('plan')
    expect(alt.kind === 'plan' && alt.lap < failLap + 1).toBe(true)
  })
})
```

Run — expect FAIL.

- [ ] **Step 3: Implement the judging half**

Append to `src/engine/debrief.ts` (add imports for the new types and `Compound`, `PaceMode`):

```ts
const COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']

export function futureSeed(seed: number, branchStep: number, k: number): number {
  return (Math.imul(seed | 0, 1000003) + Math.imul(branchStep + 1, 7919) + Math.imul(k + 1, 104729)) >>> 0
}

function finishPosition(state: RaceState): number {
  const p = state.cars.find(c => c.isPlayer)!
  return p.retired ? state.cars.length + 1 : p.position
}

function outcome(positions: number[]): OptionOutcome {
  return { positions, meanPosition: positions.reduce((a, b) => a + b, 0) / positions.length }
}

export function pickBetter(
  actual: OptionOutcome,
  candidates: { alternative: Alternative; outcome: OptionOutcome }[],
  minGain: number, minShare: number,
): CallVerdict['better'] {
  let best: CallVerdict['better'] = null
  for (const c of candidates) {
    const gain = actual.meanPosition - c.outcome.meanPosition
    const wins = c.outcome.positions.filter((p, k) => p < actual.positions[k]!).length
    const betterShare = wins / c.outcome.positions.length
    if (gain < minGain || betterShare < minShare) continue
    if (!best || c.outcome.meanPosition < best.meanPosition) {
      best = { ...c.outcome, alternative: c.alternative, betterShare }
    }
  }
  return best
}

/** One branch's comparable option: a config and call list to run from the shared past. */
interface Option { alternative: Alternative | null; config: RaceConfig; calls: readonly PlayerCall[] }

function withPlan(config: RaceConfig, edit: (plan: NonNullable<RaceConfig['playerStrategyOverride']>) => NonNullable<RaceConfig['playerStrategyOverride']>): RaceConfig {
  const plan = config.playerStrategyOverride
  return plan ? { ...config, playerStrategyOverride: edit(plan) } : config
}

export function judgeCalls(
  config: RaceConfig, seed: number, calls: readonly PlayerCall[],
  onProgress?: (done: number, total: number) => void,
): DebriefResult {
  const { futures, lapOffsets, minGain, minShare } = config.tuning.debrief
  const minOffset = Math.min(0, ...lapOffsets)

  // The race as it happened, recording the lap of every call and every stop.
  const actualRun = replay(config, seed, calls)
  const player = actualRun.state.cars.find(c => c.isPlayer)!
  const lastLap = actualRun.state.totalLaps - 1

  // Laps at which the plan's stops happened.
  const planStops: { index: number; lap: number; compound: Compound }[] = []
  const callLaps = new Map<number, number>()       // step -> state.lap at that step
  {
    const rng = createRng(seed)
    let state = initRace(config)
    let step = 0
    let pitsBefore = 0
    const sorted = calls.slice().sort((a, b) => a.step - b.step)
    let i = 0
    for (;;) {
      while (i < sorted.length && sorted[i]!.step === step) {
        callLaps.set(step, state.lap)
        state = applyCall(config, state, sorted[i]!, rng)
        i++
      }
      pitsBefore = state.cars.find(c => c.isPlayer)!.pitsDone
      if (isFinished(state)) break
      state = stepSector(config, state, rng)
      step++
      const now = state.cars.find(c => c.isPlayer)!
      // Manual pits are applied BEFORE the step and already counted in
      // pitsBefore, so any increase across the step is the plan's.
      if (now.pitsDone > pitsBefore) {
        const plan = config.playerStrategyOverride
        const planned = plan?.plannedStops[pitsBefore]
        if (planned) planStops.push({ index: pitsBefore, lap: planned.lap, compound: planned.compound })
      }
    }
  }

  // Every (call, options) group to evaluate.
  const groups: { call: JudgedCall; branchLap: number; options: Option[] }[] = []
  // Alternatives are offered from the STARTING allocation. A compound used
  // up by the time of the call is still offered; applyPlayerPit /
  // resolveAllocatedCompound then fall back to the nearest available set in
  // that branch, so the option is penalised honestly, never crashes.
  const startAllocation = initRace(config).cars.find(c => c.isPlayer)!.tyreAllocation
  const legal = (exclude: Compound, _lap: number) =>
    COMPOUNDS.filter(c => c !== exclude && (startAllocation[c] ?? 0) > 0)

  // Starting compound.
  const plan = config.playerStrategyOverride
  if (plan) {
    groups.push({
      call: { kind: 'start', compound: plan.startCompound },
      branchLap: 0,
      options: [
        { alternative: null, config, calls },
        ...legal(plan.startCompound, 0).map(c => ({
          alternative: { kind: 'start', compound: c } as Alternative,
          config: withPlan(config, p => ({ ...p, startCompound: c })),
          calls,
        })),
      ],
    })
  }

  // Executed plan stops.
  for (const ps of planStops) {
    const editStop = (lap: number, compound: Compound) => withPlan(config, p => ({
      ...p, plannedStops: p.plannedStops.map((s, j) => j === ps.index ? { lap, compound } : s),
    }))
    const timing = lapOffsets
      .map(d => ps.lap + d)
      .filter(l => l >= 1 && l <= lastLap)
      .map(l => ({ alternative: { kind: 'plan', lap: l, compound: ps.compound } as Alternative, config: editStop(l, ps.compound), calls }))
    const tyre = legal(ps.compound, ps.lap)
      .map(c => ({ alternative: { kind: 'plan', lap: ps.lap, compound: c } as Alternative, config: editStop(ps.lap, c), calls }))
    groups.push({
      call: { kind: 'plan', lap: ps.lap, compound: ps.compound },
      branchLap: ps.lap + minOffset,
      options: [{ alternative: null, config, calls }, ...timing, ...tyre],
    })
  }

  // Logged calls.
  calls.forEach((call, idx) => {
    const lap = callLaps.get(call.step) ?? 0
    const others = calls.filter((_, j) => j !== idx)
    const moved = (d: number): PlayerCall => ({ ...call, step: call.step + 3 * d })
    const timing = lapOffsets
      .filter(d => lap + d >= 0 && lap + d <= lastLap)
      .map(d => ({
        alternative: (call.kind === 'pit'
          ? { kind: 'pit', lap: lap + d + 1, compound: call.compound }
          : { kind: 'pace', lap: lap + d + 1, mode: call.mode }) as Alternative,
        config,
        calls: [...others, moved(d)],
      }))
    const extra: Option[] = call.kind === 'pit'
      ? legal(call.compound, lap).map(c => ({
          alternative: { kind: 'pit', lap: lap + 1, compound: c } as Alternative,
          config,
          calls: [...others, { ...call, compound: c }],
        }))
      : [{ alternative: { kind: 'pace-none' }, config, calls: others }]
    groups.push({
      call: call.kind === 'pit'
        ? { kind: 'pit', lap: lap + 1, compound: call.compound }
        : { kind: 'pace', lap: lap + 1, mode: call.mode },
      branchLap: lap + minOffset,
      options: [{ alternative: null, config, calls }, ...timing, ...extra],
    })
  })

  const total = groups.reduce((n, g) => n + g.options.length * futures, 0)
  let done = 0
  const verdicts: CallVerdict[] = []

  for (const g of groups) {
    // Shared past: the real race, on its own seed, up to the branch.
    const branchStep = Math.max(0, 3 * (g.branchLap - 2))
    const isStart = g.call.kind === 'start'
    const outcomes = g.options.map(opt => {
      const positions: number[] = []
      for (let k = 0; k < futures; k++) {
        const past = isStart
          ? { state: initRace(opt.config), step: 0 }
          : (() => { const r = replay(config, seed, calls, branchStep); return { state: r.state, step: r.step } })()
        const end = simulate(opt.config, past, createRng(futureSeed(seed, branchStep, k)), opt.calls)
        positions.push(finishPosition(end.state))
        done++
        onProgress?.(done, total)
      }
      return outcome(positions)
    })
    const [actual, ...alts] = outcomes
    verdicts.push({
      call: g.call,
      actual: actual!,
      better: pickBetter(actual!, alts.map((o2, j) => ({ alternative: g.options[j + 1]!.alternative!, outcome: o2 })), minGain, minShare),
    })
  }

  const left = (v: CallVerdict) => (v.better ? v.actual.meanPosition - v.better.meanPosition : 0)
  verdicts.sort((a, b) => left(b) - left(a))

  return {
    futures,
    verdicts,
    retired: player.retired && player.retiredCause
      ? { lap: (player.retiredLap ?? player.lap) + 1, cause: player.retiredCause }
      : null,
  }
}
```

Performance note: the shared past is replayed per future (cheap at ~3.5 ms per whole race). Hoisting one `replay(... branchStep)` per group and deep-cloning its state per future is a valid optimisation if the timing in Step 4 is too slow — the state is plain JSON, so `structuredClone` is enough. Note that `replay` returns its rng too, but the futures must NOT reuse it; each future uses its own `createRng(futureSeed(...))`.

Export `judgeCalls`, `replay`, `simulate`, `pickBetter`, `futureSeed` and the result types from `src/engine/index.ts`.

- [ ] **Step 4: Run** `npx vitest run tests/engine/debriefJudge.test.ts` — PASS. Record in your report how long `judgeCalls` takes for the `judges the start, the plan stop and each logged call` case (vitest prints per-test duration). If over 3 s on this machine, apply the hoisting optimisation above and re-measure.

- [ ] **Step 5: Full suite + tsc, then commit**

```bash
git add src/engine/debrief.ts src/engine/types.ts src/engine/index.ts src/data/tuning.json src/data/validators.ts tests/engine/debriefJudge.test.ts
git commit -m "feat(debrief): judge each call against its alternatives

Shared past to the branch, then the actual call and every alternative
through the same K seeded futures. An alternative is reported only when
it is minGain places better on average and better in minShare of the
futures; tuning lives in tuning.json."
```

---

### Task 6: The runner, the worker and the store

**Files:**
- Create: `src/state/debriefRunner.ts`, `src/state/debriefStore.ts`, `src/state/debriefWorkerRunner.ts`, `src/workers/debrief.worker.ts`
- Modify: `src/App.tsx`, `src/ui/RaceWatcher.tsx`
- Test: `tests/state/debriefStore.test.ts`

**Interfaces:**
- Consumes: `judgeCalls`, `DebriefResult`, `PlayerCall` (Tasks 3, 5); `useRaceStore` `playerCalls` (Task 3).
- Produces:
  - `src/state/debriefRunner.ts`:
    ```ts
    export interface DebriefJob { config: RaceConfig; seed: number; calls: PlayerCall[] }
    export interface DebriefHandle { cancel(): void }
    export interface DebriefRunner {
      start(job: DebriefJob, on: {
        progress(done: number, total: number): void
        done(result: DebriefResult): void
        failed(reason: string): void
      }): DebriefHandle
    }
    export const inProcessRunner: DebriefRunner
    ```
  - `src/state/debriefStore.ts`: `useDebriefStore` with `status: 'idle' | 'running' | 'done' | 'failed'`, `done`, `total`, `result: DebriefResult | null`, `raceKey: string | null`, actions `start(job: DebriefJob, raceKey: string)`, `cancel()`, and a module function `setDebriefRunner(r: DebriefRunner): void`.
  - `src/state/debriefWorkerRunner.ts`: `export const workerRunner: DebriefRunner`.

- [ ] **Step 1: Write the failing store tests**

Create `tests/state/debriefStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import type { DebriefRunner } from '@state/debriefRunner'
import { inProcessRunner } from '@state/debriefRunner'
import { buildRaceConfig } from '@state/buildRaceConfig'

const job = () => ({
  config: buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 24, compound: 'H' }] }, null, undefined, true),
  seed: 4242, calls: [],
})

function manualRunner() {
  const live: { on: Parameters<DebriefRunner['start']>[1]; cancelled: boolean }[] = []
  const runner: DebriefRunner = {
    start(_job, on) { const h = { on, cancelled: false }; live.push(h); return { cancel: () => { h.cancelled = true } } },
  }
  return { runner, live }
}

beforeEach(() => { useDebriefStore.getState().cancel() })

describe('debriefStore', () => {
  it('runs to done with the in-process runner', async () => {
    setDebriefRunner(inProcessRunner)
    useDebriefStore.getState().start(job(), 'race-a')
    await vi.waitFor(() => expect(useDebriefStore.getState().status).toBe('done'), { timeout: 15000 })
    expect(useDebriefStore.getState().result?.verdicts.length).toBeGreaterThan(0)
  })

  it('a new start cancels the previous run', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().start(job(), 'race-b')
    expect(live[0]!.cancelled).toBe(true)
    expect(useDebriefStore.getState().raceKey).toBe('race-b')
  })

  it('ignores a result from a race the player has left', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().start(job(), 'race-b')
    live[0]!.on.done({ futures: 8, verdicts: [], retired: null })
    expect(useDebriefStore.getState().status).toBe('running')
  })

  it('cancel stops the run and returns to idle', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    useDebriefStore.getState().cancel()
    expect(live[0]!.cancelled).toBe(true)
    expect(useDebriefStore.getState().status).toBe('idle')
  })

  it('times out to failed and never throws', () => {
    vi.useFakeTimers()
    const { runner } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    vi.advanceTimersByTime(job().config.tuning.debrief.timeoutMs + 1)
    expect(useDebriefStore.getState().status).toBe('failed')
    vi.useRealTimers()
  })

  it('a runner failure becomes failed', () => {
    const { runner, live } = manualRunner()
    setDebriefRunner(runner)
    useDebriefStore.getState().start(job(), 'race-a')
    live[0]!.on.failed('boom')
    expect(useDebriefStore.getState().status).toBe('failed')
  })
})
```

Run — expect FAIL.

- [ ] **Step 2: Implement `src/state/debriefRunner.ts`**

```ts
import type { RaceConfig } from '@engine/types'
import type { DebriefResult } from '@engine/types'
import type { PlayerCall } from '@engine/playerCalls'
import { judgeCalls } from '@engine/debrief'

export interface DebriefJob { config: RaceConfig; seed: number; calls: PlayerCall[] }
export interface DebriefHandle { cancel(): void }
export interface DebriefRunner {
  start(job: DebriefJob, on: {
    progress(done: number, total: number): void
    done(result: DebriefResult): void
    failed(reason: string): void
  }): DebriefHandle
}

/**
 * Runs the debrief on the calling thread, after a macrotask so start()
 * returns first. For tests and as a fallback; the app installs the worker
 * runner (src/state/debriefWorkerRunner.ts) at startup.
 */
export const inProcessRunner: DebriefRunner = {
  start(job, on) {
    let cancelled = false
    setTimeout(() => {
      if (cancelled) return
      try {
        const result = judgeCalls(job.config, job.seed, job.calls, (d, t) => { if (!cancelled) on.progress(d, t) })
        if (!cancelled) on.done(result)
      } catch (e) {
        if (!cancelled) on.failed(String(e))
      }
    }, 0)
    return { cancel: () => { cancelled = true } }
  },
}
```

- [ ] **Step 3: Implement `src/state/debriefStore.ts`**

```ts
import { create } from 'zustand'
import type { DebriefResult } from '@engine/types'
import { inProcessRunner, type DebriefJob, type DebriefRunner, type DebriefHandle } from './debriefRunner'

let runner: DebriefRunner = inProcessRunner
/** The app installs the Worker runner at startup; tests keep the in-process one. */
export function setDebriefRunner(r: DebriefRunner): void { runner = r }

let handle: DebriefHandle | null = null
let timer: ReturnType<typeof setTimeout> | null = null
function stop() {
  handle?.cancel(); handle = null
  if (timer) { clearTimeout(timer); timer = null }
}

interface DebriefStore {
  status: 'idle' | 'running' | 'done' | 'failed'
  done: number
  total: number
  result: DebriefResult | null
  /** Identifies the race this debrief belongs to; results for any other race are ignored. */
  raceKey: string | null
  start: (job: DebriefJob, raceKey: string) => void
  cancel: () => void
}

export const useDebriefStore = create<DebriefStore>((set, get) => ({
  status: 'idle', done: 0, total: 0, result: null, raceKey: null,

  start(job, raceKey) {
    stop()
    set({ status: 'running', done: 0, total: 0, result: null, raceKey })
    const mine = () => get().raceKey === raceKey && get().status === 'running'
    handle = runner.start(job, {
      progress: (done, total) => { if (mine()) set({ done, total }) },
      done: (result) => { if (mine()) { stop(); set({ status: 'done', result }) } },
      failed: () => { if (mine()) { stop(); set({ status: 'failed' }) } },
    })
    timer = setTimeout(() => { if (mine()) { stop(); set({ status: 'failed' }) } }, job.config.tuning.debrief.timeoutMs)
  },

  cancel() {
    stop()
    set({ status: 'idle', done: 0, total: 0, result: null, raceKey: null })
  },
}))
```

- [ ] **Step 4: Run** the store tests — PASS.

- [ ] **Step 5: The worker and its runner**

`src/workers/debrief.worker.ts`:

```ts
import { judgeCalls } from '@engine/debrief'
import type { DebriefJob } from '@state/debriefRunner'

self.onmessage = (e: MessageEvent<DebriefJob>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  try {
    const { config, seed, calls } = e.data
    const result = judgeCalls(config, seed, calls, (done, total) => post({ type: 'progress', done, total }))
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'failed', reason: String(err) })
  }
}
```

`src/state/debriefWorkerRunner.ts`:

```ts
import type { DebriefRunner } from './debriefRunner'

/**
 * The ONLY file that constructs the debrief Worker. Imported by App.tsx
 * alone and re-exported by nothing: vitest cannot construct a Worker, so a
 * barrel that re-exported this would break every test that touched it --
 * the same rule src/sync/index.ts keeps for the Play Games plugin.
 */
export const workerRunner: DebriefRunner = {
  start(job, on) {
    const w = new Worker(new URL('../workers/debrief.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ type: string; done?: number; total?: number; result?: unknown; reason?: string }>) => {
      const m = e.data
      if (m.type === 'progress') on.progress(m.done ?? 0, m.total ?? 0)
      else if (m.type === 'done') { on.done(m.result as Parameters<typeof on.done>[0]); w.terminate() }
      else if (m.type === 'failed') { on.failed(m.reason ?? 'failed'); w.terminate() }
    }
    w.onerror = (e) => { on.failed(e.message); w.terminate() }
    w.postMessage(job)
    return { cancel: () => w.terminate() }
  },
}
```

In `src/App.tsx`, at module level after the imports:

```ts
import { setDebriefRunner } from './state/debriefStore'
import { workerRunner } from './state/debriefWorkerRunner'
setDebriefRunner(workerRunner)
```

Progress throttling: `judgeCalls` reports every simulation; posting ~400 messages is fine, but if the card re-renders visibly too often, throttle in the worker to every 2% (not required by tests).

- [ ] **Step 6: Start it at the flag**

In `src/ui/RaceWatcher.tsx`, in the season branch that fires at `racePhase === 'finished'`, immediately before `recordRaceResult(positions, events)`:

```ts
      const { config: raceConfig, playerCalls } = useRaceStore.getState()
      if (raceConfig) {
        useDebriefStore.getState().start(
          { config: raceConfig, seed: raceConfig.seed, calls: playerCalls },
          `${raceConfig.seed}`,
        )
      }
```

(`raceConfig.seed` already differs between attempts, because the season seed includes `attemptNonce`.) Import `useDebriefStore` from `@state/debriefStore`. Scenario races do not start a debrief.

- [ ] **Step 7: Full suite + tsc; build the web bundle and confirm a `debrief.worker-*.js` chunk exists (`ls dist/assets | grep -i debrief`).**

- [ ] **Step 8: Commit**

```bash
git add src/state/debriefRunner.ts src/state/debriefStore.ts src/state/debriefWorkerRunner.ts src/workers/debrief.worker.ts src/App.tsx src/ui/RaceWatcher.tsx tests/state/debriefStore.test.ts
git commit -m "feat(debrief): run the debrief in a Web Worker at the flag

A DebriefRunner interface with an in-process runner for tests and a
Worker runner installed by App.tsx only. The store tags each run with
its race, cancels on restart, ignores stale results and fails closed on
timeout -- it never blocks the result screen."
```

---

### Task 7: The card

**Files:**
- Create: `src/ui/DebriefCard.tsx`
- Modify: `src/ui/RaceResult.tsx` (mount between classification and championship; cancel on leave)
- Test: `tests/ui/debriefCard.test.tsx`

**Interfaces:**
- Consumes: `useDebriefStore` (Task 6); `CallVerdict`, `DebriefResult`, `Alternative`, `JudgedCall` (Task 5).
- Produces: `DebriefCard()` (no props), and exported pure helpers `describeCall(c: JudgedCall): string`, `describeAlternative(a: Alternative): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/debriefCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebriefCard, describeCall, describeAlternative } from '@ui/DebriefCard'
import { useDebriefStore } from '@state/debriefStore'
import { useSettingsStore } from '@state/settingsStore'
import type { DebriefResult } from '@engine/types'

const o = (p: number[]) => ({ positions: p, meanPosition: p.reduce((a, b) => a + b, 0) / p.length })
const result: DebriefResult = {
  futures: 8,
  retired: null,
  verdicts: [
    { call: { kind: 'pit', lap: 25, compound: 'H' }, actual: o([6, 6, 7, 6, 6, 5, 7, 6]),
      better: { ...o([4, 4, 5, 4, 4, 4, 5, 4]), alternative: { kind: 'pit', lap: 22, compound: 'M' }, betterShare: 1 } },
    { call: { kind: 'start', compound: 'M' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
    { call: { kind: 'pace', lap: 31, mode: 'push' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
    { call: { kind: 'plan', lap: 40, compound: 'S' }, actual: o([6, 6, 6, 6, 6, 6, 6, 6]), better: null },
  ],
}

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })

describe('DebriefCard', () => {
  it('shows progress while running', () => {
    useDebriefStore.setState({ status: 'running', done: 61, total: 100, result: null, raceKey: 'r' })
    render(<DebriefCard />)
    expect(screen.getByText(/reviewing/i)).toBeTruthy()
    expect(screen.getByText('61%')).toBeTruthy()
  })

  it('shows a better alternative with ▲, both averages and the share', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/▲ PIT L25 → HARD/)).toBeTruthy()
    expect(screen.getByText(/Better: L22 → MEDIUM/)).toBeTruthy()
    expect(screen.getByText(/avg P6\.1/)).toBeTruthy()
    expect(screen.getByText(/avg P4\.3 · 8\/8/)).toBeTruthy()
  })

  it('marks good calls with ✓ and collapses beyond three rows', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getAllByText(/GOOD CALL/).length).toBe(2)
    expect(screen.getByText(/\+1 more judged good/)).toBeTruthy()
  })

  it('expands a row to show each future', () => {
    useDebriefStore.setState({ status: 'done', result, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    fireEvent.click(screen.getByText(/▲ PIT L25 → HARD/))
    expect(screen.getByLabelText(/your call, finishing positions/i).textContent).toContain('P6')
  })

  it('shows a single dim line when unavailable', () => {
    useDebriefStore.setState({ status: 'failed', result: null, raceKey: 'r', done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/Debrief unavailable/)).toBeTruthy()
  })

  it('says why for a resumed race (idle)', () => {
    useDebriefStore.setState({ status: 'idle', result: null, raceKey: null, done: 0, total: 0 })
    render(<DebriefCard />)
    expect(screen.getByText(/Debrief unavailable for a resumed race/)).toBeTruthy()
  })

  it('names calls and alternatives in plain words', () => {
    expect(describeCall({ kind: 'start', compound: 'M' })).toBe('PLAN · START ON MEDIUM')
    expect(describeCall({ kind: 'pace', lap: 31, mode: 'push' })).toBe('PACE → PUSH L31')
    expect(describeAlternative({ kind: 'pace-none' })).toBe('no pace change')
  })
})
```

Run — expect FAIL.

- [ ] **Step 2: Implement `src/ui/DebriefCard.tsx`**

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useDebriefStore } from '@state/debriefStore'
import { useSettingsStore } from '@state/settingsStore'
import type { Alternative, CallVerdict, JudgedCall, Compound } from '@engine/types'

const TYRE: Record<Compound, string> = { S: 'SOFT', M: 'MEDIUM', H: 'HARD', I: 'INTER', W: 'WET' }
const MAX_ROWS = 3
const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }

export function describeCall(c: JudgedCall): string {
  switch (c.kind) {
    case 'start': return `PLAN · START ON ${TYRE[c.compound]}`
    case 'plan': return `PLAN · PIT L${c.lap} → ${TYRE[c.compound]}`
    case 'pit': return `PIT L${c.lap} → ${TYRE[c.compound]}`
    case 'pace': return `PACE → ${c.mode.toUpperCase()} L${c.lap}`
    default: { const n: never = c; return n }
  }
}

export function describeAlternative(a: Alternative): string {
  switch (a.kind) {
    case 'start': return `start on ${TYRE[a.compound]}`
    case 'plan':
    case 'pit': return `L${a.lap} → ${TYRE[a.compound]}`
    case 'pace': return `${a.mode.toUpperCase()} at L${a.lap}`
    case 'pace-none': return 'no pace change'
    default: { const n: never = a; return n }
  }
}

function Dots({ label, positions }: { label: string; positions: number[] }) {
  return (
    <div aria-label={label} style={{ ...mono, fontSize: 11, color: 'var(--text-mid)' }}>
      {positions.map((p, i) => <span key={i} style={{ marginRight: 6 }}>P{p}</span>)}
    </div>
  )
}

function Row({ v, index }: { v: CallVerdict; index: number }) {
  const [open, setOpen] = useState(false)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const better = v.better
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, ease: [0.2, 0, 0, 1] }}
      onClick={() => setOpen(o => !o)}
      style={{ padding: '10px 0', borderTop: '1px solid var(--line-hair)', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
          color: better ? 'var(--tyre-medium)' : 'var(--accent)' }}>
          {better ? '▲ ' : '✓ '}{describeCall(v.call)}
        </span>
        <span style={{ ...mono, fontSize: 12, color: 'var(--text-mid)' }}>
          {better ? `you avg P${v.actual.meanPosition.toFixed(1)}` : 'GOOD CALL'}
        </span>
      </div>
      {better && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-hi)' }}>Better: {describeAlternative(better.alternative)}</span>
          <span style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>
            {`avg P${better.meanPosition.toFixed(1)} · ${Math.round(better.betterShare * better.positions.length)}/${better.positions.length}`}
          </span>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
          <Dots label="Your call, finishing positions" positions={v.actual.positions} />
          {better && <Dots label="Better option, finishing positions" positions={better.positions} />}
        </div>
      )}
    </motion.div>
  )
}

export function DebriefCard() {
  const { status, done, total, result } = useDebriefStore()
  const shell = { background: 'var(--bg-panel)', border: '1px solid var(--line-hair)', borderRadius: 10, padding: '12px 14px' }
  const title = <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>YOUR CALLS</span>

  if (status === 'idle') {
    return <div style={{ ...shell, fontSize: 12, color: 'var(--text-dim)' }}>Debrief unavailable for a resumed race.</div>
  }
  if (status === 'failed') {
    return <div style={{ ...shell, fontSize: 12, color: 'var(--text-dim)' }}>Debrief unavailable.</div>
  }
  if (status === 'running' || !result) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <div style={shell}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>{title}
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>reviewing…</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--line-hair)', borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
          </div>
          <span style={{ ...mono, fontSize: 11, color: 'var(--text-mid)' }}>{pct}%</span>
        </div>
      </div>
    )
  }

  const shown = result.verdicts.slice(0, MAX_ROWS)
  const hidden = result.verdicts.length - shown.length
  return (
    <div style={shell}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>{title}
        <span style={{ ...mono, fontSize: 11, color: 'var(--text-dim)' }}>
          {result.verdicts.length} judged · {result.futures} futures</span></div>
      {result.retired && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>
          Retired L{result.retired.lap} · {result.retired.cause === 'tyre' ? 'tyre failure' : result.retired.cause}
        </div>
      )}
      {shown.map((v, i) => <Row key={i} v={v} index={i} />)}
      {hidden > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', paddingTop: 8, borderTop: '1px solid var(--line-hair)' }}>
          +{hidden} more judged good
        </div>
      )}
    </div>
  )
}
```

Note: verdicts are sorted with better-alternative rows first (Task 5), so any row beyond the first three is a good call — which is why the collapsed text says "judged good". If a fourth row had a better alternative, it would still be shown: render `shown` as the first three PLUS every later verdict whose `better` is non-null, and count only good calls in `hidden`. Implement that, and keep the test above passing.

- [ ] **Step 3: Mount it and cancel on leave**

In `src/ui/RaceResult.tsx`, render `<DebriefCard />` immediately before the `{/* Championship preview */}` block, wrapped in a `<div style={{ marginBottom: 16 }}>`. Add:

```ts
  useEffect(() => () => { useDebriefStore.getState().cancel() }, [])
```

and in the RETRY handler keep today's `retryRace()` — the next flag starts a new debrief, which cancels the old one. Import `useEffect` if not already imported, `useDebriefStore`, and `DebriefCard`.

- [ ] **Step 4: Run** `npx vitest run tests/ui/debriefCard.test.tsx tests/ui/raceResultPending.test.tsx tests/ui/raceResultMenu.test.tsx` — PASS; full suite + tsc.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DebriefCard.tsx src/ui/RaceResult.tsx tests/ui/debriefCard.test.tsx
git commit -m "feat(ui): the debrief card on the result screen

Progress while the worker runs, then each judged call: ▲ with the better
alternative, both averages and how many futures it won, or ✓ GOOD CALL.
Rows expand to the per-future positions. Unavailable states are a single
dim line; navigation is never blocked."
```

---

### Task 8: Device pass and the record

**Files:**
- Modify: `docs/V2-CHECKLIST.md`

- [ ] **Step 1: Build and install**

```bash
npm run build && npx cap sync android
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleRelease
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
```

Launch and confirm `adb logcat -d | grep FATAL` is empty.

- [ ] **Step 2: Check, with screenshots**

1. Race round 1 without tapping PIT: the car pits at the planned lap (plan executes; "Box box -- plan stop." alert).
2. At the flag the result screen shows "YOUR CALLS · reviewing…" with a moving percentage, and NEXT RACE stays tappable during it. Time how long the debrief takes to finish.
3. The finished card: rows, ▲/✓ symbols, "avg" figures, a row expands to per-future positions.
4. RETRY during "reviewing…": the new attempt's card starts fresh.
5. Scroll performance on the result screen while the worker runs: no visible stutter.

- [ ] **Step 3: Record**

Append to `docs/V2-CHECKLIST.md`:

```markdown
## 2026-10-09: post-race debrief

- Spec `docs/superpowers/specs/2026-10-09-post-race-debrief-design.md`, plan
  `docs/superpowers/plans/2026-10-09-post-race-debrief.md`.
- The pre-race plan now executes (it never did); all stops share one
  stop-time model including pit crew.
- Device pass: <what was observed, with the measured debrief time>.
```

Replace the angle-bracket line with what was actually observed. If a check could not be made, say so.

- [ ] **Step 4: Commit**

```bash
git add docs/V2-CHECKLIST.md
git commit -m "docs: post-race debrief device pass"
```
