# Qualifying — Design Spec

**Date:** 2026-09-19
**Status:** Approved in brainstorming; awaiting review before implementation planning.

## 1. The problem

Grid position is not merely handed to the player — it is **identical in every race
of every season**.

`initRace` assigns `position: i + 1` from the order of `config.drivers`
(`src/engine/race.ts:62`). That order is the literal order of `src/data/drivers.json`,
which nothing sorts, shuffles, or varies by circuit. The consequences:

- `d_voss` starts on pole at all 12 rounds. `d_kane` starts P20 at all 12.
- Whichever driver the player picks in `DriverSelect` fixes their starting slot
  for the entire season.
- Car upgrades bought in Development change the player's *pace* but never their
  *starting position*, so the most expensive progression system in the game
  cannot buy the single most valuable commodity in a race: track position.
- Every weekend opens from the same place, so "recovery drive" is the only
  shape a race can have.

This is a live balance defect, not just a missing feature.

## 2. What we are building

A qualifying session the player takes part in: two pre-run decisions, then one
flying lap per car, resolved by the existing lap model. The resulting order
becomes the race grid.

**Design pillars this serves** (CLAUDE.md §1): qualifying must be an *emergent*
result of the same simulation that drives the race (pillar 1), and the decision
must be strategic rather than dextrous (pillar 2).

### Scope boundaries — deliberately excluded

- **No Q1/Q2/Q3 elimination.** Three segments would add 3-4 minutes to every
  race weekend for a game whose race is the main event.
- **No tyre-set consumption.** Tyre allocation is per-race today; making
  qualifying consume from it is the weekend-spanning tyre feature already
  deferred to V2.
- **No top-ten tyre rule.** The tyre a player qualifies on does NOT become their
  starting tyre. Qualifying outputs an ordering and nothing else.
- **No qualifying for scenarios.** A scenario is a seed plus a lap; it hands the
  player a race already in progress.

## 3. Architecture

### 3.1 The engine module

New file `src/engine/qualifying.ts`, a pure module under the golden rule
(CLAUDE.md §3): no React, no Zustand, no DOM, all randomness through the
injected RNG.

```ts
export type AttackLevel = 'conserve' | 'balanced' | 'attack'

export type QualifyingCall = {
  compound: Compound
  attack: AttackLevel
}

export type QualifyingLap = {
  driverId: string
  teamId: string
  time: number          // total lap time, seconds
  compound: Compound
  attack: AttackLevel
  scrappy: boolean      // an error was rolled on this lap
}

export type QualifyingResult = {
  laps: QualifyingLap[]   // sorted ascending by time
  order: string[]         // driverIds, P1 first
}

export function runQualifying(
  config: RaceConfig,
  rng: Rng,
  playerCall: QualifyingCall,
): QualifyingResult
```

`order` is derived from `laps` and stored alongside it so consumers never
re-sort and risk a different tie-break.

### 3.2 How one lap resolves

For each driver in `config.drivers`:

1. Build a synthetic `CarState`: the driver's real `driverId`/`teamId`, the
   chosen `compound`, `tyreAge: 0`, `paceMode: 'neutral'` always (see §3.3),
   `lapsInDirtyAir: 0`, `pitsDone: 0`, `retired: false`, `lap: 0`,
   `raceTime: 0`, `position: 0`.
2. Call `computeSectorTime(config, car, sector, rng, weatherState, null)` for
   sectors 0, 1 and 2 and sum the results.
3. Apply the attack lap-time delta.
4. Roll the error check. On a hit, add the scrappy penalty and set
   `scrappy: true`.

Then sort ascending. Ties break by `driverId` ascending, so the result is a
total order and therefore reproducible.

**Deliberate departures from race conditions**, each with a reason:

| Departure | Why |
|---|---|
| Fuel effect zeroed | A qualifying car runs light. `tuning.fuel.effectPerLap` is 0.035s/lap; applying a race-start fuel load would make qualifying slower than the race's final lap, which is backwards. |
| No traffic penalty (`lapsInDirtyAir: 0`) | A flying lap is run in clear air by definition. |
| No safety car (`null`) | There is no race running. |
| `tyreAge: 0` | A qualifying tyre is new. |

`weatherState` is `weatherTimeline[0]` — the same value `initRace` uses for the
grid — so a wet race is preceded by a wet qualifying, and the existing
`gridConditionsCompound` wet-tyre logic stays coherent with it.

### 3.3 The player's decision

**Compound.** S/M/H (plus I/W surfaced when `weatherState` is not `DRY`). The
one-lap pace difference comes from the existing `compounds.json` `offset` field
on a zero-age tyre: S is −0.8s, M is 0.0s, H is +0.6s. No new numbers, and
because there is no carry-over cost, this reads as "how much grip do you want"
rather than a trap. The soft tyre being the obvious choice in the dry is
acceptable: the *interesting* decision is the attack level.

**Attack level.** The real decision. New `tuning.json` block:

