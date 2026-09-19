# In-Game Badges — Design

**Date:** 2026-09-19
**Status:** approved in brainstorming; awaiting spec review
**Supersedes:** roadmap "Not V2, but adjacent and cheap" item on badges

---

## 1. What this is, and what it is not

A trophy case: fifteen badges recording what the player has actually done
across a career, shown on the career screen and announced by a toast on the
race-result screen at the moment one is earned.

**It is not Google Play Games Services.** That was considered and rejected on
2026-09-19. PGS would add a Play Services dependency and a sign-in to an app
that today declares no INTERNET permission and makes no network requests at
all (enforced by `tests/data/androidManifest.test.ts` and
`tests/ui/noRemoteAssets.test.ts`). It would also degrade exactly on the
offline / no-Play-Services handset the whole project is built for, and its
achievements are effectively permanent once published — a poor fit for a
career whose long-run feel is still unvalidated. Leaderboards were rejected
separately: the simulation runs entirely on-device, so any posted score is
client-reported and therefore unverifiable.

**Badges are purely cosmetic.** They grant no development points, unlock no
content, and change no balance. This is deliberate: a reward attached to a
badge creates a second economy interacting with tier costs and rival
escalation, and gives the player a reason to play against the strategy design
in order to farm it.

---

## 2. Data model

### 2.1 The race log

One append-only log on `CareerRecord`:

```ts
export interface RaceFact {
  season: number      // careerRecord.seasonNumber at the time
  round: number       // seasonStore.raceIndex, 0-based
  grid: number        // 1-based; from qualifyingResult.order
  finish: number      // 1-based finishing position
  retired: boolean
  pole: boolean
  stops: number       // RaceEventSummary.pitsDone
  overtakes: number   // RaceEventSummary.overtakesGained
  wet: boolean        // RaceEventSummary.hadRain
}
```

`season` and `round` are not read by any predicate in §3. They are kept
deliberately: they are free at the call site, and they are what makes a future
badge like "win the season finale" computable over history already played,
which is the entire argument for a log in §2.2. If they were omitted, that
argument would only half hold.

Every field is **already computed today** at the `useCareerStore.getState()
.recordRace(...)` call site in `seasonStore.recordRaceResult` (around
`src/state/seasonStore.ts:382`) and currently discarded. Nothing new is
simulated, and the engine is untouched.

### 2.2 Why a log rather than counters

The alternative was a set of incremental counters (`wetWins`,
`bestGridGain`, `oneStopWins`, `longestFinishStreak`, …). The log wins on
three grounds:

1. **Correctness.** "Longest run of consecutive finishes" is the kind of
   quantity that is subtly wrong as an incrementally-maintained counter
   (what happens across a season boundary? across a load?) and obviously
   right as a fold over a list.
2. **Retroactivity.** A badge added later is computed over every race already
   logged. With counters, a new badge starts every existing player at zero.
3. **One source of truth.** Badges persist nothing of their own, so the
   trophy case cannot disagree with the stats screen beside it, and no badge
   can be awarded twice.

**Cost:** a 12-race season adds 12 entries. Ten seasons is ~120 small
objects — a few KB in SharedPreferences. This is not a growth risk at any
plausible career length, and no cap is imposed; imposing one would silently
break retroactivity for the badges that fold over history.

### 2.3 Persistence — backward compatible, no version bump

`CareerSnapshotSchema` in `src/state/careerPersistence.ts` pins
`v: z.literal(CAREER_SAVE_VERSION)` and treats any other version as
unreadable, discarding the save. **A version bump would therefore destroy
every existing career.**

The log is added as an optional field with a default:

```ts
raceLog: z.array(RaceFactSchema).default([]),
```

`CAREER_SAVE_VERSION` stays at `1`. An existing save with no `raceLog` key
parses successfully, defaults to `[]`, and keeps its career. That player
retains every milestone badge (those derive from fields that already exist)
and begins earning event badges from their next race.

This is stated explicitly because it is the design's main risk: **if the
version is bumped, careers are wiped.** A test asserts a v1 save lacking
`raceLog` still loads.

---

## 3. The badges

Fifteen. Each is a pure predicate; none is stored.

### 3.1 Milestones — derived from existing `CareerRecord` fields

Retroactive: an existing career earns these the moment the screen exists.

