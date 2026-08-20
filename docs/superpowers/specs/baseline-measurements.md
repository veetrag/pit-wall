# Baseline measurements — race simulation as of 2026-08-20

Reference characterisation of what `src/engine/` actually does today, taken **before** the
planned changes to the overtaking model and per-circuit sensitivity weighting.

`MODEL_SPEC.md` — cited throughout `CLAUDE.md` as the validated design and "regression
oracle" — **does not exist in this repository and has no record in git history**. The only
surviving reference numbers are `tuning.json._regressionBands` and the assertions in
`tests/engine/monteCarlo.test.ts`, and those two disagree with each other. This document is
intended to replace that missing oracle with numbers that were actually measured.

---

## 1. Method

* Engine used directly: `initRace` / `stepSector` from `src/engine/index.ts`. No source file
  was modified. Measurements came from a throwaway harness (since deleted).
* `RaceConfig` construction replicates `buildConfig` in `src/state/raceStore.ts` exactly:
  brain promotion/capping via the difficulty profile, planned pit laps rescaled
  `round(lap / 30 * circuit.laps)`, `tyreAllocationBase`, `mandatoryTwoCompound`,
  `coverReactionScale`, `paceModeAggression`. No upgrade overlay.
* **No player car.** `playerDriverId` is set to a non-existent id, so `isPlayer` is false for
  all 20 cars and every car is AI-managed. Chosen because `stepSector` never runs
  `aiDecision` for the player car: with a real player id, one car would sit on its start tyre
  in `neutral` for the whole race and pollute every metric. Feeding the player `aiDecision`
  externally would have produced the same numbers as an AI car by construction, so the
  simpler configuration was used.
* **Design:** 4 cells (`rookie`/`pro` × as-shipped weather / rain forced to zero) × all 12
  circuits × **400 races per cell-circuit** = 19,200 races, 384,000 car-races. Seeds
  `i*7919 + 101`, identical seed set across every cell so cells are directly comparable.
* "Force dry" sets `rainProbability: 0, weatherBias: 'stable'` on the circuit object passed
  to the engine (a harness-level override, not a data change). Weather is by far the largest
  source of race-to-race variance, so the dry cells isolate the racing model; the as-shipped
  cells are the numbers a player actually experiences.
* Sample-size adequacy: for the headline per-circuit means the standard errors below are
  0.3–1.0 overtakes on a mean of ~50, and ±0.15 positions on `posChanged` — i.e. 1–2%
  relative. 400 races per cell-circuit is comfortably adequate for every quantity reported
  except the tail of the win distribution (three teams have **zero** wins in 9,600 races; the
  95% upper bound on their true win rate is ~0.03%, which is all the data can say).

### 1.1 Exactness of the traffic / held-up reconstruction

`calculatePaceAdvantage` and the traffic penalty are private to `race.ts` and applied
mid-step, so they were reconstructed outside the engine:
pre-penalty `raceTime` = previous `raceTime` + this step's `sectorTime` (read from the newly
appended `state.sectorResults` entries), then the pace-advantage formula replicated verbatim.

The reconstruction was **validated to exact equality**: on every non-lap-completing sector
(where nothing else touches `raceTime`), reconstructed `raceTime` equalled the engine's
actual `raceTime` for every car in every race. Max absolute mismatch across all 19,200
races: **0.0**. So items 4 and 5 below are measured, not modelled.

One behaviour was found this way: the engine computes **all** gaps from the *unpenalised*
ordering (`sorted` in `race.ts:157`), so traffic penalties do not cascade — a car's penalty
never affects the gap seen by the car behind it within the same sector.

---

## 2. Verification of the model description

All four claims put to me were checked against the source and are **correct**:

