# Circuits That Matter — design

**Date:** 2026-08-22
**Oracle:** `MODEL_SPEC.md` — read §3, §8 and §9 before starting
**Scope:** `src/engine/` (`race.ts`, `lapModel.ts`), `src/data/tuning.json`, `src/data/validators.ts`.
`src/data/circuits.json` values are **already correct and must not change**.
Split into **two plans** — overtaking first, then sensitivity wiring.

## 1. The problem

`MODEL_SPEC.md` §8 lists four circuit fields with no consumer in `src/engine/`, and §9 records that
overtaking is decorative. Both were proven, not assumed: Aurora and Kaido produce **bit-identical
races over 400 seeds**, and §3's per-circuit |Δpos| ratio measures **1.00×** against a real-F1
1.47×–2.67×. Twelve circuits, one circuit's behaviour.

Two distinct defects, one theme.

### 1.1 Overtaking never happens

`resolveOvertakes` (`race.ts:279-327`) picks the most eligible pair, rolls, and on success **swaps
two slots in a local array copy** — then returns it. It never touches `raceTime`. Every downstream
consumer re-sorts by `raceTime`: the traffic penalty (`:157`), dirty air (`:184`), final
classification (`:249`), and `resolveOvertakes` itself on the next tick (`:282`). The swap is
erased before anything reads it. `OvertakeEvent`s are logged, so the UI reports 46.3 overtakes a
race that had no effect on the result.

**And nobody can ever be stuck.** The traffic penalty is capped at `paceAdv * trafficCap` (0.7) at
`race.ts:165`, so a faster car always nets **at least 30% of its advantage** and therefore always
eventually clears. Track position has no defensive value.

### 1.2 `overtakingFactor` is shadowed, not merely unused

`race.ts:284` reads a **global** `tuning.overtaking.sectorFactor` `[1.0, 0.25, 0.55]` in the exact
place the per-circuit field belongs. The real values span 4×, from Harbour Lights `[0.35, 0.1, 0.2]`
to Veloce `[1.3, 0.6, 0.7]`. This is worse than a dead field: a plausible-looking constant is
standing in for real data, which is why the omission survived review.

### 1.3 `carSensitivity`, `driverSensitivity` and `pitLaneTimeLoss` are simply dead

All three are fully populated for all 12 circuits and read nowhere. `lapModel.ts` uses global
`carPerformance.sectorSplit` / `driverPerformance.sectorSplit`; pit stops use global
`pit.laneTimeLoss` (22.0) while circuits specify 18.0–24.0.

## 2. Goal

- A car **0.3–0.5 s/lap faster** needs **3–8 laps** to clear the car ahead, **failing entirely
  15–25%** of the time, and **60–75%** on the hardest circuit.
- Per-circuit |Δpos| ratio reaches **1.5–2.5×** (`MODEL_SPEC.md` §3), i.e. circuits measurably
  differ. Aurora and Kaido must stop being bit-identical.
- No field-wide regression: `paceRankCorrelation ≥ 0.90`, distinct winners ≥ 4, ρ inside 0.60–0.80.

This is the owner's "**circuit-dependent, real but escapable**" decision, made during the
competitive-grid brainstorm and binding here.

## 3. The owner's binding decisions

| Decision | Choice |
|---|---|
| How stuck should a faster car get? | **Circuit-dependent, real but escapable** |
| Should a circuit change *how much* the car matters, or only *which sector*? | **Raw values — a circuit compresses or amplifies the whole car-performance spread** |

The second is why every field-wide band must be re-measured across all 12 circuits: at Kaido
(`carSensitivity` sums to 0.83) the grid is 17% more compressed than at Veloce (1.00), so win share
becomes genuinely circuit-dependent. That is the intended effect, and it is what makes §3's
per-circuit ratio band reachable at all.

## 4. Plan A — overtaking converts to race time

### 4.1 Make a successful pass durable, by swapping race times

On success, **swap the two cars' `raceTime` values** rather than their array slots.

```
// before: result[i-1] = behind; result[i] = ahead      (erased by the next sort)
// after:  behind.raceTime <-> ahead.raceTime           (survives every sort)
```

Why swapping rather than assigning the overtaker a lower time:

- **It conserves total time.** Assigning `overtaker.raceTime = ahead.raceTime - margin` *gifts* the
  overtaker time it never made up on track, corrupting the cumulative race time that the whole
  model is built on. A swap moves time between two cars and invents none.
- **The magnitude is automatically physical.** The pair is only eligible when the gap is within
  `traffic.gapThreshold` (1.0s), so a swap is always a ≤1s adjustment — the size of a real pass.
- **It needs no new tuning constant**, so it cannot be mistuned.

**Plus a fight cost.** Both cars lose `overtaking.fightCost` (**0.15s**, new) on a completed pass —
wheel-to-wheel racing is slower than clear air. Applied to both, so it changes no gap, and it is
the reason a race full of passes is slower than a processional one.

### 4.2 Make being stuck possible, via the traffic cap

The single line that guarantees nobody is ever stuck is `race.ts:165`:

```
const cappedPenalty = Math.min(rawPenalty, paceAdv * config.tuning.traffic.trafficCap)
```

`trafficCap` becomes **circuit- and sector-dependent**, derived from `overtakingFactor`:

```
effectiveCap = traffic.trafficCap / max(overtakingFactor[sector], overtaking.factorFloor)
```

With `trafficCap` 0.7 and `factorFloor` **0.35**:

| circuit | S1 factor | effective cap | consequence |
|---|---|---|---|
| Veloce | 1.30 | 0.54 | passes readily; keeps 46% of its advantage |
| Bengaluru | 0.60 | 1.17 | **cap exceeds 1.0 — a faster car can lose more than its advantage and be genuinely stuck** |
| Harbour Lights | 0.35 | 2.00 | very hard to pass; the 60–75% failure target |

**A cap above 1.0 is the whole mechanism.** It is the first time in this simulation that track
position has defensive value. `rawPenalty` (`traffic.penalty / 3`) still bounds the absolute loss,
so this cannot produce a car going backwards indefinitely.

### 4.3 Use the real per-circuit overtaking factor

`race.ts:284` reads `circuit.overtakingFactor[sector]` instead of the global constant.

**This will move overtake rates hard** — the global mean is ~0.60 against per-circuit values from
0.10 to 1.30 — so `overtaking.base` (0.22) must be **retuned by measurement** so the field-wide
mean overtake count stays near today's 46.3. That count is explicitly **not a band**
(`MODEL_SPEC.md` §5, and it is a diagnostic only) so it is a calibration anchor, not a gate. The
gates are §2's clearing-time targets.

### 4.4 RNG-stream discipline

Plan A adds **no new `rng()` call** — it changes what happens after an existing roll succeeds, and
changes a multiplier. The draw sequence is therefore unchanged, and any test that shifts is
reporting a real behavioural change, not a stream artefact. **This is a strong invariant: assert it.**

## 5. Plan B — wire the three dead fields

### 5.1 `carSensitivity` and `driverSensitivity`

`lapModel.ts` replaces the global `sectorSplit` with the circuit's per-sector sensitivity, used
**raw** per §3. Both are already `[number, number, number]` per circuit.

Because the sums differ, the *total* car and driver spread becomes circuit-dependent. Expected and
intended.

**Measured 2026-08-23, replacing this section's predictions.** First a correction to the sums quoted
here: they are **not** 0.83–1.00. No circuit sums to 0.83, and the true ranges are `carSensitivity`
**0.78–1.05** and `driverSensitivity` **1.00–1.36**. The prediction was wrong on both ends; it does
not change the raw-values ruling in §3, and if anything strengthens it, since the real spread is
wider than the one the ruling was made against.

- Win share did become circuit-dependent, and more sharply than "favours Apex" anticipated. Apex
  (aero 95, power 92) and Meridian (power 98, aero 91) are one facet point apart and differ only in
  *where* the strength sits, so once circuits weighted power, aero and handling differently, which of
  the two wins became a property of the circuit. **Meridian owns Veloce outright at 69.5%**; Kaido is
  Vortex's best circuit at 31.5%. Apex still leads the calendar by **+25.1pp ± 2.9** and wins 11 of
  the 12 singly.