| id | Name | Condition |
|---|---|---|
| `in_the_points` | In The Points | `bestFinish !== null && bestFinish <= 10` |
| `rostrum` | Rostrum | `podiums >= 1` |
| `winner` | Winner | `wins >= 1` |
| `pole_position` | Pole Position | `poles >= 1` |
| `champion` | Champion | `titles >= 1` |
| `dynasty` | Dynasty | `titles >= 3` |
| `double_figures` | Double Figures | `wins >= 10` |
| `veteran` | Veteran | `racesStarted >= 50` |
| `centurion` | Centurion | `racesStarted >= 100` |

### 3.2 Event badges — folds over `raceLog`

Count from the first race logged.

| id | Name | Condition |
|---|---|---|
| `storm_chaser` | Storm Chaser | some fact with `wet && finish === 1 && !retired` |
| `comeback` | Comeback | some fact with `grid >= 10 && finish === 1 && !retired` |
| `lights_to_flag` | Lights To Flag | some fact with `pole && finish === 1 && !retired` |
| `one_stop_wonder` | One-Stop Wonder | some fact with `stops === 1 && finish === 1 && !retired` |
| `ironman` | Ironman | longest run of consecutive `!retired` facts `>= 12` |
| `damage_limitation` | Damage Limitation | some fact with `grid >= 15 && finish <= 10 && !retired` |

### 3.3 Why `damage_limitation` and not an overtake-count badge

An "8+ overtakes in one race" badge was designed and cut. Every other badge
rewards something the game is *about* — strategy, weather, track position.
Rewarding raw overtake count rewards PUSH-everything racing, which is
directly contrary to the first design pillar in CLAUDE.md §1 (track position
should be valuable; overtaking is a probabilistic cost, not a goal).
`damage_limitation` rewards the same recovery skill — starting badly and
salvaging it — without creating an incentive to play against the model.

### 3.4 Rules that apply to every badge

- **A DNF is never a win, podium or points finish.** Every event predicate
  tests `!retired` explicitly, matching `careerStore.recordRace`, which
  already excludes retirements from `wins`/`podiums`/`bestFinish`.
- **Thresholds are `>=`,** so a badge can never be skipped past.
- Badges are **monotonic**: once the underlying history satisfies a
  predicate, it satisfies it forever. Nothing un-earns.

---

## 4. Module layout

```
src/engine/            UNTOUCHED. Badges are not simulation.
src/state/badges.ts    NEW. RaceFact, BadgeDef, BADGES, earnedBadges(),
                       newlyEarned(). Pure; imports only types.
src/state/careerStore.ts     MODIFIED. raceLog on CareerRecord;
                             recordRace() takes the extra fields.
src/state/careerPersistence.ts MODIFIED. RaceFactSchema; raceLog with
                               .default([]). VERSION UNCHANGED.
src/state/seasonStore.ts     MODIFIED. Forwards grid/stops/overtakes/wet,
                             which it already has in scope.
src/ui/BadgeCase.tsx   NEW. The trophy case grid.
src/ui/BadgeToast.tsx  NEW. The earned-now announcement.
src/ui/CareerRecord.tsx MODIFIED. Renders <BadgeCase/>.
src/ui/RaceResult.tsx   MODIFIED. Renders <BadgeToast/>.
```

`src/state/badges.ts` sits in `state/`, not `engine/`, because it is not part
of the simulation and must not be reachable from it. It imports no store and
no React, so it is directly unit-testable.

### 4.1 Public interface

```ts
export interface BadgeDef {
  id: string
  name: string
  /** Shown on the locked badge. The player must be able to read the goal. */
  condition: string
  earned: (r: CareerRecord) => boolean
}

export const BADGES: readonly BadgeDef[]

/** Ids of every badge the record satisfies. */
export function earnedBadges(r: CareerRecord): string[]

/** Ids earned by `after` but not by `before`. */
export function newlyEarned(before: CareerRecord, after: CareerRecord): string[]
```

`newlyEarned` is a set difference over two pure evaluations, which is what
makes "announce it once" fall out of the design rather than needing an
`announced` flag to keep in sync.

**Where `before` comes from.** The race-result screen renders *after*
`recordRace` has already run, so it cannot recover the prior record by itself.
Rather than plumb a snapshot through the UI, `careerStore.recordRace` computes
the difference at the one moment both records exist and writes the result to a
transient field:

```ts
/** Ids earned by the race just recorded. Overwritten by the next recordRace,
 *  and NOT part of the save -- it is a UI signal, not career history. */
justEarned: string[]
```

It is excluded from `careerSnapshotFrom`, so it cannot persist and cannot
re-toast after a reload. `newlyEarned` stays exported and pure so the
difference logic is unit-testable without a store.

