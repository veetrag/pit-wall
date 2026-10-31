# DATA_SCHEMAS.md — F1 Strategist

This document defines every data file the game loads, with TypeScript types, example JSON, and field-by-field meaning. **All balance and content lives in data; none of it is hardcoded in `engine/`.** On load, every file is validated at runtime with zod against these schemas — fail loudly on malformed data.

The numbers in the `tuning.json` section are the **locked "more action, grounded" config**, validated over 300+ Monte-Carlo races. They are the starting defaults and also the regression oracle for tests.

---

## 1. Conventions

- **Time is in seconds** everywhere. Deltas are *positive = slower* (added on top of a base pace). This keeps the mental model consistent: base lap is the fastest possible, everything else slows you down.
- **Ratings:** car `rating` 0–9 (0 = fastest car). Driver `skill` 0–10 (0 = best). `racecraft` 0.0–1.0 (1.0 = best overtaker/defender). These map to time deltas via tuning constants.
- **Compounds:** `"S" | "M" | "H"` (soft/medium/hard).
- All files live in `src/data/`. Types live in `src/engine/types.ts`. Validators in `src/data/validators.ts` (zod).

---

## 2. `tuning.json` — the master balance file (LOCKED defaults)

The single most important data file. Every magic number in the model lives here. Designer balances by editing this; logic never changes.

```jsonc
{
  "carPerformance": {
    "deltaPerRating": 0.22,        // seconds/lap added per rating point. 0.22 => ~2.0s field spread (tight = more action)
    "sectorSplit": [0.30, 0.45, 0.25]  // how the per-lap car delta distributes across S1/S2/S3 (must sum ~1.0)
  },
  "driverPerformance": {
    "deltaPerSkill": 0.10,         // seconds/lap per skill point. ~1/3 of car influence => car-dominated like real F1
    "sectorSplit": [0.30, 0.40, 0.30]
  },
  "fuel": {
    "effectPerLap": 0.035          // seconds slower per lap of fuel still aboard
  },
  "noise": {
    "sigmaPerSector": 0.08         // Gaussian SD per sector (~0.14s/lap). The "alive" jitter. Feel knob.
  },
  "trackEvolution": {
    "startDelta": 0.30,            // extra seconds/lap at race start (green track)
    "decayLaps": 20                // laps over which evolution delta decays to ~0
  },
  "traffic": {
    "gapThreshold": 2.2,           // seconds: within this, a car is "held up" by the one ahead
    "penalty": 0.30                // min pace floor penalty when stuck in dirty air
  },
  "overtaking": {
    "base": 0.22,                  // base per-boundary overtake probability
    "paceMultiplier": 3.0,         // how much a pace advantage boosts overtake odds
    "sectorFactor": [1.0, 0.25, 0.55]  // per-sector overtaking ease (S1 easy, S2 hard, S3 medium) — PER CIRCUIT can override
  },
  "pit": {
    "laneTimeLoss": 22.0,          // seconds lost in pit lane (circuit can override)
    "stopMean": 2.4,               // mean stationary stop time
    "stopSigma": 0.3               // SD of stop time (the occasional slow/fast stop)
  },
  "paceModes": {
    "push":     { "paceDelta": -0.15, "degMultiplier": 1.30 },  // faster, eats tyres
    "neutral":  { "paceDelta":  0.00, "degMultiplier": 1.00 },
    "conserve": { "paceDelta":  0.20, "degMultiplier": 0.75 }   // slower, saves tyres
  },
  "projection": {
    "horizonLaps": 4,              // how far the "pit now?" what-if fast-forwards. Shows rejoin; UI may also show longer net estimate.
    "useOvertakeRolls": false      // projection uses pure pace-based gaps (fast, ~deterministic) — no overtake dice
  },
  "timeOfDay": {
    "_note": "Spec 2026-10-24 §2.2. Validated 0.8–1.0 (src/data/validators.ts); reads via circuitTraits.ts.",
    "nightWearFactor": 1.0         // multiplies tyre wear on circuits with timeOfDay 'night'. Bounds 0.8–1.0: below 1.0 means less wear at night. Ships at 1.0 in 1.7 (night wear deferred, MODEL_SPEC §17), so it has no effect yet.
  },
  "daily": {
    "_note": "Spec 2026-10-24 §4. Daily challenge generator; read by src/state (daily).",
    "rulesVersion": 1,             // salts the date hash: bumping it changes every day's challenge.
    "lapWindow": [0.35, 0.8],      // fraction of the race in which the handover may fall.
    "positionRange": [3, 14],      // grid positions the player may be handed.
    "maxSearchRaces": 24,          // cap on candidate races the generator simulates looking for a valid one.
    "keepDays": 30                 // how many days of daily bests are kept.
  },
  "incidents": {
    "dnfPerLap": 0.0,              // reliability DNF prob/lap/car. 0 in v1 (add later as a layer).
    "driverErrorPerLap": 0.0       // lock-up/crash prob. 0 in v1.
  }
}
```

