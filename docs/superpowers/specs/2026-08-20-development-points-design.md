# Development Points — Design

**Date:** 2026-08-20
**Status:** Approved in brainstorming; pending spec review before implementation planning.

## Goal

Make a season an arc rather than eight identical races. The player earns Development Points (DP) each round and spends them on tiered upgrade packages that improve their car and driver. Rival teams develop in parallel at their own rates, so the grid stays a moving target.

The intended fantasy, in the user's words: *"start with a poor car and do better later in the races."* Every design decision below serves that, and several reject alternatives that would have undermined it.

## Non-goals (explicitly out of scope)

- **Cross-season career progression.** Upgrades reset on NEW SEASON. Carrying them over would require the save/load work (deferred item 35 in `GAME_COMPLETION_PLAN.md`) as a hard prerequisite.
- **Performance-based DP income.** Rejected deliberately — see Economy.
- **A skill tree with prerequisites or branches.** Too much content and balance surface before we know the core loop feels good.
- **Rebalancing `pitCrew` / `consistency` tuning** so they become worth upgrading. See Attribute Selection.
- **Starting grid order.** Still fixed and identical every race (item 47). Unchanged by this work, and deliberately sequenced after it.

---

## 1. Architecture

**The engine does not change.** This is the load-bearing constraint.

`buildConfig` in `src/state/raceStore.ts` already assembles `teams` and `drivers` from `loadGameData()` into a `RaceConfig`. Upgrades become an **overlay applied at that boundary**: `seasonStore` owns the upgrade state, and `buildConfig` deep-copies the facet objects and adds the accumulated deltas before constructing the config.

The engine receives a team with `power: 78` and neither knows nor cares that 8 of those points were purchased. `engine/` stays pure, headless, and deterministic — the golden rule in `CLAUDE.md` §3 holds without exception.

Two alternatives were considered and rejected:

- **Pass upgrades into `RaceConfig` and let the engine apply them at read time.** Teaches `engine/` about a progression concept it has no business knowing, and adds a branch to the hottest path in the sim (`computeSectorTime`).
- **Mutate the objects returned by `loadGameData()`.** Breaks purity, and `loadGameData()` results are shared, so it would corrupt state across races.

**Critical implementation note:** the overlay MUST deep-copy facets. `loadGameData()` returns shared objects; mutating them in place would leak upgrades into every subsequent race and break determinism.

## 2. Economy

| Parameter | Value |
|---|---|
| Season length | **12 races** (up from 8) |
| DP income | **10 per race, flat** — regardless of finishing position or DNF |
| Season total | **120 DP** |
| Tier costs | Mk1 **10** · Mk2 **18** · Mk3 **30** |
| Cost to max one attribute | **58 DP** |
| Attributes maxable per season | **~2** |

**Income is flat by explicit decision.** Position-based income was rejected because it compounds an existing advantage: strong teams finish higher, earn more, and pull further ahead — the rich get richer, and the underdog run becomes impossible. Performance pressure belongs in the championship standings, not doubled into the development economy.

**Consequence accepted:** a DNF currently pays the same as a win, which softens the stakes of the tyre-failure mechanic. Noted as a future refinement (pay a reduced rate on DNF) rather than solved now.

**Tier costs were raised** from an initial 8/14/22. At 12 races that budget bought 2.7 maxed attributes, which overshot the ceiling below.

## 3. Attribute selection

Only attributes that **measurably change race outcomes** are offered. Measured against current tuning, for +15 facet points:

| Attribute | Value of +15 points | Offered? |
|---|---|---|
| `power` / `aero` / `handling` | ~0.27 s/lap, every lap (~5 s/race) | ✅ |
| `pace` | ~0.45 s/lap across all sectors | ✅ |
| `reliability` | DNF risk (newly wired, §5) | ✅ |
| `tyreManagement` | Defers the tyre cliff — strategic value | ✅ |
| `racecraft` | Overtake probability | ✅ |
| `wetWeather` | Wet-crossover relief (situational) | ✅ |
| **`pitCrew`** | **0.090 s per stop — ~0.09 s/race** | ❌ |
| **`consistency`** | **noise sigma −8.3% (sigma is 0.058 s)** | ❌ |
| `experience` | Nothing — zero engine references | ❌ |

`pitCrew` and `consistency` are excluded because offering them would be a **trap**: they cost the same as `power` and deliver roughly 2% of the benefit. A player who bought them would be strictly worse off with no way to know it.

Making them viable would mean raising `pit.pitCrewMeanRelief` and `noise.consistencyReliefFactor` — a rebalance of the validated sim, which is a separate decision and out of scope here. `experience` is excluded because it is inert in the engine entirely.

**8 attributes × 3 tiers = 24 tiers**, of which ~2 attributes' worth are affordable. Specialisation is forced by income, not by arbitrary caps.

## 4. Package sizing — normalised, displayed as consequence