```json
"qualifying": {
  "attackLevels": {
    "conserve": { "paceDelta":  0.35, "errorChance": 0.02 },
    "balanced": { "paceDelta":  0.0,  "errorChance": 0.06 },
    "attack":   { "paceDelta": -0.45, "errorChance": 0.15 }
  },
  "scrappyLapPenalty": 1.2,
  "seedOffset": 777777
}
```

**The qualifying car's `paceMode` is always `'neutral'`, and attack is applied
ONLY through `paceDelta` above.** This is load-bearing, not incidental.
`computeSectorTime` already adds `tuning.paceModes[car.paceMode].paceDelta / 3`
per sector (`src/engine/lapModel.ts:66`), which is the full pace-mode delta per
lap. Mapping `attack` onto `paceMode: 'push'` *and* giving it its own
`paceDelta` would apply both: attack would be −0.60s/lap rather than −0.45,
and every future edit to `paceModes` would silently retune qualifying.

Reusing `paceMode` buys nothing here in any case: its other effect is
`degMultiplier`, which is meaningless on a single lap at `tyreAge: 0`. One
knob, one effect.

An error is **never a retirement**. Qualifying must not end a weekend before it
starts. It is a scrappy lap: `scrappyLapPenalty` seconds added, and the
`scrappy` flag set so the UI can say *why* the player is P14 rather than leaving
them to conclude the game cheated.

**Calibration note, to be resolved during implementation.** `noise.sigmaPerSector`
is 0.08, so one lap carries roughly 0.14s of Gaussian noise (0.08 × √3). The
grid-slot value of a tenth depends on how tightly the field's car and driver
deltas pack, which has not been measured. The `paceDelta` and
`scrappyLapPenalty` values above are a starting point, not a validated tuning:
a 1.2s penalty could be worth anywhere from four to eight grid slots depending
on field spread. A calibration task in the implementation plan measures the actual field spread and reports it; the
numbers are then Veet's call on device, per CLAUDE.md §8.

### 3.4 The AI field

Each rival's compound and attack level are chosen by its team's existing
`strategy.brain` tier, which `buildRaceConfig` already computes and already
varies by difficulty:

- `naive` — always `balanced`, medium tyre. Leaves pace on the table.
- `smart` — `balanced` on the softest dry compound.
- `optimal` — `attack` on the softest dry compound, accepting the error risk.

This reuses a system that exists and is already difficulty-aware rather than
inventing a second rival AI. On higher difficulties more teams hold an
`optimal` brain, so the grid gets harder to beat for the same reason the race
does.

### 3.5 Consuming the result

`RaceConfig` gains two optional fields (`src/engine/types.ts`):

```ts
gridOrder?: string[]      // driverIds, P1 first. Absent = drivers.json order.
qualifyingSeed?: number   // absent = seed + tuning.qualifying.seedOffset
```

`initRace` changes from `position: i + 1` to a lookup against `gridOrder` when
it is present, falling back to `i + 1` when it is not.

**Why optional rather than sorting the drivers array up front:** absence must
reproduce today's behaviour byte-for-byte. `tests/engine/byteIdentity.test.ts`,
the Monte-Carlo regression bands in `MODEL_SPEC.md` §10.1, and all three
scenarios in `src/data/scenarios.json` are pinned to the current grid.
`buildScenarioConfig` simply never sets `gridOrder`, and every one of those
stays valid without re-authoring.

Cars whose `driverId` is absent from `gridOrder`, and duplicate entries, are a
programming error rather than a game state. `initRace` throws on a `gridOrder`
that is not a permutation of `config.drivers`, so the failure is loud at the
boundary instead of producing a silently wrong grid.

### 3.6 Randomness and determinism

`qualifyingSeed` defaults to `seed + tuning.qualifying.seedOffset` (777777),
mirroring the established `weatherSeed ?? seed + 999999` pattern in `initRace`.
Qualifying therefore draws from its own RNG stream and consumes nothing from
the main race seed — the same seed still produces the same race given the same
grid.

**Consequence, accepted deliberately:** because the qualifying seed derives
from the race seed, backing out of a weekend and re-entering re-rolls the
*same* qualifying. A player cannot reroll a scrappy lap. This matches the
determinism discipline the rest of the game keeps, and it is only fair because
the error chance is shown before the player commits.

## 4. State and flow

### 4.1 The new phase

`SeasonPhase` (`src/state/seasonStore.ts:6`) gains `'qualifying'`:

```
development → race_setup → qualifying → racing → result → championship
```

`race_setup` currently ends by calling `startRace(strategy)`, which sets
`phase: 'racing'` directly (`seasonStore.ts:258`). That becomes
`phase: 'qualifying'`, storing the player's chosen strategy as it does today.
A new action `startRaceFromQualifying(gridOrder: string[])` performs the
transition `startRace` used to, carrying the grid into the race config.

The pre-race strategy chosen in `race_setup` is untouched and still applies to
the race.