| Claim | Verdict | Evidence |
|---|---|---|
| `resolveOvertakes` swaps slots in a local array copy, pushes an `OvertakeEvent`, never touches `raceTime` | **Confirmed** | `race.ts:318-324`. The returned array is consumed by callers that immediately re-sort by `raceTime` (`:184`, `:249`, `:282`). The swap is unobservable. |
| Position is determined entirely by cumulative `raceTime` | **Confirmed** | `race.ts:249-254` is the only place `position` is assigned. |
| Traffic penalty capped at `paceAdv * 0.70`, so a faster car always nets ≥30% of its advantage | **Confirmed** | `race.ts:163-167`. See §7 for the important caveat this creates. |
| `overtakingFactor`, `carSensitivity`, `driverSensitivity`, `pitLaneTimeLoss` have no consumer in `src/` | **Confirmed, and proven behaviourally** | They appear only in `circuits.json` and test fixtures. Scrambling all four (`overtakingFactor` → `[0.01,0.01,0.01]`, `pitLaneTimeLoss` → 99, sensitivities inverted) produces **byte-identical** finishing order, gaps and overtake counts over 5 seeds. |

Nothing measured contradicted the description. Three things were found that extend it — see
§10.

---

## 3. Item 1 — Win rate

Pooled over both difficulties, as-shipped weather, all 12 circuits (n = 9,600 races). Binomial
standard errors.

| Team | Wins | Rate | ±SE |
|---|---|---|---|
| apex | 9,128 | **95.08%** | 0.22 |
| meridian | 358 | 3.73% | 0.19 |
| vortex | 65 | 0.68% | 0.08 |
| solstice | 28 | 0.29% | 0.06 |
| delta | 9 | 0.09% | 0.03 |
| kestrel | 7 | 0.07% | 0.03 |
| halcyon | 5 | 0.05% | 0.02 |
| nimbus | 0 | 0.00% | — |
| terra | 0 | 0.00% | — |
| zenith | 0 | 0.00% | — |

Per cell (n = 4,800 each):

| Cell | apex win rate | meridian | teams with ≥1 win |
|---|---|---|---|
| rookie, as-shipped | 97.06% ± 0.24 | 1.88% ± 0.20 | 7 / 10 |
| pro, as-shipped | 93.10% ± 0.37 | 5.58% ± 0.33 | 7 / 10 |
| rookie, dry | 98.38% ± 0.18 | 1.62% ± 0.18 | **2 / 10** |
| pro, dry | 92.90% ± 0.37 | 7.10% ± 0.37 | **2 / 10** |

Driver-level, pooled as-shipped: `d_voss` 9,034, `d_rossi` 353, `d_chen` 94, `d_silva` 57,
`d_ito` 20, everyone else ≤ 8. In the dry cells only **three** drivers ever win
(`d_voss`, `d_rossi`, `d_chen`).

**Reading.** `_regressionBands.topTeamWinRate: [0.70, 1.00]` is satisfied, but only because
its upper bound is 1.0. Rain is currently the *only* mechanism by which anyone outside the top
two teams wins a race; with weather removed the championship is a two-team, three-driver
contest. `pro` is measurably *more* open than `rookie` (93% vs 97–98% apex) because the
promoted AI brains occasionally out-strategise Voss.

---

## 4. Item 2 — Recorded overtake events per race

400 races per row; SE on the mean.

### As-shipped weather, `pro`

| Circuit | Laps | Mean ± SE | SD | Min | Max | Events / lap |
|---|---|---|---|---|---|---|
| veloce | 34 | 45.57 ± 0.63 | 12.5 | 1 | 65 | 1.34 |
| grand_savane | 38 | 47.76 ± 0.69 | 13.8 | 1 | 71 | 1.26 |
| sol_desert | 40 | 54.51 ± 0.47 | 9.4 | 17 | 74 | 1.36 |
| altiplano | 42 | 53.59 ± 0.71 | 14.2 | 3 | 80 | 1.28 |
| monsoon_bay | 44 | 27.62 ± 0.67 | 13.3 | 2 | 66 | 0.63 |
| costa_verde | 46 | 51.60 ± 0.86 | 17.2 | 3 | 83 | 1.12 |
| highland | 48 | 41.66 ± 0.87 | 17.4 | 3 | 76 | 0.87 |
| aurora | 50 | 41.37 ± 0.91 | 18.2 | 1 | 76 | 0.83 |
| kaido | 50 | 44.13 ± 0.88 | 17.5 | 2 | 76 | 0.88 |
| silverpark | 52 | 43.76 ± 0.93 | 18.5 | 0 | 79 | 0.84 |
| bengaluru | 56 | 49.63 ± 0.88 | 17.7 | 2 | 81 | 0.89 |
| harbour_lights | 60 | 49.50 ± 0.93 | 18.5 | 2 | 87 | 0.83 |

