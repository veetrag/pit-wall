# Pit Wall 2.0 — Deeper race strategy

**Date:** 2026-10-24 · **Status:** written autonomously at Veet's instruction ("make it very
comprehensive, don't ask questions, decide what's best"). Every design call that would normally be
his is recorded as **Ruling: what — why — cost if wrong**, and all of them are collected in §16.
**Base:** `main` at `cba6f19` (1.6.2, versionCode 9).
**Plan:** `docs/superpowers/plans/2026-10-24-v2-deeper-race-strategy.md`.
**Excluded forever (never propose):** run both cars, practice session, rule changes between
seasons, driver market, tablet/landscape, translations, weekend tyre allocation, daily
rewards/streaks, server leaderboards.

## Goal

1.x gave the strategist three levers: pace mode, PIT and the compound. 2.0 makes the race
**deeper, not busier**: more resources to manage (fuel, battery, tyre temperature), more of the
real pit-wall toolkit (team orders, a mid-race re-plan, a safety-car read), and more of the real
racing texture that decides strategy (DRS trains, a track that rubbers in and washes out,
double-stacked stops, penalties). Every new mechanic must stay **emergent** (CLAUDE.md pillar 1):
nothing is scripted, every effect falls out of the sector model, and every number lives in
`src/data/tuning.json`.

What the player feels, in one paragraph: the opening laps on a green track are slow and get faster;
a shower washes the rubber away and the grip bar visibly drains. Fitting hards costs a cold out-lap,
so the undercut is no longer automatic. Softs overheat at Sol Desert if you push; mediums grain at a
cold Aurora if you save. Chasing a car is now "get within a second for DRS, then hit ATTACK" — unless
the car ahead is itself in DRS, in which case the train cancels it out and you need the battery or a
stop to escape. The fuel gauge says you are 0.6 laps short, so you lift-and-coast later or hope for a
safety car — and the SC meter says 24% in the next five laps. Your team-mate can be asked to let you
through (he may refuse — he leads you in the championship). Both cars boxing under the SC queue in
one box. Running wide earns warnings, then a 5-second penalty you serve at your next stop or carry to
the flag. And at any moment you can open the planner, drag your remaining stops, and see what the new
plan is worth before committing.

## Global constraints

- **Determinism.** Same seed + same inputs ⇒ byte-identical race. No `Math.random()` in
  `src/engine/`. New rng draws are allowed only on paths that are off at a zero rate and that
  short-circuit with **no draw** at zero (`MODEL_SPEC.md` §10.3). **2.0 in fact adds no rng draw to
  the race path at all** (Ruling A1).
- **Golden fixture never re-captured.** `tests/engine/byteIdentity.test.ts` must pass against the
  untouched `tests/fixtures/golden-race-pre-incidents.json`. `makeDeterministicTuning` pins every
  2.0 feature off through one helper, `v2Off()` (Ruling A3). New `CarState`/`RaceState`/
  `SectorResult` fields are **absent** (not `undefined`) whenever their feature is off.
- **Engine purity.** `src/engine/` imports nothing from `state/`, `ui/`, `canvas/`. Every new
  pure helper the UI needs (DRS trains, outlook, effective order, fuel margin, thermal status) lives
  in the engine and is unit-tested there; the UI only reads.
- **Data-driven.** Every balance number in `tuning.json` with zod validation in
  `src/data/validators.ts` (nested `z.object` strips unknown keys — every new key must be declared).
  New per-circuit facts (`drsSectors`, `trackTempC`, `incidentRisk`) are optional in
  `circuits.json` and authored for all 12 circuits.
- **Monte-Carlo bands.** Every existing band in `tuning.json._regressionBands` holds after each
  slice's switch-on. New bands are measured over four n=240 cells (pro/rookie × seed bases
  1000/7000) on the 4-circuit `SAMPLE`, sized `[floor(0.7·min/0.05)·0.05, ceil(1.3·max/0.05)·0.05]`,
  and written to `tuning.json._regressionBands`, `validators.ts` and `MODEL_SPEC.md` §3/§17.
- **Saves.** Season `SAVE_VERSION` 2, career 1, cloud 1 — **no bumps**. New persisted fields are
  optional, appended last, same order in schema and snapshot. Settings keys appended to
  `settingsStore` `K` and the positional destructure in `loadSettings` in the same order.
- **Race Day Bold.** Tokens only (`styles/tokens.css`); volt = player / call to action; caution =
  race control; hot = urgent; gain = good. Text on volt/caution/hot fills is ink. Tabular figures on
  every live number. One forward slant. Every new control ≥ 44px with an `aria-label`; colour never
  the only signal; `prefers-reduced-motion` replaces slides/pulses with opacity. Motion fast and
  directional, never bouncy (kit `EASE`, `PRESS`).
- **Performance.** Narrow Zustand selectors; per-tick derived data (trains, outlook, effective
  order) computed once per state reference; no per-frame allocations in Pixi.
- **Scenarios.** If a switch-on moves a scenario's handover, re-author it with
  `scripts/find-scenarios.ts` (first hit meeting its brief, goal = par − 1, blurb kept true).
- **Process.** Never two full `vitest run`s at once. Bounded loops in tests. If a pre-existing test
  fails and the plan does not name it, stop and report.

## 0. Cross-cutting architecture

### 0.1 Zero new draws

Every probabilistic 2.0 mechanic reuses a value the engine **already draws** or is a pure
threshold / hash:

| Mechanic | Source of randomness | Extra `rng()` calls |
|---|---|---|
| Track limits | `lapModel`'s `noise2` (second value of the per-sector `gaussianPair`, today used only as a spin magnitude), lower tail | 0 |
| Unsafe release | `pitStopTime`'s `g2`, **lower** tail (the slow stop owns the upper tail) | 0 |
| Team-order compliance | `hash01(config.seed, call.step, mateId)` (same finaliser as `forecastOffset`) | 0 |
| Graining, overheating, DRS, fuel, ERS, double-stack, AI policies, outlook | deterministic functions of state | 0 |

**Ruling A1: 2.0 adds no `rng()` call to the race path — why: every measured number keeps its
stream, the debrief's common random numbers stay paired across options, and a feature switched
off is byte-identical by construction rather than by guard discipline — cost if wrong: track
limits share a draw with spin magnitude, so on a sector where a car spins no track-limits check is
made (documented, and physically sensible: a car that spun is already off the road).**

### 0.2 One switch per feature, pinned off in tests

Each feature has an off value that reproduces the 1.6.2 stream exactly. `tuning.json` ships every
block **off** in the foundation task; each slice's switch-on task flips its features on after the
bands are measured.

| Feature | Off value (pinned by `v2Off()`) | Shipped (on) |
|---|---|---|
| Fuel | `fuelModel.enabled: false` | `true` |
| ERS | `ers.enabled: false` | `true` |
| Team orders (AI swaps) | `teamOrders.aiSwapStuckLaps: 0` | `3` |
| DRS | `drs.enabled: false` | `true` |
| Track rubber wash | `trackEvolution.wash: { DAMP: 0, WET: 0 }` | `{ DAMP: 0.35, WET: 0.80 }` |
| Tyre temperature | `tyreTemp.enabled: false` | `true` |
| Planner | n/a — only a player call can trigger it | — |
| Double-stack | `doubleStack.enabled: false` | `true` |
| Penalties | `penalties.enabled: false` | `true` |
| SC outlook (model inputs) | `incidents.wetErrorMultiplier` all 1, `incidents.circuitRiskWeight: 0`, `ai.scGambleMaxDelay: 0` | DAMP 1.4 / WET 1.8, 1.0, 3 |

**Ruling A3: one helper `v2Off()` in `tests/fixtures/tuning.ts`, merged first inside
`makeDeterministicTuning` — why: a single list a reviewer can audit against this table; a new 2.0
switch forgotten in the fixture fails byteIdentity at once — cost if wrong: none beyond the
helper.** A test that measures some other mechanism with `makeTuning` (shipped values) gets
`v2Off()` merged into its overrides when a switch-on turns it red, the 1.6 R14 precedent (a test
measuring X gets the other mechanics off unless they are its subject). No assertion changes.

### 0.3 State shape

New per-car state is four optional objects, written by `initRace` only when the feature is on, so
the golden JSON never sees them:

```ts
export type FuelMode = 'rich' | 'standard' | 'save'
export type FuelLoad = 'light' | 'target' | 'safe'
export type ErsMode = 'harvest' | 'balanced' | 'attack' | 'defend'
export type TeamOrderKind = 'swap' | 'hold' | 'free' | 'yield'

export interface FuelState { laps: number; mode: FuelMode; forced: boolean }
export interface ErsState { charge: number; mode: ErsMode }
export interface ThermalState { temp: number; coldLaps: number; grainLaps: number; heatWear: number }
export interface PenaltyState { warnings: number; pendingSec: number; servedSec: number }

// CarState (appended, all optional): fuel?, ers?, thermal?, penalty?
// RaceState (appended, all optional):
//   teamOrder?: { order: 'swap' | 'hold' | 'yield'; issuedLap: number; expiresLap: number }
//   replanned?: true
//   boxFree?: Record<string, number>     // teamId -> raceTime instant the box is free
// SectorResult (appended, optional): trackLimits?: true
```