### 4.2 Store ownership

Qualifying state is small and short-lived, so it lives in `seasonStore` rather
than a new store:

```ts
qualifyingResult: QualifyingResult | null   // cleared on entering race_setup
```

The `runQualifying` call happens in a store action, never in a component — the
same engine/UI boundary `raceStore` already keeps.

### 4.3 Persistence

`src/state/seasonPersistence.ts` gains `qualifying: null` to its phase map,
the same treatment `grid`, `settings` and `how_to_play` already receive.

Qualifying is a transient step, not a resumable save point: quitting mid-session
returns the player to `race_setup` on reload rather than restoring a half-run
session. This avoids persisting a `QualifyingResult` whose validity depends on
config that may have changed between launches.

## 5. UI

New component `src/ui/Qualifying.tsx`, rendered by `App.tsx` on
`phase === 'qualifying'`.

Three beats:

1. **The call.** Two chip rows — compound, then attack level — using the
   selected-state treatment the pace-mode toggle already establishes as the
   game's visual language (CLAUDE.md §6.2). Each attack level shows its
   consequence inline, in the same "+tyre wear, −0.15s/lap" idiom the pace
   toggle uses: `ATTACK · −0.45s · 15% error risk`. The risk is stated as a
   number before the player commits, because §3.6 makes the outcome
   irreversible.

2. **SIMULATE.** A secondary action that runs the session on `balanced` plus
   the medium compound, for a player who does not want to engage that round.
   Qualifying is never skipped — no grid is handed out unearned — but it can be
   resolved in one tap.

3. **The result.** The lap resolves and the order animates into a list that
   reuses `TimingTower`'s row treatment, so the grid reads as the same object
   the race will show. The player's row carries the teal accent. Scrappy laps
   are labelled in text, not signalled by colour alone (CLAUDE.md §6.3).

**Accessibility.** The result list is a `role="status"` region announcing the
player's final grid slot, following the pattern established by
`SafetyCarBanner`'s green-flag region — including its `data-testid`
disambiguation, since a second live region on screen at once is exactly the
collision that was fixed there. Reduced motion is honoured via
`useSettingsStore(s => s.reducedMotion)`, never a direct `window.matchMedia`
read — the defect fixed in `RaceResult`.

## 6. Testing

### 6.1 The three load-bearing tests

1. **Determinism** (`tests/engine/qualifyingDeterminism.test.ts`)
   Same config + same seed + same call ⇒ deeply equal `QualifyingResult`.
   The mirror of `byteIdentity.test.ts`.

2. **Non-regression** (`tests/engine/gridOrderOptional.test.ts`)
   A `RaceConfig` with no `gridOrder` produces a byte-identical race to the
   same config today. This is the assertion protecting the three scenarios and
   the Monte-Carlo bands. It must be written to fail if the `gridOrder`
   fallback is removed — verify by mutation.

3. **Upgrades reach the grid** (`tests/state/qualifyingUpgrades.test.ts`)
   A config carrying purchased tiers qualifies measurably better, across a
   sample of seeds, than one without. This is the test that proves the
   Development screen now buys track position — the point of the feature.

### 6.2 Supporting tests

- **Permutation guard:** `initRace` throws on a `gridOrder` that omits,
  duplicates, or invents a `driverId`.
- **Scenarios untouched:** `buildScenarioConfig` returns a config with
  `gridOrder` undefined.
- **Error is not retirement:** a scrappy lap sets `scrappy: true` and leaves
  the driver in the order.
- **Phase flow:** `race_setup` → `qualifying` → `racing`, and
  `qualifyingResult` is cleared on re-entering `race_setup`.
- **Persistence:** `qualifying` maps to `null`; a save written during
  qualifying restores to `race_setup`.
- **SIMULATE** produces a valid full-field result without any player input.

### 6.3 Monte-Carlo band

Added to `tuning.json` `_regressionBands`, in the style of the existing bands:
over 200 qualifying sessions, `attack` produces a scrappy lap in 13–17% of
runs, and a top-tier car on `balanced` averages a starting position in the top
five. This is the regression oracle for §3.3's numbers once the calibration
task has settled them.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The tuning numbers are unvalidated (§3.3) | A calibration task measures field spread and reports it; final values are Veet's call on device. The Monte-Carlo band is written against the calibrated numbers, not the placeholders. |
| `gridOrder` silently ignored by a future `initRace` edit | The non-regression test is mutation-verified, and the permutation guard throws rather than degrading. |
| Soft tyre is always correct in the dry | Accepted. The attack level is the decision; the compound is a smaller one. If it proves genuinely dead, the top-ten tyre rule (§2, excluded) is the designed lever to revisit. |
| A second `role="status"` region collides with an existing one | `data-testid` disambiguation, following the fix already made in `SafetyCarBanner`. |

## 8. Out of scope for this spec

Multi-season career, practice sessions, weekend-spanning tyre allocation, and
the monetisation decision remain V2 questions and are untouched here.
