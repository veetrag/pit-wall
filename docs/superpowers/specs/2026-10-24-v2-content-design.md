# Pit Wall 2.0 "Content" — circuits, night races, challenges, start codes, custom championships

**Date:** 2026-10-24 · **Status:** draft for Veet's review
**Mandate (Veet):** "make it very comprehensive, don't ask questions, decide what's best."
Every design call is recorded inline as **Ruling Rn: what — why — cost if wrong**, and
collected in §10.
**Scope:** roadmap items 21–26. **Excluded forever, never proposed here:** run both cars,
practice session, rule changes between seasons, driver market, tablet/landscape layout,
translations, weekend tyre allocation, daily rewards/streaks, server leaderboards/friends.

## Goal

Give the game more places to race and more ways to play them, without touching the
locked model's behaviour on any race that exists today:

1. **Two new circuits** (a night street circuit with high safety-car risk that is hard
   to pass on; a high-degradation desert day circuit) and a repeatable pipeline for
   authoring more.
2. **Night races** as a circuit attribute with a real (small) track-temperature effect,
   and a **day theme** for the whole UI.
3. A **historic challenge pack** of scenarios inspired by classic strategy moments.
4. A **daily challenge**: one seeded scenario per calendar day, offline, the same for
   everyone, with only a personal best.
5. A **start editor**: turn any finished race into a custom start at a lap you choose,
   and share it as a compact, validated, checksummed code.
6. A **custom championship**: your calendar, distance, AI difficulty, weather mix and
   sprint rounds, endless, in its own save slot.

## Global constraints (bind every section)

- **Determinism.** Same seed + same inputs ⇒ identical race. No `Math.random()` in
  `src/engine/`. New behaviour is reached only through new *inputs* (new optional circuit
  fields, new optional `RaceConfig` content) whose absent/neutral value is exactly the
  old arithmetic. **No new rng draw anywhere in this spec.** Where a factor scales an
  existing probability, a zero base still short-circuits with no draw (the existing
  `chance > 0 && rng() < chance` idiom), and a factor of exactly 1 is the identity.
- **The golden fixture** (`tests/fixtures/golden-race-pre-incidents.json`, bengaluru,
  seed 424242) is **never re-captured**. bengaluru gets no engine-active new field
  (its `timeOfDay` is `dusk`, which has no engine effect).
- **Saves.** Season `SAVE_VERSION` 2, career 1, cloud 1: **no bumps**. The career season
  snapshot gains **no** field. New persistence lives under **new keys** with their own
  version constants (`custom.save` v1, `starts.mine`, `daily.best`), so no existing save
  can be affected. The real 1.4 fixtures `tests/fixtures/season-save-1.4.json` and
  `career-save-1.4.json` keep loading and the career keeps serialising byte for byte.
- **Balance numbers live in `src/data/tuning.json`** (and per-circuit numbers in
  `circuits.json`), zod-validated with bounds that turn a fat-fingered value into a
  load-time failure.
- **Monte-Carlo bands** (`MODEL_SPEC.md` §3) all still hold on the 4-circuit `SAMPLE` and
  the 12-round career calendar. New per-circuit calibration gates are added for each new
  circuit (§1.6). Nothing is widened to fit a measurement.
- **Scenarios** are discovered, not written: `scripts/find-scenarios.ts`, first hit
  meeting the brief, **goal = par − 1**, blurb kept true. The par and situation tests in
  `tests/data/scenarios.test.ts` cover every new scenario automatically.
- **UI.** Race Day Bold tokens only (never raw hex in components); volt = the player / the
  one call to action; caution = race control; hot = urgent; text on a volt, hot, caution
  or gain fill uses `--on-accent` (§2.4). Tabular figures on live numbers. Every new
  control ≥ 44px with a screen-reader label. Colour is never the only signal.
  `prefers-reduced-motion` and the in-app toggle respected: large motion becomes an
  opacity change. `color-mix()` stays banned; translucency is `rgba(var(--x-rgb), a)`.
- **No new dependency, no new Android permission.** Sharing text uses the existing
  `@capacitor/share`; copying uses `navigator.clipboard` best-effort; pasting is a text
  field.
- **Offline.** Nothing in this spec makes a network request.

## Ship slicing (summary — detail in §9)

| Slice | Release | versionCode | Contents |
|---|---|---|---|
| A | 1.7 | 10 | Circuit traits, Lantern Quay, Mesa Roja, authoring pipeline, night attribute + wear effect, night presentation |
| B | 1.8 | 11 | Challenges hub, historic pack, daily challenge |
| C | 1.9 | 12 | Race recipes, start editor, share codes, MY STARTS |
| D | 2.0 | 13 | Custom championship, day theme, store listing |

**Ruling R1: four public releases, not one big 2.0 — each slice is small enough to feel-test
on device before the next builds on it, and the first slice is the only one that moves
the model — cost if wrong: four store review cycles instead of one (~1 day each); the
slices can still be batched by holding releases on the internal track.**

---

## 1. More circuits (item 21)

### 1.1 Player-facing behaviour

Two new circuits join the game (14 in total):

| id | name | character | time of day |
|---|---|---|---|
| `lantern_quay` | Lantern Quay GP | Night street circuit. Walls everywhere: more errors, more crashes, and a crash brings out a safety car far more often than anywhere else. Second-hardest circuit to pass on. Long pit lane (24 s), so a safety-car stop is a huge prize. | night |
| `mesa_roja` | Mesa Roja GP | Hot, abrasive desert circuit in daylight. Tyres wear ~35% faster than the calendar norm: two stops is the baseline, three is live. Long straights, easy-ish passing on tyre offsets. | day |

Where the player meets them:

- **Career:** the round's circuit strip on Race Setup (which already lets the player race
  any circuit in a round) lists the two new circuits after the twelve calendar circuits.
  The **default calendar order, length (12) and every seed are unchanged.**
- **Custom championship** (§6): selectable like any circuit.
- **Challenges:** historic scenarios (§3) and the daily challenge (§4) use them.
- Trait pills wherever a circuit is presented (Race Setup header, main-menu next-race
  card, qualifying header, challenge cards): `NIGHT RACE`, `STREET`, `HIGH WEAR`,
  `SAFETY CAR RISK`. Each pill carries text, never colour alone.

**Ruling R2: the career calendar stays exactly the twelve rounds it is — new circuits are
reachable through the round strip, custom championships and challenges — why: the calendar
order feeds `seedFor`, the economy (`income.perRace × 12`), sprint rounds, the wet-adjacency
rule and every save on every phone; changing it is a balance and migration project, not
content — cost if wrong: career players rarely see the new circuits; the fix later is an
additive optional `calendar` field on new seasons only (the `SeasonRules` seam of §6 makes it
a data change).**

### 1.2 Data model