**Regression bands (for the Monte-Carlo test, derived from validation runs):** with these constants and the example field below, over 200–300 races expect: top car wins ~55–68%; mean overtakes ~12–22/race with min ≥ 2; median adjacent racing gap ~2–4s; no single strategy/compound wins 0% across the set. Tests assert these bands.

---

## 3. `compounds.json` — tyre model

The degradation curve is `offset + lin*age + pen*max(0, age - cliff)^2`, where `age` is in laps (ticks in thirds-of-a-lap via sectors). The squared term is the "cliff."

```jsonc
{
  "S": { "name": "Soft",   "offset": -0.6, "lin": 0.040, "cliff": 12, "pen": 0.030, "colorToken": "--tyre-soft" },
  "M": { "name": "Medium", "offset":  0.0, "lin": 0.025, "cliff": 22, "pen": 0.020, "colorToken": "--tyre-medium" },
  "H": { "name": "Hard",   "offset":  0.5, "lin": 0.015, "cliff": 35, "pen": 0.012, "colorToken": "--tyre-hard" }
}
```

| Field | Meaning |
|---|---|
| `offset` | fresh-tyre pace vs medium baseline (soft fastest, hard slowest) |
| `lin` | linear degradation per lap of age (gentle phase) |
| `cliff` | lap of tyre age where the steep penalty begins |
| `pen` | coefficient on the squared post-cliff penalty (steepness of the cliff) |
| `colorToken` | CSS token for the compound dot in the UI |

---

## 4. `circuits.json` — track definitions

A circuit owns its sector base times, sensitivities, pit loss, and (optionally) overrides for overtaking ease and a path for the canvas renderer.

```jsonc
{
  "silverpark": {
    "name": "Silverpark",
    "laps": 30,                          // v1 race length (short for mobile sessions; tunable)
    "sectorBase": [28.0, 34.0, 28.0],    // base time per sector (sum = clean lap = 90.0s)
    "carSensitivity": [0.30, 0.45, 0.25],   // optional per-circuit override of how car perf splits across sectors
    "driverSensitivity": [0.30, 0.40, 0.30],
    "overtakingFactor": [1.0, 0.25, 0.55],  // per-sector ease; overrides tuning.overtaking.sectorFactor for this track
    "pitLaneTimeLoss": 22.0,             // overrides tuning.pit.laneTimeLoss
    "trackPath": "paths/silverpark.json",   // SVG-path / point list for the canvas track shape + sector markers
    "characterNote": "Balanced reference circuit. S1 power, S2 aero, S3 mixed/traffic."
  }
  // ... more circuits added later
}
```

**Circuit traits (1.7, spec 2026-10-24 §1.2).** All optional; absent means the neutral value (1), so old circuits behave exactly as before. Read through `src/engine/circuitTraits.ts`. Bounds are enforced by `CircuitSchema` in `src/data/validators.ts`; an out-of-range value fails the load.

| Field | Type / bounds | Meaning |
|---|---|---|
| `timeOfDay` | `'day' \| 'dusk' \| 'night'` | Lighting. Night multiplies tyre wear by `tuning.timeOfDay.nightWearFactor`. Tied to `atmosphere` by a test. |
| `layout` | `'permanent' \| 'street'` | Track type, for presentation. |
| `tyreWear` | number, 0.7–1.6 | Multiplier on effective tyre age (higher = harder on tyres). |
| `crashRisk` | number, 0.5–2.0 | Multiplier on the driver-error chance. |
| `neutralisationRisk` | number, 0.5–2.0 | Multiplier on SC and VSC deploy chances (capped at 1). |