`IncidentKind` gains `'track_limits' | 'penalty_issued' | 'penalty_served' | 'penalty_added' |
'unsafe_release' | 'double_stack' | 'team_order_swap' | 'team_order_ignored' |
'team_order_lapsed' | 'graining' | 'fuel_critical'` — each emitted only by its feature.

**Ruling A2: separate optional objects, not one `v2` bag — why: each feature can be switched on
alone and its absence is readable at the call site (`car.fuel ? … : …`); key order is stable
because the objects are only ever replaced in place — cost if wrong: four presence checks instead
of one.**

### 0.4 One stop path

Today four sites build a stopped car by hand (`race.ts` AI stop, `race.ts` plan stop,
`playerCalls.applyPlayerPit`, `projection.projectPitNow`), and the projection's copy already
differs: it neither consumes a set nor records the compound in `compoundsUsed`. 2.0 adds four
things every stop must do (out-lap tyre temperature, serving a pending penalty, the double-stack
queue, the unsafe-release check). Five sites × four behaviours is the `pitLaneTimeLoss` lockstep
problem (MODEL_SPEC §8) again.

New in `src/engine/pitStop.ts`:

```ts
/** The stopped car: tyres fitted, `addSeconds` charged. Pure, no rng. */
export function fitTyres(config: RaceConfig, car: CarState, compound: Compound, addSeconds: number): CarState
/** Draw the stop (one gaussianPair), queue, unsafe release, penalty service, box claim. */
export function executeStop(config: RaceConfig, ctx: StopContext, car: CarState, compound: Compound,
  rng: Rng, opts?: { allowSlow?: boolean }): StopOutcome
```

**Ruling A4: every stop goes through `executeStop`/`fitTyres`, including the projection — why:
the overlay must price exactly what the race charges (cold out-lap, queue, penalty), and the
projection's hand copy already carried a latent defect (a projection that reaches the flag did not
record the new compound, so with the two-compound rule it could charge a phantom 30 s) — cost if
wrong: projection outputs change for stops near the flag; `projectionDeterminism.test.ts` pins
determinism, not values, and a new test pins the fix.** The red-flag restart uses `fitTyres` with
0 seconds and a blanket-warm tyre (§5).

Byte identity of the refactor: `fitTyres` spreads the car and overwrites keys it already has, so
JSON key order is unchanged; `addSeconds` is exactly `cost.total` when queue and served penalty are
both 0 (no `+ 0` on the hot path).

### 0.5 Player calls

```ts
export type PlayerCall =
  | /* existing: pit, pace, restart_tyre, hold_plan */
  | { step: number; kind: 'fuel'; mode: FuelMode }
  | { step: number; kind: 'ers'; mode: ErsMode }
  | { step: number; kind: 'team_order'; order: TeamOrderKind }
  | { step: number; kind: 'replan'; stops: PitStop[] }
```

All four apply between steps through `applyCall` (exhaustive switch). None draws from the rng.
Replay, the lap chart, the debrief and what-if all keep working from `(config, seed, calls)`.
Call logs are not persisted (they live in `raceStore` and the debrief job only), so no save changes.

### 0.6 Sector context

`computeSectorTime(config, car, sector, rng, weatherState, safetyCar, ctx = NO_CTX)` gains a
seventh optional argument:

```ts
export interface SectorContext {
  /** Laps of rubber on the track (§4). Absent = car.lap, the 1.6 formula. */
  rubberLaps?: number
  /** DRS open for this car in this sector (§3). */
  drsOpen?: boolean
  /** Seconds this sector from the ERS deployment decided in race.ts (§1). */
  ersPace?: number
}
```

Fuel, thermal and penalty effects read `car.fuel`/`car.thermal` directly. All 2.0 pace terms are
summed into one `v2Delta` added to `raw` **only when non-zero**, so with every feature off the
expression is the 1.6 one.

### 0.7 Config additions

`RaceConfig` gains two optional fields, absent unless the caller sets them:
`playerFuelLoad?: FuelLoad` (race setup, §1) and `teamMateAheadInStandings?: boolean` (season
standings, §2). `buildRaceConfig` writes each only when known.

### 0.8 Fallback ladder for bands

**Ruling A5: each feature carries one pre-authorised balance fallback, applied once if its
switch-on moves a gated band out; if the band is still out, that feature ships off and the miss is
recorded in MODEL_SPEC §17 — why: Veet asked for autonomy, and |Δpos| (3.6–3.7 vs a 4.0 ceiling)
and ρ (0.62–0.69 vs a 0.60 floor) have little headroom for added churn; a pre-agreed single step
stops an executor from tuning to the test — cost if wrong: a feature can ship off in 2.0.** The
fallbacks are listed per feature and collected in §12.3.

## 1. Fuel and the energy store (ERS)

Two resources beside the tyres, both managed from one **Power unit** sheet. Pace mode stays the
tyre lever; fuel mode trades pace for fuel; ERS mode trades pace and position for battery.

### 1.1 Fuel — player-facing

- **Race setup** gains FUEL LOAD: `LIGHT` / `TARGET` (default) / `SAFE`. Light starts lighter and
  faster but short; safe carries margin and weight.
- **In the race** the HUD shows a fuel gauge as a **margin in laps**: "FUEL +0.3 L" (enough plus
  0.3 laps), "−0.6 L" (short by 0.6 laps of fuel at standard burn). Fuel mode: `RICH` (faster, burns
  more), `STD`, `SAVE` (lift-and-coast: slower, burns less, kinder on the tyres, cooler).
- If the margin falls below −0.3 laps the car goes into **forced lift-and-coast** — the engineer
  takes over until the margin is back to 0: SAVE pace plus an extra 0.5 s/lap. No fuel DNF.
- Safety-car and VSC laps burn 45%: a neutralisation is a fuel windfall.

### 1.2 Fuel — engine model

`L = config.lapsOverride ?? config.circuit.laps`.

- Start: `fuel.laps = L × (1 + loadMarginFrac[load])`, `load = playerFuelLoad ?? 'target'` for the
  player, `'target'` for every AI car. Fractions scale with distance so a sprint is not crippled.
- Burn per sector: `b = burn[effMode] × paceBurn[car.paceMode] × (neutralised ? neutralisedBurn : 1) / 3`;
  `fuel.laps -= b`. `effMode = forced ? 'save' : fuel.mode`.
- Margin: `fuelMarginLaps(car, L) = fuel.laps − (L − car.lap − car.sector / 3)`.
- At each lap boundary: `forced := margin < forcedSaveMargin` if not forced; `forced := margin < 0`
  while forced. Logged once as `fuel_critical` when it turns on.
- Pace per sector: `paceDelta[effMode] / 3 + (forced ? forcedSavePenalty / 3 : 0)`.
- Weight (replaces the 1.6 term when fuel is on): `fuelDelta = −((L − fuel.laps) × fuel.effectPerLap) / 3`.
  At standard burn with no neutralisation this equals the 1.6 `−(lap × effectPerLap)/3` plus a
  constant `loadMargin × effectPerLap / 3` — the fuel model collapses to the old model.
- Tyre wear: `effectiveTyreAge` multiplies by `degMultiplier[effMode]` (save 0.94), with the same
  "current mode, applied to the whole stint" convention pace mode already uses.

**Ruling F1: no fuel DNF; running short forces lift-and-coast with a penalty instead — why: a DNF
from a gauge the player missed is punitive and would dominate the DNF bands; forced save keeps the
consequence (lost time) proportional — cost if wrong: less jeopardy; `forcedSavePenalty` is the
lever.**
**Ruling F2: margin is counted in laps of fuel, never kg — why: the player plans in laps, and laps
compare directly with "laps to go" — cost if wrong: none.**
**Ruling F3: fuel load is a pre-race choice, fuel mode the in-race lever; no refuelling — why:
mirrors the real rules and gives the setup screen a second meaningful decision — cost if wrong:
one more setup control.**

