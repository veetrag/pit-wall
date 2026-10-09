# Post-race debrief — design

**Status:** approved in conversation, 2026-10-09. Not yet planned.
**Prerequisite:** the pre-race plan must execute automatically (§2). That is a
separate fix that ships first.

## 1. What this is

After every season race, the result screen judges the calls the player made —
each pit stop, each pace-mode change, and the pre-race plan — by replaying the
race with that one call done differently and measuring the finishing position.
It is a strategy coach: "pitting on lap 22 for Mediums would have averaged P4,
against your P6".

Decisions made in conversation:

| question | decision |
|---|---|
| Purpose | **Judge the player's calls** (not find calls never made, not a race story) |
| Alternatives | **Timing and compound** |
| Luck | **Shared past, sampled future** (§4) |
| Placement | **A section on the result screen**, computed after every race |
| Build | **Pure engine module, run in a Web Worker** |
| The plan | **Executes automatically** — prerequisite fix (§2) |

Rejected and not to be re-proposed: running both cars, a practice session, a
driver market.

## 2. Prerequisite: the plan must run

Found while designing this. The player's pre-race plan (starting tyre plus
planned stops) is never carried out. `plannedStops` is only displayed
(`src/ui/TelemetryZone.tsx`), and the engine skips the player's car when it
decides pit stops (`src/engine/race.ts`, `if (!updated.isPlayer)`). A player
who does not tap PIT runs one set of tyres to the cliff and retires — in dry
races too. The race setup screen promises the opposite: *"PLAN: M → H on lap
25. You can override this live during the race."*

The fix, shipped separately and before the debrief:

- The engine executes the player's next planned stop at its lap, unless a
  manual stop has already consumed it (the existing `plannedStops[pitsDone]`
  indexing already handles that).
- The executed stop uses the same stop-time model as AI stops, including the
  team's pit-crew facet. Today the manual `pitNow` ignores pit crew and uses a
  different noise model; the fix aligns manual stops to the same model, so a
  player's crew counts however the stop is called.

Because the plan then executes inside the engine, replays include it without
any logged call.

## 3. Recording calls, and replaying them

**A call** is one of:

- **The plan** — in `RaceConfig.playerStrategyOverride`, already.
- **An in-race call**, logged by `raceStore`:

```ts
type PlayerCall =
  | { step: number; kind: 'pit';  compound: Compound }
  | { step: number; kind: 'pace'; mode: PaceMode }
```

`step` is the number of `stepSector` calls completed before the call. Calls
land between steps, so this pins each one exactly.

**One implementation per call.** The state changes now inside
`raceStore.pitNow` and `raceStore.setPaceMode` move into the engine as pure
functions:

- `applyPlayerPit(config, state, compound, rng): RaceState`
- `applyPlayerPace(state, mode): RaceState`

The live race and the debrief both use them, so a replay cannot drift from
what happened. UI-only state (`pitPanelOpen`, `playerInPit`, alerts) stays in
the store.

**The replay primitive:**

```ts
replay(config, seed, calls, untilStep?): RaceState
```

Replays are cheap — measured **3.5 ms per full 56-lap race** on the
development laptop; a mid-range phone is estimated at ~15 ms — so no snapshots
are stored. To branch at a call, replay up to it.

**Randomness outside `stepSector`:** only the stop-time draw in `pitNow`.
`applyPlayerPit` takes the rng so that draw stays in sequence.

## 4. Judging a call

**Branch.** For a call at step *s*, the branch point is the earliest step any
of its alternatives needs (e.g. 3 laps before *s*). Replay the real race to
the branch on its own seed: the shared past.

**Sampled futures.** From the branch, the race's rng is replaced by **K
continuation streams**, seeded from `(raceSeed, branchStep, k)`. The actual
call and every alternative run through the **same K futures** — common random
numbers across options. An alternative with an extra pit stop takes one extra
draw and so shifts its future slightly; averaging over K absorbs that.

**Everything else is kept.** The player's other calls replay at their original
steps. A later call that becomes illegal in a branch (e.g. no sets of that
compound left) is skipped in that branch.

**Alternatives:**

- **A pit stop** (manual, or a planned stop): the same compound moved by each
  lap offset in `[-3..+3]` excluding 0; and every other legal compound at the
  original lap. Legal means available in the tyre allocation and not breaking
  the mandatory two-compound rule.
- **A pace change:** made at each lap offset in `[-3..+3]` excluding 0, or not
  made at all.
- **The plan's starting compound:** each other legal compound.

**Metric.** Finishing position, a retirement counting as P21, averaged over K.

**Verdict.** An alternative is reported only if it is **at least `minGain`
places better on average AND better in at least `minShare` of the futures**.
Otherwise the call is **good**. Only the single best qualifying alternative is
reported per call.

**Budget.** ~3 calls × ~50 alternatives × K=8 ≈ 400 partial races: about 1 s
on the laptop, an estimated 4–5 s on a phone, off the main thread.