`aero` sits in S2 (weight 0.45) versus `power` in S1 (0.30) and `handling` in S3 (0.25), so a point of aero is worth ~1.5× a point of power. **Uniform package sizes would make aero mathematically dominant.**

Package sizes are therefore tuned per attribute so each tier delivers roughly **equal value (~0.085 s/lap)**:

| Attribute | Points per tier | Measured value per tier |
|---|---|---|
| `power` | +5 | 0.089 s/lap |
| `aero` | +3 | 0.080 s/lap |
| `handling` | +6 | 0.089 s/lap |
| `pace` | +3 | 0.090 s/lap |
| `reliability` | +5 | see §5 |
| `tyreManagement` | +5 | strategic (cliff deferral) |
| `racecraft` | +5 | strategic (pass probability) |
| `wetWeather` | +6 | situational (wet races only) |

Raw facet numbers ("+3 aero") read as arbitrary, so **the UI shows the consequence, not the stat**: `AERO PACKAGE Mk1 · −0.09s/lap`. This is both better UX and a better fit for the telemetry aesthetic in `CLAUDE.md` §6.1. Attributes whose value is not lap time show their own unit (`−40% failure risk`, `+2 laps before the cliff`).

All sizes and costs live in a new `src/data/upgrades.json`, validated by zod on load. **No balance numbers in logic** (`CLAUDE.md` §5).

### Ceiling check

Maxing two pace attributes (`power` +15 and `aero` +9) = **0.508 s/lap**. The entire grid spread — Zenith `power` 66 to Meridian 96, 30 facet points — is **0.535 s/lap**.

So a fully-specialised season buys **95% of the gap between the worst and best car on the grid**. A maxed Zenith reaches roughly Apex's *starting* pace — and Apex has been developing meanwhile. That is a genuine fight, not a coronation, and it is the intended ceiling.

## 5. Reliability, finally wired

`reliability` exists in `cars.json`, is described in every team archetype ("slow but bulletproof", "a nightmare to keep running"), and has **zero engine references**. Upgrading it would do nothing without this.

**Mechanic:** a per-lap mechanical-failure roll scaled by `reliability`, reusing the `CarState.retired` / `retiredLap` plumbing already built for tyre failure. A retired car freezes and classifies after every finisher, exactly as it does today — no new retirement semantics.

New tuning block — **one** constant:

```
tuning.mechanicalFailure = {
  baseChancePerLap: 0.008   // failure chance per lap at reliability 0
}
```

Per-lap chance is `baseChancePerLap * (1 - reliability / 100)`, rolled per sector
as `chance / 3` to match the existing `tyreFailure` pattern in `race.ts`.

**Revised from a two-constant form during planning.** The original design proposed
`base * (1 - (reliability/100) * reliabilityRelief)`. Solving that for the target
bands below requires `reliabilityRelief = 1.019`, which is unusable — it yields a
negative failure chance as reliability approaches 100. Pinning relief to 1.0 makes
it redundant, so it is dropped. The surviving linear form is also the same shape
as `facetToRating9` used elsewhere in `lapModel.ts`.

`baseChancePerLap: 0.008` was solved from the Halcyon band, then verified across
the grid (56-lap race):

| Team | `reliability` | DNF rate |
|---|---|---|
| Halcyon F1 | 72 | **11.8%** |
| Terra | 80 | 8.7% |
| Delta | 89 | 4.9% |
| Zenith Racing | 94 | **2.7%** |
| Apex | 96 | 1.8% |

**Target bands** (the specification; the constant serves these):

| Team | `reliability` | Target DNF rate |
|---|---|---|
| Halcyon F1 | 72 | ~10–15% of races |
| Zenith Racing | 94 | ~2–4% of races |

Rates scale with race length by design — Halcyon runs 7.5% over Veloce's 34 laps
and 12.8% over Harbour Lights' 60. Tests must therefore pin a lap count.

**Balance risk:** this adds a second source of retirements on top of tyre failure. The existing Monte-Carlo bands in `tests/engine/monteCarlo.test.ts` measured ~0.005 retirements/race under AI management; that figure will rise and the bands need re-validating, not just re-running. If total retirements make the field feel thin, `baseChancePerLap` is the single dial.

## 6. Rival development

Each race, every AI team gains a facet pool scaled by its existing `developmentRate` (currently unread by any code — `cars.json` has values 1.0–1.4), **distributed evenly** across `power` / `aero` / `handling` — one third each, rather than weighted toward a team's existing strength. Even distribution is chosen so rival development stays legible and does not silently amplify the aero-is-worth-more asymmetry noted in §4.

This makes the data honest: Terra Motorsport (1.4, *"the fastest-developing team on the grid"*) and Zenith (1.2) climb quickly; Apex (1.0) barely moves. **The field compresses over 12 rounds**, which is precisely the underdog arc — the strong cars are the ones with the least headroom.

