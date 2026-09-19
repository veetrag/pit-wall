# Multi-Season Career — Design Spec

**Date:** 2026-09-19
**Status:** Implemented. See `docs/superpowers/plans/2026-09-19-career.md`.
**Roadmap:** `docs/superpowers/specs/2026-09-19-v2-roadmap.md` (item A)

## 1. The problem

There is no career. At the end of 12 races the season reaches `championship`,
and the only exit is `playAgain()` (`src/state/seasonStore.ts`), which sets:

```ts
playerDriverId: null, selectedTeamId: null, raceIndex: 0, standings: [],
devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}
```

Everything the player built across twelve races is discarded. The upgrades,
the team, the championship — the app returns to the state it had on first
install. `grep -rni "career\|seasonNumber\|seasonIndex" src/ tests/` returns
nothing: the concept does not exist.

The season wrapper itself is complete and correct. What is missing is a layer
**above** it that owns what survives a season boundary.

## 2. Decisions taken

All four were Veet's, made during brainstorming on 2026-09-19:

| # | Decision |
|---|---|
| 1 | **Stats carry over.** Purchased upgrades persist across seasons. |
| 2 | **The player keeps their seat.** No contracts, no team changes, no driver market. |
| 3 | **Advantage erodes between seasons.** Some purchased tiers are lost each off-season. |
| 4 | **Rivals escalate, rubber-banded.** They improve each season, and faster when the player is winning. |
| 5 | **The career is endless,** with accumulating milestones rather than an ending. |
| 6 | **Career lands before the store listing.** No save-migration layer is built. |

### 2.1 Why erosion exists — the arithmetic that forced it

Decision 1 alone breaks the game, and the numbers are not close.

Maxing every upgrade costs **275 points** (`tierCosts` `[10, 18, 27]` = 55 per
attribute, across 5 attributes in `upgrades.json`). Income is **10 per race**
(`upgrades.income.perRace`), so **120 per season**.

So a player who carries everything forward maxes the car roughly **2.3 seasons**
in. From early season 3 the Development screen has nothing left to sell, points
accrue against nothing, and the most expensive progression system in the game
is finished for the rest of an endless career.

Erosion is what keeps decisions 1 and 5 compatible. It is not flavour.

### 2.2 Why erosion is also the right fiction

It is what actually happens in F1: regulations change, the field converges, and
last year's advantage is not this year's. It also makes defending a title feel
different from winning one — which is the main thing an endless career needs in
order not to flatten out.

## 3. Architecture

### 3.1 The career is a separate store and a separate save

New `src/state/careerStore.ts`, holding only what outlives a season:

```ts
export interface CareerRecord {
  seasonNumber: number        // 1-based. Season 1 is a career's first season.
  titles: number
  wins: number                // career total
  seasonWins: number          // this season only; reset at each rollover, so
                              // SeasonSummary records what a season was worth
                              // rather than the running career total
  podiums: number
  poles: number               // qualifying makes this meaningful
  racesStarted: number
  bestFinish: number | null   // lowest position number achieved
  seasonHistory: SeasonSummary[]   // one entry per completed season
}

export interface SeasonSummary {
  seasonNumber: number
  teamId: string
  driverId: string
  championshipPosition: number
  points: number
  wins: number
}
```

**Separate from the season snapshot, deliberately.** An abandoned or restarted
season must not cost the career. Two Preferences keys, two schemas, two
versions.

The career does NOT hold `purchasedTiers` or `rivalDevelopment` — those stay on
`seasonStore`, because they are read every race and the engine boundary already
knows where to find them. The career's job at a season boundary is to *transform*
them (section 3.3), not to own them.

### 3.2 The season gains a number, and season 1 must not change

`currentSeed()` is `raceIndex * 1000 + 42 + attemptNonce * 7919` — no season
term. A second season would replay the first one's twelve races exactly,
weather included.

```ts
currentSeed() {
  const { raceIndex, attemptNonce } = get()
  const season = useCareerStore.getState().seasonNumber
  return (season - 1) * 100000 + raceIndex * 1000 + 42 + attemptNonce * 7919
}
```

**`(season - 1)`, not `season`.** Season 1 must produce byte-identical seeds to
today, so existing saves, `tests/engine/byteIdentity.test.ts` and the three
scenarios are untouched. Same discipline as `RaceConfig.gridOrder`: the new
concept's absence — or its first value — reproduces current behaviour exactly.