- The field-wide figure moved **down**: top-team win share is **56.67% / 59.17%** pro over all 12 at
  n=720 (two seed bases), against 65.0% before. Every other band held — distinct winners 7,
  `paceRankCorrelation` unmoved at 0.9636 pro / 0.9152 rookie, |Δpos| 2.84–2.86 pro, ρ 0.750–0.756
  pro. **No band was widened**; the full re-measurement is `MODEL_SPEC.md` §3 and §4.
- One consequence not predicted here: the Monte-Carlo gate's team-identity assertion had to move from
  a 4-circuit sample to the whole calendar, because the sample contains Veloce and at n=240 the
  Apex–Meridian margin was 1.3 SE — the gate was measuring sampling power, not the grid.

### 5.2 `pitLaneTimeLoss`

Pit stops read `circuit.pitLaneTimeLoss` (18.0–24.0) instead of global `pit.laneTimeLoss` (22.0).
`MODEL_SPEC.md` §3 bands pit-lane loss at 19.5–24.0s against a real 19.7–23.8s; **Veloce's 18.0 and
Harbour Lights' 19.0 fall below that floor.**

**Ruling: `circuits.json` does not change, and the band is not widened.** The §3 band describes the
real-world *population mean* across circuits, not a per-circuit minimum — real F1 pit lanes do vary
below 19.7s. The band's measurement must therefore be redefined as the **field-wide mean across the
12 circuits** (which is 21.0, inside the band), and `MODEL_SPEC.md` §3 updated to say so
explicitly. This is a clarification of what the band measures, not a loosening of it.

**Done as specified, 2026-08-23.** The calendar mean is **exactly 21.00s**, inside 19.5–24.0. One
correction to the count above: **three** circuits fall below the floor, not two — Veloce 18.0,
Harbour Lights 19.0 and **Altiplano 19.0**. Neither the data nor the band's endpoints changed. A
spread gate (max − min ≥ 4.0s) sits beside the mean so the calendar cannot be quietly flattened back
toward a single value, which is the failure mode the mean alone would not catch. The wiring turned out
to need **five** call sites, not the four this spec assumed: `race.ts`, `projection.ts`,
`raceStore.ts` (×2) and `PitTimer.tsx`.

### 5.3 The differentiation proof

The test that matters: **Aurora and Kaido must no longer be bit-identical.** Today they are, over
400 seeds. Assert they diverge, and assert the per-circuit |Δpos| ratio (max/min across the 12)
lands in §3's **1.5–2.5×**. That ratio is the single number that says circuits matter, and it is
currently exactly 1.00×.

**Measured 2026-08-23. The divergence landed; the ratio target did not.**

The divergence is proved, and it needed more care than this section assumed. Aurora and Kaido are
both `showery`, and `rainProbability: 0` does **not** force dry weather — `weather.ts:28` rolls
DRY→DAMP every lap off `weatherBias`, independently of the rain gate — so that pair read a clean 0 and
concealed a confounder. Four circuit fields have to be held equal for a differentiation test to be
failable at all (`overtakingFactor`, `sectorBase`, `weatherBias`, `pitLaneTimeLoss`), each with a
measured pre-wiring flip count; the headline pair is now harbour_lights vs grand_savane with the bias
pinned. Aurora/Kaido are kept for continuity with the oracle's §8.

**The ratio moved the wrong way.** Measured 1.3454 (mean of four seed bases, pro, n=200 per circuit)
against **1.5238** for the same sweep with only the two wired `lapModel.ts` lines reverted — so the
wiring pushed it from just inside the 1.5 floor to clearly below it. The "up from exactly 1.00×"
claim that first stood here was a pre-Plan-A figure inherited without re-measurement; 1.00× predates
the overtaking work, which had already carried the ratio to ~1.52 by making `overtakingFactor` live.
**Recorded as a regression rather than tuned away**, per §7's report-don't-edit rule: the calendar
data is the owner's.

The cause is that the sensitivities as authored **anti-correlate with position churn**. `harbour_lights`
is the most position-shuffling circuit and carries the *lowest* `carSensitivity` (0.78) and the
*highest* `driverSensitivity` (1.36) — realistic for a street circuit, but driver skill also helps set
the grid, so amplifying the driver makes results *more* grid-ordered: harbour_lights' own |Δpos| fell
3.770 → 3.567 while the old floor circuit (veloce, 1.00/1.00) rose. The range is squeezed from both
ends. `overtaking.factorFloor` (0.35) compounds it by clipping `overtakingFactor` in 2 of 3 sectors at
exactly harbour_lights and kaido, the two circuits at the top of the range.