1.7 circuit values (Lantern Quay, Mesa Roja) are the ones still open for Veet's call; see `docs/V2-CHECKLIST.md`.

**Scenario fields (1.8, spec 2026-10-24 §3).** Added to `ScenarioSchema` in `src/data/validators.ts`; all optional, so existing scenarios are unchanged.

| Field | Type / bounds | Meaning |
|---|---|---|
| `pack` | `'core' \| 'historic'` | Which hub section lists it. Absent means `'core'`. |
| `inspiredBy` | string, 1-140 chars | The real moment a classic is inspired by (display only). |
| `era` | string, 1-24 chars | Era label shown on the card. |
| `expect.dryingAhead` | positive integer | Laps until the track dries, for the scenario's expectation check. |

`tuning.daily` (above) configures the daily challenge: `rulesVersion`, `lapWindow`, `positionRange`, `maxSearchRaces`, `keepDays`.

**Start share codes (1.9, spec 2026-10-24 §5.4).** Implemented in `src/state/startCode.ts` with the append-only index tables in `src/state/startCodes.ts` (an index, once shipped, means that id forever; new circuits, drivers and teams are appended, never reordered). Text is `PW1-` + base64url (no padding) of the payload bytes followed by a 4-byte FNV-1a checksum of those bytes. Whitespace is ignored on decode; hard cap 2048 characters (`MAX_CODE_CHARS`) before any decoding. Payload is big-endian:

| Field | Bytes | Notes |
|---|---|---|
| format version | u8 | `CODE_FORMAT` = 1 |
| data fingerprint | u32 | FNV-1a of the engine-relevant game data; a mismatch warns, it does not reject |
| seed | u32 | |
| circuit | u8 | index into `CIRCUIT_CODES` |
| player driver | u8 | index into `DRIVER_CODES` |
| startLap | u8 | |
| flags | u8 | b0 sprint, b1 dryStart, b2 allDry, b3 pro, b4 strategy, b5 grid, b6 overlay; b7 must be 0 |
| lapsPercent | u8 | 25 / 50 / 75 / 100 |
| weather | u8 | index into `WEATHER_CODES`: 0 circuit, 1 dry, 2 changeable, 3 wet |
| strategy (b4) | 3 + 2n | start compound, wing (0 = none, max 5), n stops (max 2), each lap + compound |
| grid (b5) | 1 + n | n driver indices |
| overlay (b6) | var | u16 packed tiers (5 x 2 bits, `ATTRIBUTE_CODES` order); u8 n + n x (u8 team, f64 pool) rival development; u8 m + m x (u8 team, i8 offset) team tiers |
| calls | 1 + 4n | n max 255; u16 step, u8 kind (`CALL_KINDS`: 0 pit, 1 pace, 2 restart_tyre, 3 hold_plan), u8 arg (compound, pace mode or hold flag) |
| expect | 5 | position, lapsRemaining, compound, tyreAge, par |
| name | 1 + len | ASCII 0x20-0x7E, length 1-24 |
`decodeStart` never throws and returns `{ ok: true, payload, id }` or `{ ok: false, reason: 'format' | 'checksum' | 'newer' | 'invalid' }`.

**Storage and tuning (1.9).** Saved starts live under the Preferences key `starts.mine` (`src/state/startsStore.ts`) as `{ v: 1, starts: [{ id, code, savedAt, best }] }`, at most 30. `tuning.custom` (`minLaps`, `weather.changeable`, `weather.wet`, `sprintEvery`) configures custom races: `minLaps` floors a shortened race, `weather.*` reshapes a cloned circuit.

`trackPath` references a separate file describing the circuit geometry for the Pixi renderer: an ordered list of points (or an SVG path) for the racing line, plus the three sector-boundary positions and the pit-lane entry/exit points so cars can be interpolated along it and the pit animation has a real path.

---

## 5. `cars.json` and `drivers.json` — the grid

Kept separate so a driver can be reassigned to a car (useful later for the career layer).