**Why seasons cannot collide, stated properly.** `attemptNonce` is UNBOUNDED —
`retryRace()` increments it with no cap — so the tempting justification ("the
stride is bigger than anything the other terms can reach") is simply false:
thirteen retries alone exceed 100000. The real argument is modular.

A collision requires:

```
Δseason × 100000 = Δrace × 1000 + Δnonce × 7919
```

Both 100000 and 1000 are multiples of 1000, so `Δnonce × 7919 ≡ 0 (mod 1000)`.
Since `gcd(7919, 1000) = 1`, that forces `Δnonce ≡ 0 (mod 1000)`. For two
attempts whose nonces differ by less than 1000 this means `Δnonce = 0`, leaving
`Δseason × 100 = Δrace` — impossible, because `|Δrace| ≤ 11` for a 12-race
season and `Δseason ≥ 1`.

Verified empirically as well as algebraically: no cross-season collision exists
for seasons 1..30, all 12 rounds, and nonces 0..4999. The test in section 5
pins this over an explicit domain rather than asserting a magnitude that does
not hold.

### 3.3 The season rollover

A season boundary runs once, between `championship` and the next season's
`development` phase, and does four things:

1. **Record the season** into `CareerRecord` — increment `titles` if the player
   finished first, append a `SeasonSummary`.
2. **Erode the player's upgrades** (3.4).
3. **Escalate the rivals** (3.5).
4. **Increment `seasonNumber`.**

**The split between the two stores is forced, and worth stating.**
`careerStore.rollOverSeason(summary, tiers)` does 1, 2 and 4 — it TAKES the
current tiers and RETURNS the eroded ones. `seasonStore.startNextSeason()` does
3 and applies the returned tiers.

The reason is the import direction. `seasonStore` imports `careerStore` as a
value (for `currentSeed`), so `careerStore` must not import `seasonStore` back
— that closes a real ESM cycle. Passing tiers in and handing them back keeps
erosion a pure function of its arguments and keeps the cycle open. It is the
same constraint that already stops `raceStore` reading `seasonStore` directly
and routes the upgrade overlay through `RaceWatcher` instead; see the comment
at `src/state/buildRaceConfig.ts:25`.

`seasonStore` then resets its season-scoped state — `raceIndex`, `standings`,
`devPoints`, `attemptNonce`, `lastRaceResults` — while KEEPING
`playerDriverId`, `selectedTeamId` (decision 2) and the eroded
`purchasedTiers`.

### 3.4 Erosion

```json
"career": {
  "tierDecayPerSeason": 1,
  "rivalCatchUp": { "base": 0.5, "championBonus": 0.5 },
  "seedStride": 100000
}
```

Each attribute drops by at most `tierDecayPerSeason` tiers, floored at 0:

```ts
purchasedTiers[id] = Math.max(0, (purchasedTiers[id] ?? 0) - decay)
```

**The arithmetic, stated plainly because it is the balance of the whole
feature.** At `tierDecayPerSeason: 1`, a fully maxed player (5 attributes at
tier 3) loses 5 tiers, and rebuying all five third tiers costs `27 × 5 = 135`
against a season income of 120. So a maxed player cannot quite hold the
maximum — they end each season slightly behind where they started, and must
choose which attributes to keep at the top.

That is intentional: it is what stops decision 1 from trivialising an endless
career. It is also the single number most likely to be wrong, so it is a tuning
constant and the implementation plan calibrates it. **Veet signs it off on
device.**

### 3.5 Rival escalation

`rivalDevelopment` already accrues per race, weighted by each team's
`developmentRate` — and that rate is already inverse to team strength
(`terra` 1.4 and `zenith` 1.2 are the weakest; `apex` and `meridian` sit at
1.0), so the existing accrual is already a catch-up mechanic within a season.
Today it is discarded at the season boundary.

Carrying it forward is most of the work: `rollOverSeason` simply does not reset
`rivalDevelopment`, where `playAgain` does today.

On top of that, a single off-season boost. It reuses the SAME pool constant the
per-race accrual already uses, so the winter counts as a number of extra races
rather than introducing a second, separately-tuned economy:

```ts
// tuning.career.rivalCatchUp = { base, championBonus }
// upgrades.rivalDevelopment  = { poolPerRace, facets }  -- already exists
const { poolPerRace, facets } = loadGameData().upgrades.rivalDevelopment
const { base, championBonus } = tuning.career.rivalCatchUp

// The winter is worth `base` races of development to every rival, plus
// `championBonus` races more if the player took the title.
const winterRaces = base + (playerChampionshipPosition === 1 ? championBonus : 0)

for (const team of teams) {
  const rate = team.developmentRate ?? 1.0
  rivalDevelopment[team.id] =
    (rivalDevelopment[team.id] ?? 0) + poolPerRace * rate * facets.length * winterRaces
}
```

At the proposed `base: 0.5` and `championBonus: 0.5`, a mid-field season hands
rivals half a race of extra development and a title-winning season hands them a
full one — small next to a 12-race season, which is deliberate for a first pass.
Both are tuning constants and the plan calibrates them.

A player who wins the title faces a grid that closed harder over the winter.
A player who finished mid-field gets a gentler year.

**Deliberately NOT a continuous rubber band** keyed to margin of victory. A
smooth function that quietly scales with how well the player drives is the kind
of mechanic players detect and resent ("the game cheats when I do well"). A
single, legible "you won, so they pushed harder" step is honest and explicable.

### 3.6 Persistence

`SAVE_VERSION` goes to **2** (the season snapshot gains nothing structurally,
but `currentSeed` now depends on career state, so a v1 save resuming into a
career-less store would produce different races than it was saved under).

A new `CAREER_SAVE_VERSION = 1` with its own schema and Preferences key.

**No migration layer is built** (decision 6). A v1 save fails `safeParse` and
is discarded by the existing loader — which is the current behaviour for any
version mismatch. This is acceptable only because the app has not shipped.
**This spec is therefore a commitment to land career before the store
listing.** If that changes, a migration layer becomes a prerequisite and this
section must be rewritten first.

## 4. Flow and UI

`playAgain()` splits into two actions, because today's single reset is really
the destructive one wearing a friendly name:

```ts
startNextSeason(): void   // keeps the career; rolls over; -> 'development'
endCareer(): void         // today's playAgain, plus clearing the career save
```

The championship screen gains:

- **NEXT SEASON** — primary. Shows what the player is carrying and losing:
  *"Season 3 · You keep 10 of 15 upgrade tiers · Rivals developed over the
  winter"*. The erosion must be visible BEFORE it is felt, or it reads as the
  game quietly taking things away.
- **END CAREER** — secondary, confirmed. Destructive and irreversible.

A new **Career** view, reachable from the main menu, showing the
`CareerRecord`: seasons, titles, wins, poles, and the `seasonHistory` table.
This is the payoff for an endless career — decision 5 gives the player no
ending, so the record is what makes the accumulation legible.

## 5. Testing

Three load-bearing tests:

1. **Season 1 is unchanged.** `currentSeed()` at `seasonNumber: 1` returns
   exactly today's value for every `raceIndex`/`attemptNonce`. This protects
   byte-identity, the Monte-Carlo bands and the three scenarios.
2. **Seasons do not collide.** No `(season, raceIndex, nonce)` triple produces
   a seed reachable by a different season, over an EXPLICIT domain: seasons
   1..30, all 12 rounds, nonces 0..999. The nonce bound is named in the test
   because `attemptNonce` is unbounded in principle (section 3.2), so the
   guarantee is over a stated domain rather than universal.
3. **The career survives an abandoned season.** Clearing or restarting a season
   leaves `CareerRecord` intact — the reason the two saves are separate.

Supporting:

- Erosion floors at 0 and never produces a negative tier.
- A maxed player who wins, then rolls over, cannot re-max within one season
  (the arithmetic in 3.4 holding in code rather than in a comment).
- `endCareer` clears both saves; `startNextSeason` clears neither.
- Rival escalation is strictly greater after a title than after a mid-field
  season, with all else equal.
- `titles` increments only on a championship win, not on any podium.

Monte-Carlo band, added to `_regressionBands`: simulating 10 seasons with a
consistently strong player, the player's mean championship position must not
drift monotonically toward 1 — i.e. erosion plus escalation actually prevent a
runaway.

## 6. Risks

| Risk | Mitigation |
|---|---|
| `tierDecayPerSeason` is wrong and erosion feels punitive rather than tense | It is a single tuning constant; the plan calibrates it and Veet signs it off on device. The UI states the loss up front so it never feels arbitrary. |
| Rubber-banding reads as the game cheating | A single legible step at "you won the title", not a continuous function of margin. |
| A v1 save is discarded on update | Accepted, and only acceptable pre-launch. Section 3.6 is the commitment. |
| Endless career flattens out | Erosion plus escalation is the mechanical answer; the career record is the motivational one. Revisit only with play data. |

## 7. Explicitly out of scope

- **Contracts, team changes, a driver market.** Decision 2: the player keeps
  their seat. This is the single largest thing a career could add later, and
  cutting it is what keeps this sub-project small.
- **Tyre allocation.** Cut from V2 — it would feel restrictive.
- **Practice.** Cut from V2 — nothing to dial in without a car setup model.
- **Driver ageing, retirement, regeneration.** No.