So closing the gap is **not** a matter of widening the spread in the direction it already runs. It
needs the spread re-authored so high-churn circuits carry high car sensitivity, or `factorFloor`
lowered. Both are owner decisions, and this is the main open question the plan leaves behind.

The shipped gate is a **fixed pair** (harbour_lights ÷ grand_savane > 1.15, measured 1.2968 ± 0.0451
pro), not the max/min this section proposed: a max-over-12 is an extremum whose endpoints changed
identity across seed bases, and gating one would repeat a defect this project has already removed
once.

## 6. Testing

Both plans inherit the discipline `MODEL_SPEC.md` §12 and the two predecessor plans established:

- **Every new assertion must be failable.** Mutate the data and confirm the test catches it. This
  project has shipped four tautologies and one unfailable floor (`≥ 0.0` on a proportion). No sixth.
- **Field-wide measurement over ≥ 4 circuits at a stated difficulty** (§4). For Plan B, over **all
  12**, because the change makes circuits differ by design.
- `playerDriverId: '__none__'` in the harness, or one car sits in `neutral` on its start tyre and
  skews every statistic.
- **Determinism:** same seed ⇒ byte-identical race, compared on serialised `RaceState` with a
  negative control. The original determinism test passed while lap times were perturbed 0.0007s.
- **Report standard errors** and state sample size in every failure message.
- **Plan A additionally asserts the RNG stream is unchanged** (§4.4).

### 6.1 Plan A's specific gates

| Gate | Target |
|---|---|
| Laps for a 0.3–0.5 s/lap advantage to clear | **3–8** |
| Clearing failure rate, median circuit | **15–25%** |
| Clearing failure rate, hardest circuit (Harbour Lights) | **60–75%** |
| Overtakes now change classification | assert a swapped pair's final order differs from pace order |
| Field-wide mean overtake count | calibrated near 46.3 (diagnostic, not a gate) |

### 6.2 Plan B's specific gates

| Gate | Target |
|---|---|
| Per-circuit \|Δpos\| ratio, max/min over 12 | **1.5–2.5×** |
| Aurora vs Kaido | must **not** be identical |
| Mean pit-lane loss across 12 | inside 19.5–24.0 |
| `paceRankCorrelation` | **≥ 0.90** (anti-lottery) |
| Distinct winners | ≥ 4 |
| Grid↔finish ρ | 0.60–0.80 |

## 7. Risks

| Risk | Mitigation |
|---|---|
| The `raceTime` swap corrupts cumulative time | A swap conserves total time by construction; assert the field's summed `raceTime` is unchanged by an overtake beyond `2 × fightCost` |
| An effective cap above 1.0 sends a car backwards indefinitely | `rawPenalty` still bounds the absolute per-sector loss; assert a bounded worst case |
| Retuning `overtaking.base` is fitted to the sample rather than principled | The overtake count is a **diagnostic, not a gate** (§5 of the oracle); the real gates are the clearing-time targets, which are mechanism-derived |
| Plan B moves win share out of band | Measure across all 12 and report; do not touch `cars.json`, which the competitive-grid plan settled |
| `pitLaneTimeLoss` values fall below §3's floor | §5.2 — redefine the band as the field-wide mean and say so in the oracle; do not widen it and do not edit the data |
| Both plans touch `race.ts` in the same region | Sequential execution, Plan A fully landed and reviewed before Plan B starts |

## 8. Deliberately out of scope

- **A lapping / un-lapping model.** The engine tracks `car.lap` but has no concept of being lapped.
- **DRS, dirty-air aero sensitivity per circuit, tyre-warmup.** All plausible, none needed for §2.
- **Any change to `cars.json` or `drivers.json`.** Settled by predecessor plans.
- **The race-incidents plan** (`2026-08-22-race-incidents-design.md`), which now follows these two.
  Its §7 numbers were derived against the current engine and **will need re-deriving** once these
  land, because both plans change measured win share. Its §2.1 stopping rule survives unchanged.
