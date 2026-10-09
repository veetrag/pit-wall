# Team ladder — design

**Status:** approved in conversation, 2026-10-09. Not yet planned.
**Builds on:** `2026-09-19-career-design.md` (seasons, erosion, rival catch-up).

## 1. What this is

The player stays with the team they chose. Over seasons that team, and every
other team on the grid, moves up or down a ladder of performance tiers,
**earned by results**. A team that keeps beating what its car deserved climbs;
one that keeps falling short slips. The same rule governs all ten teams,
including the player's.

The player-facing story is loyalty: take a midfield car and, by out-thinking
the grid season after season, turn it into a front-runner. The late-career
challenge is that holding a high tier is harder than reaching it.

Decisions made in conversation, in order:

| question | decision |
|---|---|
| What moves? | The player's **team improves**. The player never changes team. |
| What triggers a step? | **Earned by results**, not a timer. |
| What does a step change? | The car's **base facets**. |
| What stops a runaway? | **Both**: rivals climb too, and you can slip. |
| Approach | **A: one symmetric ladder** for all teams (B, reputation score, and C, player-only tier, rejected; see §9). |

## 2. Constraints this design is shaped by

**The facet ceiling is a correctness bound.** `facetToRating9()` computes
`(1 - facet/100) * 9`; above 100 a faster car becomes slower
(`src/state/upgradeOverlay.ts`, `FACET_MAX`). The grid already sits close to
it: Meridian power 98, Apex reliability 96, Kestrel power 96. A player upgrade
tier is +5 facet points (`pointsPerTier`), three deep.

**Any ladder that only adds points ratchets the grid into that ceiling.**
Over a long career every team converges on 100, the spread collapses, and
late seasons get *easier*. That is the opposite of the brief. The ladder must
therefore conserve performance rather than create it (§3).

**Rival development already saturates.** Found while designing this (§5):
rival pools never reset, and by season 4 every rival's power, aero and
handling are pinned at 100. The ladder cannot work on top of that, so this
design fixes it.

## 3. The rule: performance against deserved result

Evaluated **once per team, at season end**.

1. **Constructors' table.** Sum each team's two drivers' championship points.
   Ties break by the team's best-placed driver in the drivers' championship,
   then by team id (determinism).
2. **Deserved rank.** Rank teams by **effective car rating**: the mean of the
   team's effective facets, computed by the same overlay that built the
   season's races (base + tier offset + player upgrades or rival development,
   clamped). Ties break by base rating, then team id.
3. **Compare.** For each team, `delta = deservedRank - actualRank` (positive
   means it finished better than its car deserved).
   - `delta >= threshold` → offset **+1**
   - `delta <= -threshold` → offset **−1**
   - otherwise unchanged
4. **Clamp** offsets to `[min, max]`.

Properties this buys:

- **Self-correcting.** Climbing raises a team's rating, so its deserved rank
  rises and the next step is harder. Teams drift to the tier their true
  strength supports and then oscillate. A fixed rule such as "top 3 up,
  bottom 3 down" was considered and rejected: it rewards raw rank, so the same
  strong teams ratchet to the top, the weak to the bottom, both clamp, and the
  ladder freezes at maximum spread within about six seasons.
- **Conserved without imposing it.** Constructors' rank is zero-sum across
  ten teams, so beating expectation somewhere means missing it elsewhere.
  Clamping leaks a little at the bounds (a team at `max` that over-performs
  loses its step). That is accepted rather than redistributed.
- **Measures the player's actual contribution.** The car is priced in; what
  moves the team is beating it. Kept upgrade tiers are included in the
  rating, so money is not mistaken for skill.
- **No special case for the player.** All ten teams run the same function.

**Drivers are not part of the rating.** The ladder is about the team's car.
A team with unusually strong drivers will over-perform its car and climb
until its rating catches up, which is the self-correction working as
intended, not a bug.

### What an offset does

A team's effective facet, for each facet in `career.teamTiers.facets`, is:

```
base + offset × step      (then the existing overlay, then the existing clamp)
```

Only **power, aero and handling** move: the same performance facets rival
development spreads across. Reliability and pit crew are a team's character
and stay as authored.

### Tuning (`src/data/tuning.json`, `career.teamTiers`)

```json
"teamTiers": {
  "step": 3,
  "min": -3,
  "max": 3,
  "threshold": 2,
  "facets": ["power", "aero", "handling"]
}
```

±3 tiers at 3 points is ±9 on each of three facets, which moves a team's
five-facet mean by about ±5.4. Terra (≈82) tops out near 87 on the ladder
alone, just short of the 88 FRONT-RUNNER line; the player's upgrades close
that last gap. That is deliberate: the ladder and the Development screen
together make a front-runner, not either alone. It is also small enough that
the ceiling is rarely touched. All five values are designer-editable and
zod-validated, per CLAUDE.md §5.

## 4. Where it lives

| piece | home | why |
|---|---|---|
| `teamTiers: Record<teamId, offset>` | `careerStore` (`CareerRecord`) | the one thing that crosses seasons for every team |
| `constructorsTable(standings)` | new pure module in `state/` | a fold over driver standings; no store reads |
| `settleTeamTiers(table, ratings, tiers, tuning)` | same module | pure, deterministic, the whole rule in one function |
| applying offsets to facets | `buildRaceConfig` / `upgradeOverlay` | the only place progression becomes simulation input (§3 of CLAUDE.md) |

`teamTiers` reaches `buildRaceConfig` as an injected argument alongside the
existing upgrade overlay. It is not read from a store, which keeps that
function pure and avoids the documented `seasonStore` ↔ `buildRaceConfig`
ESM cycle. `seasonStore` calls the settle function at rollover and hands the
result to the career, the same way `rollOverSeason` hands back eroded tiers.
`careerStore` never imports `seasonStore`.

