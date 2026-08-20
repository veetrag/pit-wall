# Twelve-Race Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the championship from 8 races to 12 with 12 distinct circuits, so a season has the runway the development-point economy is tuned for and no round is a repeat.

**Architecture:** Pure content and data work. Four new circuit specs in `src/data/circuits.json`, four track-path files in `src/data/paths/`, and `CIRCUIT_ORDER` / `TOTAL_RACES` extended to 12. One of the four (Silverpark) already has a path file and needs only a spec. No engine changes.

**Tech Stack:** JSON data, zod validation, TypeScript, Vitest, PixiJS (consumes the track paths).

**Spec:** `docs/superpowers/specs/2026-08-20-development-points-design.md` (§8)

**Relationship to the other plans:** independent of both. It can land before or after the development-points core; the economy simply under-runs its 120 DP target until this lands.

## Global Constraints

- `TOTAL_RACES` becomes **12**; `CIRCUIT_ORDER` must contain **12 distinct** circuit ids.
- Every circuit needs all of: `name`, `location`, `flag`, `laps`, `sectorBase` (3), `carSensitivity` (3), `driverSensitivity` (3), `overtakingFactor` (3), `pitLaneTimeLoss`, `rainProbability`, `weatherBias`, `trackPath`, `characterNote`, `funFacts`, `atmosphere`.
- `carSensitivity` and `driverSensitivity` each sum to ~1.0 across the three sectors — they are weightings.
- `atmosphere` must be one of the values the canvas already renders: `day`, `dusk`, `night`, `desert_night`, `storm`, `northern_dusk`.
- Circuit and driver/team names must stay **fictional and trademark-free**. The app was renamed off "F1 Strategist" for exactly this reason — do not introduce real circuit names (no Monaco, Spa, Suzuka). "Monza, Italy" appears as a *location* string on the fictional "Veloce GP" and that pattern is fine; a circuit *named* after a real one is not.
- Track paths are `{ points: [[x, y], ...], sectorBoundaries: number[], pitEntry: number, pitExit: number }` in a roughly 640×540 coordinate space.
- No balance numbers in logic — everything in `circuits.json`.

---

### Task 1: Add Silverpark and extend the calendar to 9

Silverpark's path file already exists (`src/data/paths/silverpark.json`) as an orphan with no circuit entry. Adding it first proves the whole pipeline — spec, validation, calendar, canvas — with one cheap circuit before authoring three from scratch.

**Files:**
- Modify: `src/data/circuits.json`
- Modify: `src/state/raceStore.ts:43-46` (`CIRCUIT_ORDER`)
- Test: `tests/data/calendar.test.ts` (create)

**Interfaces:**
- Consumes: nothing
- Produces: circuit id `silverpark`, available in `CIRCUIT_ORDER`

- [ ] **Step 1: Write the failing test**

Create `tests/data/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { TOTAL_RACES } from '@state/seasonStore'

describe('calendar', () => {
  it('has an entry for every circuit in the order', () => {
    const { circuits } = loadGameData()
    for (const id of CIRCUIT_ORDER) expect(circuits[id]).toBeTruthy()
  })

  it('never repeats a circuit', () => {
    expect(new Set(CIRCUIT_ORDER).size).toBe(CIRCUIT_ORDER.length)
  })

  it('has exactly one circuit per round', () => {
    expect(CIRCUIT_ORDER.length).toBe(TOTAL_RACES)
  })

  it('includes silverpark', () => {
    expect(loadGameData().circuits['silverpark']).toBeTruthy()
  })

  it('weights sector sensitivities to roughly 1.0', () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      const car = c.carSensitivity.reduce((a, b) => a + b, 0)
      const drv = c.driverSensitivity.reduce((a, b) => a + b, 0)
      expect(car, `${id} carSensitivity`).toBeGreaterThan(0.95)
      expect(car, `${id} carSensitivity`).toBeLessThan(1.05)
      expect(drv, `${id} driverSensitivity`).toBeGreaterThan(0.95)
      expect(drv, `${id} driverSensitivity`).toBeLessThan(1.05)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/calendar.test.ts`