```jsonc
// cars.json
{
  "teams": [
    { "id": "apex",    "name": "Apex Racing",   "rating": 0, "reliability": 0.99, "colorPrimary": "#00E5D0", "colorSecondary": "#0A0E1A" },
    { "id": "meridian","name": "Meridian GP",   "rating": 1, "reliability": 0.98, "colorPrimary": "#E8344E", "colorSecondary": "#FFFFFF" },
    { "id": "vortex",  "name": "Vortex Motors", "rating": 2, "reliability": 0.97, "colorPrimary": "#F2C94C", "colorSecondary": "#0A0E1A" }
    // ... up to grid size
  ]
}
```

```jsonc
// drivers.json
{
  "drivers": [
    { "id": "d_ver", "name": "Verstael",  "code": "VER", "teamId": "apex",     "skill": 1, "racecraft": 0.95, "consistency": 0.95 },
    { "id": "d_ham", "name": "Hamilcar",   "code": "HAM", "teamId": "meridian", "skill": 1, "racecraft": 0.92, "consistency": 0.93 },
    { "id": "d_lec", "name": "Leclair",    "code": "LEC", "teamId": "meridian", "skill": 3, "racecraft": 0.85, "consistency": 0.88 }
    // ... two drivers per team
  ]
}
```

| Field | Meaning |
|---|---|
| `rating` (car) | 0–9, master performance (0 fastest) |
| `reliability` | per-lap survival factor; only used once incidents layer is enabled (v1: ignored) |
| `colorPrimary/Secondary` | team livery, used for car dots, timing-tower accents, tyre/UI theming |
| `skill` (driver) | 0–10 pace contribution (0 best) |
| `racecraft` | 0–1, overtaking/defending effectiveness |
| `consistency` | 0–1, scales driver-error probability (v1: ignored, reserved for incidents layer) |
| `code` | 3-letter timing-tower abbreviation (must be unique) |

**Names are fictional on purpose** — avoid real-driver IP. Keep them evocative but original.

---

## 6. `strategies.json` — AI rival default plans (optional seed data)

Rival AI computes strategy dynamically, but we seed sensible default plans per car so races are coherent from the first build before the strategy AI is sophisticated.

```jsonc
{
  "defaults": [
    { "teamId": "apex",     "startCompound": "M", "plannedStops": [{ "lap": 16, "compound": "H" }] },
    { "teamId": "meridian", "startCompound": "M", "plannedStops": [{ "lap": 15, "compound": "H" }] },
    { "teamId": "vortex",   "startCompound": "S", "plannedStops": [{ "lap": 11, "compound": "H" }] }
  ]
}
```

The strategy AI (in `engine/strategy.ts`) may deviate from these in response to race state (tyre cliff reached, undercut opportunity, etc.). The player ignores this file entirely — they set their own plan in the UI.

---

## 7. Loading & validation contract

- All data files load at startup, validated with zod. Any schema violation throws with a clear message naming the file and field — fail fast, never run on bad data.
- `sectorBase`, `carSensitivity`, `driverSensitivity`, `overtakingFactor` arrays MUST have length 3. Sensitivity splits should sum to ~1.0 (warn if not within tolerance).
- Every `driver.teamId` must reference an existing `team.id`; every `strategy.teamId` likewise. Validate cross-references.
- Compound keys are exactly `S`, `M`, `H`.
- `tuning.json` is loaded once and injected into the engine — the engine takes tuning as a parameter, it does not import the file directly (keeps the engine pure and testable with alternate tunings).

---

## 8. Summary of the locked numbers (quick reference)

| Knob | Value | Effect |
|---|---|---|
| Car delta / rating | 0.22 s/lap | ~2.0s field spread; tight for action |
| Driver delta / skill | 0.10 s/lap | car-dominated |
| Noise σ / sector | 0.08 s | lively but not random |
| Traffic gap / penalty | 2.2 s / 0.30 s | track position matters, field bunches |
| Overtake base / pace mult | 0.22 / 3.0 | ~17 passes/race |
| Sector overtake ease | [1.0, 0.25, 0.55] | S1 easy, S2 hard, S3 medium |
| Pit loss | 22.0 s + 2.4±0.3 | undercut/overcut emerge |
| Pace push / conserve | −0.15s,+30% deg / +0.20s,−25% deg | the live strategic lever |
| Projection horizon | 4 laps | "pit now?" what-if |

These produce: top car ~62% wins, ~17 overtakes/race, ~2.9s median racing gaps — "more action, grounded." Re-tune by editing `tuning.json`; never touch logic.