### Rain forced to zero, `rookie` — the clean view

| Circuit | Laps | Mean ± SE | SD | Min | Max | **Events / lap** |
|---|---|---|---|---|---|---|
| veloce | 34 | 50.98 ± 0.35 | 6.9 | 23 | 65 | 1.499 |
| grand_savane | 38 | 57.09 ± 0.38 | 7.6 | 29 | 71 | 1.502 |
| sol_desert | 40 | 58.98 ± 0.40 | 7.9 | 30 | 76 | 1.474 |
| altiplano | 42 | 61.36 ± 0.41 | 8.1 | 30 | 80 | 1.461 |
| monsoon_bay | 44 | 63.85 ± 0.43 | 8.6 | 30 | 82 | 1.451 |
| costa_verde | 46 | 64.93 ± 0.42 | 8.4 | 30 | 84 | 1.411 |
| highland | 48 | 66.53 ± 0.43 | 8.6 | 30 | 90 | 1.386 |
| aurora | 50 | 69.59 ± 0.48 | 9.6 | 32 | 99 | 1.392 |
| kaido | 50 | **69.59 ± 0.48** | 9.6 | 32 | 99 | 1.392 |
| silverpark | 52 | 71.39 ± 0.51 | 10.1 | 33 | 97 | 1.373 |
| bengaluru | 56 | 73.36 ± 0.50 | 9.9 | 33 | 101 | 1.310 |
| harbour_lights | 60 | 76.61 ± 0.55 | 10.9 | 34 | 100 | 1.277 |

**Reading.**
* Mean overtake events per race is **~46 as-shipped, ~62–65 dry** — 2–3× the documented band
  `_regressionBands.meanOvertakesPerRace: [12, 22]`. The data file's band is stale by a wide
  margin.
* `tests/engine/monteCarlo.test.ts` asserts 20–70 and passes only because its
  `REFERENCE_CIRCUIT` is 30 laps with `rainProbability: 0`. Measured on that exact fixture with
  no player car: **mean 48.04, SD 6.07, SE 0.30, min 29, max 62** (n = 400). Every shipped
  circuit is longer than 30 laps, and Harbour Lights in the dry (76.6 mean, max 100) sits
  **above** the test's upper bound. The suite is green because it never tests a real circuit.
* Confirmed: in the dry, event count is a near-pure function of **lap count** — the ordering of
  the table is exactly the ordering of `laps`, at a slowly declining ~1.28–1.50 events/lap
  (the decline is tyre-life and field-spread over a longer race, not circuit character).