New optional fields on a circuit (absent = neutral = today's arithmetic):

```ts
// src/engine/types.ts — CircuitSpec gains
timeOfDay?: 'day' | 'dusk' | 'night'      // absent = 'day'
layout?: 'permanent' | 'street'           // absent = 'permanent'; presentation + calendar test only
tyreWear?: number                         // multiplies effective tyre age; absent = 1
crashRisk?: number                        // multiplies the driver-error chance; absent = 1
neutralisationRisk?: number               // multiplies SC and VSC deploy chances; absent = 1
```

zod (`CircuitSchema` in `src/data/validators.ts`):

```ts
timeOfDay: z.enum(['day', 'dusk', 'night']).optional(),
layout: z.enum(['permanent', 'street']).optional(),
tyreWear: z.number().min(0.7).max(1.6).optional(),
crashRisk: z.number().min(0.5).max(2.0).optional(),
neutralisationRisk: z.number().min(0.5).max(2.0).optional(),
atmosphere: z.enum(['day', 'dusk', 'night', 'desert_night', 'desert_day', 'storm', 'northern_dusk']).optional(),
```

The `neutralisationRisk` ceiling of 2.0 keeps every deploy chance ≤ 0.8 (max shipped base
0.40), so the product never needs clamping in practice; the engine clamps at 1 anyway.

Tuning (`tuning.json`): `"timeOfDay": { "nightWearFactor": 0.94 }`, zod
`z.object({ nightWearFactor: z.number().min(0.8).max(1.0) })`.

The two circuits (authored values; the pipeline §1.5 produced and checks them):

```json
"lantern_quay": {
  "name": "Lantern Quay GP", "location": "Harbour city, Singapore", "flag": "🇸🇬",
  "laps": 58, "sectorBase": [36.0, 29.0, 29.0],
  "carSensitivity": [0.33, 0.34, 0.33], "driverSensitivity": [0.32, 0.35, 0.33],
  "overtakingFactor": [0.45, 0.15, 0.25], "pitLaneTimeLoss": 24.0,
  "rainProbability": 0.20, "weatherBias": "showery",
  "timeOfDay": "night", "layout": "street", "crashRisk": 1.6, "neutralisationRisk": 1.5,
  "trackPath": "paths/lantern_quay.json", "atmosphere": "night",
  "characterNote": "Floodlit street circuit between the warehouses. Walls bite, safety cars are common, and passing is the second-hardest on the calendar.",
  "funFacts": ["Most safety cars of any circuit", "Longest pit lane on the calendar", "Cooler night track — tyres last a little longer"]
},
"mesa_roja": {
  "name": "Mesa Roja GP", "location": "Atacama Desert, Chile", "flag": "🇨🇱",
  "laps": 50, "sectorBase": [34.0, 25.0, 29.0],
  "carSensitivity": [0.40, 0.32, 0.28], "driverSensitivity": [0.30, 0.34, 0.36],
  "overtakingFactor": [1.15, 0.5, 0.65], "pitLaneTimeLoss": 21.0,
  "rainProbability": 0.03, "weatherBias": "stable",
  "timeOfDay": "day", "layout": "permanent", "tyreWear": 1.35,
  "trackPath": "paths/mesa_roja.json", "atmosphere": "desert_day",
  "characterNote": "Sun-baked, abrasive desert circuit. Tyres fall apart fast: two stops is the baseline and three is never off the table.",
  "funFacts": ["Highest tyre wear on the calendar", "It almost never rains", "Long straights reward a low wing"]
}
```

Track paths (validated against every rule in `tests/data/calendar.test.ts`: closed loop,
no duplicate point, neighbouring-segment ratio < 4 (max measured 1.57 / 1.55), boundaries
inside the loop):

- `lantern_quay.json`: 22 points, `sectorBoundaries [7, 14]`, arc shares 0.382 / 0.308 / 0.310
  (sectorBase shares 0.383 / 0.309 / 0.309).
- `mesa_roja.json`: 21 points, `sectorBoundaries [7, 13]`, arc shares 0.389 / 0.280 / 0.331
  (sectorBase shares 0.386 / 0.284 / 0.330).

Coordinates are in the plan (Task 3, Task 4).

**Ruling R3: two circuits, not three — why: each circuit costs a calibration pass, a
band gate, art and challenge content; two is enough to prove the pipeline and cover the two
briefed archetypes — cost if wrong: a thinner 2.0; a third circuit is a pure data task once
the pipeline exists.**

**Ruling R4: both new circuits use sensitivities normalised to sum ~1.0 (car and driver) —
why: MODEL_SPEC §4 shows harbour_lights' driver-heavy sum (1.36) anti-correlates with churn;
a street circuit's character here comes from walls, safety cars and passing difficulty, not
from amplifying the driver — cost if wrong: Lantern Quay feels less "driver's circuit" than
Harbour Lights; raising `driverSensitivity` later is a data edit re-checked by its band gate.**

**Ruling R5: real-region locations with fictional circuit names, as the existing twelve do —
why: consistency with the shipped calendar ("Monza, Italy" for Veloce); the
no-real-people/brands rule applies to the historic pack's content (§3) — cost if wrong: a
location string edit.**

### 1.3 Engine impact

One pure helper module, `src/engine/circuitTraits.ts`:

```ts
export interface CircuitTraits { wear: number; crashRisk: number; neutralisationRisk: number }
export function circuitTraits(circuit: CircuitSpec, tuning: TuningConstants): CircuitTraits
// wear = (circuit.tyreWear ?? 1) * (circuit.timeOfDay === 'night' ? tuning.timeOfDay.nightWearFactor : 1)
```

- **Tyre wear.** `effectiveTyreAge` is the single source of truth for wear (its own
  comment says so: the HUD gauge, AI pit calls and radio must agree with the lap model).
  Its fourth parameter changes from `tuning: TuningConstants` to
  `ctx: TyreContext = Pick<RaceConfig, 'tuning' | 'circuit'>`, and the result is
  multiplied by `circuitTraits(ctx.circuit, ctx.tuning).wear`.
  **Ruling R6: change the parameter type rather than add an optional factor — why: tsc
  then flags all eleven call sites (engine, radio, pit panel, telemetry gauge), so the UI
  can never show a different cliff fraction from the one the engine races on; an optional
  factor would silently default to 1 at a forgotten call site — cost if wrong: a
  mechanical edit in ~11 places and two test files.** At wear = 1, `x * 1 === x`, so the
  golden race is untouched.
- **Crash risk.** `driverErrorChancePerSector(consistency, tuning, crashRisk = 1)` multiplies
  its result; `rollDriverError` forwards it; `race.ts` passes the circuit's value. A zero
  base still draws nothing. Red-flag chance is **not** scaled (it is conditional on a crash,
  so more crashes already mean more red flags).
- **Neutralisation risk.** `rollSafetyCarDeployment(cause, tuning, rng, risk = 1)` and
  `rollVscDeployment(...)` use `Math.min(1, base * risk)`; at a zero base, no draw.
- **No new rng draw, no new `RaceState` field.** Existing `rng()` call order is unchanged
  because every scaled roll was already drawn whenever its base was non-zero.

### 1.4 Save impact

None. Circuits are build-time data. A saved `selectedCircuitId` of a new circuit is a valid
id for any build that has it; a build without it falls back via `currentCircuitId()`'s
existing `?? CIRCUIT_ORDER[...]` (only reachable by downgrading, which the store prevents).

### 1.5 The circuit-authoring pipeline (repeatable)

Written up as the runbook `docs/CIRCUIT-AUTHORING.md` (created in the plan) and enforced by
tests. Seven steps, each with its gate:

1. **Brief.** One paragraph: archetype, the one strategic question the circuit asks, time of
   day, which existing circuit it must *not* duplicate.
2. **Data entry** in `circuits.json`: laps (target race 75–95 min of sim clock), traits,
   `overtakingFactor` (pick its rank on the calendar first, then values; max sector
   ≥ 0.35 so `overtaking.factorFloor` still leaves the circuit varying sector to sector),
   `pitLaneTimeLoss` (18–24 s), sensitivities summing 0.95–1.05 each.
   *Gate:* `tests/data/validators.test.ts`, `tests/data/calendar.test.ts`.
3. **Wing check.** Dry optimum `d* = (gripGain·(w1+w2) − speedGain·w0) / (2·balanceCost)` must
   sit near a level: step-off loss 0.08–0.30 s/lap. *Gate:* `tests/engine/setupBalance.test.ts`.
   The circuit report prints `d*`, the best level and the step-off.
4. **Track path** `src/data/paths/<id>.json`: 18–26 points in a ~80–380 box, closed, no
   segment more than 4× its neighbour, `sectorBoundaries` placed so each sector's arc share
   is within ±0.03 of its `sectorBase` share (the canvas tweens at sector rate, so a
   mismatch makes dots visibly speed up/slow down), `pitEntry`/`pitExit` on the main
   straight. Register in `src/data/circuitPaths.ts`. *Gate:* calendar test (geometry) and
   the new `sector arc shares match sectorBase` test.
5. **Calibration** with the report tool:
   `CIRCUIT_REPORT=1 CIRCUITS=<id> npx vitest run tests/tools/circuitReport.run.test.ts --reporter=verbose`.
   It prints, at n=120 per difficulty (seed base 1000): |Δpos|, ρ, pace-rank ρ, distinct
   winners, crashes/car-race, mechanical DNF, tyre-failure DNF, SC/race, VSC/race, AI stops
   per classified car, clearing-failure rate at 0.4 s/lap; and the same line for the
   4-circuit `SAMPLE` as the reference. Tune **only this circuit's data** until the
   per-circuit envelope (§1.6) and the circuit's identity targets pass. Never tune a global
   tuning value for one circuit.
6. **Art & presentation.** Atmosphere palette (add one to `ATMOSPHERE_PALETTES` only if no
   existing one fits), trait pills derive from data automatically, `CircuitOutline` derives
   from the path automatically. Store: one listing screenshot if the circuit is a headline.
7. **Record.** Measured report lines go into `MODEL_SPEC.md` §17 (new), with the commit that
   added the circuit.

### 1.6 Calibration gates per new circuit

`tests/engine/newCircuitBands.test.ts` (simulation project), n=120 per cell, both
difficulties, seed base 1000, all cars AI (`MODEL_SPEC` §12 trap 1):

| metric | per-circuit envelope (all new circuits) | why this range |
|---|---|---|
| mean \|grid − finish\| | 2.3 – 4.6 | the legacy circuits measure 2.59–3.57 individually (§3 table); ±0.3 margin |
| grid↔finish ρ | 0.50 – 0.85 | per-circuit samples are noisier than the field-wide 0.60–0.80 |
| pace-rank correlation | ≥ 0.85 | anti-lottery; field-wide final gate is 0.90 on pooled samples |
| distinct winners | ≥ 3 | a single circuit pools less disruption (MODEL_SPEC §4) |
| mechanical DNF / car-race | 0.04 – 0.12 | circuit-independent mechanism; sanity |

Identity targets (the circuit must *be* what its brief says):

- **Lantern Quay:** SC/race ≥ 0.85 **and** ≥ 1.4 × the same run's `SAMPLE` SC/race;
  crashes/car-race ≤ 0.14; clearing-failure rate at 0.4 s/lap ≥ 0.20 (veloce measures 0.00).
- **Mesa Roja:** mean AI stops per classified car ≥ 2.0 **and** ≥ `SAMPLE`'s + 0.6;
  tyre-failure DNF / car-race ≤ 0.03 (high wear must create decisions, not a puncture
  lottery).

Field-wide bands are unaffected by adding a circuit (they run on `SAMPLE` and the career
calendar). **Ruling R7: the full-calendar Monte-Carlo gate (`apex remains the strongest
team over the full calendar`) is pinned to the career calendar `CIRCUIT_ORDER` instead of
`Object.keys(circuits)` — why: that gate was measured on, and is about, the twelve-round
championship; letting a content addition change its sample turns a balance gate into a
content gate — cost if wrong: the new circuits never contribute to the team-order gate;
their own envelope gates cover them.**

**Ruling R8: `tests/data/calendar.test.ts`'s "Kaido is the hardest non-street circuit"
is rewritten as "every street circuit is harder to pass than every permanent circuit, and
Kaido is the hardest permanent circuit" — why: the test's own failure message asks for
exactly this update when a deliberately harder circuit arrives; Lantern Quay (Σ 0.85) sits
between Harbour Lights (0.65) and Kaido (1.00) — cost if wrong: none to gameplay; Kaido's
`characterNote` already says "non-street".**

### 1.7 UI

- Trait pills (`src/ui/kit/TraitPills.tsx`, new): derived from `circuitTraits` +
  `timeOfDay`/`layout` with thresholds in code (`wear ≥ 1.15` → HIGH WEAR, `crashRisk ≥ 1.3` or
  `neutralisationRisk ≥ 1.3` → SAFETY CAR RISK). Tones: NIGHT RACE `dusk`, STREET `dusk`,
  HIGH WEAR `hot`, SAFETY CAR RISK `caution`. Text pills, ≥ 24px tall, inside 44px rows;
  `aria-label` spelled out ("Night race").
- Race Setup: for a HIGH WEAR circuit the default plan opens on **two stops** at 30% / 62%
  of the laps and the plan hint reads "High wear: a third stop may be needed — pit live."
- Circuit strip: the two new chips after round 12's chip, separated by a thin divider and
  labelled `EXTRA` (not a round number) so the strip never implies a 14-round season.

### 1.8 Testing

Unit (engine): neutral traits give byte-identical `effectiveTyreAge`, sector times and
whole races (golden test unchanged); wear multiplies effective age exactly; crash and
neutralisation risk scale the chance exactly and still draw nothing at a zero base
(counting rng); a 2× crash-risk circuit roughly doubles errors in a race (n bounded).
Data: validators bounds, calendar geometry, arc-share test, street/permanent ordering,
setup step-off for 14 circuits, every circuit registered and given an outline.
Simulation: §1.6 gates; existing `SAMPLE` and career-calendar gates green.

### 1.9 Risks

- **Mesa Roja punctures** (AI plans ignore wear). Mitigated: every brain boxes at the
  emergency cliff; the tyre-DNF gate (≤ 0.03) catches it; the lever is `tyreWear`, not the
  global failure tuning.
- **Lantern Quay as an SC lottery.** Mitigated by the anti-lottery gate (pace-rank ≥ 0.85)
  and |Δpos| ceiling; levers are its two risk factors.
- **Wing step-off** can fail on authoring; the report prints it first.

---

## 2. Night races and a day theme (item 22)

### 2.1 Night as a circuit attribute

Every circuit gets an explicit `timeOfDay`:

| night | dusk | day |
|---|---|---|
| harbour_lights, kaido, sol_desert, lantern_quay | bengaluru, grand_savane, costa_verde, aurora | monsoon_bay, veloce, highland, silverpark, altiplano, mesa_roja |

A data test pins consistency with the visual `atmosphere`: `night`/`desert_night`
atmosphere ⇔ `timeOfDay: 'night'`.

**Ruling R9: night is a property of the circuit, not something a weekend or a custom
championship can toggle — why: it keeps every circuit's identity (and its calibration) one
thing; a per-weekend override would multiply the calibration matrix — cost if wrong: a later
`RaceConfig.timeOfDayOverride` is additive and neutral when absent.**

### 2.2 Track-temperature effect

A cooler night track wears tyres less: `tuning.timeOfDay.nightWearFactor` **0.94** multiplies
effective tyre age at night circuits (through `circuitTraits.wear`, §1.3). Dusk and day are 1.

**Ruling R10: yes to a real effect, and a small one (−6% wear) — why: an attribute with no
consequence is decoration, and CLAUDE.md §6.4 forbids decoration; 6% moves a medium's cliff
from 16 to ~17 laps — enough to make a one-stop more plausible at night, not enough to
re-rank the field — cost if wrong: harbour_lights, kaido and sol_desert races change; two
shipped scenarios on harbour_lights (`cliff_edge`, `sprint_finish`) may need re-authoring.**

Delivery follows the 1.5 VSC pattern: the mechanism lands at `nightWearFactor: 1.0`
(nothing moves), then one reviewable commit sets 0.94, re-measures the bands on `SAMPLE`
(which contains two night circuits) and the career calendar, re-runs the scenario suite, and
re-authors any scenario whose situation or par moved (first hit, goal = par − 1). Measured
values go into `MODEL_SPEC.md` §17. If a field-wide band leaves its range, the factor is
raised toward 1.0 in 0.02 steps until it holds; the band is never widened.

### 2.3 Night presentation

- **Canvas.** Night circuits get floodlight pools: 6–10 soft warm radial pools at fixed points
  along the track (every ~1/8 of the arc), drawn once into the static atmosphere layer (no
  per-frame cost), using the existing `--floodlight` value mirrored in Pixi. Reduced motion:
  identical (static). Day circuits get none; `desert_day` gets a warm ochre wash
  (`top 0x2A1C14, bottom 0x0A0E1A, trackTint 0x6A4A30`).
- **Pills.** `NIGHT RACE` on Race Setup, qualifying header and the main-menu next-race card;
  the Race Setup tyre hint adds "Cool track: tyres last longer."
- **Share card:** unchanged — always the standard night palette (it is for other people).

### 2.4 Day theme

**Ruling R11: the theme is a Settings choice — THEME: NIGHT (default) / DAY / SYSTEM — not
something that flips per race — why: switching the whole UI between the menu and a day race
is jarring and breaks the "one orchestrated moment" rule; NIGHT stays the brand and the
default, so no current player sees a change; SYSTEM follows `prefers-color-scheme`, which is
the modern expectation — cost if wrong: players who wanted the UI to match the race's time
of day don't get it; "MATCH THE RACE" is a fourth option later, reusing the same tokens.**

**Ruling R12: the track canvas keeps the circuit's own lighting in both themes — why: the
canvas is the world (a night race is dark whatever the chrome); in the day theme it reads as
a broadcast monitor inset in a light frame — cost if wrong: the day theme feels split; a
lighter `day` atmosphere set is an additive palette table.**

**Mechanism: token redefinition plus three semantic token families.** Components keep
using the Race Day Bold names (`--ink` = ground, `--night`, `--grape` = cards, `--dusk`,
`--lilac` = body, `--lilac-dim` = labels, `--white` = titles/numbers). `:root[data-theme="day"]`
redefines them to a light ground with dark text. Two usages invert wrongly under that and get
new tokens:

| new token | night value | day value | used for |
|---|---|---|---|
| `--on-accent` | `#120E2B` | `#120E2B` | text/icons on a volt, hot, caution or gain fill (was `var(--ink)`) |
| `--volt-text` | `= --volt` | `#6B5000` | volt-coloured *text* (was `color: var(--volt)`) |
| `--hot-text` | `= --hot` | `#B3134C` | hot text |
| `--gain-text` | `= --gain` | `#0B6B3A` | gain text |
| `--caution-text` | `= --caution` | `#8A4600` | caution text |
| `--fill-edge` | `transparent` | `rgba(18, 14, 43, 0.35)` | 1px inset edge on light fills (volt CTA, hard-tyre chip) so they stay visible on white cards |

Day palette: `--ink #F3F0FA`, `--night #E9E4F7`, `--grape #FFFFFF`, `--dusk #DDD6F2`,
`--line-hair #C4BAE6`, `--lilac #3A2F7A`, `--lilac-dim #5A4E96`, `--white #120E2B`, with
matching `-rgb` channels. Accent fills (`--volt`, `--hot`, `--caution`, `--gain`, tyre tokens)
are unchanged. Measured contrast (WCAG 2.x), every pair ≥ 4.5:1:

| text | on ink | on night | on grape | on dusk |
|---|---|---|---|---|
| white (#120E2B) | 16.61 | 15.05 | 18.69 | 13.33 |
| lilac | 9.99 | 9.05 | 11.24 | 8.02 |
| lilac-dim | 6.29 | 5.70 | 7.08 | 5.05 |
| volt-text | 6.73 | 6.10 | 7.57 | 5.40 |
| hot-text | 5.99 | 5.43 | 6.74 | 4.81 |
| gain-text | 5.87 | 5.32 | 6.61 | 4.71 |
| caution-text | 6.31 | 5.72 | 7.10 | 5.06 |

`--on-accent` on volt 13.24, hot 5.97, caution 10.22, gain 10.48.

Migration: every `color: var(--ink)` on an accent fill → `--on-accent`; every
`color: var(--volt|--hot|--gain|--caution)` → the `-text` token; the one
`background: var(--white)` fill (StintBar marker) → `--tyre-hard`. Enforced by source-scan
tests in the style of `legacyTokenBan.test.ts`. `tokenContrast.test.ts` runs every pair in
both palettes. The colour-blind tyre palette composes with either theme (it overrides only
`--tyre-*`).

### 2.5 Save and settings impact

Settings gains `theme: 'night' | 'day' | 'system'` under key `settings.theme`, appended last
to `K` and to `loadSettings`' positional destructure; absent = `'night'`. Applied as
`data-theme` on the root by `applyDisplaySettings`; SYSTEM resolves through
`matchMedia('(prefers-color-scheme: light)')` and follows its `change` event. The Android
status/navigation bars stay ink in both themes (static resources pinned by `tests/data/systemBars.test.ts`;
a dark frame around the light UI reads as intentional — plan ruling P3). No
save change.

### 2.6 Testing

Engine: wear factor (night 0.94, day/dusk 1.0), golden unchanged with fixture tuning pinned to
1.0. Data: timeOfDay ⇔ atmosphere. UI: contrast tables both palettes, source scans, Settings
row (3-way segmented, label "Theme"), root attribute for each value, SYSTEM follows a
`matchMedia` change, reduced motion unaffected, floodlight layer drawn once per resize.

### 2.7 Risks

- Hidden raw-hex or inverted usages make the day theme ugly in corners. Mitigated by the
  source scans and a screenshot pass of every screen in the phone checklist.
- Night factor moves shipped scenarios. Accepted (R10); re-authored by rule.

---

## 3. Historic challenge pack (item 23)

### 3.1 Player-facing behaviour

The Scenarios screen becomes the **Challenges** hub (`scenario_select` phase, title
"CHALLENGES") with tabs: **SCENARIOS** (the seven shipped, default tab, unchanged) ·
**CLASSICS** (the historic pack) · **DAILY** (§4) · **MY STARTS** (§5, from slice C).
Classics cards look like scenario cards plus a one-line italic "inspired by" note and an
era chip (e.g. `NIGHT STREET ERA`). TAKE OVER, briefing, BEST pill and result screen are the
existing scenario flow.

The pack (six; circuits chosen so the premise is native to the circuit):

| id | name | circuit | brief (what the search looks for) | inspired by (shipped text, no names) |
|---|---|---|---|---|
| `lantern_gamble` | Lantern Gamble | lantern_quay | SC out, P4–P9, ≥ 15 laps left | "A night street race where an early stop met a perfectly timed safety car." |
| `desert_two_stop` | Desert Two-Stop | mesa_roja | P3–P6, tyre ≥ 0.6 of its cliff, 18–26 laps left, one stop made | "The tyre wars, when the boldest call was one more stop than everyone else." |
| `slicks_or_stay` | Slicks or Stay | silverpark | on I/W, track DRY within 3 laps, P5–P10, ≥ 10 laps left | "Drying-track afternoons where the first car on slicks won the race." |
| `hold_the_train` | Hold the Train | harbour_lights | P1–P3, tyre ≥ 0.75 of cliff, a car within 1.5 s behind on fresher tyres, 10–16 laps left | "A street-circuit leader who kept a faster car behind on dying tyres for the last stint." |
| `undercut_duel` | Undercut Duel | costa_verde | P2, ≤ 2.0 s behind P1, both on their first set at 0.6–0.85 of cliff, ≥ 20 laps left | "The great undercut duels, decided by a single lap of timing." |
| `from_the_back` | From the Back | kaido | P14–P18, tyre age ≤ 3, ≥ 25 laps left | "A champion's recovery drive from the back of the grid." |

Fallbacks are listed per brief in the plan (widen position by one, then the next circuit
of the same character); if none hits at `SEEDS=2000` the scenario is dropped and reported,
never invented.

**Ruling R13: fictional names and teams only; "inspired by" text names no person, team,
race, year or brand — why: the brief forbids real people/brands and the grid is already
fictional; describing the *strategic shape* of a classic moment keeps the nostalgia without
the IP — cost if wrong: copy edits only.**

**Ruling R14: classics live in `scenarios.json` with `pack: 'historic'`, not a second file —
why: every guard in `tests/data/scenarios.test.ts` (situation, par, goal = par − 1, unique id)
then covers them for free — cost if wrong: none; a split is a loader change.**

### 3.2 Data model

`ScenarioSchema` gains, all optional, appended last:

```ts
pack: z.enum(['core', 'historic']).optional(),      // absent = 'core'
inspiredBy: z.string().min(1).max(140).optional(),
era: z.string().min(1).max(24).optional(),
// in expect:
dryingAhead: z.number().int().positive().optional(), // wet now, a DRY lap within N laps
```

`find-scenarios.ts` gains the six briefs and two env filters (`PACK`, existing `BRIEF`).
Engine impact: none (scenarios are seeds). Save impact: bests use the existing
`scenarios.best` key, keyed by id.

### 3.3 Testing

Data tests run automatically. New: `pack` values legal; every `historic` scenario has
`inspiredBy` and `era`; a scan of `inspiredBy` rejects **any capitalised word that is not
the first word of its sentence**, so a real person, team, race or brand name cannot slip in. UI: tab switching, default tab,
a11y (tablist), classics card renders the inspired-by line.

### 3.4 Risks

A brief may have no hit. Handled by listed fallbacks and the "drop, don't invent" rule.

---

## 4. Daily challenge (item 24)

### 4.1 Player-facing behaviour

The DAILY tab shows one card for **today** (the device's local calendar date): circuit
outline, the circuit, driver and team, the situation pills (P, laps left, tyre, SC/VSC/rain
when brief-bearing), the goal ("FINISH P5 OR BETTER"), and **TODAY'S BEST** if played.
PLAY runs it through the scenario flow. Retry as often as you like; the best is kept.

That is all. **No streak, no counter of days played, no calendar of past days, no countdown
to tomorrow, no notification, no reward, no achievement, no badge.** Yesterday's card is not
shown.

**Ruling R15: the "day" is the device's local calendar date — why: players expect "today"
to change at their midnight; everyone on the same date gets the same challenge, which is the
promise — cost if wrong: at any instant two time zones see two different days; changing the
device clock lets a player play another day, which is harmless because nothing is rewarded.**

**Ruling R16: no countdown and no history list — why: both are the gentlest forms of the
streak mechanic the dark-pattern rule excludes (a countdown is a return prompt; a history is
a streak you can see) — cost if wrong: players can't see past results; additive later if
Veet wants it.**

### 4.2 Generation (deterministic, offline)

`src/state/daily.ts` (state layer: it uses `buildScenarioConfig`, which reads data):

```ts
export function dateKey(d: Date): string                       // 'YYYY-MM-DD', local
export function dailyHash(key: string): number                 // FNV-1a 32 of `daily:v${rulesVersion}:${key}`
export interface DailyChallenge {
  dateKey: string; id: string                                  // id = `daily-${dateKey}`
  circuitId: string; seed: number; playerDriverId: string; startLap: number
  goal: { position: number }
  expect: { position: number; lapsRemaining: number; compound: string; tyreAge: number; par: number; safetyCarOut: boolean; vscOut: boolean }
  archetype: DailyArchetype; signature: string                 // `${circuitId}:${seed}:${startLap}:${playerDriverId}`
}
export function generateDaily(key: string): DailyChallenge
```

Algorithm, all choices from `h = dailyHash(key)` and an engine `createRng(h)` stream (the
state layer may use the engine's seeded rng; nothing uses `Math.random`):

1. `circuitId = DAILY_CIRCUITS[h % 14]` (all fourteen, fixed order); driver = one of the 20
   drivers chosen by the stream; archetype = one of `recovery | defend | safety_car | rain |
   cliff | open` chosen by the stream.
2. For k = 0 … `daily.maxSearchRaces − 1`: seed = next stream value; one **autopilot** race
   (`buildScenarioConfig`, all cars AI, as `find-scenarios` does); collect laps in the window
   `daily.lapWindow` (0.35–0.80 of the race) whose situation matches the archetype; take the
   **first** matching lap of the first seed whose par is not retired and ≥ 2 and whose
   handover position is within `daily.positionRange`. Goal = par − 1. (The find-scenarios
   first-hit rule, applied at runtime.)
3. If the archetype finds nothing in budget, retry with archetype `open` (any lap in the
   window, position 3–14) on a fresh stream; then, as the last resort, `open` with position
   2–20. A test sweeps two years of dates and asserts the last resort is never reached.

Tuning: `"daily": { "rulesVersion": 1, "lapWindow": [0.35, 0.8], "positionRange": [3, 14],
"maxSearchRaces": 24, "keepDays": 30 }`.

Cost on device: one race ≈ 0.75 ms on desktop (8000 races in ~6 s), ~10 ms on a mid-range
phone; typical generation 1–4 races, worst case 72. It runs once per date, memoised, after the
tab's first paint behind a "formation lap" loader (a designed state).

**Ruling R17: generate on the main thread, deferred, memoised — why: the worst case is well
under a second and the debrief worker's message protocol would need a third message type for
a once-a-day job — cost if wrong: a visible stall on a very slow phone; moving it to the worker
is a contained change.**

**Ruling R18: "the same for everyone" means everyone on the same app version — why: the
challenge is produced by the engine and data; an update that moves the model may move the
day — cost if wrong: two players on different versions compare different challenges; the
card's signature makes that detectable, and bests are keyed by signature (§4.3).**

### 4.3 Data model and saves

`daily.best` (Preferences, new key): `Record<dateKey, { signature, position: number | null,
met: boolean }>`, zod-validated, pruned to the newest `daily.keepDays` entries on every write.
A stored best whose signature differs from today's generated signature is ignored (and
replaced on the next result). Engine impact: none. Daily never touches season, career, cloud
or achievements.

### 4.4 UI

DailyCard: slanted grape card, volt "TODAY" eyebrow is **not** used (volt is the CTA); eyebrow
`DAILY · 28 OCT` in lilac-dim; PLAY is the one volt button. Loader: the kit's formation-lap
animation, reduced motion = static "Building today's challenge…". a11y: card is a region
labelled "Daily challenge for 28 October"; best announced via `aria-live` on return.

### 4.5 Testing

Pure: `dateKey` (local, zero-padded, DST boundary), `dailyHash` (golden values), determinism
(same key twice → deep-equal), three pinned golden dates (exact circuit/seed/lap/goal, the
drift alarm), validity sweep over 730 consecutive dates (par not retired, goal = par − 1 ≥ 1,
lap in window, never last resort), signature mismatch drops a best, pruning. UI: tab, loader,
best pill, no countdown text anywhere (a source scan for "streak", "tomorrow", "come back").

### 4.6 Risks

Generation cost on low-end phones (R17); a model change shifting days (R18).

---

## 5. Start editor and share codes (item 25)

### 5.1 Player-facing behaviour

On a **Grand Prix or sprint result** (career or custom championship), a secondary button
**MAKE A START** opens a bottom sheet:

- A lap slider (1 … laps − 3, 44px thumb, arrow keys step one lap) over the lap chart; the
  chosen lap is marked on the chart.
- A live situation readout for the chosen lap (P, laps left, tyre and age, gap ahead, SC/VSC/
  red flag pill), recomputed on slider release (debounced 120 ms; replay is ~1 ms).
- **SET START** computes par (the AI drives your car from that lap to the flag) and shows the
  goal, "FINISH P4 OR BETTER". If par is P1 or the AI retires your car, the sheet says
  "THE AI ALREADY WINS FROM HERE" / "TOO MUCH OF A LOTTERY FROM HERE — PICK ANOTHER LAP" and
  SAVE stays disabled.
- An optional name (default `<CIRCUIT> L<lap>`), then **SAVE** (to MY STARTS) and
  **SHARE CODE** (system share sheet with the text code and one line of context).

The **MY STARTS** tab lists saved starts (newest first, max 30, swipe-free: a ⋯ menu offers
SHARE CODE, RENAME, DELETE with inline confirm) and an **IMPORT CODE** field (paste, then
IMPORT). An imported start shows its re-derived situation and goal before PLAY. Playing a start
uses the scenario flow; each start keeps its own BEST.

**Ruling R19: a start is a *recipe* — the race's config inputs, the player's calls before the
lap, and the lap — never a serialised `RaceState` — why: the engine is deterministic, so the
recipe reproduces the exact situation (including the rng position) in ~1 ms; a state snapshot
would be 20 cars × ~30 fields plus a forged rng state, could encode situations the engine can
never reach, and would break the "scenarios are discovered, not written" principle — cost if
wrong: a code made in one version can drift in another (handled by R23).**

**Ruling R20: MAKE A START is offered only on Grand Prix and sprint results, not on challenge
results — why: a challenge's prefix was AI-driven from a different handover, so (config, seed,
calls) does not reproduce it (the same reason RaceWatcher excludes scenarios from the debrief)
— cost if wrong: no "start from a start"; supporting it means nesting recipes.**

**Ruling R21: goal = par − 1, always, and no hand-set goals — why: the authoring rule every
shipped scenario follows; a creator-chosen goal could be trivially easy or impossible — cost if
wrong: less creative freedom; an optional harder goal is an additive field in format v2.**

### 5.2 Data model

```ts
// src/state/raceRecipe.ts
export type LapsPercent = 25 | 50 | 75 | 100
export type WeatherMix = 'circuit' | 'dry' | 'changeable' | 'wet'
export interface RaceRecipe {
  seed: number; playerDriverId: string; circuitId: string; difficulty: Difficulty
  strategy: PlayerStrategyChoice | null; overlay: UpgradeOverlayInput | null
  gridOrder: string[] | null; dryStart: boolean; sprint: boolean; allDry: boolean
  lapsPercent: LapsPercent; weather: WeatherMix
}
export function buildConfigFromRecipe(r: RaceRecipe): RaceConfig   // = buildRaceConfig(...) with the same args

// src/state/customStart.ts
export interface CustomStart {
  id: string                    // checksum hex of the code: stable, dedupes imports
  name: string                  // ASCII, 1-24 chars
  recipe: RaceRecipe
  calls: PlayerCall[]           // every call with step < startLap * 3
  startLap: number
  expect: { position: number; lapsRemaining: number; compound: Compound; tyreAge: number; par: number }
  fingerprint: number           // game-data fingerprint the code was made under
}
```

`RaceRecipe.lapsPercent` and `weather` exist from slice C (always `100` / `'circuit'` until the
custom championship lands) so the code format never needs a bump for them.

`raceStore` records the recipe of every season/custom race at start; `DebriefJob` gains
`recipe?: RaceRecipe` so MAKE A START still works after `raceStore` resets 1.5 s after the flag.

### 5.3 Engine impact

`src/engine/customStart.ts`, pure:

```ts
export function handoverFromCalls(config: RaceConfig, calls: readonly PlayerCall[], startLap: number): { state: RaceState; rng: Rng }
export function parFromHandover(config: RaceConfig, calls: readonly PlayerCall[], startLap: number): { position: number; retired: boolean }
```

`handoverFromCalls` = `replay(config, config.seed, prefix, startLap * 3)` with the live rng
returned, then `applyPlanHold(state, false)` (a pit panel left open at the handover must not
carry a hold into the start; draws nothing). `parFromHandover` replays independently to the
handover, marks every car AI (`isPlayer: false`, `playerDriverId: '__none__'`) and steps to
the flag with the same live rng — exactly `scenarios.test.ts`' par definition. No new draws, no
`RaceState` field.

### 5.4 The share code (format v1)

Text: `PW1-` + base64url (no padding) of the payload bytes followed by a 4-byte FNV-1a checksum
of those bytes. Whitespace anywhere is ignored on decode (chat apps wrap lines). Hard cap 2048
characters before any decoding work.

Payload (big-endian, `DataView`):

| field | bytes | notes |
|---|---|---|
| format version | u8 | 1 |
| data fingerprint | u32 | FNV-1a of the canonical engine-relevant game data |
| seed | u32 | |
| circuit | u8 | index into append-only `CIRCUIT_CODES` |
| player driver | u8 | index into append-only `DRIVER_CODES` |
| startLap | u8 | |
| flags | u8 | b0 sprint, b1 dryStart, b2 allDry, b3 pro, b4 strategy, b5 grid, b6 overlay |
| lapsPercent | u8 | 25/50/75/100 |
| weather | u8 | 0 circuit, 1 dry, 2 changeable, 3 wet |
| strategy (b4) | 3 + 2n | start compound, wing (0 = none), n stops ≤ 2, each lap + compound |
| grid (b5) | 1 + n | n = 20 driver indices |
| overlay (b6) | var | u16 packed tiers (5 × 2 bits, `upgrades.attributes` order); u8 n + n × (u8 team, f64 pool) rival development; u8 m + m × (u8 team, i8 offset) team tiers |
| calls | 1 + 4n | n ≤ 255; u16 step, u8 kind (0 pit, 1 pace, 2 restart_tyre, 3 hold_plan), u8 arg |
| expect | 5 | position, lapsRemaining, compound, tyreAge, par |
| name | 1 + len | ASCII 0x20–0x7E, len 1–24 |

Typical code ≈ 220 bytes → ~300 characters. Rival development is carried as exact `f64`
because the engine must reproduce the cars bit for bit.

Decode returns `{ ok: true; start } | { ok: false; reason: 'format' | 'checksum' | 'newer' | 'invalid' }`
and **never throws**: prefix and length checked; base64url decoded defensively; checksum
verified before parsing; every read bounds-checked; the decoded object then passes a zod schema
(ranges) and a semantic validator (circuit and driver exist, `1 ≤ startLap ≤ laps − 3`, call
steps non-decreasing and `< startLap × 3`, grid a permutation of all drivers, stop laps inside
the race, tiers 0–3, pools finite in [0, 200], tier offsets within `career.teamTiers`, name
charset). Strings are never evaluated, only rendered as React text.

**Ruling R22: hand-packed binary + base64url + FNV-1a, no compression library — why: no new
dependency (CLAUDE.md §2), `CompressionStream` is absent in jsdom so it could not be tested,
and ~300 characters pastes fine into every chat app — cost if wrong: codes ~40% longer than
compressed ones.**

**Ruling R23: a fingerprint mismatch warns, it does not reject — why: an older code usually
still plays a sensible race; the import screen re-derives the situation and, if it differs
from the code's `expect`, says "Made on another version of Pit Wall — this start now plays out
differently" with PLAY ANYWAY; a code from a newer *format* is rejected ("Update Pit Wall to
open this code") — cost if wrong: a player plays a start that is not what their friend played;
the message says so.**

**Ruling R24: no clipboard plugin — SHARE CODE uses the Share sheet (text), COPY uses
`navigator.clipboard.writeText` when available and otherwise selects the code in a read-only
field; import is a paste field — why: no new dependency or permission — cost if wrong: one
extra tap on devices where the WebView clipboard is unavailable.**

### 5.5 Saves

`starts.mine` (Preferences, new key): `{ v: 1, starts: Array<{ code: string; savedAt: number;
best: { position: number | null; met: boolean } | null }> }`. The code is the single source:
entries are decoded on load and an undecodable entry is dropped (logged). Max 30 (oldest
dropped on save, with an inline warning when the list is full). No effect on season, career
or cloud saves.

### 5.6 UI

Sheet: grape panel sliding up (`snapIn`, 180 ms, reduced motion = fade), focus trapped, ESC/back
closes. SET START is the sheet's one volt button; SAVE becomes the volt button after SET.
Code display uses Barlow 600 in a dusk field, `user-select: all`. Import errors are inline hot
text with an icon, announced via `aria-live`. All controls 44px, labelled.

### 5.7 Testing

Engine: handover reproduces the live race's state at that lap exactly (`replayFidelity` style);
a dangling hold is released; par equals an independent autopilot run; no draws added (byte
identity of a race replayed with and without the helper). Codec: round-trip on recipes covering
every flag combination; a pinned golden code string for a fixed start (format stability);
fuzz — 5,000 seeded random strings, every single-character mutation of a valid code, and every
truncation length: never throws, mutations fail with `checksum` (or `format`), truncations never
succeed; newer version → `newer`; 2049-char input rejected before decoding; table append-only
pins. Store: save/dedupe/limit/rename/delete/best. UI: slider a11y, par-1 and retired messages,
import error copy, drift warning.

### 5.8 Risks

- **Data drift** (R23).
- **Float exactness** of rival development across devices: JS numbers are IEEE-754 doubles on
  every platform; `f64` round-trips exactly (tested).
- **Abuse:** a code is inert data; caps on size, counts and charset bound the work.

---

## 6. Custom championship (item 26)

### 6.1 Player-facing behaviour

Main menu gains **CUSTOM CHAMPIONSHIP** (and **CONTINUE CUSTOM** when a custom save exists,
showing "Round 3 of 8 · P2"). A new game opens **Custom Setup**, one scrolling screen:

1. **Calendar** — the 14 circuit chips; tap to add in order (chip shows its round number),
   tap again to remove. Presets: CLASSIC 12 (career order), ALL 14, SHORT 6 (first six of the
   career order), STREETS & NIGHTS (every night or street circuit), SHUFFLE (re-orders the
   current selection deterministically from the championship seed). 2–14 rounds, each circuit
   at most once.
2. **Distance** — 25% / 50% / 75% / 100% (segmented).
3. **AI** — ROOKIE / PRO (segmented; independent of the career's difficulty setting).
4. **Weather** — AS THE CIRCUIT / ALWAYS DRY / CHANGEABLE / WET.
5. **Sprints** — NONE / FEW (every 4th round) / MANY (every 3rd round); never round 1.
6. **START** (volt) → the existing team select → driver select → Race Setup for round 1.

Racing is the career flow minus the economy: Race Setup → qualifying → (sprint) → race →
result → NEXT RACE. Standings, sprint points, lap chart, debrief, what-if, share card and
MAKE A START all work. At the end: the Championship screen shows the final table with
**RUN IT BACK** (same rules, new seed, "Championship 2") and MENU. RUN IT BACK keeps team and
driver; a CHANGE TEAM link returns to team select. A small tally ("Titles 1 of 2") is the only
history.

**Ruling R25: no development economy, team ladder, offers, erosion, career record, badges,
Play Games achievements or cloud save in custom — why: the career is where progression lives;
a sandbox that also paid out would be a second, easier career that devalues the first, and
every one of those systems is calibrated to a 12-round season — cost if wrong: players who
want progression in custom don't get it; adding development later is a rules flag.**

**Ruling R26: endless = RUN IT BACK with a fresh seed, not a multi-season career — why:
"endless" is satisfied without rival development or erosion, which would need their own
calibration — cost if wrong: no season-over-season arc in custom.**

**Ruling R27: each circuit at most once, order = tap order — why: unique circuits keep the
round ↔ circuit map unambiguous and the picker a single row of toggles instead of a fiddly
reorder list (44px rule, one-handed) — cost if wrong: no double-headers; allowing repeats is a
picker change only.**

**Ruling R28: distance scales AI planned stops to the raced laps, and the two-compound rule
follows the AI difficulty — why: `buildRaceConfig` today scales stops against the circuit's
full laps, which at 25% would schedule stops after the flag — cost if wrong: very short races
are one-stop sprints in practice; that is honest, and the Monte-Carlo bands are Grand Prix
bands that are not claimed at short distances.**

### 6.2 Data model

```ts
// src/state/seasonRules.ts
export type SeasonSlot = 'career' | 'custom'
export type SprintDensity = 'none' | 'few' | 'many'
export interface SeasonRules {
  slot: SeasonSlot
  calendar: readonly string[]
  lapsPercent: LapsPercent
  difficulty: Difficulty | null      // null = follow Settings (career)
  weather: WeatherMix
  sprints: readonly number[]         // 1-based rounds
  seedBase: number                   // custom only; career uses seedFor()
  championshipNumber: number         // custom only; 1 for career
}
export const CAREER_RULES: SeasonRules
export function sprintRoundsFor(density: SprintDensity, rounds: number): number[]
export function customSeedFor(rules: SeasonRules, raceIndex: number, attemptNonce: number, kind: RaceKind): number
```

`CAREER_RULES = { slot: 'career', calendar: CIRCUIT_ORDER, lapsPercent: 100, difficulty: null,
weather: 'circuit', sprints: tuning.sprint.rounds, seedBase: 0, championshipNumber: 1 }`.

Seeds: career is unchanged (`seedFor`). Custom: `seedBase + raceIndex × 1000 + 42 +
attemptNonce × 7919 (+ sprint.seedSalt)`, with `seedBase = 2^31 + (fnv1a(rules-json + ':' +
createdAt) & 0x7ff) × 1_000_000`. Career seeds are `(season − 1) × 100,000 + …` and stay below
2^31 for 21,000 seasons, so custom and career seeds can never coincide; the largest custom seed
(≈ 4.195 × 10^9) stays inside uint32. The seed base is generated in the state layer at creation
and stored; RUN IT BACK draws a new one.

Weather mix (via a cloned circuit in `buildRaceConfig`; the data object is never mutated):
- `circuit`: unchanged.
- `dry`: `allDry: true` (the existing mechanism; draws consumed identically).
- `changeable`: `rainProbability = min(0.7, max(0.25, base × 1.6))`, `weatherBias 'variable'`.
- `wet`: `rainProbability = 0.85`, `weatherBias 'wet'`.
Values in `tuning.custom.weather`. Distance: `lapsOverride = max(5, round(laps × pct/100))`
(set only when pct < 100, so a 100% config is byte-identical to the career's).

Custom save: key `custom.save`, `CUSTOM_SAVE_VERSION = 1`,
`CustomSnapshotSchema = SeasonSnapshotSchema.omit({ v: true }).extend({ v: z.literal(1), rules:
CustomRulesSchema, titles: z.number().int().min(0), championshipsRun: z.number().int().min(1) })`.
Every resume rule (`RESUME_PHASE`) is shared.

### 6.3 Architecture

**Ruling R29: custom is a mode of the existing `seasonStore` (a `rules` field), not a second
store — why: every race screen (Race Setup, qualifying, sprint screens, HUD watcher, result,
championship) reads `useSeasonStore`; a parallel store would duplicate the whole flow — cost if
wrong: career code paths gain `rules` reads, so the refactor is guarded by the full existing
suite plus "custom never writes `season.save`" and "custom never touches `careerStore`" tests.**

- `rules` lives in the store; `TOTAL_RACES`, `CIRCUIT_ORDER` and `isSprintRound` stay exported
  for the career, and every in-flow read goes through `roundsOf(rules)`, `calendarOf(rules)`,
  `isSprintRoundIn(rules, i)`.
- Career hooks (`recordRace`, `recordSprint`, badges preview, wing memory, ladder, offers,
  season-end bonus, `income.perRace`, rival development) are gated by `rules.slot === 'career'`.
- Autosave routes by slot: the subscriber writes `season.save` for career and `custom.save`
  for custom. The in-memory store holds exactly one slot; switching goes through the menu,
  which loads the target slot's snapshot from Preferences (the source of truth).
- The menu's CONTINUE (career) never sees custom state: it reads `loadSnapshot()` directly.

### 6.4 UI

Custom Setup uses the kit (`Segmented`, chips, `KitButton`); chips are 44px, show round
numbers and use `aria-pressed`; the calendar row announces "8 rounds selected". Championship
screen in custom mode replaces offer/ladder/bonus blocks with the tally and RUN IT BACK (volt).
The main-menu custom card is grape with a `CUSTOM` pill so it is never confused with the
career card.

### 6.5 Testing

Pure: `sprintRoundsFor`, `customSeedFor` (no collisions with career seeds over 50 seasons ×
12 rounds × 50 attempts vs 1,000 custom championships × 14 × 50), weather mix configs,
distance scaling of AI stops, 100%/circuit config byte-identical to the career config. Store:
full custom championship of 3 rounds driven through the store (results, sprint points,
standings, end, RUN IT BACK), career store untouched (deep-equal before/after), `season.save`
never written in custom, `custom.save` never written in career, kill-and-resume in every phase,
the 1.4 fixtures still load. UI: setup validation (START disabled below 2 rounds), presets,
continue cards, championship end.

### 6.6 Risks

- **Refactor regressions in career.** Mitigated: no career behaviour change is intended; the
  existing ~250 test files are the regression net; the refactor task changes no assertion.
- **Slot confusion** writing one slot's state into the other's key. Pinned by two tests.

---

## 7. Store listing, docs and release

- **Listing copy** (`docs/store/listing-copy.md`): new short description line "Night street
  races, a daily challenge, shareable starts and custom championships."; full description gains
  four bullets. "What's new" text per release.
- **Screenshots** (8 stay at 8, replace three): `03-what-if.png` → `03-lantern-quay-night.png`
  (live race under floodlights with SC banner), `06-scenarios.png` → `06-challenges-daily.png`
  (DAILY tab), `07-factory.png` → `07-custom-championship.png` (Custom Setup). Plus
  `09-day-theme.png` only if Play's 8-image limit allows (it allows up to 8 phone screenshots,
  so it replaces `04-qualifying.png`). Processed with `scripts/process-screenshots.py`
  (both 9:16 and 16:9 copies).
- **Data safety / privacy:** unchanged in substance; add one sentence: "Start codes are text you
  choose to share; Pit Wall does not send them anywhere."
- **Docs:** `docs/CIRCUIT-AUTHORING.md` (new runbook), `MODEL_SPEC.md` §17 (circuit traits,
  night factor, new-circuit measurements), `docs/V2-CHECKLIST.md` per slice, `DATA_SCHEMAS.md`
  (new fields), `docs/DEVICE-CHECKLIST.md` (day theme pass).
- **Versions:** 1.7/10, 1.8/11, 1.9/12, 2.0/13; `appVersion.test.ts` pinned each time.

## 8. Phone feel-test checklist (Veet, on device, per slice)

Slice A: Lantern Quay at 1× — do SCs feel frequent but not every-lap? Is passing hard but
possible on S1? Floodlights legible, 60fps held. Mesa Roja — does the two-vs-three-stop call
appear naturally around lap 30? Any puncture lottery? NIGHT RACE / HIGH WEAR pills read at a
glance. Harbour Lights after the night factor: still a two-stopper for most?
Slice B: classics read as classic moments; DAILY card loads in < 1 s; no sense of being nagged.
Slice C: MAKE A START from a real race, share the code to yourself via a chat app, import on a
second device or after reinstall, situation matches; garbled paste gives a friendly error.
Slice D: build an 8-round 50% wet championship with many sprints and play two rounds; kill the
app mid-race and resume; RUN IT BACK; career untouched afterwards. Day theme on every screen in
daylight and in a dark room; SYSTEM follows the phone's dark mode.

Balance calls for Veet after the passes: `crashRisk` 1.6 / `neutralisationRisk` 1.5,
`tyreWear` 1.35, `nightWearFactor` 0.94, daily archetype mix, custom weather values.

## 9. Order of work, dependencies, slices

```
A1 traits engine ─┬─ A2 harness+report+runbook ─┬─ A3 Lantern Quay ─┐
                  │                             └─ A4 Mesa Roja ────┼─ A5 night switch-on ─ A6 presentation ─ A7 release 1.7
B1 challenge plumbing ─ B2 classics (needs A3/A4) ─┐
B3 daily generator ─ B4 daily bests ───────────────┴─ B5 hub UI ─ B6 release 1.8
C1 recipes ─ C2 engine handover/par ─ C3 codec ─ C4 starts store ─ C5 sheet ─ C6 MY STARTS ─ C7 release 1.9
D1 rules + refactor ─ D2 custom save/slots ─ D3 gating+endless ─ D4 setup UI
D5 theme tokens ─ D6 migration ─ D7 theme setting           ─┴─ D8 store/docs/release 2.0
```

- Slice A first: it is the only slice that changes race behaviour, and B's classics use its
  circuits.
- B before C: the challenges hub is where MY STARTS lives.
- C before D: `RaceRecipe` already carries `lapsPercent`/`weather`, so D only sets them.
- D's theme (D5–D7) is independent of D1–D4 and can run in parallel.

## 10. Rulings (collected)

R1 four releases · R2 career calendar unchanged · R3 two circuits · R4 normalised
sensitivities · R5 real regions, fictional names · R6 `TyreContext` parameter · R7 full-calendar
gate on `CIRCUIT_ORDER` · R8 street/permanent overtaking test · R9 night is a circuit property ·
R10 real −6% night wear, switched on separately · R11 NIGHT/DAY/SYSTEM theme setting · R12
canvas keeps circuit lighting · R13 no real names in classics · R14 classics in scenarios.json ·
R15 local calendar date · R16 no countdown/history · R17 daily on main thread · R18 same per app
version · R19 starts are recipes · R20 MAKE A START only from GP/sprint results · R21 goal =
par − 1 · R22 hand-packed binary codec · R23 fingerprint warns, newer format rejects · R24 no
clipboard plugin · R25 no economy in custom · R26 endless = RUN IT BACK · R27 unique circuits,
tap order · R28 stops scale with distance · R29 custom is a mode of seasonStore.

Each is stated in full, with why and cost if wrong, where it is made.