Non-career modes (quick race, scenarios) pass no tiers: every offset is 0 and
they play exactly as today.

## 5. Interaction with the existing season boundary

### The saturation bug, measured

Rival pools accrue every race (`accumulateRivalDevelopment`) and every winter
(`escalateRivals`), and `startNextSeason` carries them forward forever.
Simulated with the shipped `upgrades.json` and `tuning.json`:

| season | rivals' power/aero/handling (mean) | facets pinned at 100 |
|---|---|---|
| 1 | 87–97 | 2 / 30 |
| 2 | 92–100 | 14 / 30 |
| 3 | 98–100 | 24 / 30 |
| 4+ | 100 for every team | 30 / 30 |

This is in the live game (1.2, and 1.3). Nobody has reached season 4 on a
device yet. It also defeats the ladder: offsets on those three facets would
be clamped to nothing from season 4.

### The fix: one timescale per system

| system | timescale | at the season boundary |
|---|---|---|
| rival development | within a season | **resets** to the winter head start |
| player upgrades | within a season, partly kept | erode as today (−1, floor 2) |
| team ladder | across seasons | settled by §3 |

The winter head start is exactly what `escalateRivals` computes today from
zero: `rivalCatchUp.base` races (0.5), plus `championBonus` (0.5) when the
player won the title. "Win the title and the grid has a bigger winter"
survives; the endless ratchet does not.

This changes the live game's difficulty curve from season 3 onward. That was
surfaced as a balance decision and approved.

### Order of operations at rollover

1. Season ends: `recordSeasonEnd` banks the title and history (unchanged).
2. **Settle the ladder**, measuring the ratings the season was actually raced
   with: end-of-season rival pools, end-of-season player tiers.
3. Erode the player's upgrades.
4. Reset rival development to the winter head start.

Settling must come first. Settling after the reset would measure next
season's cars against this season's results.

## 6. Saves

**No version bump, no migration code.** The career schema's own rule
(`careerPersistence.ts`, the `raceLog` comment): additive fields get
`.default()`, because a version bump makes every existing save load as
`null` and silently deletes the career.

```ts
teamTiers: z.record(z.string(), z.number()).default({})
```

A missing key reads as offset 0, which is the truth for every existing
career, since no ladder has ever moved. Cloud save reuses
`CareerSnapshotSchema`, so the field travels with no further change.

**Existing inflated rival pools need no migration.** A mid-season save keeps
its pools until the season ends. That is correct: those are the cars the
season is being raced with, and settlement should measure them. The first
rollover under the new code resets the pools.

**Known risk, accepted:** a player with 1.3 on one device and a ladder build
on another. Zod strips unknown keys, so if the 1.3 device wins a cloud
reconcile it uploads a career without `teamTiers`, and the ladder resets to
baseline. With one install and Play's update path, this is documented, not
engineered around.

## 7. UI

**Championship screen: the reveal.** The one orchestrated moment
(CLAUDE.md §6.2). Below the drivers' result:

```
CONSTRUCTORS'              TERRA
Deserved      P7     ─────────────
Finished      P4     ▲ STEP UP
                     Tier +1  →  +2
```

- Deserved and finished positions roll up in mono digits, then the verdict
  resolves: **STEP UP** (accent), **HELD** (dim), **STEP DOWN** (accent-warm).
  Each carries an arrow as well as a colour (§6.3).
- Haptic on any step; a sound on a step up only.
- One line of **grid movers** beneath: e.g. `Apex ▼ · Halcyon ▲ · Zenith ▲`.
- A **constructors' table** as a tab beside the drivers' table. It does not
  exist today.
- Reduced motion: values appear without rolling; the verdict fades in.

**Labels tell the truth.** `teamTier()` in `src/ui/TeamSelect.tsx` derives
FRONT-RUNNER / MIDFIELD from static `cars.json` ratings. During a career it
reads the effective rating instead, and the Development screen shows the
offset as a small chip beside the team name (`+2`, `−1`).

## 8. Testing commitments

- `settleTeamTiers`: each threshold edge, both clamps, ties, determinism.
- **All ten teams obey the same rule.** The player's team gets no special
  case. Asserted directly, not inferred.
- **Deserved rank uses the ratings the races were built from.** Build race
  configs and settle from the same inputs, and assert they agree. This pins
  the coupling that would otherwise drift silently.
- **Conservation:** over a simulated ten-season career, the sum of offsets
  stays within a small band of zero and the grid's rating spread neither
  collapses nor freezes.
- **Rollover order:** settle, then erode, then reset.
- **Saturation regression:** by season 8, rivals' power/aero/handling are
  *not* all 100.
- **Old saves:** a career snapshot with no `teamTiers` loads with every
  offset at 0, both locally and through `parseCloud`.
- Non-career modes build identical configs to today's.

## 9. Rejected

- **Reputation score (B).** Smooth, but illegible: the player cannot see why
  the team moved, and the feature exists to tell that story.
- **Player-only tier, rivals via `escalateRivals` (C).** Rivals would rise in
  a different currency from the player, and it cannot express the player
  slipping, which was asked for.
- **Fixed top-3-up / bottom-3-down.** Freezes at maximum spread (§3).

## 10. Out of scope

- A live "on course to step up" indicator during the season. It would turn
  every race into chasing a number and needs mid-season deserved rank. A v2
  candidate.
- Ladder history charts, rival news, driver transfers.
- A wider grid with true backmarkers. The weakest team (Terra, ≈82) already
  reads MIDFIELD, so "backmarker to champion" starts from midfield. Widening
  the grid is a data change with its own effect on race pacing and is
  deliberately separate.