Rival development is applied through the same `buildConfig` overlay, from state owned by `seasonStore`. It is deterministic: no RNG, so a given season produces identical rival development every time.

## 7. Flow and UI

New `'development'` phase in `seasonStore.SeasonPhase`:

```
result → [NEXT RACE] → development → race_setup → racing → result
```

**Skippable** — unspent DP banks and carries to the next round, so the screen is a decision point rather than a toll booth. This directly answers the complaint that a season is *"just keep hitting play button"*: every round now poses a real question.

One screen (`src/ui/Development.tsx`):

- DP balance, prominent, in mono/tabular figures
- One row per attribute: current value, tier pips (Mk1/Mk2/Mk3 owned/available/locked), cost, and the consequence line
- Affordability state on each tier; locked tiers show their prerequisite tier
- Confirm + skip

Follows existing screen conventions (`RaceSetup.tsx` is the closest model: header, scrollable body, fixed bottom action). Uses design tokens, `useUiTap` for haptics, and honours the same accessibility gaps as the rest of the UI — no worse, and `aria` labels included since this is new code.

## 8. Content: 4 new circuits

12 races needs 12 circuits; there are 8. The wrapping logic (`raceIndex % CIRCUIT_ORDER.length`) would silently replay rounds 1–4, which reads as filler and would put Monsoon Bay (75% rain) in the calendar twice.

**One is nearly free:** `src/data/paths/silverpark.json` already exists as an orphan track path with no circuit entry.

So: **1 circuit spec** (Silverpark) plus **3 new circuits** needing spec + track path. Each circuit spec requires `sectorBase`, `carSensitivity`, `driverSensitivity`, `overtakingFactor`, `pitLaneTimeLoss`, `rainProbability`, `weatherBias`, `atmosphere`, `flag`, `location`, `characterNote`, and `funFacts` — authored consistent with the existing calendar's character and spread of circuit types (one high-speed, one technical, one wet-biased, etc.).

`TOTAL_RACES` moves 8 → 12, and `MainMenu.tsx:45`'s `"8-race championship"` subtitle must follow.

## 9. Data model

```
// src/data/upgrades.json — all balance numbers, zod-validated
{
  income: { perRace: 10 },
  tierCosts: [10, 18, 30],
  attributes: [
    { id: 'power', target: 'team',   facet: 'power', pointsPerTier: 5, unit: 'laptime' },
    ...
  ]
}
```

```
// seasonStore — season-scoped, resets in startNewSeason() and playAgain()
devPoints: number                              // unspent balance
purchasedTiers: Record<AttributeId, 0|1|2|3>   // player's owned tiers
rivalDevelopment: Record<TeamId, FacetDeltas>  // accumulated AI gains
```

Kept as a flat, separately-serialisable shape so wiring it into persistence later (deferred item 35) is small.

## 10. Testing

**Engine** (`tests/engine/`)
- Mechanical failure: DNF-rate bands for high and low `reliability` teams; a fully reliable car never fails; a retired car freezes correctly.
- Monte-Carlo re-validation: the existing field-balance and strategy-value guardrails must still hold with mechanical failure live.

**State** (`tests/state/`)
- Overlay arithmetic: purchased tiers produce the exact expected facets; **facets are deep-copied, not mutated** (a regression test for the sharing hazard in §1).
- Economy: income accrual, tier cost/affordability, escalating cost, tier prerequisites.
- Reset: `startNewSeason()` and `playAgain()` clear DP, tiers, and rival development.
- Rival development: per-team rates apply, deterministic across runs.
- Teammate: car upgrades reach both team cars; driver upgrades reach only the player.

**UI** (`tests/ui/`)
- Development screen: spend path, skip path, unaffordable tiers are not purchasable.

**Data**
- `upgrades.json` passes its zod validator; all 12 circuits validate.

## 11. Balance risks

1. **Two retirement sources.** Mechanical failure stacks on tyre failure; total DNF rate must be re-validated, not assumed. Single dial: `baseChancePerLap`.
2. **The 95% ceiling is deliberate but untested in play.** If a maxed underdog feels dominant, lower `pointsPerTier` before touching costs — it keeps the economy's shape intact.
3. **Rival development interacts with difficulty.** The `difficultyProfiles` levers already shift AI strategy quality; adding pace development on top may push Pro difficulty past the guardrail margins.
4. **12 races is 50% more sim time per season.** No performance concern (races are stepped, not batched), but it lengthens playtesting cycles.

## Deferred / open

- DNF paying reduced DP — decided against for now, revisit if failure stakes feel soft.
- Making `pitCrew` / `consistency` worth upgrading — needs a tuning rebalance, separate decision.
- Cross-season carryover — blocked on deferred item 35.
- Constructor standings (item 48) would pair naturally with team-wide car upgrades, but is not required by this work.