| Key (`fuelModel.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `loadMarginFrac` | `{ light: -0.025, target: -0.012, safe: 0.004 }` | — |
| `burn` | `{ rich: 1.06, standard: 1.0, save: 0.90 }` | — |
| `paceBurn` | `{ push: 1.03, neutral: 1.0, conserve: 0.98 }` | — |
| `neutralisedBurn` | `0.45` | — |
| `paceDelta` (s/lap) | `{ rich: -0.12, standard: 0, save: 0.30 }` | — |
| `degMultiplier` | `{ rich: 1.0, standard: 1.0, save: 0.94 }` | — |
| `forcedSaveMargin` (laps) | `-0.3` | — |
| `forcedSavePenalty` (s/lap) | `0.5` | — |
| `aiRichMinMargin` (laps) | `0.4` | — |

`tuning.fuel.effectPerLap` (0.035) is unchanged and still the weight constant.

### 1.3 ERS — player-facing

- A battery gauge (0–100%). ERS mode: `HARVEST` (slower, recharges), `BAL` (neutral), `ATTACK`
  (faster and better at passing, drains fast), `DEFEND` (deploys only while a car is within 1.0 s
  behind; makes you harder to pass).
- **Battle chips.** Within 1.0 s of the car ahead an `ATTACK` chip slides in above the levers;
  with a car within 1.0 s behind a `DEFEND` chip does. One tap sets the mode.
- An empty battery keeps the chosen mode but deploys nothing; the gauge reads "FLAT".

### 1.4 ERS — engine model

`charge ∈ [0, 1]`, starts at `startCharge`. Decided once per car per sector in `race.ts` by the
pure `ersSector(config, car, ctx)` (new `src/engine/ers.ts`), before `computeSectorTime`:

- Neutralised: no deployment, `charge += neutralisedChargePerLap / 3`.
- `harvest`: pace `+modes.harvest.paceDelta / 3`, `charge += modes.harvest.chargePerLap / 3`.
- `balanced`: nothing.
- `attack`: `need = −modes.attack.chargePerLap / 3`; `frac = min(1, charge / need)`;
  pace `modes.attack.paceDelta × frac / 3`; `charge −= need × frac`; `attacking = frac`.
- `defend`: only when a running car is within `drs.detectionGap` behind at the sector start (the
  pre-tick order); `frac = min(1, charge / defendDrainPerSector)`; pace `defendPaceDelta × frac / 3`;
  `charge −= defendDrainPerSector × frac`; `defending = frac`.
- Clamp to `[0, 1]`. The pace goes into `ctx.ersPace`.

In `resolveOvertakes`: an attacking attacker adds `attackOvertakeAdv × attacking` to its `paceAdv`
(probability only — its sector time already carries the deployment); a defending defender scales the
pass probability by `1 − defendResist × defending`. The 0.85 cap is unchanged.

| Key (`ers.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `startCharge` | `1.0` | — |
| `modes` | harvest `{ paceDelta: 0.15, chargePerLap: 0.30 }`, balanced `{ 0, 0 }`, attack `{ paceDelta: -0.30, chargePerLap: -0.40 }`, defend `{ 0, 0 }` | — |
| `defendDrainPerSector` | `0.05` | — |
| `defendPaceDelta` (s/lap) | `-0.10` | — |
| `attackOvertakeAdv` (s/lap) | `0.15` | — |
| `defendResist` | `0.35` | — |
| `neutralisedChargePerLap` | `0.5` | — |
| `aiAttackGap` (s) | `1.0` | — |
| `aiMinAttackCharge` | `0.30` | — |
| `aiMinDefendCharge` | `0.15` | — |
| `aiHarvestBelow` | `0.25` | — |

**Ruling E1: four ERS modes, not a single "overtake button" — why: DEFEND makes the battery a
two-sided resource (attack and defence compete for one charge) and HARVEST makes the recharge a
decision — cost if wrong: one more segment; the battle chips cover the urgent case.**
**Ruling E2: an empty battery never silently changes the player's mode — why: the engine must not
rewrite a logged choice; the gauge says FLAT and the radio says it once — cost if wrong: a player
may sit in ATTACK on an empty battery.**

### 1.5 AI policy (both resources)

Pure `aiResourceModes(config, car, state): { fuel?: FuelMode; ers?: ErsMode }` in `strategy.ts`,
applied at lap boundaries beside `aiDecision`, only to cars carrying the state:

- **Naive:** fuel `standard`, ERS `balanced` (forced save still applies).
- **Smart / optimal fuel:** margin < 0 → `save`; battle ahead (gap ≤ `ers.aiAttackGap` and
  `paceAdv ≥ overtaking.paceGateMin`) with margin ≥ `aiRichMinMargin` → `rich`; else `standard`.
- **Smart / optimal ERS:** battle ahead and charge ≥ `aiMinAttackCharge` → `attack`; else a car
  within `aiAttackGap` behind and charge ≥ `aiMinDefendCharge` → `defend`; else charge <
  `aiHarvestBelow` → `harvest`; else `balanced`.

### 1.6 Power unit assist

**Ruling E3: a setting `Power unit: ASSISTED / MANUAL`, default ASSISTED — why: three lever groups
on a portrait phone is a real overload risk; assisted runs the smart AI policy for the player's car
through logged `fuel`/`ers` calls at lap ends, so replay and the debrief stay exact — cost if wrong:
players may never discover the levers; the coach mark and the battle chips (which work in either
mode; any manual change switches that race to MANUAL) mitigate it.**

### 1.7 UI

- **TelemetryZone:** two compact gauges right of the tyre meter. Fuel: centre-zero bar, margin in
  tabular figures ("+0.3 L"); gain ≥ 0, caution −0.3…0, hot when forced (label "LIFT & COAST",
  pulse, one Warning haptic on entry). Battery: 10 segments, gain fill, caution < 25%, hot and "FLAT"
  at 0; segments step with a 120 ms opacity change (none under reduced motion).
- **PU button** (48 px, slanted) between the pace toggle and PIT opens the **Power unit sheet**:
  Fuel and ERS `Segmented` controls with consequence subs computed from tuning ("−0.12s · +6% fuel",
  "−0.30s · −40%/lap"), the assist toggle, and a projection line ("At this rate: +0.1 L at the flag").
- **Battle chips:** volt fill, ink text, 48 px, slide in from the right in 160 ms (`EASE`); a tap
  gives a Medium haptic and the player's canvas glow intensifies while ATTACK deploys.
- a11y: gauges are `role="meter"` with `aria-valuetext` ("Fuel plus 0.3 laps", "Battery 62
  percent"); chips labelled "ERS attack" / "ERS defend".
- Coach mark `power_unit`: the first time a battle chip appears.

### 1.8 Replay, debrief, risks

- `fuel` and `ers` calls are judged like pace calls (timing ±`lapOffsets`, other modes, none), but
  at most `debrief.maxResourceVerdicts` (4) of them — the four in effect longest — so a chatty ERS
  race cannot blow the 20 s debrief budget (**Ruling E4 — why: the budget is fixed — cost if wrong:
  short-lived toggles are not judged**).
- Risk: ATTACK adds pass probability to every battle → |Δpos| up. **Fallback:**
  `ers.attackOvertakeAdv` 0.15 → 0.08.
- Invariant (test, not band): the AI field's mean final fuel margin ≥ −0.4 laps.

## 2. Team orders with the AI team-mate

The player never controls the team-mate's **strategy** — his stops, tyres, fuel and ERS stay with
the AI ("run both cars" is rejected forever). Team orders act only on **track position** between
the two team cars.

### 2.1 Player-facing

- A **TEAM** button (48 px) opens a small sheet with three orders:
  - `LET ME THROUGH` — enabled when the team-mate is directly ahead within 3.0 s.
  - `HOLD POSITIONS` — the two cars stop racing each other.
  - `FREE TO RACE` — cancels a hold or a pending swap.
- The answer comes on the radio within the lap: "Copy, he'll let you by." / "He says no. He wants
  to race." There is no visible percentage; a hint line in the sheet names the factors that apply
  ("He leads you in the championship", "Late in the race").
- The AI team-mate can **ask** through the existing radio-request card: "HAN is faster and stuck
  behind you. Let him through?" — YES logs a `yield` order (the player's car lifts), NO logs nothing.
- The tower links the two team rows with a thin team-colour bracket while an order stands.

### 2.2 Engine model (`src/engine/teamOrders.ts`)

Applying a `team_order` call (between steps, no rng):

- `free`: removes `state.teamOrder`.
- `yield`: always complied (it is the player's own car): `teamOrder = { order: 'yield', issuedLap:
  state.lap, expiresLap: state.lap + windowLaps }`.
- `swap` / `hold`: compliance `p`, then `roll = hash01(config.seed, call.step, mateIdHash)`;
  `roll < p` → set `teamOrder`; else log `team_order_ignored` (driverId = mate) and set nothing.

```
p_swap = clamp(base
               − (teamMateAheadInStandings ? championshipAhead : 0)
               − perPriorSwap × (swaps already obeyed by the mate this race)
               − (lapsLeft ≤ lateRaceLaps ? lateRace : 0)
               + (paceAdv(player over mate) ≥ paceBonusAdv ? paceBonus : 0),
               min, max)
p_hold = clamp(holdBase − (teamMateAheadInStandings && mate behind player ? championshipAhead : 0), min, max)
```

Execution, checked at the end of every sector in `stepSector` after `resolveOvertakes`, only with no
neutralisation out:

- `swap`: when the mate is directly ahead of the player in the post-overtake order and the gap ≤
  `swapMaxGap`: `mate.raceTime := player.raceTime + swapMargin`, `player.raceTime += swapLoss`
  (`swapMargin > swapLoss`, so the order flips); log `team_order_swap` (driverId = the car that
  yielded, timeLoss = its loss); remove the order.
- `yield`: the same with the roles reversed (player directly ahead of the mate).
- `hold`: `resolveOvertakes` skips any candidate pair made of the player and the mate; persists
  until `free`.
- A swap or yield not executed by `expiresLap` logs `team_order_lapsed` and is removed.

**AI teams' own orders.** At a lap boundary, for every team with two running AI cars (never the
player's team), not naive, no neutralisation: if the rear car is directly behind its team-mate, the
gap ≤ `traffic.gapThreshold`, its `lapsInDirtyAir ≥ aiSwapStuckLaps` and `paceAdv(rear over front)
≥ aiSwapMinAdv`, the swap executes with the same mechanics. No draw.

| Key (`teamOrders.*`) | Start | Off |
|---|---|---|
| `swapMaxGap` (s) | `1.5` | — |
| `swapMargin` / `swapLoss` (s) | `0.35` / `0.20` | — |
| `windowLaps` | `3` | — |
| `compliance` | `{ base: 0.85, championshipAhead: 0.25, perPriorSwap: 0.15, lateRace: 0.15, lateRaceLaps: 5, paceBonus: 0.10, paceBonusAdv: 0.10, holdBase: 0.92, min: 0.05, max: 0.98 }` | — |
| `aiSwapStuckLaps` | `3` | `0` |
| `aiSwapMinAdv` (s/lap) | `0.25` | — |
| `yieldRequest` | `{ minAdv: 0.15, gap: 1.0, lapEnds: 2, minLapsLeft: 5, maxPerRace: 1 }` | — |

**Ruling T1: compliance is a hash of (seed, step, mate), not an rng draw — why: no stream shift
(A1), and the same order at the same moment of the same race always gets the same answer, so a
retry cannot fish for compliance by reopening the sheet — cost if wrong: a player who notices may
re-time the order by a step to re-roll; the hint and the one-swap-per-call design make this low
value.**
**Ruling T2: compliance is hidden behind named factors, never a percentage — why: a team-mate is a
person, and a number invites min-maxing — cost if wrong: less legible; the factor hints carry it.**
**Ruling T3: `teamMateAheadInStandings` comes into the config from season standings
(`buildRaceConfig`), absent in quick races and scenarios — why: the engine is standings-agnostic
(CLAUDE.md §3) — cost if wrong: none.**
**Ruling T4: swaps never happen under a neutralisation — why: overtakes are already suspended
there, and a swap is an overtake — cost if wrong: an order given under SC waits for green.**

### 2.3 UI

- **TEAM sheet:** three 56 px slanted buttons; `LET ME THROUGH` is volt when available, grape and
  `aria-disabled` otherwise with the reason ("He is not ahead"); factor hints in lilac-dim Barlow.
- **Radio:** answer lines in `radio.json`; the tower flashes both team rows gain (swap obeyed) or
  hot (refused); Light haptic on send, Success/Error notification haptic on the answer.
- **Request card:** the existing `RadioRequest` component with kind `yield`; same expiry rules
  (1.6 R7 — expiry counts only while the clock runs).
- a11y: sheet is a `dialog` with focus trapped; each order has an `aria-description` of its effect.
- Coach mark `team_orders`: the first time the team-mate is directly ahead within 1.5 s.

### 2.4 Replay, debrief, risks

- `team_order` calls are judged with alternatives "no order" and ±`lapOffsets` timing (JudgedCall
  `{ kind: 'order'; lap; order }`, Alternative `{ kind: 'order-none' }`).
- Lap chart: a small "⇅" marker on both lines at a swap.
- Risk: AI swaps add churn. **Fallback:** `aiSwapStuckLaps` 3 → 5.
- New band: `aiTeamSwapsPerRace`.

## 3. DRS and DRS trains

### 3.1 Player-facing

- Within 1.0 s of the car ahead at the start of a DRS sector, a car gets DRS there: a little extra
  speed and a better chance to pass.
- **Trains:** when the car ahead is itself within 1.0 s of *its* car ahead, the defender also has
  DRS and the attacker's passing bonus is cancelled. Three or more cars each within a second form a
  **DRS train** — the tower brackets them "TRAIN ×5". Escaping a train takes ATTACK, a pace edge or a
  stop into clear air.
- DRS is off for the first 2 laps, for 2 laps after a safety car or red-flag restart, under any
  neutralisation, and on a non-dry track.

### 3.2 Engine model (`src/engine/drs.ts`)

- Circuits gain `drsSectors?: SectorIndex[]` (authored, table below). Absent ⇒ no DRS (every
  synthetic test circuit).
- `greenSinceLap(state)` = 0, or one past the lap of the latest `safety_car_ended` /
  `red_flag_restart` incident (VSC endings do not reset it, matching the real rule).
- `drsOpenSet(config, state, sector)`: the ids of running cars with DRS this sector, from the
  **pre-tick** order (sorted by `raceTime`): `drs.enabled`, `sector ∈ drsSectors`, `safetyCar ===
  null`, `weatherState === 'DRY'`, `state.lap − greenSinceLap ≥ enableAfterLaps`, not the leader,
  gap to the car ahead ≤ `detectionGap`.
- Sector time: `−timeGain` for a car with DRS (via `ctx.drsOpen`). Two cars in DRS both gain, so the
  time effect cancels inside a train by itself.
- Overtake probability: `× (1 + overtakeBonus × (1 − trainNeutralisation × [ahead has DRS]))` when
  the attacker has DRS. The 0.85 cap still applies.
- `drsTrains(config, state): { carIds: string[] }[]` — maximal runs of consecutive running cars each
  within `detectionGap` of the car ahead, length ≥ `trainMinCars`, the head included. Pure, used by
  the UI, the AI and the harness.

| circuit | `drsSectors` | why |
|---|---|---|
| bengaluru | `[0]` | S1 has the highest `overtakingFactor` (0.6) |
| monsoon_bay | `[0]` | 0.9 |
| veloce | `[0, 2]` | temple of speed, two zones |
| harbour_lights | `[0]` | street circuit, one short zone |
| sol_desert | `[0, 2]` | long straights |
| highland | `[0, 2]` | 1.1 / 0.65 |
| grand_savane | `[0]` | |
| aurora | `[0]` | |
| silverpark | `[0, 2]` | 1.1 / 0.65 |
| costa_verde | `[0]` | |
| kaido | `[0]` | |
| altiplano | `[0, 2]` | 1.15 / 0.6, thin air |

| Key (`drs.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `detectionGap` (s) | `1.0` | — |
| `enableAfterLaps` | `2` | — |
| `timeGain` (s per DRS sector) | `0.20` | — |
| `overtakeBonus` | `0.6` | — |
| `trainNeutralisation` | `1.0` | — |
| `trainMinCars` | `3` | — |
| `aiTrainEscape` | `true` | — |

### 3.3 AI

**Optimal brains escape trains** (`aiTrainEscape`): a car inside a train (not its head) with
`lapsInDirtyAir ≥ 3`, `cliffFrac ≥ 0.50`, its next planned stop within 8 laps and more than 8 laps
left boxes for its plan compound. Pure threshold. This is the first step on MODEL_SPEC §9.4's
"teach the brain to price traffic".

**Ruling D1: DRS is a per-sector flag, not a zone geometry — why: the sector is the engine's tick
and the overtaking discipline rule resolves passes at sector boundaries only; a sub-sector zone
would be fiction — cost if wrong: DRS cannot be placed mid-sector.**
**Ruling D2: the train cancels the passing bonus explicitly but the time gain only implicitly —
why: time is relative already (both cars gain); probability is not — cost if wrong: none.**
**Ruling D3: no DRS on a damp or wet track — why: real race direction disables it, and it keeps
wet races from becoming lotteries on top of the crossover model — cost if wrong: none.**

### 3.4 UI

- Tower: a `DRS` pill (gain fill, ink text) on rows with DRS open this sector; trains get a
  left-edge bracket in `--dusk` with a "TRAIN ×N" label in lilac-dim; if the player is inside a
  train (not its head) the player's pill reads "DRS ✕" with the tooltip text "Neutralised — the car
  ahead has DRS too". The bracket grows/shrinks with Framer `layout` (opacity only under reduced
  motion).
- Canvas: train cars connected by a faint lilac line drawn in the pooled overlay `Graphics`.
- Pit panel: if the projected rejoin lands inside a train, the line reads "Rejoins in a DRS train
  (×4)" — the projection already knows the order, `drsTrains` runs on the projected state.
- a11y: the pill text is the signal; the row's `aria-label` gains "DRS open" / "in a DRS train".

### 3.5 Risks and fallback

- DRS is the biggest new churn source. **Fallback:** `overtakeBonus` 0.6 → 0.3.
- New band: `drsTrainLapEndsPerRace` (lap ends with at least one train).
- Diagnostic: share of passes made with DRS open.

## 4. Track evolution made visible, and rain resets it

### 4.1 What exists

`lapModel.ts` already adds `trackEvolution.startDelta × max(0, 1 − car.lap / decayLaps) / 3`
(0.30 s/lap on lap 1, gone after 20 laps). It is invisible and blind to rain.

### 4.2 Player-facing

- The weather strip gains a **TRACK GRIP** bar (10 segments, 0–100%) with the lap-time cost beside
  it ("green · +0.21s/lap"). It fills as the race rubbers in.
- A damp lap washes off 35% of the rubber, a wet lap 80%: the bar drains right-to-left with a
  "GRIP RESET" caution toast, and the track is slow again when it dries.

### 4.3 Engine model (`src/engine/track.ts`)

Rubber is a pure fold over the weather timeline — **no new state**:

```
r = 0
for i in 0 .. lap − 1:
  r = min(decayLaps, r + 1) × (1 − wash[timeline[i]])      // wash[DRY] = 0
trackDelta = startDelta × max(0, 1 − r / decayLaps) / 3
grip01 = min(1, r / decayLaps)
```

With `wash` all 0 the fold is exact integer arithmetic and equals `min(decayLaps, lap)`, which gives
the 1.6 value bit for bit (beyond `decayLaps` both read 0). `race.ts` computes `rubberLaps` once
per tick and passes it in `ctx.rubberLaps`; when both wash rates are 0 it passes nothing and
`lapModel` keeps `car.lap` — belt and braces for the golden race.

| Key | Start | Off |
|---|---|---|
| `trackEvolution.wash` | `{ DAMP: 0.35, WET: 0.80 }` | `{ DAMP: 0, WET: 0 }` |

**Ruling R1: derive rubber, don't store it — why: no state-shape change, replay and the projection
get it for free, and it is O(lap) per tick (negligible) — cost if wrong: none.**
**Ruling R2: a non-dry lap first lays rubber then washes a fraction — why: with wash 0 that is
exactly the 1.6 rule, so one formula covers on and off — cost if wrong: a light drizzle still
rubbers slightly; physically defensible.**

### 4.4 Consumers

- `lapModel` (pace), §5 graining (`grainMaxGrip`), the weather strip and the canvas rubber line
  (opacity = 0.15 + 0.35 × grip01, set once per lap, no per-frame allocation).

### 4.5 UI

- `TrackGrip` row inside `WeatherStrip`: label "TRACK GRIP", 10 slanted segments in `--lilac`
  over `--dusk`, value in tabular figures, `role="meter"` with `aria-valuetext` "Track grip 78
  percent, plus 0.07 seconds a lap". On a reset the lost segments flash caution once (opacity
  under reduced motion) and the HUD alert "GRIP RESET — the rain washed the rubber away" fires.