---

## 5. Presentation

### 5.1 Trophy case (`BadgeCase.tsx`, inside `CareerRecord.tsx`)

- A grid of all fifteen, earned and unearned, in the order listed in §3.
- **Earned:** full `--accent` teal, badge name in `--font-display`.
- **Unearned:** dimmed outline at `--text-dim`, **with its `condition` text
  visible.** A locked badge whose requirement is hidden is a mystery box, not
  a goal.
- A count — "7 / 15" — in `--font-mono` with `tabular-nums`.
- Colour is never the only signal: earned badges also carry a filled state
  and their unearned counterparts are visibly outlined (CLAUDE.md §6.3).

### 5.2 Toast (`BadgeToast.tsx`, on the race-result screen)

- Fires for ids returned by `newlyEarned`, computed from the career record
  snapshotted immediately before `recordRace` and the record immediately
  after.
- Slide-in with `motion/react`, one at a time, ~2.5s each when several land
  together.
- Haptic on appearance via `useHaptics().impact` directly, NOT via
  `useUiTap`: that helper also plays the `navTap` sound, which is the
  acknowledgement of a press. A badge arriving is not a press, and firing the
  tap sound for it would misuse the audio language. Respects
  `settingsStore.hapticsEnabled` through the same hook.
- **Reduced motion:** when `settingsStore.reducedMotion` is true, the toast
  appears and disappears by opacity only, no translation. It is never
  suppressed entirely — it carries information, not decoration.

### 5.3 Colours

All colour via existing tokens. **No new `rgba` literals** — the repo already
carries ~20 as debt, and `color-mix()` is banned (Chromium 91 at minSdk 30;
see `tests/ui/colorMixBan.test.ts`). Alpha uses
`rgba(var(--token-rgb), <a>)`; tinting an opaque surface uses
`linear-gradient(<rgba>, <rgba>), <solid>`.

---

## 6. Testing

### 6.1 Predicates (`tests/state/badges.test.ts`)

- One case per badge: a minimal record that earns it, and a near-miss that
  does not (`grid: 9` for `comeback`, an 11-race streak for `ironman`).
- **A DNF earns nothing.** A fact with `finish: 1, retired: true` must not
  earn `winner`, `storm_chaser`, `comeback`, `lights_to_flag` or
  `one_stop_wonder`.
- **`ironman` counts consecutive facts,** not total: 11 finishes, a
  retirement, then 11 more finishes must NOT earn it.
- **Monotonicity:** every badge earned by a record is still earned by that
  record with another race appended.
- **The definitions are coherent:** ids are unique, every badge has a
  non-empty `name` and `condition`, and `BADGES.length === 15`. Without this
  a typo'd duplicate id silently shadows a badge in the UI.

### 6.2 Persistence (`tests/state/careerPersistence.test.ts`)

- **A v1 save with no `raceLog` still loads and keeps its career.** This is
  the regression that matters most: the failure mode is silent career loss.
- `CAREER_SAVE_VERSION` is still `1` — asserted literally, so a future bump
  has to be a deliberate act that fails this test first.
- A log round-trips: save → load → identical facts.

### 6.3 Toast (`tests/ui/badgeToast.test.tsx`)

- A badge already earned before the race does NOT toast.
- A badge earned by the race DOES toast, exactly once.
- With `reducedMotion` true, the toast still renders its text.

### 6.4 Wiring (`tests/state/seasonStore.test.ts`, extended)

- After a race, `raceLog` has exactly one new entry, and its `grid` matches
  the player's slot in `qualifyingResult.order`. Without this the log could
  be plausibly populated but wrong, and every event badge would be wrong with
  it.

---

## 7. Out of scope

- Google Play Games Services, leaderboards, cloud sync (§1).
- Any gameplay reward for a badge (§1).
- Badge notifications outside the race-result screen.
- Retroactive event badges for races played before this ships. Milestone
  badges are retroactive; event badges cannot be, because the facts were
  never recorded. This is stated rather than worked around: fabricating a log
  from aggregate counters would invent history that did not happen.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| A version bump wipes careers | §2.3; asserted by test §6.2 |
| Badge drifts from stats screen | Badges persist nothing; both derive from one record |
| Toast fires repeatedly | `newlyEarned` is a set difference, not a flag |
| Log grows unbounded | ~12 entries/season; a few KB at any real career length |
| A badge encourages play against the design | `damage_limitation` replaced the overtake badge (§3.3) |