**Tuning** — `src/data/tuning.json`, new `debrief` block, zod-validated:

```json
"debrief": {
  "futures": 8,
  "lapOffsets": [-3, -2, -1, 1, 2, 3],
  "minGain": 1.0,
  "minShare": 0.67,
  "timeoutMs": 20000
}
```

**Deterministic.** The same race yields the same debrief, always. No
`Math.random()`, no `Date.now()` in the engine.

## 5. Where it runs

| file | role |
|---|---|
| `src/engine/debrief.ts` | pure: `replay`, branching, alternatives, verdicts |
| `src/engine/playerCalls.ts` | pure: `applyPlayerPit`, `applyPlayerPace`, `PlayerCall` |
| `src/workers/debrief.worker.ts` | thin shell: receives `{config, seed, calls}`, posts progress and result |
| `src/state/debriefStore.ts` | `status: 'running' \| 'done' \| 'failed'`, progress, result, tagged with race seed and attempt |
| `src/state/debriefRunner.ts` | the `DebriefRunner` interface + an in-process runner for tests |
| `src/state/debriefWorkerRunner.ts` | the only file that constructs the Worker; **not re-exported** anywhere |

The store depends on the `DebriefRunner` interface. The Worker implementation
lives in one file nothing re-exports — the same rule `src/sync/index.ts` keeps
for the Play Games plugin, because a module the test environment cannot load
must never be reachable from a barrel.

**Lifecycle**

- At the flag, `RaceWatcher` passes config, seed and the call log to
  `debriefStore`, which starts the runner.
- RETRY terminates it; the new attempt starts its own.
- NEXT RACE, MENU, or leaving the screen terminates any run in progress.
- A result tagged with a race the player has left is ignored.

**Not persisted.** A result screen restored from a save shows "Debrief
unavailable for a resumed race." Scenario races have no debrief.

**Failure never blocks.** A worker error, or no result within `timeoutMs`,
sets `failed`; the card shows one dim line. NEXT RACE, RETRY and MENU work at
every moment.

**Device risk, checked first:** module Web Workers inside the Capacitor
WebView served from `https://localhost`. The plan's first task proves a
trivial worker loads on the Pixel before anything is built on it.

## 6. The card

On the result screen, between the classification and the championship table.

Running:

```
YOUR CALLS                         reviewing…
▕████████████░░░░░░░░▏ 61%
```

Done:

```
YOUR CALLS                       3 judged · 8 futures
───────────────────────────────────────────────────
▲ PIT L25 → HARD                 you P6 · avg P6.1
  Better: L22 → MEDIUM               avg P4.2 · 7/8
───────────────────────────────────────────────────
✓ PLAN · START ON MEDIUM                GOOD CALL
✓ PACE → PUSH L31                       GOOD CALL
```

- Rows sorted by places left on the table, largest first. At most three
  shown; the rest collapse to "+N more judged good".
- ▲ amber (`--tyre-medium`) = a better alternative existed; ✓ teal = good
  call. Symbol always present with the colour (CLAUDE.md §6.3).
- "avg" and "k/K" always shown; the header states K. The player's real
  finish (or DNF) sits beside their average, because the futures re-roll the
  race and the average can differ from what happened.
- A planned stop the car never reached because it **crashed** is not judged;
  one never reached because of a tyre failure still is.
- Tapping a row expands a dot strip: the player's finishing position in each
  of the K futures, for their call and the better one.
- A retirement adds one line under the header: "Retired L48 · tyre failure".
- Numbers in mono with tabular figures.
- Motion: rows fade and stagger in once when the result arrives. No haptic,
  no sound — analysis, not reward. Reduced motion: rows appear instantly.
- Copy: never "you should have"; always "Better: …".

## 7. Testing commitments

- **Replay fidelity (the foundation, built first):** across many seeds, drive
  races through the real `raceStore` actions with calls at random moments;
  `replay(config, seed, log)` must deep-equal the live final state.
- `applyPlayerPit` / `applyPlayerPace` produce exactly what the old store
  actions produced (characterisation tests written before the move).
- Branching: the shared past is identical for every alternative of a call.
- Common futures: the actual call and its alternatives receive the same K
  continuation seeds.
- Alternatives respect allocation and the two-compound rule; offsets that fall
  before lap 1 or after the last lap are dropped.
- Verdict thresholds at their edges (`minGain`, `minShare`).
- Determinism: same race → same debrief.
- A constructed race where pitting earlier clearly avoids a tyre failure is
  reported with that alternative.
- Store lifecycle: retry, leaving and stale results, with the in-process
  runner.
- Timeout and error paths set `failed` and never block navigation.
- Card: verdict symbols, sorting, collapse, unavailable states, reduced
  motion.

## 8. Out of scope

- Judging calls the player never made ("you should have pitted for inters").
  Rejected in favour of judging calls made.
- A narrative race story.
- Debriefs for scenarios or for resumed races.
- Saving debriefs.
- Car setup counterfactuals — a natural later addition once car setup exists.
