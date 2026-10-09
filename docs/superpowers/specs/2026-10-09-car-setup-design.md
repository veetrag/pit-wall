# Car setup per circuit — design

**Status:** approved in conversation, 2026-10-09. Not yet planned.

## 1. What this is

Before each race the player picks a **wing level, 1–5**. Low wing is fast on
the power sector and on the straights; high wing is fast through the aero and
handling sectors and safer in the rain. Each circuit's existing per-sector
weights make a different level best there. Rivals pick their own.

Decisions made in conversation:

| question | decision |
|---|---|
| What setup trades | **Downforce only**: speed vs grip |
| How the player finds it | **Read the circuit** — nothing hidden; lap-time delta shown |
| What pulls against pure lap time | **Straight-line racing** and **rain risk** (not tyre wear) |
| Granularity / who | **5 levels; AI picks too** |
| Build | **Approach A** — wing on each car, read by the engine |
| Debrief | **Included** — the wing is a judged call |

Rejected and not to be re-proposed: running both cars, a practice session, a
driver market.

## 2. The model

Wing `w ∈ {1..5}`; centred `d = (w − 3) / 2 ∈ [−1, 1]`.

**Sector time** (seconds, added in `lapModel`):

```
S1 (power):    +d · speedGain · carSensitivity[0]
S2 (aero):     −d · gripGain  · carSensitivity[1]
S3 (handling): −d · gripGain  · carSensitivity[2]
every sector:  +balanceCost · d² / 3
```

The quadratic term gives each circuit an interior optimum,
`d* = (gripGain·(w₁+w₂) − speedGain·w₀) / (2·balanceCost)`, rounded to the
nearest level. No per-circuit data is authored; it emerges from
`circuits.json`.

**Overtaking.** At each sector-boundary check the pass probability is
multiplied by `1 + overtakeGain · (d_defender − d_attacker) · f`, where `f` is
the sector's existing `overtakingFactor` normalised so the power sector
dominates. The result is clamped by the existing probability bounds.

**Rain.** When weather is not `DRY`, each sector adds
`−d · wetGain · severity`, where `severity` is the existing weather-severity
scale for that state.

**Qualifying** uses the same lap model, so setup affects the grid.

**Gating.** Setup applies only when `RaceConfig.setups` is present. Absent, every
car is level 3, which is exactly zero effect. Byte-identity, the Monte-Carlo
bands and the scenarios therefore do not change.

**Tuning** — `src/data/tuning.json`, new `setup` block, zod-validated:

```json
"setup": {
  "speedGain": 0.0,
  "gripGain": 0.0,
  "balanceCost": 0.0,
  "overtakeGain": 0.0,
  "wetGain": 0.0,
  "aiNoise": 0.25
}
```

The gains are set by the plan's balance task against §5's targets; the zeros
above are the neutral starting point, not the shipped values.

## 3. Who picks, and the data flow

**`src/engine/setup.ts`** (pure):

- `wingDelta(config, car, sector, weather): number`
- `wingOvertakeFactor(config, attacker, defender, sector): number`
- `expectedBestWing(circuit, tuning, rainChance): Wing` — best on average,
  including the wet term weighted by the circuit's rain probability.

**Rivals and teammate.** `buildRaceConfig` sets each non-player car to
`expectedBestWing`, then a draw from an rng seeded from the race seed (its
own salt, so no existing stream shifts) moves it ±1 level with probability
`aiNoise`, clamped to 1–5. Same race, same setups.

**The player.** Chosen on the race setup screen, carried with the pre-race
plan into `RaceConfig.setups[playerDriverId]`. A restored mid-race save
restores it with the config.

**Memory per circuit.** `careerStore.wingByCircuit: Record<circuitId, Wing>`,
persisted as `z.record(...).default({})` — no save-version bump. Unvisited
circuit → `expectedBestWing`; visited → last level run there, recorded when
the race is kept (same point the career record commits).

**Scenarios** omit `setups` and behave as today.

## 4. The UI

**Setup screen — WING row**, beside the tyre plan:

- Five vertical bars, short (low wing) to tall (high wing). Press-scale spring
  and light haptic on select.
- A teal tick under the expected-best level.
- One mono, tabular line: `+0.18 s/lap vs best · Straights ▲ · Rain −0.3 s`.
  Values roll on change; ▲/▼ always accompany colour.
- A circuit character line: e.g. "Power track · S1 weighted".
- Accessibility: a labelled radio group ("Wing level, 2 of 5"); reduced
  motion makes changes instant.

**In race:** a `W2` chip in the telemetry zone. When rain arrives on wing 1–2,
the existing rain radio adds "Low wing in the wet — expect to lose time."

**Debrief:** a judged call `SETUP · WING 2`. Alternatives: the other four
levels, branching at lap 0, through the same K futures. Shown like any other
row: "Better: WING 4 · avg P5.1 · 7/8".

## 5. Balance targets

Measured in the plan, recorded in `MODEL_SPEC.md`:

- Across the 12 circuits, best levels cover **at least 4 of the 5** levels.
- Best vs one step off: **0.08–0.30 s/lap**.
- Best vs worst over a dry race: **~1.5–4 places**.
- Monte-Carlo with AI setups on stays inside **every existing band**.

## 6. Testing commitments

- `setup.ts`: zero effect at level 3; correct sign per sector; quadratic gives
  an interior optimum; `expectedBestWing` agrees with a brute-force search.
- Without `setups`, races are byte-identical to today (existing oracles
  untouched).
- AI setups deterministic per seed; the ±1 rate matches `aiNoise` over many
  seeds.
- Overtaking: a lower-winged attacker passes more often (statistical).
- Rain: high wing loses less than low wing when wet.
- Persistence: `wingByCircuit` defaults on legacy saves; remembered per
  circuit; recorded only when a race is kept (retry discards).
- Debrief: a constructed race where the wrong wing clearly costs places
  reports the better wing; the wing call shares futures with its
  alternatives.
- UI: radio group, best-level tick, trade-off line, reduced motion.

## 7. Out of scope

- Setup affecting tyre wear.
- More setup sliders (ride height, suspension, brakes, gearing).
- Changing setup during the race.
- A per-team setup skill.