* `harbour_lights` (`overtakingFactor [0.35, 0.1, 0.2]`, described in its own data as "almost
  impossible to overtake") records **the most overtakes on the calendar**, because it has the
  most laps. The circuit character fields are inverted in effect.
* Rain *reduces* recorded overtakes sharply (`monsoon_bay`, `rainProbability 0.75`: 27.6 vs
  63.9 dry) — wet crossover penalties spread the field beyond the 1.0 s gap threshold, so the
  eligibility gate fires far less often.

---

## 5. Item 3 — Actual position changes (the headline contrast)

Grid position is `index + 1` in `drivers.json` order. There is no qualifying, so **the grid is
byte-identical in every single race**; a "position change" is always relative to that fixed
order.

| Cell | Cars changing position (of 20) | Mean \|Δpos\| per car | Mean total position-slots moved | Recorded overtake events | **Events per position change** |
|---|---|---|---|---|---|
| rookie, as-shipped | 13.94 ± 0.04 | 1.78 | 35.6 | 46.7 | 3.35 |
| pro, as-shipped | 14.58 ± 0.04 | 1.98 | 39.6 | 45.9 | 3.15 |
| rookie, dry | 14.01 ± 0.04 | 1.70 | 34.0 | 65.4 | 4.67 |
| pro, dry | 14.61 ± 0.04 | 1.96 | 39.2 | 62.2 | 4.26 |

(Per-circuit `posChanged` means all fall in 13.3–15.2 with SE ≈ 0.15; `meanAbsPosDelta` in
1.55–2.18. Max single-car displacement averages 5–7 positions and is dominated by
retirements.)

**Reading.** The simulation records **~46 "overtakes" per race but produces only ~14 cars
finishing somewhere other than where they started, moving ~2 positions each.** Roughly
3–4.7 recorded events for every net position change. The recorded event count is decorative,
exactly as described: it measures *how often two cars were close with a pace delta*, not how
often anything happened. Any UI or commentary that surfaces `overtakeEvents.length` is
reporting a number 3–5× larger than the racing the player can see on the timing tower.

A large share of even the 14 changes is attributable to retirements (mean 0.7–1.6 DNFs per
race, each of which shifts everyone behind it up a slot) rather than to on-track racing.

---

## 6. Item 4 — How often is a faster car held up, and for how long

"Held up" = within `tuning.traffic.gapThreshold` (1.0 s) of the car ahead **and**
`calculatePaceAdvantage > 0`, evaluated on the exact pre-penalty ordering the engine used.
This is the quantity the planned change is meant to make circuit-dependent.

| Cell | Held-up share of car-sectors | Per-circuit range | Median run (sectors) | P(run ≥ 5) | P(run ≥ 10) | Worst run |
|---|---|---|---|---|---|---|
| rookie, as-shipped | **15.0%** | 13.1–17.3% | 2–3 | — | — | 156 sectors (100% of race) |
| pro, as-shipped | **13.8%** | 12.0–16.7% | 2–3 | 0.313 | 0.154 | 137 sectors (98% of race) |
| rookie, dry | **16.5%** | 14.2–17.7% | 2–3 | 0.292 | 0.135 | 122 sectors (100% of race) |
| pro, dry | **14.3%** | 12.4–17.4% | 2–3 | — | — | 81 sectors (79% of race) |

Pooled run-length distribution, `pro` as-shipped (n = 332,623 runs, bucketed with ≥30 collapsed):

| Run length (sectors) | Share | Cumulative |
|---|---|---|
| 1 | 31.4% | 31.4% |
| 2 | 19.1% | 50.5% |
| 3 | 12.0% | 62.5% |
| 4 | 6.1% | 68.7% |
| 5 | 4.9% | 73.5% |
| 6–9 | 11.1% | 84.6% |
| 10–19 | 9.6% | 94.2% |
| 20–29 | 3.4% | 97.6% |
| ≥30 | **2.4%** | 100% |

**Reading.** A faster car spends ~14–16% of its race within a second of a slower car. The
distribution is heavily front-loaded — half of all held-up episodes last two sectors or less,
and 63% resolve within one lap — so most "traffic" is a brief brush, not a battle. But the
tail is long and real: 2.4% of episodes run 30+ consecutive sectors (10+ laps), and the worst
observed case is a car held up for essentially an entire race (100% of its sectors).

Per-circuit spread is 12.0–17.7% held-up share, and the ordering is again driven by lap count,
not by circuit character: shorter races have a *higher* held-up share (~0.53
held-up-sectors/car/lap at 34-lap Veloce vs ~0.43 at 60-lap Harbour Lights) because the field
has had less time to spread out. This is the reverse of the intended character —
`harbour_lights` should be the most traffic-bound circuit on the calendar and is currently the
least.

---

## 7. Item 5 — Total time lost to the traffic penalty

Per car per race, exact (see §1.1).

| Cell | Mean per car-race | Median | p90 | Max observed | Per-circuit range of means |
|---|---|---|---|---|---|
| rookie, as-shipped | **0.605 s** | ~0.12 s | ~1.6 s | 5.17 s | 0.429–0.680 s |
| pro, as-shipped | 0.551 s | — | — | 4.81 s | 0.421–0.617 s |
| rookie, dry | 0.728 s | — | — | 5.88 s | 0.566–0.821 s |
| pro, dry | 0.643 s | — | — | 5.00 s | 0.571–0.723 s |

**Reading.** Traffic costs a car **about 0.6 seconds over an entire race**, and 5.9 s in the
single worst case ever seen in 384,000 car-races. For scale, one pit stop costs
`laneTimeLoss + stopMean` ≈ 24.4 s, and the top car's pace advantage over the field is
~0.2 s/lap — so an entire race's traffic is worth roughly three laps of car-performance
advantage, or 2.5% of one pit stop.

The `trafficCap` of 0.70 is the binding constraint almost everywhere: the uncapped penalty is
`0.12/3 = 0.04 s` per sector, while `paceAdv * 0.70` for a typical adjacent pair is well
below that. Combined with the ~15% held-up share, this is why blocking is nearly free.

Note the interaction with §6: the cap guarantees a faster car nets ≥30% of its pace advantage
**per sector**, so it must eventually clear — yet 30-plus-sector held-up runs are common. Both
are true because the pairs that get stuck longest are the pairs with the *smallest* pace
advantage (teammates, adjacent teams), for whom "eventually" is longer than the race. The cap
does not prevent long blocking; it just makes long blocking cheap.

---

## 8. Item 6 — Grid vs finishing position

Spearman ρ between the (fixed) grid order and classified finishing order, per race, averaged
over 400 races.

| Cell | Mean ρ | Range across the 12 circuits |
|---|---|---|
| rookie, as-shipped | 0.864 | 0.841 (monsoon_bay) – 0.884 (grand_savane) |
| pro, as-shipped | 0.850 | 0.817 (harbour_lights) – 0.880 (veloce) |
| rookie, dry | 0.876 | 0.865 (silverpark) – 0.886 (grand_savane) |
| pro, dry | 0.856 | 0.841 (harbour_lights) – 0.884 (veloce) |

**Reading.** ρ ≈ 0.85–0.88 everywhere. The start is highly predictive of the finish — but this
must be read carefully: because there is no qualifying, the grid is the fixed `drivers.json`
order, which already approximates the true car/driver speed order. So this number is mostly
measuring "does the fastest car win" (it does, 95% of the time), not "does track position
matter". The residual 0.12–0.18 of disorder comes from retirements, rain, and strategy
divergence, not from overtaking. Track position, as a *lever*, is currently worth very little:
a car's finishing slot is its pace rank plus noise.

---

## 9. Item 7 — How little the 12 circuits differ

Only three circuit fields reach the engine at all: `laps`, `sectorBase`, and
`rainProbability`/`weatherBias`. Of those, `sectorBase` affects nothing except absolute lap
time.

**Proof 1 — the four character fields are inert.** Taking `aurora` and scrambling
`carSensitivity` → `[0.9, 0.05, 0.05]`, `driverSensitivity` → `[0.05, 0.9, 0.05]`,
`overtakingFactor` → `[0.01, 0.01, 0.01]`, `pitLaneTimeLoss` → 99 yields **byte-identical**
finishing order, per-car gaps (to 1e-6) and overtake counts across 5 seeds.

**Proof 2 — `sectorBase` is racing-neutral.** Swapping `aurora`'s `sectorBase`
`[25, 27, 24]` for `kaido`'s `[27, 36, 26]` leaves finishing order, overtake count and all
classified cars' gaps identical to 1e-6. Only *retired* cars' accumulated times differ (they
stop at a different absolute time). `sectorBase` is a common additive offset for all cars, so
it cancels out of every gap.

**Proof 3 — two different circuits produce statistically identical racing.** `aurora`
(`sectorBase [25,27,24]`, `overtakingFactor [0.95,0.35,0.55]`, `pitLaneTimeLoss 22`) and
`kaido` (`sectorBase [27,36,26]`, `overtakingFactor [0.55,0.15,0.30]`, `pitLaneTimeLoss 23`)
share only their lap count (50). Over the same 400 seeds with rain forced off, they produce
**bit-identical results for every metric measured** — same mean overtakes (69.59), same
per-race overtake histogram, same `posChanged`, same `meanAbsPosDelta`, same Spearman ρ, same
traffic-penalty distribution, same held-up run-length histogram, same retirement count. The
only number that differs is normalised lap time (1.0201 vs 1.0171), which is a `sectorBase`
rounding artefact.

**Aggregate spread.** Normalised race pace (winner's total time ÷ `sum(sectorBase) × laps`) is
1.0171–1.0223 across all 12 dry circuits — a spread of 0.5%, entirely explained by how
tyre/fuel/traffic absolutes divide into different `sectorBase` totals.

**Conclusion, stated plainly: the 12 circuits are currently interchangeable apart from lap
count and rain probability.** Everything the calendar's `characterNote`s promise — Monza's
easy passing, Monaco's impossibility, Bengaluru's driver-dominance, per-circuit pit loss — is
data that no code reads. The only per-circuit levers that work today are "how long is the
race" and "how likely is it to rain", and lap count currently pushes the metrics in the
*opposite* direction from the intended character.

---

## 10. Item 8 — Determinism

Same seed ⇒ identical race, confirmed: two independent `initRace`/`stepSector` runs with seed
4242 on `bengaluru`/`pro` produced JSON-identical results across **every** metric collected
(finishing order, per-car race times, overtake event list, per-car traffic penalties, held-up
run lists, retirements). A different seed (4243) produced a different result, confirming the
check is not vacuous. Every number in this document is reproducible from the stated seed
sequence `i*7919 + 101`.

---

## 11. Findings that extend the stated model description

Nothing measured contradicted the description given. Three additions:

1. **Traffic penalties do not cascade.** All gaps in the traffic pass are computed from the
   unpenalised ordering (`race.ts:157`), so a car's penalty never widens the gap seen by the
   car behind it in the same sector.
2. **`sectorBase` is a fifth effectively-dead field for racing purposes.** It is read
   (`lapModel.ts:20`) but, being a common additive offset, it cannot influence any gap,
   position, or overtake — only absolute clock time. The list of per-circuit fields that
   actually change the racing is therefore just `laps` and `rainProbability`/`weatherBias`.
3. **The `trafficCap` guarantee and long blocking coexist.** "A faster car always nets ≥30% of
   its advantage and eventually gets past" is true per sector, yet 2.4% of held-up episodes
   last 10+ laps and the worst lasts a whole race — because the longest-stuck pairs are the
   ones with the smallest pace advantage. The cap makes blocking cheap rather than short.

## 12. Regression bands: measured replacements

The existing `_regressionBands` should be treated as unvalidated. Measured equivalents
(as-shipped weather, all 12 circuits, both difficulties, n = 9,600):

| Quantity | Documented band | Measured | Suggested band |
|---|---|---|---|
| Top-team win rate | [0.70, 1.00] | 0.951 ± 0.002 | [0.88, 0.99] |
| Mean recorded overtakes/race | [12, 22] | 46.3 (circuit means 27.6–57.5) | per-circuit, or [0.6, 1.6] events per lap |
| Min overtakes/race | 2 | **0 observed** (silverpark, pro) | 0 — the current assertion is false on real circuits |
| Cars finishing off their grid slot | — | 14.3 ± 0.04 of 20 | [12, 17] |
| Mean \|Δposition\| per car | — | 1.88 | [1.4, 2.4] |
| Held-up share of car-sectors | — | 14.4% | [11%, 19%] |
| Traffic time lost per car-race | — | 0.58 s (max 5.2 s) | [0.35, 0.90] s |
| Grid↔finish Spearman ρ | — | 0.857 | [0.79, 0.90] |

Note the third row: **`tests/engine/monteCarlo.test.ts`'s "every race has at least 2
overtakes" assertion is not true of the shipped circuits** — a `silverpark` `pro` race in this
sample recorded zero, and `veloce`, `grand_savane` and `aurora` each produced a race with
exactly 1. It passes only on the 30-lap dry reference fixture.