### 4.6 Risks

- Rain races get a few tenths slower after the rain — a small, legible change. No band of its own;
  the weather-stop band is re-measured at the 2.0a switch-on. No fallback needed beyond wash 0.

## 5. Tyre temperature

### 5.1 Player-facing

- The tyre meter gains a **temperature band**: `COLD` / `IN WINDOW` / `HOT`, with a marker.
- **Out-lap:** fresh tyres come off blankets at 70 °C; hards take most of a lap to switch on, softs
  are ready almost at once. The pit panel prices it: "OUT-LAP: cold hards ≈ +0.6s".
- **Overheating:** pushing (and running rich, and following in dirty air) heats the tyres; above the
  window the car loses pace and the tyre wears faster — the cliff gauge visibly speeds up.
- **Graining:** softs and mediums run too cold on a green or cold track (saving fuel and tyres)
  start to grain: −0.35 s/lap for 4 laps, then it clears. Separate from wear.
- **Track temperature** matters: Sol Desert (44 °C) cooks softs, Aurora (21 °C) leaves hards cold.

### 5.2 Engine model (`src/engine/thermal.ts`)

```
trackTemp = circuit.trackTempC ?? defaultTrackTemp
target = trackTemp + weatherOffset[weather] + runningHeat + paceHeat[paceMode]
       + fuelHeat[effFuelMode]           (if car.fuel)
       + (car.lapsInDirtyAir > 0 ? dirtyAirHeat : 0)
       + (neutralised ? neutralisedHeat : 0)
[lo, hi] = windows[compound]
d = max(0, lo − temp);  e = max(0, temp − hi)
applies = (compound is dry) === (weather === 'DRY')      // the crossover model owns mismatches
pace/sector = applies ? (coldCoeff·(d/10)² + overheatCoeff·(e/10)² + (grainLaps > 0 ? grainPenalty : 0)) / 3 : 0
```

