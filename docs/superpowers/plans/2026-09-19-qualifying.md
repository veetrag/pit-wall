# Qualifying Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed, always-identical starting grid with a qualifying session the player takes part in, so grid position is earned and car upgrades can buy track position.

**Architecture:** A new pure engine module `src/engine/qualifying.ts` runs one flying lap per car through the existing `computeSectorTime`, around two player decisions (compound, attack level). `RaceConfig` gains an OPTIONAL `gridOrder`; when absent, `initRace` behaves exactly as today, so byte-identity, the Monte-Carlo bands and all three scenarios stay valid without re-authoring. A new `'qualifying'` season phase sits between `race_setup` and `racing`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Zustand, React, Framer Motion (`motion/react`), zod for data validation.

**Spec:** `docs/superpowers/specs/2026-09-19-qualifying-design.md`

## Global Constraints

- **Engine purity (CLAUDE.md §3):** `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`, or `hooks/`. No `Math.random()` anywhere in `engine/` — all randomness through the injected `Rng`.
- **Determinism is non-negotiable:** same seed + same inputs ⇒ byte-identical result.
- **No tuning constants in code.** All balance numbers live in `src/data/tuning.json` and are validated by zod in `src/data/validators.ts`.
- **`color-mix()` is banned.** minSdkVersion is 30; API 30's factory WebView is Chromium 91 and color-mix needs 111. Use `rgba(var(--token-rgb), <alpha>)` for alpha, or `linear-gradient(<rgba>, <rgba>), <solid>` to tint an opaque surface. Enforced by `tests/ui/colorMixBan.test.ts`.
- **No raw hex in components.** Colour via tokens in `src/styles/tokens.css` only.
- **All live-updating numbers use `fontVariantNumeric: 'tabular-nums'`** (CLAUDE.md §6.1).
- **Reduced motion** is read from `useSettingsStore(s => s.reducedMotion)`, NEVER a direct `window.matchMedia` call.
- **Colour is never the only signal** (CLAUDE.md §6.3) — a scrappy lap carries a text label, not just a colour.
- **`vitest` does not typecheck.** Run `npx tsc --noEmit` separately before every commit.
- The qualifying car's `paceMode` is always `'neutral'`; attack is applied ONLY through `tuning.qualifying.attackLevels[...].paceDelta`. `computeSectorTime` already adds `tuning.paceModes[car.paceMode].paceDelta / 3` per sector, so using both double-counts.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/types.ts` (modify) | Add `gridOrder?` and `qualifyingSeed?` to `RaceConfig`; add `QualifyingCall`, `QualifyingLap`, `QualifyingResult`, `AttackLevel`. |
| `src/engine/race.ts` (modify) | `initRace` consumes `gridOrder` when present, with a permutation guard. |
| `src/engine/qualifying.ts` (create) | `runQualifying` — the whole session. Pure. |
| `src/engine/index.ts` (modify) | Export the new function and types. |
| `src/data/tuning.json` (modify) | The `qualifying` block and its regression band. |
| `src/data/validators.ts` (modify) | zod schema for the `qualifying` block. |
| `src/state/buildRaceConfig.ts` (modify) | Thread an optional `gridOrder` through to `RaceConfig`. |
| `src/state/raceStore.ts` (modify) | `startSeasonRace` accepts and forwards `gridOrder`. |
| `src/state/seasonStore.ts` (modify) | `'qualifying'` phase, `qualifyingResult` slice, `runQualifyingSession` and `startRaceFromQualifying` actions. |
| `src/state/seasonPersistence.ts` (modify) | `qualifying: null` in `RESUME_PHASE`. |
| `src/ui/Qualifying.tsx` (create) | The screen: the call, SIMULATE, the result. |
| `src/App.tsx` (modify) | Render `Qualifying` on `phase === 'qualifying'`. |
| `scripts/calibrate-qualifying.ts` (create) | Measures field spread so the tuning numbers are chosen, not guessed. |

---

## Task 1: `gridOrder` on RaceConfig, consumed by initRace

**Files:**
- Modify: `src/engine/types.ts` (the `RaceConfig` interface)
- Modify: `src/engine/race.ts:41-62` (the `initRace` car mapping)
- Test: `tests/engine/gridOrder.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RaceConfig.gridOrder?: string[]` (driverIds, P1 first) and `RaceConfig.qualifyingSeed?: number`. Task 3 reads `qualifyingSeed`; Task 5 sets `gridOrder`.