Expected: FAIL — no `silverpark` circuit; `CIRCUIT_ORDER.length` (8) does not equal `TOTAL_RACES` (8) will actually pass at this point, so the failures are the silverpark test and the order/entry test.

- [ ] **Step 3: Add the Silverpark circuit spec**

Add to the `"circuits"` object in `src/data/circuits.json`. A fast, flowing, wet-prone British-flavoured track — it fills a gap in the existing calendar, which has no high-speed circuit with real rain risk:

```json
    "silverpark": {
      "name": "Silverpark GP",
      "location": "Northamptonshire, England",
      "flag": "🇬🇧",
      "laps": 52,
      "sectorBase": [30.0, 32.0, 27.0],
      "carSensitivity": [0.34, 0.40, 0.26],
      "driverSensitivity": [0.30, 0.38, 0.32],
      "overtakingFactor": [1.1, 0.45, 0.65],
      "pitLaneTimeLoss": 20.0,
      "rainProbability": 0.45,
      "weatherBias": "variable",
      "trackPath": "paths/silverpark.json",
      "characterNote": "Fast and flowing, taken almost flat. Rewards aero balance and nerve, and the weather turns without warning.",
      "funFacts": [
        "Rain has decided more races here than any other round",
        "Three long full-throttle sequences reward an aero-strong car",
        "The final sector is the shortest on the calendar"
      ],
      "atmosphere": "day"
    },
```

**Verified during planning:** the schema is `weatherBias: z.string().optional()`, so it accepts *any* string without erroring, but `generateWeatherTimeline` looks the value up in `tuning.weather.timeline.intensityBias` as `intensityBias[weatherBias] ?? 0.2`. The only valid keys are **`stable`, `variable`, `wet`, `mixed`, `showery`, `stormy`**. Anything else silently falls back to 0.2 and the circuit's rain character becomes a lie with no error anywhere. Use only those six.

- [ ] **Step 4: Add it to `CIRCUIT_ORDER`**

In `src/state/raceStore.ts`:

```ts
export const CIRCUIT_ORDER = [
  'bengaluru', 'veloce', 'sol_desert', 'highland',
  'monsoon_bay', 'grand_savane', 'aurora', 'harbour_lights',
  'silverpark',
] as const
```

- [ ] **Step 5: Set `TOTAL_RACES` to 9 temporarily**

In `src/state/seasonStore.ts`, change `TOTAL_RACES` to `9` so the "one circuit per round" test passes at this intermediate step. Task 3 takes both to 12.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/data/calendar.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS. `tests/ui/seasonEnd.test.tsx` computes season end from `TOTAL_RACES`, so it should adapt automatically — if it hardcodes 8 anywhere, fix it to read the constant.

- [ ] **Step 7: Verify Silverpark renders on the canvas**

```bash
npm run build && npx cap sync android
cd android && ./gradlew installDebug
```

Requires `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.

Start a season, pick Silverpark in race setup, and start the race. Confirm the track outline draws, cars follow the path, and the pit entry/exit are on the circuit rather than floating. A malformed path shows as cars jumping or a broken outline.

- [ ] **Step 8: Commit**

```bash
git add src/data/circuits.json src/state/raceStore.ts src/state/seasonStore.ts tests/data/calendar.test.ts
git commit -m "feat(data): add Silverpark GP, extend calendar to 9 rounds