- Pace uses the temperature at the **start** of the sector; after the sector,
  `temp += responsePerSector × (target − temp)` and
  `heatWear += applies ? overheatWearPerLap × (e/10) / 3 : 0`.
- `effectiveTyreAge(...) = <1.6 value> + heatWear` (added only when non-zero) — one source of truth
  for wear, so the gauge, the AI and radio see overheating.
- **Graining** at each lap boundary, DRY weather, compound in `grainCompounds`, no graining active:
  `coldLaps = temp < lo − grainMargin ? coldLaps + 1 : 0`; if `coldLaps ≥ grainOnsetLaps` and
  `grip01 < grainMaxGrip` → `grainLaps = grainDurationLaps`, `coldLaps = 0`, log `graining`.
  While active, `grainLaps −= 1` per boundary.
- **Stops** (`fitTyres`): `temp = blankets`, counters and `heatWear` reset.
- **Start and red-flag restart:** `temp = blankets + formationWarm` (85 °C).

| Key (`tyreTemp.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `defaultTrackTemp` (°C) | `32` | — |
| `weatherOffset` | `{ DRY: 0, DAMP: -20, WET: -35 }` | — |
| `runningHeat` | `62` | — |
| `paceHeat` | `{ push: 8, neutral: 0, conserve: -6 }` | — |
| `fuelHeat` | `{ rich: 2, standard: 0, save: -5 }` | — |
| `dirtyAirHeat` | `3` | — |
| `neutralisedHeat` | `-25` | — |
| `responsePerSector` | `0.35` | — |
| `blankets` / `formationWarm` | `70` / `15` | — |
| `windows` | `{ S: [75,100], M: [85,108], H: [92,115], I: [50,85], W: [35,75] }` | — |
| `coldCoeff` / `overheatCoeff` (s/lap at 10 °C off) | `0.20` / `0.20` | — |
| `overheatWearPerLap` (laps of age per 10 °C over) | `0.08` | — |
| `grainMargin` / `grainOnsetLaps` / `grainDurationLaps` | `8` / `2` / `4` | — |
| `grainPenalty` (s/lap) / `grainMaxGrip` | `0.35` / `0.85` | — |
| `grainCompounds` | `["S", "M"]` | — |
| `ai` | `{ hotExcess: 4, coldDeficit: 6 }` | — |

Circuit `trackTempC` (authored, calendar mean exactly 32): bengaluru 38, monsoon_bay 31, veloce 33,
harbour_lights 27, sol_desert 44, highland 24, grand_savane 40, aurora 21, silverpark 26,
costa_verde 36, kaido 29, altiplano 35.

Worked checks (neutral, dry): Sol Desert soft 44+62 = 106 → 6 °C over → +0.07 s/lap, push → +0.39
s/lap and +0.11 laps of wear a lap. Aurora hard 21+62 = 83 → 9 °C cold → +0.16 s/lap, push → 0.
Hard out-lap at 32 °C from 70: ≈ +0.55 s; medium ≈ +0.17 s; soft ≈ +0.02 s.

**Ruling H1: one temperature scalar per car, not four corners or surface/carcass — why: the player
reads one band; anything finer is invisible decoration — cost if wrong: no front/rear-limited
circuits.**
**Ruling H2: the out-lap penalty is not a special rule — it is the cold side of the window after
`fitTyres` sets 70 °C — why: one mechanism, so the SC restart (cooled tyres) and the red-flag
restart behave consistently — cost if wrong: none.**
**Ruling H3: thermal pace applies only when the tyre family matches the weather — why: slicks in
the wet are already priced by the crossover penalty; stacking both would double-count — cost if
wrong: none.**
**Ruling H4: graining needs a green track (grip < 0.85) — why: real graining is a low-grip
phenomenon, and it makes rain-reset tracks and race starts the graining risk — cost if wrong:
graining may be rare; the band measures it.**

### 5.3 AI

Smart/optimal, after their pace decision at a lap boundary: `e > ai.hotExcess` and PUSH → NEUTRAL;
`d > ai.coldDeficit`, no neutralisation → PUSH (warm the tyres). Naive ignores temperature.

### 5.4 UI

- `TyreMeter` gains an optional `thermal` prop: a three-zone bar under the wear segments (`--dusk`
  cold zone with a "❄ COLD" label, `--gain` window, `--hot` "HOT"), a marker sliding at the
  current temperature (Framer spring-free `EASE` 200 ms; opacity jump under reduced motion), and a
  caution chip "GRAINING 3L" while active. No °C number on the HUD (Ruling H5: the window is the
  decision, the degree is noise).
- Tower: a small caution "COLD" tag on any row in its out-lap (temp below window).
- Radio: "Tyres are cooked" (first overheat lap > 6 °C), "We're graining" (onset), "Tyres are in."
- Pit panel: the out-lap line per compound chip.
- Coach mark `tyre_temp`: the player's first out-lap.

### 5.5 Risks and fallback

- Cold out-laps shrink the undercut — strategy value moves. The OPTIMAL-vs-NAIVE gate runs under
  `makeDeterministicTuning` (2.0 off) and is unaffected; a MEASURE-only diagnostic records the
  shipped-tuning gain for Veet.
- **Fallback:** `coldCoeff` 0.20 → 0.12 and `overheatCoeff` 0.20 → 0.12.
- New band: `grainingPerRace`.

## 6. Mid-race strategy rewrite

### 6.1 Player-facing

- A **PLAN** button (48 px) opens the planner: a timeline from now to the flag. The current stint
  (compound, age, cliff marker) and every remaining stop are drawn as stint bars; stop pins drag
  along the lap axis; a compound chip per stint; `+ STOP` / `− STOP`; up to 3 remaining stops.
- Constraints shown live: stops after the current lap, ≥ 4 laps apart, before the last lap; only
  compounds with sets left; a caution note when the pro two-compound rule is not yet met.
- **Preview:** "NOW: P6 (P4–P9)  ·  NEW: P5 (P3–P8) — better in 3 of 4". Runs in the debrief worker.
  Also shows the SC chance (§9), a pending penalty to be served (§8) and the cold out-lap (§5).
- Opening the planner **pauses the race clock** and holds a due plan stop (the 1.6.2 hold).
  CONFIRM (volt) commits; CANCEL changes nothing.

### 6.2 Engine model (`src/engine/planner.ts`)

- `sanitizeStops(config, state, stops)`: sort by lap; clamp laps to `[state.lap + 1, L − 1]`;
  enforce `minStintLaps` gaps by dropping later conflicting stops; keep at most `maxStops`;
  compounds resolved with `resolveAllocatedCompound` against the player's allocation. Pure.
- `applyReplan(config, state, stops)`: the player's `strategy.plannedStops` becomes
  `[...executed prefix padded to pitsDone, ...sanitized]`; `state.replanned = true`. The plan
  executes in `race.ts` when `(config.playerStrategyOverride || state.replanned) && !state.planHold`.
- `planPreview(config, state, seed, step, stops, futures)`: for k in 0..futures−1, from deep copies
  of `state`, run to the flag both the current plan and `applyReplan(stops)` with the **same**
  `createRng(futureSeed(seed ^ previewSeedSalt, step, k))` (common random numbers); returns
  `{ current: number[]; proposed: number[] }` finishing positions (DNF = cars + 1). Never touches
  the live rng.

| Key (`planner.*`) | Start |
|---|---|
| `maxStops` | `3` |
| `minStintLaps` | `4` |
| `previewFutures` | `4` |
| `previewSeedSalt` | `60013` |

**Ruling P1: the planner pauses the clock — why: a multi-step edit must not race the clock; the
under-pressure call stays the PIT button and the projection — cost if wrong: it can be used as a
free pause; it already exists as the pause button, so nothing is given away.**
**Ruling P2: a re-plan is one logged call carrying the whole remaining plan — why: replay applies it
atomically and the debrief can judge it as one decision — cost if wrong: none.**
**Ruling P3: four preview futures, not eight — why: a mid-race preview runs up to ~60 laps ×
8 runs in the worker and must answer in under a second on a mid-range phone; four with CRN is
enough to rank two plans — cost if wrong: noisier preview; it is labelled "typical" and shows a
range.**
**Ruling P4: the planner never edits the team-mate's plan — why: "run both cars" is rejected —
cost if wrong: none.**

### 6.3 UI

- `StrategyPlanner` full-height sheet, ink ground, slanted grape header "STRATEGY — LAP 23/50".
- Timeline: stint bars in tyre tokens with the compound letter (never colour alone); pins are 44 ×
  44 px hit targets with a 4 px visual stem; drag snaps to whole laps with a Light haptic per lap;
  keyboard: focused pin moves with ←/→, `aria-valuetext` "Stop 1, lap 31, hards".
- Preview card animates the two finishes with `useCountUp`; "better in N of 4" in gain/hot with an
  ▲/▼ arrow. While computing: the card shows a slim formation-lap shimmer (opacity only under
  reduced motion). Stale previews are cancelled on every edit (debounce 300 ms).
- CONFIRM: volt, Success haptic, the sheet sweeps down (`EASE` 220 ms); the stint bar under the
  tower updates.

### 6.4 Replay, debrief, what-if

- Judged as one call: JudgedCall `{ kind: 'replan'; lap; stops }`; alternatives `{ kind:
  'replan-none' }` (keep the previous plan) and `{ kind: 'replan-shift'; lap; delta }` (all its stops
  moved by `delta ∈ lapOffsets`, clamped).
- What-if: `playerStops` attributes a stop that came from a re-plan to `{ kind: 'replan'; index;
  stop }` and `whatIfInputs` edits that stop inside the call.

## 7. Double-stacked pit stops

### 7.1 Player-facing

- Both team cars share one box. If the team-mate is in the box when you arrive, you queue: the pit
  panel says "BOX BUSY — HAN in the box · +2.1s queue" and the projection includes it.
- When you box, the **team (AI)** decides whether to stack your team-mate behind you or keep him out
  a lap. A stack is confirmed on the radio: "Double stack — you first, HAN queues behind."
- A stacked stop raises the risk of an unsafe release (§8).

### 7.2 Engine model (in `executeStop`)

The box is modelled on the shared race clock (`raceTime` is every car's cumulative time, so
instants are comparable):

```
laneIn     = laneLoss × entryShare                       // laneLoss = effectivePitLaneLoss(...)
queue      = max(0, boxFree[team] − (arrival + laneIn))  // arrival = car.raceTime before the stop
stationary = cost.total − laneLoss
boxFree[team] = arrival + laneIn + queue + stationary + releaseGap
total added   = cost.total + queue (+ any served penalty, §8)
```

`queue > 0` logs `double_stack` (driverId = the queued car, timeLoss = queue). `state.boxFree` is
written only with `doubleStack.enabled`. Within one tick `race.ts` processes stops in running order
(leader first), so the leading team car claims the box.

**AI deferral** (pure, before an AI stop): `q̂ = max(0, boxFree[team] − (car.raceTime + laneIn))`;
if `q̂ > limit[brain]` (`maxQueueNeutralised` under SC/VSC) and the stop is not a weather stop and
`cliffFrac < emergencyCliffFrac`, the car stays out this boundary. The player's own stops (button or
plan) are never deferred — the player decided; the panel line is the warning.

| Key (`doubleStack.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `entryShare` | `0.5` | — |
| `releaseGap` (s) | `0.8` | — |
| `maxQueue` | `{ naive: 99, smart: 3.0, optimal: 2.0 }` | — |
| `maxQueueNeutralised` | `{ naive: 99, smart: 6.0, optimal: 5.0 }` | — |
| `emergencyCliffFrac` | `1.3` | — |

**Ruling S1: the box is a free-at instant per team on RaceState, not a pit-lane simulation — why:
the engine has no sub-sector space; an instant on the shared clock is exact enough and survives the
player's between-steps stops — cost if wrong: two arrivals within one sector are ordered by
raceTime, which is the honest order anyway.**
**Ruling S2: the team decides for the team-mate; the player decides for himself — why: the
team-mate's strategy is the AI's ("run both cars" is rejected) — cost if wrong: none.**

### 7.3 UI, risks

- Pit panel caution line when `boxFree[team]` is in the future; the projection rejoin includes the
  queue. Radio lines for "stack" and "hold him out". PitTimer shows "QUEUE +2.1" in caution before
  the stationary count.
- Stacking is rare outside neutralisations. **Fallback:** `maxQueueNeutralised.smart` 6 → 4.
  New band: `doubleStacksPerRace`.

## 8. Penalties: track limits and unsafe release

### 8.1 Player-facing

- **Track limits:** pushing, hot tyres, a damp track and a less consistent driver run wide more
  often. Three warnings ("TRACK LIMITS · WARNING 2/3"), then every further offence is a **5-second
  time penalty**.
- **Unsafe release:** rarely, a stop releases the car into another — 5 seconds. More likely in a
  double stack, less likely with a good pit crew.
- **Served vs added:** a pending penalty is **served at the next stop** (5 s stationary) or, if the
  car never stops again, **added at the flag**. The tower shows "+5" on the row and the player's
  readout says "P4 ▸ P6 after +5s" — staying out and building a 5-second gap is a real strategy.

### 8.2 Engine model (`src/engine/penalties.ts`)

- **Track limits** (in `lapModel`, green track only, not on a spin sector):
  `p = chancePerLap/3 × paceModeFactor[paceMode] × (1 + hotFactor × [thermal excess > 0]) ×
  (1 − consistency/100 × consistencyRelief) × wetFactor[weather]`; offence iff
  `normalCdf(noise2) < p`. Sets `SectorResult.trackLimits = true`. `race.ts` then `warnings += 1`
  and logs `track_limits`; if `warnings > warningsAllowed`, `pendingSec += timePenaltySec` and logs
  `penalty_issued` (timeLoss 5).
- **Unsafe release** (in `executeStop`, never in the projection): `p = chance × (1 − pitCrew/100 ×
  pitCrewRelief) × (queue > 0 ? stackedFactor : 1)`; unsafe iff `normalCdf(g2) < p` (lower tail;
  the slow stop owns the upper tail, so they are exclusive). Logs `unsafe_release` and
  `penalty_issued`; the new 5 s become pending **after** any older penalty is served at this stop.
- **Serving:** `executeStop` adds `pendingSec` to the stop, moves it to `servedSec`, logs
  `penalty_served`. The red-flag free change serves nothing.
- **At the flag:** on the race-completing tick every running car's `pendingSec` is added to
  `raceTime` (log `penalty_added`) before the final sort, beside the two-compound rule.
- `effectiveOrder(state)` (pure): running cars by `raceTime + pendingSec`.

| Key (`penalties.*`) | Start | Off |
|---|---|---|
| `enabled` | `true` | `false` |
| `timePenaltySec` | `5` | — |
| `trackLimits` | `{ chancePerLap: 0.012, warningsAllowed: 3, paceModeFactor: { push: 1.8, neutral: 1, conserve: 0.5 }, hotFactor: 0.5, consistencyRelief: 0.5, wetFactor: { DRY: 1, DAMP: 1.5, WET: 1.2 } }` | — |
| `unsafeRelease` | `{ chance: 0.015, pitCrewRelief: 0.5, stackedFactor: 2.5 }` | — |
| `aiCoverMargin` (s) | `1.0` | — |

**AI:** a smart/optimal car with `pendingSec > 0` and no planned stop left pushes while the gap
behind is under `pendingSec + aiCoverMargin` and its cliff fraction is under 0.7.

**Ruling N1: only 5-second time penalties in 2.0 — no drive-through, stop-go or grid penalties —
why: one type keeps "served vs added" legible — cost if wrong: less variety.**
**Ruling N2: track limits ride on `noise2`'s lower tail — why: zero new draws (A1), and `noise2` is
independent of the sector's pace noise — cost if wrong: none measurable.**
**Ruling N3: no penalties under any neutralisation — why: limits are not policed under yellow —
cost if wrong: none.**

### 8.3 UI, risks

- Steward toast: caution "TRACK LIMITS · WARNING 2/3" (Light haptic); hot "5s TIME PENALTY"
  (Heavy haptic, the player's row flashes hot once). Tower "+5" chip (hot, ink text, tabular),
  aria "five second penalty pending". Player readout "P4 ▸ P6 after +5s" with ▼, never colour alone.
- Pit panel: "Serves +5s penalty at this stop"; PitTimer counts the 5 s in hot first. Lap chart
  "+5" marker; result screen "+5s added". Commentary/radio lines per new incident kind.
- Penalties shuffle results → |Δpos|. **Fallback:** `trackLimits.chancePerLap` 0.012 → 0.006.
  New bands: `penaltiesPerRace`, `unsafeReleasesPerRace`. Diagnostic: warnings per race.

## 9. Live safety-car likelihood

### 9.1 Player-facing

- A compact **SC meter** in the HUD top bar: three caution-tinted segments LOW / MED / HIGH and,
  on tap, a card: "SC or VSC in the next 5 laps: 24%" with the reasons that apply ("Street circuit",
  "Damp track", "3 cars past the cliff", "SC used 2/2 — VSC only").
- The pit panel and the planner show the same number beside the projection — the safety-car gamble
  becomes a priced decision.
- While a neutralisation is out the meter reads "OUT".

### 9.2 Engine model

The indicator is honest because it is computed from **the engine's own hazard**, through the same
helpers the race uses. Two real model changes make circuit and weather matter:

- `incidents.wetErrorMultiplier` (`{ DRY: 1, DAMP: 1.4, WET: 1.8 }`) and `circuit.incidentRisk`
  (authored, calendar mean exactly 1.00) scale `driverErrorChancePerSector`:
  `× wetErrorMultiplier[weather] × (1 + circuitRiskWeight × (incidentRisk − 1))`. Off: all 1 and
  weight 0 (`v2Off()`), the factors are skipped and no draw changes.
- `neutralisationOutlook(config, state, horizon = scOutlook.horizonLaps)` in
  `src/engine/outlook.ts`, pure, no rng:

```
if a neutralisation is out → { kind: 'out' }
for each running car c, for k = 1..H (H = min(horizon, laps left)):
  crash_c   = driverErrorChancePerSector(c, weather, circuit) × 3 × terminalFraction
  mech_c    = mechanicalFailure.baseChancePerLap × (1 − reliability_c / 100)
  tyre_c(k) = min(maxChancePerLap, chancePerLapOverThreshold × max(0, f_c + k·g_c − cliffFractionThreshold))
pN_crash = rf + (1 − rf)·(sc' + (1 − sc')·vsc')        // ' = 0 when that kind's cap is used up
pN_mech  = sc'_m + (1 − sc'_m)·vsc'_m                    // rf = 0 when ineligible (cap, minLapsLeft)
λ = Σ_k Σ_c (crash_c·pN_crash + (mech_c + tyre_c(k))·pN_mech)
chance = 1 − exp(−λ)
band = chance < bands[0] ? 'low' : chance < bands[1] ? 'medium' : 'high'
reasons: circuit risk ≥ 1.15, non-dry weather, cars with f + H·g > threshold, caps used
```

(`f_c` = the car's cliff fraction now, `g_c` = its per-lap growth — the same `effectiveTyreAge`
the gauge reads.)

| Key | Start | Off |
|---|---|---|
| `incidents.wetErrorMultiplier` | `{ DRY: 1, DAMP: 1.4, WET: 1.8 }` | all `1` |
| `incidents.circuitRiskWeight` | `1.0` | `0` |
| `scOutlook.horizonLaps` | `5` | — |
| `scOutlook.bands` | `[0.15, 0.30]` | — |
| `ai.scGambleChance` / `ai.scGambleMaxDelay` / `ai.scGambleMaxCliffFrac` | `0.35` / `3` / `0.85` | maxDelay `0` |

`circuit.incidentRisk` (sum 12.00): harbour_lights 1.45, kaido 1.25, monsoon_bay 1.15, bengaluru
1.10, highland 1.05, aurora 1.00, silverpark 0.95, costa_verde 0.95, altiplano 0.90, grand_savane
0.80, veloce 0.75, sol_desert 0.65.

**AI:** an optimal brain whose planned stop is due, with `chance ≥ scGambleChance` and cliff fraction
under `scGambleMaxCliffFrac`, delays the stop a lap, at most `scGambleMaxDelay` laps past the plan
(`car.lap − nextStop.lap < maxDelay`). Pure.

**Ruling O1: "incident history" enters only through what the model really remembers — the per-race
caps (SC/VSC/red used), the field's worn tyres and the weather — no fabricated "hot streak" factor —
why: an indicator that disagrees with the model teaches a false lesson — cost if wrong: the meter
can drop right after a crash (the cap is used), which is true.**
**Ruling O2: circuit risk and rain become real model inputs, not just display — why: otherwise the
meter would be flat across the calendar and in the rain; making them real keeps it honest — cost if
wrong: the crash band moves; the calendar mean of 1.00 keeps the field-wide rate, the wet factor
raises it, and the switch-on re-measures. Fallback: `wetErrorMultiplier` → `{ 1, 1.2, 1.4 }`.**
**Ruling O3: a calibration gate, not just bands — why: the number is a promise to the player —
cost if wrong: none.** Test: bucket every lap-end prediction (n=240 races); in each bucket with ≥200
samples the observed frequency of a neutralisation within the horizon is within ±0.06 of the mean
prediction.

### 9.3 UI

- `ScOutlook` meter: 3 segments 14 × 8 px in caution at 35/65/100% opacity, label "SC" + band word;
  HIGH pulses opacity 1→0.5 every 1.2 s (static under reduced motion); 44 px tap target opens the
  reasons card (`snapIn`). `aria-label` "Safety car chance next 5 laps 24 percent, medium".
- Updates once per lap end (the number does not flicker per sector).

## 10. Feature interactions

| A × B | What happens | Where it is tested |
|---|---|---|
| Fuel × tyre temp × pace mode | Heat targets add: PUSH +8, RICH +2, SAVE −5, CONSERVE −6. SAVE + CONSERVE on a cold track grains softs and mediums; PUSH + RICH at Sol Desert overheats softs. Wear multipliers multiply (pace mode × fuel mode) and `heatWear` adds | thermal + fuel unit tests; v2 bands |
| Fuel × neutralisation | SC/VSC/red laps burn 45% → a margin windfall; the outlook helps time fuel use | fuel tests |
| ERS × DRS | DRS bonus × train neutralisation; ATTACK's pace and pass edge are NOT neutralised → ATTACK is the way out of a train. DEFEND counters an attacker's DRS | drs + ers tests |
| ERS × neutralisation | no deployment, +0.5 charge/lap | ers tests |
| Team orders × DRS train | a swap inside a train executes at the sector end without a pass roll | teamOrders tests |
| Team orders × neutralisation | swaps wait for green (T4) | teamOrders tests |
| Track rubber × tyre temp | grip < 0.85 is a graining precondition; rain resets rubber → graining after rain | thermal tests |
| Tyre temp × SC restart | target −25 under SC → cold restart, DRS off 2 laps → a restart is a cold scramble | thermal + drs |
| Tyre temp × projection/planner | out-lap priced through `fitTyres` | projection test |
| Double-stack × penalties | queued stop × 2.5 unsafe-release chance | penalties tests |
| Penalties × planner/projection | pending seconds served at the next stop are in the stop cost; `effectiveOrder` for the net estimate | planner + projection tests |
| Penalties × red flag | no service at the free change; pending carries | penalties tests |
| SC outlook × AI × planner | optimal delays a due stop up to 3 laps when ≥ 35%; planner shows the number | outlook tests |
| Red flag restart × all | tyres at 85 °C, ERS recharged to `startCharge`, fuel unchanged, pending penalties kept, DRS off 2 laps, team orders kept | redFlag tests |
| Sprint × fuel | load margins are fractions of distance | fuel tests |
| Qualifying × all | 2.0 resources do not exist in qualifying (`qualifying.ts` untouched) | — |
| Scenarios × all | fast-forward runs the shipped tuning → handovers move → re-author per slice | scenarios test |

**Ruling I1: red-flag restart recharges the battery and re-blankets tyres, never refuels — why:
cars sit in the garage under red; refuelling is banned — cost if wrong: none.**

## 11. Saves, replay, debrief, what-if

- **Saves:** season `PlayerStrategySchema` gains `fuelLoad: z.enum(['light','target','safe']).optional()`
  appended last (written only when not `target`). Settings: `puAssist` key appended to `K` and the
  `loadSettings` destructure (default `true`). `NEW_COACH_MARKS` gains `tyre_temp`, `power_unit`,
  `team_orders` (appended; `parseCoachSeen` already keeps only known ids). Career and cloud
  unchanged. No version bumps. The 1.4 fixtures still load and serialise byte for byte.
- **Replay determinism:** the four new call kinds are applied by `applyCall`; `replayFidelity`
  gains a test that a race with every new call kind replays byte-identically. Assisted PU calls are
  logged, so an assisted race replays exactly.
- **Debrief:** new JudgedCall kinds `fuel`, `ers`, `order`, `replan` and Alternatives `fuel`,
  `ers`, `fuel-none`, `ers-none`, `order-none`, `replan-none`, `replan-shift`; `DebriefCard` text
  for each (exhaustive switch). `debrief.maxResourceVerdicts` 4. The debrief budget (20 s) is
  re-checked on a worst-case race in the 2.0c measurement task.
- **What-if:** `PlayerStop.source` gains `{ kind: 'replan'; index; stop }`.
- **Lap chart:** `CarHistory` gains `penaltyLaps: number[]` and `swapLaps: number[]`.

## 12. Monte-Carlo bands

### 12.1 Existing bands — must all hold after each switch-on

`topTeamWinRate` [0.33, 0.55], `minDistinctWinners` 4, `meanAbsPosChange` [2.5, 4.0],
`gridFinishSpearman` [0.60, 0.80], `minPaceRankCorrelation` 0.90, `mechanicalDnfPerCarRace`
[0.06, 0.10], `crashesPerCarRace` [0.05, 0.09], `safetyCarsPerRace` [0.40, 0.90], `vscPerRace`
[0.40, 0.95], `aiNeutralisationStopsPerRace` [2.20, 5.55], `aiWeatherStopsPerRace` [44.30, 86.75],
`slowStopsPerRace` [0.45, 0.95], `redFlagPerRace` [0.00, 0.10]; plus `setupBalance`,
`circuitDifferentiation`, `qualifyingBands`.

The tight ones: |Δpos| (measured 3.6–3.7, ceiling 4.0) and ρ (0.62–0.69, floor 0.60). 2.0 adds
churn (DRS, ERS attack, AI swaps, penalties) and some anti-churn (DRS trains, cold out-laps, ERS
defend). Each slice's switch-on measures before it commits.

### 12.2 New bands (sized by the rule over four n=240 cells)

| Band | Counts | Slice |
|---|---|---|
| `grainingPerRace` | `graining` incidents | 2.0a |
| `drsTrainLapEndsPerRace` | lap ends with ≥ 1 train | 2.0a |
| `scOutlookCalibration` | max bucket error ≤ 0.06 (fixed gate, not sized) | 2.0a |
| `doubleStacksPerRace` | `double_stack` incidents | 2.0b |
| `penaltiesPerRace` | `penalty_issued` incidents | 2.0b |
| `unsafeReleasesPerRace` | `unsafe_release` incidents (n=240 gate, "live" assertion carries the floor) | 2.0b |
| `aiTeamSwapsPerRace` | `team_order_swap` incidents | 2.0c |

Diagnostics (MEASURE lines, never gated): passes with DRS open, track-limit warnings, fuel-critical
events, mean final AI fuel margin, OPTIMAL-vs-NAIVE gain under shipped tuning.

Invariant tests (exact, not banded): AI mean final fuel margin ≥ −0.4 laps; with every 2.0 switch
off the race equals the golden race; a race of every new call kind replays byte-identically.

### 12.3 Fallback ladder (Ruling A5)

| Feature | One pre-authorised step |
|---|---|
| DRS | `drs.overtakeBonus` 0.6 → 0.3 |
| ERS | `ers.attackOvertakeAdv` 0.15 → 0.08 |
| Tyre temp | `coldCoeff`, `overheatCoeff` 0.20 → 0.12 |
| Wet / circuit risk | `wetErrorMultiplier` → `{ 1, 1.2, 1.4 }` |
| Penalties | `trackLimits.chancePerLap` 0.012 → 0.006 |
| Double-stack | `maxQueueNeutralised.smart` 6 → 4 |
| AI swaps | `aiSwapStuckLaps` 3 → 5 |

Apply the step of the feature most plausibly responsible (switch features on one at a time within a
slice and measure after each); if still out, ship that feature off and record it in MODEL_SPEC §17.

## 13. Order of work and ship slicing

Three slices on `feat/2.0`. Each slice ends with its features on, every band green, scenarios
re-authored, MODEL_SPEC updated and a phone feel-test.

**2.0a — Track & tyres** (engine-first; adds information, no new levers):
foundations (types, tuning blocks off, `v2Off`, validators) → one stop path (`fitTyres`/
`executeStop`, projection fix) → track rubber + grip UI → tyre temperature engine (heat, out-lap,
overheat, graining) + UI → DRS + trains + UI → SC outlook (risk/wet inputs, outlook, optimal
gamble) + UI → switch-on, bands, scenarios, MODEL_SPEC §17.1.

**2.0b — Power & pit lane** (new resources):
fuel engine → ERS engine → fuel load at setup → PU sheet, gauges, battle chips, assist setting →
double-stack engine + UI → penalties engine + UI → switch-on, bands, scenarios, §17.2.

**2.0c — The strategist's tools:**
team orders engine → team orders UI + yield request → planner engine (`applyReplan`,
`planPreview`) → planner UI + worker → debrief/what-if/lap chart for every new call → switch-on,
full sweep, scenarios, §17.3 → version 2.0 / versionCode 10, checklist.

Dependencies: everything depends on the foundation and the stop path. Thermal reads fuel heat only
if fuel exists (works without). Penalties' track limits read thermal excess (works without).
Double-stack and unsafe release live in `executeStop`. The planner preview reads the outlook and
penalties. The debrief task needs every call kind.

**Ruling A6: one public version bump, 2.0 / versionCode 10, at the end; slices a and b are
merge-and-feel-test milestones built as local release APKs — why: Play burns every versionCode, and
a half-shipped 2.0 (fuel without the planner) is a worse first impression than one 2.0 — cost if
wrong: no outside testers between slices; if Veet wants 2.0a public, move the version task to the
end of 2.0a and name it 2.0 there.**

## 14. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| |Δpos| breaks the 4.0 ceiling / ρ the 0.60 floor | high | feature-at-a-time switch-on, fallback ladder, ship-off rule |
| Lever overload on a phone | medium | PU assist default, battle chips, PU sheet off the main HUD, coach marks |
| `applyStop` refactor perturbs the golden race | medium | byteIdentity runs in the refactor task before anything else lands |
| Debrief exceeds 20 s with many resource calls | medium | `maxResourceVerdicts` 4; measured on a worst case |
| Planner preview slow on mid-range phones | medium | worker, 4 futures, debounce, cancel on edit |
| Scenarios move at every switch-on | certain | re-authoring procedure each slice |
| Thermal makes the undercut weak, flattening strategy | medium | MEASURE the OPTIMAL gain; fallback on the coefficients |
| Hidden compliance reads as random | low | factor hints and radio wording |
| Wet error multiplier pushes crashes over 9pp | low–medium | fallback step; crash band gated |

## 15. Not in 2.0 (considered and left out)

A debris-VSC memory mechanic (would make "history" matter but needs a new draw), drive-throughs and
grid penalties, refuelling, per-corner tyre temperatures, AI orders that move the player's car
without asking, new scenarios built on 2.0 mechanics (a follow-up once the bands settle), badges for
2.0 mechanics (they need new persisted facts; follow-up).

## 16. Rulings index

| Id | Ruling (short) |
|---|---|
| A1 | No new rng draw in the race path |
| A2 | Four optional state objects, not one bag |
| A3 | `v2Off()` pins every switch in `makeDeterministicTuning` |
| A4 | Every stop through `executeStop`/`fitTyres`, incl. the projection (fixes a phantom two-compound penalty) |
| A5 | One pre-authorised fallback per feature, else ship it off |
| A6 | One public bump at the end: 2.0 / versionCode 10 |
| F1 | No fuel DNF; forced lift-and-coast |
| F2 | Fuel margin in laps |
| F3 | Fuel load pre-race, fuel mode in race, no refuelling |
| E1 | Four ERS modes |
| E2 | An empty battery never changes the player's mode |
| E3 | Power unit ASSISTED by default via logged calls |
| E4 | At most 4 resource calls judged in the debrief |
| T1 | Team-order compliance by hash, not rng |
| T2 | Compliance shown as factors, not a percentage |
| T3 | Championship standing passed in the config |
| T4 | No swaps under a neutralisation |
| D1 | DRS per sector, not zone geometry |
| D2 | Trains cancel the pass bonus explicitly, the time gain implicitly |
| D3 | No DRS on a non-dry track |
| R1 | Rubber derived from the weather timeline, not stored |
| R2 | A wet lap lays then washes rubber |
| H1 | One tyre temperature per car |
| H2 | Out-lap cost = the cold side of the window |
| H3 | Thermal pace only on the matching tyre family |
| H4 | Graining needs a green track |
| H5 | No °C on the HUD |
| P1 | The planner pauses the clock |
| P2 | A re-plan is one call |
| P3 | Four preview futures |
| P4 | The planner never edits the team-mate |
| S1 | The box is a free-at instant per team |
| S2 | The team decides for the team-mate only |
| N1 | Only 5 s time penalties |
| N2 | Track limits on `noise2`'s lower tail |
| N3 | No penalties under a neutralisation |
| O1 | No fabricated incident memory |
| O2 | Circuit risk and rain are real model inputs |
| O3 | The outlook has a calibration gate |
| I1 | Red-flag restart recharges and re-blankets, never refuels |

Each is stated in full, with why and cost if wrong, at its section.