**Why the field is optional, and why that matters more than it looks:** `tests/engine/byteIdentity.test.ts`, the Monte-Carlo regression bands in `MODEL_SPEC.md` §10.1, and all three scenarios in `src/data/scenarios.json` are pinned to the CURRENT fixed grid. If `gridOrder` were mandatory, or if its absence changed anything, every one of those would need re-authoring. Absence must reproduce today's behaviour exactly.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/gridOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initRace, stepSector, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('RaceConfig.gridOrder', () => {
  it('ABSENT gridOrder produces a byte-identical race to today', () => {
    /*
     * This is the assertion that protects byteIdentity.test.ts, the
     * Monte-Carlo bands in MODEL_SPEC.md 10.1, and all three scenarios in
     * src/data/scenarios.json -- every one of which is pinned to the fixed
     * drivers.json grid. If the fallback in initRace is ever removed, this
     * fails before any of those do, and with a clearer message.
     */
    const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    expect(config.gridOrder, 'buildRaceConfig must not set gridOrder by default').toBeUndefined()

    const run = () => {
      const rng = createRng(4242)
      let state = initRace(config)
      for (let i = 0; i < 30; i++) state = stepSector(config, state, rng)
      return state.cars.map(c => `${c.driverId}:${c.position}:${c.raceTime.toFixed(6)}`)
    }
    expect(run()).toEqual(run())

    // Grid order with no gridOrder is exactly drivers.json order.
    const fresh = initRace(config)
    expect(fresh.cars.map(c => c.driverId)).toEqual(config.drivers.map(d => d.id))
    expect(fresh.cars.map(c => c.position)).toEqual(config.drivers.map((_, i) => i + 1))
  })

  it('PRESENT gridOrder sets starting positions', () => {
    const base = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    const reversed = [...base.drivers.map(d => d.id)].reverse()
    const config = { ...base, gridOrder: reversed }
    const state = initRace(config)
    for (const [i, driverId] of reversed.entries()) {
      const car = state.cars.find(c => c.driverId === driverId)!
      expect(car.position, `${driverId} should start P${i + 1}`).toBe(i + 1)
    }
  })

  it('THROWS on a gridOrder that is not a permutation of the field', () => {
    /*
     * A bad gridOrder is a programming error, not a game state. Failing loudly
     * at the boundary beats producing a silently wrong grid that only shows up
     * as an inexplicable race result.
     */
    const base = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)
    const ids = base.drivers.map(d => d.id)

    expect(() => initRace({ ...base, gridOrder: ids.slice(0, -1) }), 'missing driver')
      .toThrow(/gridOrder/)
    expect(() => initRace({ ...base, gridOrder: [ids[0]!, ...ids] }), 'duplicate driver')
      .toThrow(/gridOrder/)
    expect(() => initRace({ ...base, gridOrder: [...ids.slice(1), 'd_nobody'] }), 'unknown driver')
      .toThrow(/gridOrder/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/engine/gridOrder.test.ts`
Expected: FAIL — `gridOrder` is not a property of `RaceConfig`, and the permutation guard does not exist.

- [ ] **Step 3: Add the fields to `RaceConfig`**

In `src/engine/types.ts`, inside `interface RaceConfig`, immediately after `weatherSeed?: number`:

```ts
  // Starting grid, P1 first, as driverIds. ABSENT means "use drivers.json
  // order", which is exactly what the engine did before qualifying existed --
  // byteIdentity, the Monte-Carlo bands and all three scenarios depend on that
  // fallback being byte-identical, so do not make this required.
  gridOrder?: string[]
  // Separate RNG stream for qualifying, same pattern as weatherSeed above, so
  // a qualifying session consumes nothing from the main race seed.
  qualifyingSeed?: number
```

- [ ] **Step 4: Consume it in `initRace`**

In `src/engine/race.ts`, immediately before `const cars: CarState[] = config.drivers.map((driver, i) => {`:

```ts
  // Validate before use: a gridOrder that is not a permutation of the field
  // would otherwise silently leave cars at position 0 or stack two cars on the
  // same slot, and the symptom would surface laps later as a nonsense result.
  if (config.gridOrder) {
    const fieldIds = config.drivers.map(d => d.id)
    const given = config.gridOrder
    const unique = new Set(given)
    const ok = given.length === fieldIds.length
      && unique.size === given.length
      && given.every(id => fieldIds.includes(id))
    if (!ok) {
      throw new Error(
        `gridOrder must be a permutation of config.drivers (got ${given.length} entries, ` +
        `${unique.size} unique, for a field of ${fieldIds.length})`,
      )
    }
  }
```

Then change the `position` assignment inside the map from `position: i + 1` to:

```ts
      position: config.gridOrder ? config.gridOrder.indexOf(driver.id) + 1 : i + 1,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/engine/gridOrder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the fallback test can actually fail (mutation check)**

Temporarily change the `position` line to `position: config.gridOrder ? config.gridOrder.indexOf(driver.id) + 1 : i + 2` and run the test file.
Expected: the "ABSENT gridOrder" test FAILS. Revert the mutation immediately.

This step is not optional — it is the only evidence the non-regression test is not vacuous.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. In particular `tests/engine/byteIdentity.test.ts` and `tests/data/scenarios.test.ts` must be unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/race.ts tests/engine/gridOrder.test.ts
git commit -m "feat(engine): optional gridOrder on RaceConfig, consumed by initRace

Absence reproduces drivers.json order byte-for-byte, so byteIdentity, the
Monte-Carlo bands and all three scenarios stay valid untouched. A gridOrder
that is not a permutation of the field throws at the boundary rather than
producing a silently wrong grid."
```

---

## Task 2: The qualifying tuning block

**Files:**
- Modify: `src/data/tuning.json`
- Modify: `src/data/validators.ts:75-79` (after the `paceModes` schema)
- Test: `tests/data/qualifyingTuning.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `tuning.qualifying` with shape
  `{ attackLevels: Record<'conserve'|'balanced'|'attack', { paceDelta: number; errorChance: number }>, scrappyLapPenalty: number, seedOffset: number }`.
  Task 3 reads all of it.

**Note on the numbers:** these are a STARTING POINT, not a validated tuning. Task 4 measures field spread and settles them. Do not treat them as final here, and do not write a regression band against them in this task.

- [ ] **Step 1: Write the failing test**

Create `tests/data/qualifyingTuning.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('tuning.qualifying', () => {
  it('LOADS AND VALIDATES', () => {
    const { tuning } = loadGameData()
    const q = tuning.qualifying
    expect(q).toBeDefined()
    expect(q.seedOffset).toBe(777777)
    expect(q.scrappyLapPenalty).toBeGreaterThan(0)
    for (const level of ['conserve', 'balanced', 'attack'] as const) {
      expect(q.attackLevels[level].errorChance).toBeGreaterThanOrEqual(0)
      expect(q.attackLevels[level].errorChance).toBeLessThanOrEqual(1)
    }
  })

  it('ORDERS THE ATTACK LEVELS COHERENTLY', () => {
    /*
     * The whole decision is "faster costs riskier". If a level were ever
     * edited so that attacking is both slower AND safer, the choice becomes
     * strictly dominated and the screen is decoration. This test is a balance
     * guard, not a schema guard -- zod cannot express it.
     */
    const { attackLevels: a } = loadGameData().tuning.qualifying
    expect(a.attack.paceDelta).toBeLessThan(a.balanced.paceDelta)
    expect(a.balanced.paceDelta).toBeLessThan(a.conserve.paceDelta)
    expect(a.attack.errorChance).toBeGreaterThan(a.balanced.errorChance)
    expect(a.balanced.errorChance).toBeGreaterThan(a.conserve.errorChance)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/data/qualifyingTuning.test.ts`
Expected: FAIL — `tuning.qualifying` is undefined.

- [ ] **Step 3: Add the data**

In `src/data/tuning.json`, add a top-level `"qualifying"` key (place it immediately after the `"paceModes"` block so related pace numbers sit together):

```json
  "qualifying": {
    "attackLevels": {
      "conserve": { "paceDelta": 0.35, "errorChance": 0.02 },
      "balanced": { "paceDelta": 0.0, "errorChance": 0.06 },
      "attack": { "paceDelta": -0.45, "errorChance": 0.15 }
    },
    "scrappyLapPenalty": 1.2,
    "seedOffset": 777777
  },
```

- [ ] **Step 4: Add the zod schema**

In `src/data/validators.ts`, immediately after the `paceModes: z.object({ ... }),` block:

```ts
  qualifying: z.object({
    attackLevels: z.object({
      conserve: z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
      balanced: z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
      attack:   z.object({ paceDelta: z.number(), errorChance: z.number().min(0).max(1) }),
    }),
    scrappyLapPenalty: z.number(),
    seedOffset: z.number(),
  }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/data/qualifyingTuning.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/data/tuning.json src/data/validators.ts tests/data/qualifyingTuning.test.ts
git commit -m "feat(data): qualifying tuning block

Attack levels trade pace against error chance. The ordering test is a balance
guard zod cannot express: if attacking were ever both slower and safer, the
decision would be strictly dominated. Numbers are a starting point -- the
calibration task settles them."
```

---

## Task 3: `runQualifying`

**Files:**
- Create: `src/engine/qualifying.ts`
- Modify: `src/engine/types.ts` (add the four exported types)
- Modify: `src/engine/index.ts` (export them)
- Test: `tests/engine/qualifying.test.ts` (create)

**Interfaces:**
- Consumes: `RaceConfig.qualifyingSeed` from Task 1; `tuning.qualifying` from Task 2.
- Produces:
  ```ts
  type AttackLevel = 'conserve' | 'balanced' | 'attack'
  type QualifyingCall = { compound: Compound; attack: AttackLevel }
  type QualifyingLap = { driverId: string; teamId: string; time: number; compound: Compound; attack: AttackLevel; scrappy: boolean }
  type QualifyingResult = { laps: QualifyingLap[]; order: string[] }
  function runQualifying(config: RaceConfig, rng: Rng, playerCall: QualifyingCall): QualifyingResult
  ```
  Task 5 calls `runQualifying` and passes `result.order` as `gridOrder`. Task 6 renders `result.laps`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/qualifying.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runQualifying, createRng, type QualifyingCall } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

const CALL: QualifyingCall = { compound: 'S', attack: 'attack' }
const config = () => buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', null, null)

describe('runQualifying', () => {
  it('IS DETERMINISTIC', () => {
    // The mirror of byteIdentity.test.ts. Without this, a stray Math.random or
    // an iteration-order dependency turns the grid into a reroll.
    const run = () => runQualifying(config(), createRng(99), CALL)
    expect(run()).toEqual(run())
  })

  it('RETURNS A TOTAL ORDER OVER THE WHOLE FIELD', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), CALL)
    expect(result.laps).toHaveLength(c.drivers.length)
    expect(result.order).toHaveLength(c.drivers.length)
    expect(new Set(result.order).size).toBe(c.drivers.length)
    expect([...result.order].sort()).toEqual(c.drivers.map(d => d.id).sort())
    // order agrees with laps, and laps are sorted ascending
    expect(result.order).toEqual(result.laps.map(l => l.driverId))
    const times = result.laps.map(l => l.time)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('PRODUCES A GRID THAT initRace CAN CONSUME', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), CALL)
    // The permutation guard from Task 1 is the contract; this proves the two
    // halves actually fit rather than each being correct in isolation.
    expect(() => {
      const { initRace } = require('@engine/index')
      initRace({ ...c, gridOrder: result.order })
    }).not.toThrow()
  })

  it('APPLIES THE PLAYER CALL ONLY TO THE PLAYER', () => {
    const c = config()
    const result = runQualifying(c, createRng(99), { compound: 'H', attack: 'conserve' })
    const player = result.laps.find(l => l.driverId === c.playerDriverId)!
    expect(player.compound).toBe('H')
    expect(player.attack).toBe('conserve')
    // Rivals are driven by their brain tier, not the player's call.
    const others = result.laps.filter(l => l.driverId !== c.playerDriverId)
    expect(others.every(l => l.attack === 'conserve'), 'rivals must not copy the player').toBe(false)
  })

  it('A SCRAPPY LAP COSTS TIME BUT NEVER REMOVES A DRIVER', () => {
    /*
     * Qualifying must not end a weekend before it starts. Scan seeds until a
     * scrappy lap appears rather than asserting on one fixed seed, so this
     * keeps testing the behaviour after the numbers are recalibrated.
     */
    const c = config()
    let found = false
    for (let seed = 0; seed < 60 && !found; seed++) {
      const result = runQualifying(c, createRng(seed), CALL)
      if (result.laps.some(l => l.scrappy)) {
        found = true
        expect(result.laps).toHaveLength(c.drivers.length)
        expect(result.order).toHaveLength(c.drivers.length)
      }
    }
    expect(found, 'no scrappy lap in 60 seeds -- errorChance may be broken').toBe(true)
  })

  it('ATTACKING IS FASTER THAN CONSERVING, AVERAGED OVER SEEDS', () => {
    // Per-seed comparison is noise-dominated (sigmaPerSector 0.08), so compare
    // means. This is the test that would catch attack and conserve being
    // wired to the wrong sign.
    const c = config()
    const mean = (attack: 'attack' | 'conserve') => {
      let total = 0
      for (let seed = 0; seed < 40; seed++) {
        const r = runQualifying(c, createRng(seed), { compound: 'S', attack })
        total += r.laps.find(l => l.driverId === c.playerDriverId)!.time
      }
      return total / 40
    }
    expect(mean('attack')).toBeLessThan(mean('conserve'))
  })

  it('DOES NOT DOUBLE-COUNT THE PACE MODE', () => {
    /*
     * computeSectorTime already adds paceModes[car.paceMode].paceDelta / 3 per
     * sector. If a qualifying car were built with paceMode 'push' AS WELL AS
     * the attack paceDelta, attack would be -0.60s/lap rather than -0.45, and
     * every future edit to paceModes would silently retune qualifying.
     *
     * Measured against a zero-delta control: the gap between attack and
     * balanced must match tuning, within one lap of noise.
     */
    const c = config()
    const meanFor = (attack: 'attack' | 'balanced') => {
      let total = 0
      for (let seed = 0; seed < 120; seed++) {
        const r = runQualifying(c, createRng(seed), { compound: 'S', attack })
        total += r.laps.find(l => l.driverId === c.playerDriverId)!.time
      }
      return total / 120
    }
    const expected = Math.abs(
      c.tuning.qualifying.attackLevels.attack.paceDelta
      - c.tuning.qualifying.attackLevels.balanced.paceDelta,
    )
    // Scrappy laps inflate both means; compare with a tolerance wide enough for
    // that and for sampling noise, but far tighter than a 0.15s double-count.
    const observed = meanFor('balanced') - meanFor('attack')
    expect(Math.abs(observed - expected)).toBeLessThan(0.12)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/qualifying.test.ts`
Expected: FAIL — `runQualifying` is not exported.

- [ ] **Step 3: Add the types**

In `src/engine/types.ts`, at the end of the file:

```ts
export type AttackLevel = 'conserve' | 'balanced' | 'attack'

export interface QualifyingCall {
  compound: Compound
  attack: AttackLevel
}

export interface QualifyingLap {
  driverId: string
  teamId: string
  /** Total lap time in seconds, including the attack delta and any scrappy penalty. */
  time: number
  compound: Compound
  attack: AttackLevel
  /** An error was rolled on this lap. Never a retirement -- see qualifying.ts. */
  scrappy: boolean
}

export interface QualifyingResult {
  /** Sorted ascending by time. */
  laps: QualifyingLap[]
  /** driverIds, P1 first. Derived from `laps`; stored so consumers never re-sort. */
  order: string[]
}
```

- [ ] **Step 4: Write `src/engine/qualifying.ts`**

```ts
import type {
  RaceConfig, CarState, SectorIndex, Compound, WeatherState,
  QualifyingCall, QualifyingLap, QualifyingResult, AttackLevel, StrategyBrain,
} from './types'
import type { Rng } from './rng'
import { createRng } from './rng'
import { computeSectorTime } from './lapModel'
import { generateWeatherTimeline } from './weather'
import { UNLIMITED_TYRE_ALLOCATION } from './tyres'

/**
 * One flying lap per car, resolved by the same lap model that drives the race.
 *
 * That reuse is the point: a car that is fast in the race is fast in qualifying
 * BECAUSE it is the same model, so the upgrades bought in Development move the
 * grid without qualifying ever learning that progression exists.
 *
 * Pure and headless per CLAUDE.md 3 -- all randomness arrives through `rng`.
 */

// A qualifying lap is deliberately NOT a race lap. Each departure has a reason:
//   fuel zeroed        -- a qualifying car runs light; a race-start fuel load
//                         would make qualifying slower than the race's last lap
//   lapsInDirtyAir 0   -- a flying lap is run in clear air by definition
//   safetyCar null     -- there is no race running
//   tyreAge 0          -- a qualifying tyre is new
//
// paceMode is ALWAYS 'neutral'. computeSectorTime already adds
// paceModes[car.paceMode].paceDelta / 3 per sector, so mapping attack onto a
// pace mode as well as applying the attack paceDelta would double-count it.
function qualifyingCar(
  driverId: string,
  teamId: string,
  compound: Compound,
): CarState {
  return {
    driverId,
    teamId,
    position: 0,
    raceTime: 0,
    lap: 0,
    sector: 0 as SectorIndex,
    compound,
    tyreAge: 0,
    paceMode: 'neutral',
    pitted: false,
    pitsDone: 0,
    strategy: { teamId, startCompound: compound, plannedStops: [] },
    isPlayer: false,
    tyreAllocation: { ...UNLIMITED_TYRE_ALLOCATION },
    compoundsUsed: [compound],
    lapsInDirtyAir: 0,
    retired: false,
    retiredLap: null,
    retiredCause: null,
  }
}

/** The softest compound legal for these conditions. */
function softestFor(weather: WeatherState): Compound {
  if (weather === 'WET') return 'W'
  if (weather === 'DAMP') return 'I'
  return 'S'
}

/**
 * A rival's call comes from its team's existing strategy brain tier, which
 * buildRaceConfig already resolves and already varies by difficulty. Reusing it
 * means higher difficulties field more attacking rivals for the same reason
 * they field better race strategists -- rather than inventing a second AI.
 */
function rivalCall(brain: StrategyBrain, weather: WeatherState): QualifyingCall {
  const softest = softestFor(weather)
  if (brain === 'optimal') return { compound: softest, attack: 'attack' }
  if (brain === 'smart') return { compound: softest, attack: 'balanced' }
  return { compound: weather === 'DRY' ? 'M' : softest, attack: 'balanced' }
}

export function runQualifying(
  config: RaceConfig,
  rng: Rng,
  playerCall: QualifyingCall,
): QualifyingResult {
  const q = config.tuning.qualifying

  // Same weather the grid will form up in, derived the same way initRace does,
  // so a wet race is preceded by a wet qualifying.
  const weatherRng = createRng(config.weatherSeed ?? config.seed + 999999)
  const timeline = generateWeatherTimeline(
    config.circuit.laps, config.circuit, config.tuning, weatherRng,
  )
  const weather: WeatherState = timeline[0] ?? 'DRY'

  const laps: QualifyingLap[] = config.drivers.map(driver => {
    const isPlayer = driver.id === config.playerDriverId
    const brain = (config.strategies.find(s => s.teamId === driver.teamId)?.brain
      ?? 'naive') as StrategyBrain
    const call = isPlayer ? playerCall : rivalCall(brain, weather)
    const level = q.attackLevels[call.attack]

    const car = qualifyingCar(driver.id, driver.teamId, call.compound)
    let time = 0
    for (let s = 0; s < 3; s++) {
      time += computeSectorTime(config, car, s as SectorIndex, rng, weather, null).sectorTime
    }

    // Fuel is charged per lap completed, and a qualifying car runs light, so
    // the race's fuel term does not apply. computeSectorTime charges it from
    // car.lap, which is 0 here -- no subtraction needed, documented so nobody
    // "fixes" it later by adding a fuel load.

    time += level.paceDelta

    const scrappy = rng() < level.errorChance
    if (scrappy) time += q.scrappyLapPenalty

    return {
      driverId: driver.id,
      teamId: driver.teamId,
      time,
      compound: call.compound,
      attack: call.attack,
      scrappy,
    }
  })

  // Tie-break by driverId so the order is total and therefore reproducible.
  laps.sort((a, b) => (a.time - b.time) || a.driverId.localeCompare(b.driverId))

  return { laps, order: laps.map(l => l.driverId) }
}

/** The RNG stream qualifying draws from. Separate from the race seed. */
export function qualifyingRng(config: RaceConfig): Rng {
  return createRng(config.qualifyingSeed ?? config.seed + config.tuning.qualifying.seedOffset)
}
```

- [ ] **Step 5: Export from the engine's public API**

In `src/engine/index.ts`:

```ts
export { runQualifying, qualifyingRng } from './qualifying'
```

and add to the existing `export type { ... } from './types'` list:

```ts
  AttackLevel, QualifyingCall, QualifyingLap, QualifyingResult,
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/qualifying.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests), tsc clean.

- [ ] **Step 7: Verify engine purity still holds**

Run: `npx vitest run tests/state/storeBoundaries.test.ts`
Expected: PASS. `src/engine/qualifying.ts` must import nothing from `state/`, `ui/`, `canvas/` or `hooks/`.

- [ ] **Step 8: Commit**

```bash
git add src/engine/qualifying.ts src/engine/types.ts src/engine/index.ts tests/engine/qualifying.test.ts
git commit -m "feat(engine): runQualifying -- one flying lap per car

Reuses computeSectorTime so a fast race car is a fast qualifying car by
construction, which is how Development upgrades reach the grid. paceMode is
pinned to neutral and attack applied only via its own paceDelta; a test
measures the gap against tuning so the double-count cannot come back."
```

---

## Task 4: Calibrate the numbers

**Files:**
- Create: `scripts/calibrate-qualifying.ts`
- Modify: `src/data/tuning.json` (the `qualifying` values, and `_regressionBands`)
- Test: `tests/engine/qualifyingBands.test.ts` (create)

**Interfaces:**
- Consumes: `runQualifying`, `qualifyingRng` from Task 3; `tuning.qualifying` from Task 2.
- Produces: settled tuning values and `tuning._regressionBands.qualifying`.

**Why this task exists.** `noise.sigmaPerSector` is 0.08, so one lap carries roughly 0.14s of Gaussian noise. The grid-slot value of a tenth depends on how tightly the field's car and driver deltas pack, which has NOT been measured. Writing a regression band against unmeasured numbers would lock in whatever they happen to be. Measure first, then band.

- [ ] **Step 1: Write the calibration script**

Create `scripts/calibrate-qualifying.ts`:

```ts
/**
 * Measures what the qualifying tuning numbers are actually worth, in grid
 * slots, so they can be chosen rather than guessed.
 *
 * Run: npx tsx scripts/calibrate-qualifying.ts
 */
import { runQualifying, createRng } from '../src/engine/index'
import { buildRaceConfig } from '../src/state/buildRaceConfig'

const SEEDS = 400
const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
const PLAYER = config.playerDriverId

function sample(attack: 'conserve' | 'balanced' | 'attack') {
  const positions: number[] = []
  const times: number[] = []
  let scrappy = 0
  let fieldSpread = 0
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = runQualifying(config, createRng(seed), { compound: 'S', attack })
    positions.push(r.order.indexOf(PLAYER) + 1)
    const lap = r.laps.find(l => l.driverId === PLAYER)!
    times.push(lap.time)
    if (lap.scrappy) scrappy++
    fieldSpread += r.laps[r.laps.length - 1]!.time - r.laps[0]!.time
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    attack,
    meanPosition: mean(positions).toFixed(2),
    meanTime: mean(times).toFixed(3),
    scrappyRate: (scrappy / SEEDS).toFixed(3),
    meanFieldSpread: (fieldSpread / SEEDS).toFixed(3),
  }
}

const rows = (['conserve', 'balanced', 'attack'] as const).map(sample)
console.table(rows)

const spread = Number(rows[0]!.meanFieldSpread)
const perSlot = spread / (config.drivers.length - 1)
console.log(`\nField spread: ${spread.toFixed(3)}s across ${config.drivers.length} cars`)
console.log(`One grid slot is worth roughly ${perSlot.toFixed(3)}s`)
console.log(`scrappyLapPenalty ${config.tuning.qualifying.scrappyLapPenalty}s ` +
  `=> about ${(config.tuning.qualifying.scrappyLapPenalty / perSlot).toFixed(1)} slots`)
console.log(`attack paceDelta ${config.tuning.qualifying.attackLevels.attack.paceDelta}s ` +
  `=> about ${Math.abs(config.tuning.qualifying.attackLevels.attack.paceDelta / perSlot).toFixed(1)} slots`)
```

- [ ] **Step 2: Run it and record the output**

Run: `npx tsx scripts/calibrate-qualifying.ts`

Paste the full output into the task report. It is the evidence for the numbers chosen in Step 3, and Veet reviews it.

- [ ] **Step 3: Settle the tuning numbers**

Adjust `tuning.qualifying` in `src/data/tuning.json` so that, per the measured output:

- `attack` is worth **2 to 4 grid slots** against `balanced`.
- `scrappyLapPenalty` costs **4 to 7 grid slots** — enough to hurt, not enough to be unrecoverable.
- `attack.errorChance` stays **0.15** (Veet signed this off explicitly; do not change it).

If the starting numbers already land in those ranges, change nothing and say so in the report. Re-run the script after any change and paste the new output.

- [ ] **Step 4: Write the regression band test**

Create `tests/engine/qualifyingBands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runQualifying, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('qualifying regression bands', () => {
  it('ATTACK PRODUCES A SCRAPPY LAP AT THE TUNED RATE', () => {
    /*
     * The oracle for tuning.qualifying.attackLevels.attack.errorChance, in the
     * style of the Monte-Carlo bands in MODEL_SPEC.md 10.1. Sampling 200 runs
     * of a p=0.15 Bernoulli gives a standard error near 0.025, so the 0.10-0.20
     * band is roughly +/- 2 SE -- wide enough not to flake, tight enough to
     * catch the rate being wired to the wrong level.
     */
    const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    let scrappy = 0
    const N = 200
    for (let seed = 0; seed < N; seed++) {
      const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'attack' })
      if (r.laps.find(l => l.driverId === config.playerDriverId)!.scrappy) scrappy++
    }
    expect(scrappy / N).toBeGreaterThanOrEqual(0.10)
    expect(scrappy / N).toBeLessThanOrEqual(0.20)
  }, 60_000)

  it('A TOP CAR STILL QUALIFIES NEAR THE FRONT', () => {
    // Guards the opposite failure from the band above: noise so dominant that
    // car quality stops mattering and qualifying becomes a lottery.
    const config = buildRaceConfig(1, 'd_voss', 'bengaluru', 'rookie', null, null)
    let total = 0
    const N = 100
    for (let seed = 0; seed < N; seed++) {
      const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'balanced' })
      total += r.order.indexOf(config.playerDriverId) + 1
    }
    expect(total / N, 'd_voss is a front-running car and must qualify like one').toBeLessThan(8)
  }, 60_000)
})
```

- [ ] **Step 5: Add the band to tuning**

In `src/data/tuning.json`, inside the existing `_regressionBands` object:

```json
    "qualifying": {
      "attackScrappyRate": [0.10, 0.20],
      "topCarMeanGridPosition": [1, 8]
    },
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engine/qualifyingBands.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests).

If `A TOP CAR STILL QUALIFIES NEAR THE FRONT` fails, do NOT widen the band to make it pass — that is the test doing its job. Report it: it means noise is drowning car quality and the tuning needs Veet's attention.

- [ ] **Step 7: Commit**

```bash
git add scripts/calibrate-qualifying.ts src/data/tuning.json tests/engine/qualifyingBands.test.ts
git commit -m "test(engine): calibrate qualifying and band the result

Measures what a tenth is worth in grid slots before banding it, so the
regression oracle guards chosen numbers rather than whatever the placeholders
happened to be. errorChance stays at 0.15 by explicit design decision."
```

---

## Task 5: Season phase, store wiring, persistence

**Files:**
- Modify: `src/state/seasonStore.ts:6` (the `SeasonPhase` union), and the actions block near `confirmRaceSetup` (`:255-259`)
- Modify: `src/state/seasonPersistence.ts:54-70` (`RESUME_PHASE`)
- Modify: `src/state/buildRaceConfig.ts` (`buildRaceConfig` signature)
- Modify: `src/state/raceStore.ts:31,77-80` (`startSeasonRace`)
- Test: `tests/state/qualifyingFlow.test.ts` (create)

**Interfaces:**
- Consumes: `runQualifying`, `qualifyingRng`, `QualifyingResult`, `QualifyingCall` from Task 3.
- Produces:
  - `SeasonPhase` includes `'qualifying'`
  - `seasonStore.qualifyingResult: QualifyingResult | null`
  - `seasonStore.runQualifyingSession(call: QualifyingCall, difficulty: Difficulty): void` — runs the session and stores the result, staying in `'qualifying'`
  - `seasonStore.startRaceFromQualifying(): void` — moves to `'racing'` using the stored result's order
  - `buildRaceConfig(seed, playerDriverId, circuitId?, difficulty?, playerStrategy?, upgrades?, gridOrder?)` — seventh parameter
  - `raceStore.startSeasonRace(..., upgrades?, gridOrder?)` — eighth parameter

  Task 6 calls `runQualifyingSession` and `startRaceFromQualifying` and reads `qualifyingResult`.

- [ ] **Step 1: Write the failing tests**

Create `tests/state/qualifyingFlow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { buildScenarioConfig } from '@state/buildRaceConfig'

describe('qualifying flow', () => {
  beforeEach(() => {
    useSeasonStore.setState({ phase: 'race_setup', qualifyingResult: null })
  })

  it('race_setup CONFIRMS INTO qualifying, NOT racing', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    expect(useSeasonStore.getState().phase).toBe('qualifying')
  })

  it('runQualifyingSession STORES A RESULT AND STAYS PUT', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession({ compound: 'S', attack: 'attack' }, 'rookie')
    const { phase, qualifyingResult } = useSeasonStore.getState()
    expect(phase, 'the player reads their grid slot before racing').toBe('qualifying')
    expect(qualifyingResult).not.toBeNull()
    expect(qualifyingResult!.order.length).toBeGreaterThan(1)
  })

  it('startRaceFromQualifying MOVES TO racing', () => {
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession({ compound: 'S', attack: 'attack' }, 'rookie')
    useSeasonStore.getState().startRaceFromQualifying()
    expect(useSeasonStore.getState().phase).toBe('racing')
  })

  it('IS DETERMINISTIC ACROSS RE-ENTRY -- a bad lap cannot be rerolled', () => {
    /*
     * qualifyingSeed derives from the race seed, so backing out to race_setup
     * and re-qualifying gives the same session. This is deliberate: it is the
     * same determinism discipline the rest of the game keeps, and it is only
     * fair because the error chance is shown before the player commits.
     */
    const call = { compound: 'S', attack: 'attack' } as const
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession(call, 'rookie')
    const first = useSeasonStore.getState().qualifyingResult!

    useSeasonStore.getState().toRaceSetup()
    expect(useSeasonStore.getState().qualifyingResult, 'stale result must be cleared').toBeNull()
    useSeasonStore.getState().confirmRaceSetup(undefined, null)
    useSeasonStore.getState().runQualifyingSession(call, 'rookie')

    expect(useSeasonStore.getState().qualifyingResult).toEqual(first)
  })

  it('SCENARIOS NEVER GET A GRID ORDER', () => {
    // A scenario is a seed plus a lap. Handing it a qualifying grid would
    // change the situation its expect block was authored against.
    const config = buildScenarioConfig({ circuitId: 'bengaluru', seed: 193, playerDriverId: 'd_voss' })
    expect(config.gridOrder).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/state/qualifyingFlow.test.ts`
Expected: FAIL — `runQualifyingSession` does not exist.

- [ ] **Step 3: Thread `gridOrder` through `buildRaceConfig`**

In `src/state/buildRaceConfig.ts`, add a seventh parameter to `buildRaceConfig`:

```ts
  // The grid from qualifying, P1 first. Omitted for scenarios and for any
  // caller that wants the engine's drivers.json default -- see the comment on
  // RaceConfig.gridOrder for why absence must stay meaningful.
  gridOrder?: string[],
```

and add `gridOrder,` to the returned object literal.

`buildScenarioConfig` already passes its arguments positionally and stops before this parameter, so scenarios continue to get `undefined`. Leave it alone.

- [ ] **Step 4: Thread it through `raceStore`**

In `src/state/raceStore.ts`, change the `startSeasonRace` signature on the interface (line 31) and the implementation (line 77) to take a final `gridOrder?: string[]`, and pass it as the seventh argument to `buildRaceConfig`.

- [ ] **Step 5: Add the phase, the slice and the actions**

In `src/state/seasonStore.ts`, add `'qualifying'` to the `SeasonPhase` union (after `'race_setup'`).

Add to the store's state: `qualifyingResult: QualifyingResult | null` initialised to `null`.

Change `confirmRaceSetup` to enter qualifying rather than racing:

```ts
  confirmRaceSetup(circuitId, strategy) {
    if (circuitId) set({ selectedCircuitId: circuitId })
    set({ phase: 'qualifying', playerStrategy: strategy ?? null, qualifyingResult: null })
  },

  runQualifyingSession(call: QualifyingCall, difficulty: Difficulty) {
    const s = get()
    // Built with EXACTLY the arguments RaceWatcher passes to startSeasonRace
    // (see src/ui/RaceWatcher.tsx:44). If these two ever diverge, the grid
    // would be qualified under different car performance than the race runs
    // with -- a bug that would look like the simulation being unfair.
    const config = buildRaceConfig(
      s.currentSeed(), s.playerDriverId, s.currentCircuitId(), difficulty,
      s.playerStrategy, { purchasedTiers: s.purchasedTiers, rivalDevelopment: s.rivalDevelopment },
    )
    set({ qualifyingResult: runQualifying(config, qualifyingRng(config), call) })
  },

  startRaceFromQualifying() {
    const result = get().qualifyingResult
    // No result means the player reached the race without a session, which the
    // UI does not allow. Racing with an undefined grid would silently fall back
    // to the fixed drivers.json order -- the exact defect this feature removes.
    if (!result) throw new Error('startRaceFromQualifying called with no qualifyingResult')
    set({ phase: 'racing' })
  },
```

Also clear the stale result in `toRaceSetup`:

```ts
  toRaceSetup() { set({ phase: 'race_setup', qualifyingResult: null }) },
```

**The argument list is not negotiable.** `src/ui/RaceWatcher.tsx:44` builds the race with
`startSeasonRace(playerDriverId, currentSeed(), currentCircuitId(), difficulty, playerStrategy, { purchasedTiers, rivalDevelopment })`.
The qualifying config above mirrors it exactly. `difficulty` is not on `seasonStore` — RaceWatcher reads it from `useSettingsStore`, so it is passed into the action as a parameter rather than pulled from the season store.

The `QualifyingCall` and `Difficulty` types must be imported into `seasonStore.ts`, along with `runQualifying` and `qualifyingRng` from `@engine/index` and `buildRaceConfig` from `./buildRaceConfig`.

- [ ] **Step 6: Pass the grid into the race**

Find the call site that invokes `raceStore.startSeasonRace(...)` on entering `'racing'` (it is in `src/ui/RaceWatcher.tsx`). Add the stored `qualifyingResult?.order` as the final argument.

- [ ] **Step 7: Add the persistence mapping**

In `src/state/seasonPersistence.ts`, add to `RESUME_PHASE`:

```ts
  // 'race_setup', NOT null. A player in qualifying is genuinely mid-season, so
  // the save should be written -- unlike the menu/settings detours above, which
  // map to null precisely so they cannot overwrite a save with "sitting in a
  // menu". This matches `racing` directly below: a QualifyingResult's validity
  // depends on config that may have changed between launches, so the honest
  // offer on reload is "set up the round again", not a half-restored session.
  qualifying: 'race_setup',
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/state/qualifyingFlow.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), tsc clean.

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run`
Expected: all pass. Pay attention to `tests/data/scenarios.test.ts` and `tests/engine/byteIdentity.test.ts` — both must be unaffected. Any season-flow test that assumed `race_setup` leads straight to `racing` needs updating to go through `'qualifying'`; update the test, not the behaviour.

- [ ] **Step 10: Commit**

```bash
git add src/state tests/state/qualifyingFlow.test.ts src/ui/RaceWatcher.tsx
git commit -m "feat(state): qualifying phase between race setup and the race

The qualifying config is built exactly as the race config is, so the grid is
qualified under the same car performance the race runs with. Re-entry is
deterministic -- a scrappy lap cannot be rerolled. Scenarios never receive a
gridOrder, so their authored situations are untouched."
```

---

## Task 6: The qualifying screen

**Files:**
- Create: `src/ui/Qualifying.tsx`
- Modify: `src/App.tsx:53-62` (the phase render block)
- Test: `tests/ui/qualifying.test.tsx` (create)

**Interfaces:**
- Consumes: `seasonStore.runQualifyingSession(call, difficulty)` (difficulty from `useSettingsStore(s => s.difficulty)`), `seasonStore.startRaceFromQualifying()`, `seasonStore.qualifyingResult`, and `QualifyingResult`/`AttackLevel` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/qualifying.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Qualifying } from '@ui/Qualifying'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'

describe('Qualifying screen', () => {
  beforeEach(() => {
    useSeasonStore.setState({ phase: 'qualifying', qualifyingResult: null })
  })

  it('OFFERS THE ATTACK CALL WITH ITS RISK STATED AS A NUMBER', () => {
    /*
     * The outcome is irreversible (the seed derives from the race seed), so the
     * error chance must be visible BEFORE the player commits. A risk the player
     * could not have known about is a cheat, not a gamble.
     */
    render(<Qualifying />)
    const attack = screen.getByRole('button', { name: /attack/i })
    expect(attack.textContent).toMatch(/15\s*%/)
  })

  it('RUNS THE SESSION AND SHOWS THE PLAYER THEIR GRID SLOT', () => {
    render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    expect(useSeasonStore.getState().qualifyingResult).not.toBeNull()
    expect(screen.getByTestId('qualifying-status').textContent).toMatch(/P\d+/)
  })

  it('SIMULATE RESOLVES WITHOUT ANY PLAYER INPUT', () => {
    render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /simulate/i }))
    const result = useSeasonStore.getState().qualifyingResult
    expect(result).not.toBeNull()
    expect(result!.order.length).toBeGreaterThan(1)
  })

  it('LABELS A SCRAPPY LAP IN TEXT, NOT COLOUR ALONE', () => {
    // CLAUDE.md 6.3: colour is never the only signal. Inject a result with a
    // known scrappy lap rather than hunting for a seed that produces one.
    const order = ['d_voss', 'd_chen']
    useSeasonStore.setState({
      qualifyingResult: {
        order,
        laps: [
          { driverId: 'd_voss', teamId: 't1', time: 80, compound: 'S', attack: 'attack', scrappy: false },
          { driverId: 'd_chen', teamId: 't2', time: 81.2, compound: 'S', attack: 'attack', scrappy: true },
        ],
      },
    })
    render(<Qualifying />)
    expect(screen.getByText(/scrappy|error|mistake/i)).toBeTruthy()
  })

  it('HONOURS THE IN-APP REDUCED-MOTION TOGGLE', () => {
    // Must read the store, never window.matchMedia directly -- the defect
    // fixed in RaceResult. With the toggle on, no layout animation is applied.
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<Qualifying />)
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    expect(container.querySelectorAll('[data-animated="true"]')).toHaveLength(0)
  })

  it('PROCEEDS TO THE RACE ONLY AFTER A SESSION HAS RUN', () => {
    render(<Qualifying />)
    expect(screen.queryByRole('button', { name: /to the grid/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^run lap$/i }))
    fireEvent.click(screen.getByRole('button', { name: /to the grid/i }))
    expect(useSeasonStore.getState().phase).toBe('racing')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/qualifying.test.tsx`
Expected: FAIL — `@ui/Qualifying` does not exist.

- [ ] **Step 3: Build the screen**

Create `src/ui/Qualifying.tsx`. Requirements, all load-bearing:

- Two chip rows — compound (S/M/H, plus I/W when the weather is not `DRY`) and attack level — styled with the same selected-state treatment the pace-mode toggle uses (read `src/ui/PacePanel.tsx` or the equivalent pace control and match it; do not invent a second visual language).
- Each attack chip states its consequence inline in the existing idiom, e.g. `ATTACK · −0.45s · 15% risk`. Read the numbers from `loadGameData().tuning.qualifying`; do NOT hardcode them, or the chip will lie after recalibration.
- A **RUN LAP** primary button and a **SIMULATE** secondary button. SIMULATE calls `runQualifyingSession({ compound: 'M', attack: 'balanced' }, difficulty)`.
- After a result exists: a list of `qualifyingResult.laps` using `TimingTower`'s row treatment, the player's row carrying `--accent`, all times with `fontVariantNumeric: 'tabular-nums'`. A scrappy lap carries a visible text label.
- A `role="status"` region with `data-testid="qualifying-status"` announcing the player's grid slot, e.g. `Qualified P4`. Follow `src/ui/SafetyCarBanner.tsx` for the pattern — including the `data-testid` disambiguation, since two live regions on screen at once is the exact collision fixed there.
- A **TO THE GRID** button, rendered only once `qualifyingResult` is non-null, calling `startRaceFromQualifying()`.
- Motion: gate every animation on `useSettingsStore(s => s.reducedMotion)`. Animated elements carry `data-animated="true"` only when motion is enabled, so the test above is meaningful.
- Colours via tokens only. No `color-mix()`. No raw hex.

- [ ] **Step 4: Wire it into `App.tsx`**

In `src/App.tsx`, inside the `<AnimatePresence mode="wait">` block, after the `race_setup` line:

```tsx
          {phase === 'qualifying' && <Qualifying key="qualifying" />}
```

and add the import: `import { Qualifying } from './ui/Qualifying'`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ui/qualifying.test.tsx && npx tsc --noEmit`
Expected: PASS (6 tests), tsc clean.

- [ ] **Step 6: Run the full suite and the CSS bans**

Run: `npx vitest run`
Expected: all pass, including `tests/ui/colorMixBan.test.ts` and `tests/ui/cautionToken.test.ts`.

- [ ] **Step 7: Verify on device**

```bash
npx vite build && npx cap sync android
cd android && ./gradlew assembleRelease
```

Then install and play one qualifying session through to the race. `docs/DEVICE-CHECKLIST.md` has the emulator commands; an API 30 AVD named `pitwall_api30` already exists.

Confirm: the chips respond to taps, the numbers are tabular, the result list reads correctly, the grid slot announced matches the race's actual starting position, and the race starts from that grid rather than from the drivers.json order.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Qualifying.tsx src/App.tsx tests/ui/qualifying.test.tsx
git commit -m "feat(ui): the qualifying screen

States the error chance as a number before the player commits, because the
seed derives from the race seed and the outcome cannot be rerolled. Scrappy
laps carry a text label, not colour alone. SIMULATE resolves the session for a
player who does not want to engage that round -- no grid is handed out unearned."
```

---

## Task 7: Close the loop on the original defect

**Files:**
- Test: `tests/state/qualifyingUpgrades.test.ts` (create)
- Modify: `docs/superpowers/specs/2026-09-19-qualifying-design.md` (status line)

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing.

**Why this is its own task.** Tasks 1-6 can all pass while the feature still fails its purpose. The spec's problem statement is that upgrades cannot buy track position; this task is the test that proves they now can, plus the assertion that the grid actually varies.

- [ ] **Step 1: Write the test**

Create `tests/state/qualifyingUpgrades.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runQualifying, createRng } from '@engine/index'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { loadGameData } from '@data/validators'

const PLAYER = 'd_kane'  // a back-of-the-grid driver, so there is room to improve

function meanGrid(upgrades: Parameters<typeof buildRaceConfig>[5]) {
  const config = buildRaceConfig(7, PLAYER, 'bengaluru', 'rookie', null, upgrades)
  let total = 0
  const N = 80
  for (let seed = 0; seed < N; seed++) {
    const r = runQualifying(config, createRng(seed), { compound: 'S', attack: 'balanced' })
    total += r.order.indexOf(PLAYER) + 1
  }
  return total / N
}

describe('the defect this feature exists to fix', () => {
  it('THE GRID IS NO LONGER IDENTICAL EVERY RACE', () => {
    /*
     * Before qualifying, initRace assigned position from drivers.json order, so
     * d_kane started P20 at all 12 rounds of every season and d_voss started
     * pole at all 12. If this ever passes trivially again, the feature is gone.
     */
    const config = buildRaceConfig(7, PLAYER, 'bengaluru', 'rookie', null, null)
    const grids = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      grids.add(runQualifying(config, createRng(seed), { compound: 'S', attack: 'balanced' }).order.join(','))
    }
    expect(grids.size, 'every seed produced the same grid').toBeGreaterThan(15)
  }, 60_000)

  it('UPGRADES BUY TRACK POSITION', () => {
    /*
     * The point of the feature. Before it, Development could buy pace but never
     * a starting slot. Maxing every car attribute must measurably improve the
     * average grid position.
     */
    // There is no `tiers` array on an attribute: the number of tiers is the
    // length of the shared tierCosts list (see seasonStore.ts:176-179).
    const { attributes, tierCosts } = loadGameData().upgrades
    const maxed = Object.fromEntries(
      attributes.map(a => [a.id, tierCosts.length]),
    )
    const without = meanGrid(null)
    const with_ = meanGrid({ purchasedTiers: maxed, rivalDevelopment: {} })
    expect(with_, `maxed upgrades: P${with_.toFixed(2)} vs stock P${without.toFixed(2)}`)
      .toBeLessThan(without - 0.5)
  }, 120_000)
})
```

**If `UPGRADES BUY TRACK POSITION` fails**, do not weaken the threshold. Check first that `buildRaceConfig`'s overlay actually applies to `PLAYER`'s team — `applyUpgrades` has an `appliesTo` guard, and a player id that resolves to no team disables the overlay entirely. Report the finding rather than tuning the test to pass.

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/state/qualifyingUpgrades.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests).

- [ ] **Step 3: Update the spec's status**

In `docs/superpowers/specs/2026-09-19-qualifying-design.md`, change the status line to:

```markdown
**Status:** Implemented. See `docs/superpowers/plans/2026-09-19-qualifying.md`.
```

- [ ] **Step 4: Full verification**

```bash
npx vitest run && npx tsc --noEmit && npx vite build
cd android && ./gradlew assembleRelease
```

Expected: all tests pass, tsc clean, both builds succeed.

- [ ] **Step 5: Commit**

```bash
git add tests/state/qualifyingUpgrades.test.ts docs/superpowers/specs/2026-09-19-qualifying-design.md
git commit -m "test: prove qualifying fixes the defect it was built for

The grid now varies by seed instead of being drivers.json order at all 12
rounds, and maxed Development upgrades measurably improve average grid
position -- so the progression system can finally buy track position."
```

---

## Notes for the implementer

- **The three load-bearing tests**, in order of how much they protect: the `gridOrder`-absent non-regression test (Task 1), the double-count test (Task 3), and `UPGRADES BUY TRACK POSITION` (Task 7). If any of them needs weakening to pass, something real is wrong — report it rather than adjusting the test.
- **Mutation-check any test you add** that is meant to guard a fallback or a default. The project has been bitten by unfailable tests before; `tests/ui/simSpeedSetting.test.tsx` exists because a setting was dead for weeks with no test failing.
- **`vitest` does not typecheck and neither reads Android XML.** Run `npx tsc --noEmit` before every commit.
- **Game-feel numbers are Veet's call** (CLAUDE.md §8). Surface them; do not decide them silently.