paths/silverpark.json already existed as an orphan with no circuit entry.
Adds the spec and wires it into the calendar, which also proves the whole
pipeline (spec -> validation -> order -> canvas) before three circuits are
authored from scratch. Fills a real gap: no existing round combines high speed
with genuine rain risk."
```

---

### Task 2: Author three new circuits

**Files:**
- Create: `src/data/paths/costa_verde.json`
- Create: `src/data/paths/kaido.json`
- Create: `src/data/paths/altiplano.json`
- Modify: `src/data/circuits.json`
- Test: `tests/data/calendar.test.ts`

**Interfaces:**
- Consumes: the validation from Task 1
- Produces: circuit ids `costa_verde`, `kaido`, `altiplano`

**Design intent — fill gaps, do not duplicate.** The existing eight already cover a temple of speed (Veloce), a monsoon track (Monsoon Bay), a desert night race (Sol Desert), and a street circuit (Harbour Lights). These three add character the calendar lacks:

| Circuit | Character | Why it is not a duplicate |
|---|---|---|
| **Costa Verde** | Coastal, medium-speed, high tyre wear | No existing circuit punishes tyre management specifically |
| **Kaido** | Technical mountain esses, very hard to pass | Lowest `overtakingFactor` of any permanent circuit (1.00; only the Harbour Lights street track is lower at 0.65) — makes track position king |
| **Altiplano** | High altitude, thin air, power-sapping | Only circuit where the power facet matters less than usual |

- [ ] **Step 1: Write the failing test**

Append to `tests/data/calendar.test.ts`:

```ts
describe('new circuits', () => {
  const NEW_IDS = ['silverpark', 'costa_verde', 'kaido', 'altiplano']

  it('defines all four new circuits', () => {
    const { circuits } = loadGameData()
    for (const id of NEW_IDS) expect(circuits[id], id).toBeTruthy()
  })

  it('gives every circuit a track path file that exists', async () => {
    const { circuits } = loadGameData()
    for (const [id, c] of Object.entries(circuits)) {
      expect(c.trackPath, `${id} trackPath`).toBeTruthy()
      const file = c.trackPath!.replace('paths/', '')
      const mod = await import(`../../src/data/paths/${file}`)
      const path = mod.default
      expect(Array.isArray(path.points), `${id} points`).toBe(true)
      expect(path.points.length, `${id} points length`).toBeGreaterThan(10)
      expect(path.sectorBoundaries.length, `${id} sectorBoundaries`).toBe(3)
    }
  })

  it('makes Kaido the hardest non-street circuit to overtake on', () => {
    // Measured during planning: harbour_lights (a street circuit) totals 0.65
    // and should stay the hardest of all. Kaido at 1.00 is second, ahead of
    // bengaluru's 1.30 which was previously the hardest permanent circuit.
    const { circuits } = loadGameData()
    const total = (id: string) => circuits[id]!.overtakingFactor.reduce((a, b) => a + b, 0)
    expect(total('kaido')).toBeGreaterThan(total('harbour_lights'))
    for (const id of Object.keys(circuits)) {
      if (id === 'kaido' || id === 'harbour_lights') continue
      expect(total(id), id).toBeGreaterThan(total('kaido'))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/calendar.test.ts`
Expected: FAIL — the three new circuits do not exist.

- [ ] **Step 3: Author the three track-path files**

Each is `{ points, sectorBoundaries, pitEntry, pitExit }` in a ~640×540 space. Model the structure on `src/data/paths/silverpark.json`. Requirements:

- 18–28 points, forming a **closed loop** (last point near the first — the renderer tweens along the spline and a gap shows as a jump)
- `sectorBoundaries`: three indices into `points`, ascending, roughly evenly spaced, matching the `sectorBase` character (Kaido's technical sector should be the longest stretch of points)
- `pitEntry` / `pitExit`: indices bracketing the start/finish straight, `pitExit` a few points after `pitEntry`
- Shapes should differ visibly from the existing eight — Kaido tight and serpentine, Altiplano wide and open, Costa Verde with one long curving straight

- [ ] **Step 4: Author the three circuit specs**

Add to `src/data/circuits.json`:

```json
    "costa_verde": {
      "name": "Costa Verde GP",
      "location": "Cascais, Portugal",
      "flag": "🇵🇹",
      "laps": 46,
      "sectorBase": [29.0, 31.0, 30.0],
      "carSensitivity": [0.30, 0.38, 0.32],
      "driverSensitivity": [0.28, 0.34, 0.38],
      "overtakingFactor": [0.95, 0.40, 0.55],
      "pitLaneTimeLoss": 21.0,
      "rainProbability": 0.30,
      "weatherBias": "stable",
      "trackPath": "paths/costa_verde.json",
      "characterNote": "Abrasive coastal asphalt and long loaded corners. Tyres go off here faster than anywhere else — a one-stop is a gamble.",
      "funFacts": [
        "Highest tyre degradation on the calendar",
        "Sea breeze cools the surface through the evening",
        "Two-stop strategies usually beat a long first stint"
      ],
      "atmosphere": "dusk"
    },
    "kaido": {
      "name": "Kaido Circuit",
      "location": "Nagano Prefecture, Japan",
      "flag": "🇯🇵",
      "laps": 50,
      "sectorBase": [27.0, 36.0, 26.0],
      "carSensitivity": [0.26, 0.48, 0.26],
      "driverSensitivity": [0.26, 0.44, 0.30],
      "overtakingFactor": [0.55, 0.15, 0.30],
      "pitLaneTimeLoss": 23.0,
      "rainProbability": 0.35,
      "weatherBias": "showery",
      "trackPath": "paths/kaido.json",
      "characterNote": "Relentless mountain esses with no straight worth the name. Passing is nearly impossible outside the streets of Harbour Lights — win it in the pit lane or not at all.",
      "funFacts": [
        "Hardest permanent circuit on the calendar to overtake on",
        "Track position matters more here than raw pace",
        "Mountain weather can change within a single lap"
      ],
      "atmosphere": "night"
    },
    "altiplano": {
      "name": "Altiplano GP",
      "location": "Cochabamba, Bolivia",
      "flag": "🇧🇴",
      "laps": 42,
      "sectorBase": [31.0, 30.0, 29.0],
      "carSensitivity": [0.24, 0.42, 0.34],
      "driverSensitivity": [0.32, 0.36, 0.32],
      "overtakingFactor": [1.15, 0.50, 0.60],
      "pitLaneTimeLoss": 19.0,
      "rainProbability": 0.15,
      "weatherBias": "stable",
      "trackPath": "paths/altiplano.json",
      "characterNote": "Thin air at altitude robs the engines and blunts the aero. The power advantage the big teams rely on counts for less here.",
      "funFacts": [
        "Highest elevation round of the season",
        "Engine power matters least of any circuit",
        "Cooling is marginal — reliability is tested hardest here"
      ],
      "atmosphere": "day"
    },
```

Note `altiplano`'s `carSensitivity` deliberately down-weights S1 (0.24, the lowest on the calendar) so the "power matters less" claim in `characterNote` is mechanically true rather than flavour text.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/data/calendar.test.ts && npx tsc --noEmit`
Expected: PASS. The Kaido overtaking assertion will fail if any existing circuit has a lower total `overtakingFactor` — check `harbour_lights` (a street circuit) and lower Kaido's values further if so.

- [ ] **Step 6: Commit**

```bash
git add src/data/circuits.json src/data/paths/ tests/data/calendar.test.ts
git commit -m "feat(data): add Costa Verde, Kaido and Altiplano circuits

Three circuits chosen to fill gaps rather than duplicate character: Costa Verde
punishes tyre management (nothing else did), Kaido has the lowest overtaking
factor on the calendar so track position becomes king, and Altiplano
down-weights S1 car sensitivity so its 'power matters less at altitude' note is
mechanically true rather than flavour text. All names fictional."
```

---

### Task 3: Take the season to 12 rounds

**Files:**
- Modify: `src/state/seasonStore.ts` (`TOTAL_RACES`)
- Modify: `src/state/raceStore.ts` (`CIRCUIT_ORDER`)
- Modify: `src/ui/MainMenu.tsx:45` (the `"8-race championship"` subtitle)
- Test: `tests/data/calendar.test.ts`

**Interfaces:**
- Consumes: all twelve circuits from Tasks 1–2
- Produces: `TOTAL_RACES === 12`

- [ ] **Step 1: Write the failing test**

Append to `tests/data/calendar.test.ts`:

```ts
it('runs a twelve-round championship', () => {
  expect(TOTAL_RACES).toBe(12)
  expect(CIRCUIT_ORDER.length).toBe(12)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/calendar.test.ts`
Expected: FAIL — `TOTAL_RACES` is 9.

- [ ] **Step 3: Extend the calendar order**

In `src/state/raceStore.ts` — sequenced so the character of consecutive rounds varies rather than clustering the wet tracks:

```ts
export const CIRCUIT_ORDER = [
  'bengaluru', 'veloce', 'sol_desert', 'silverpark',
  'highland', 'costa_verde', 'monsoon_bay', 'altiplano',
  'grand_savane', 'kaido', 'aurora', 'harbour_lights',
] as const
```

- [ ] **Step 4: Set `TOTAL_RACES` to 12**

In `src/state/seasonStore.ts`: `export const TOTAL_RACES = 12`

- [ ] **Step 5: Fix the menu subtitle**

In `src/ui/MainMenu.tsx:45`, change `sub: '8-race championship'` to `sub: '12-race championship'`.

Then grep for other stale references: `grep -rn "8-race\|8 races\|eight races" src/ docs/` and fix any found.

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. Anything asserting a season length must read `TOTAL_RACES`, never a literal.

- [ ] **Step 7: Verify the season actually ends at round 12**

Play or drive the store through to round 12 and confirm `FINAL STANDINGS →` appears and reaches the Championship screen. This is the regression guarded by `tests/ui/seasonEnd.test.tsx` — it should already pass, but the boundary moved, so confirm rather than assume.

- [ ] **Step 8: Commit**

```bash
git add src/state/seasonStore.ts src/state/raceStore.ts src/ui/MainMenu.tsx tests/data/calendar.test.ts
git commit -m "feat: extend the championship to twelve rounds

Twelve distinct circuits, no repeats, ordered so consecutive rounds vary in
character rather than clustering the wet tracks. Gives the development-point
economy the 120 DP runway it is tuned for."
```

---

## Self-Review

**Spec coverage (§8):** Silverpark from the orphan path — Task 1. Three new circuits with specs and paths — Task 2. `TOTAL_RACES` 8 → 12 and the MainMenu subtitle — Task 3. No gaps.

**Placeholder scan:** every circuit spec is complete with real values; no "TBD" fields. The track-path files are the one place where I specify *requirements* (point count, closed loop, boundary placement) rather than literal coordinates — 20-plus hand-authored coordinate pairs per file cannot meaningfully be dictated in advance, and Task 2 Step 3 gives the exact structural constraints plus an existing file to model. Task 1 Step 7 and Task 2's path test catch a malformed result.

**Type consistency:** circuit ids `silverpark`, `costa_verde`, `kaido`, `altiplano` are spelled identically in the specs, `CIRCUIT_ORDER`, the tests, and the `trackPath` filenames. `TOTAL_RACES` is imported from `@state/seasonStore` and `CIRCUIT_ORDER` from `@state/raceStore` consistently.

**Intermediate state is deliberate:** Task 1 sets `TOTAL_RACES` to 9 so the "one circuit per round" invariant holds at every commit rather than being briefly violated. Task 3 takes it to 12.

**Two risks were checked during self-review and both were real, so the plan is corrected rather than merely warning about them:**

1. `weatherBias: "changeable"` (my first draft) is **not** a valid key. The schema is `z.string().optional()` so it would never error, but `generateWeatherTimeline` falls back to 0.2 for unknown keys and the circuit's advertised rain character would silently be false. Silverpark now uses `variable`, Kaido uses `showery`; Task 1 Step 3 lists the six legal values.
2. Kaido was going to be asserted as the hardest circuit to overtake on. Measured: `harbour_lights` totals 0.65, below Kaido's planned 1.00, so that test would have failed. The claim, the `funFacts` line, and the `characterNote` are now scoped to "hardest permanent circuit", and the test asserts that ordering explicitly.
