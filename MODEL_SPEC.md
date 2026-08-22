# MODEL_SPEC.md — the simulation's regression oracle

**Status:** reconstructed 2026-08-20. This document replaces a `MODEL_SPEC.md` that `CLAUDE.md`
has cited since the project began as "already designed and validated" and as "your regression
oracle" — **but which never existed in this repository.** Nothing was lost; there is no earlier
version to recover. Every number below is either measured from this simulation or computed from
real Formula 1 results, and each one says which.

Read this before changing anything in `src/engine/` or any balance value in `src/data/`.

---

## 1. Why this document exists, and what it is not

The simulation had three reference numbers, in `src/data/tuning.json` under `_regressionBands`:
`topTeamWinRate: [0.7, 1.0]`, `meanOvertakesPerRace: [12, 22]`, `minOvertakesPerRace: 2`. All
three were unattributed, and two were wrong:

- `meanOvertakesPerRace: [12, 22]` was stale by a factor of 2–4. The simulation measured **46.3** when
  this was written (2026-08-20); it measures **33.3** since overtaking became durable (§9). Both
  figures are outside that band, and §5 is why the band should never have existed. The key has since
  been removed from `_regressionBands`.
- `tests/engine/monteCarlo.test.ts` asserts a *different* band, **20–70**, contradicting the data
  file it lives beside.
- `minOvertakesPerRace: 2` was **false on shipped circuits** — a Silverpark race recorded 0, and
  Veloce, Grand Savane and Aurora each produced a 1. The test suite passes only because it runs
  against `REFERENCE_CIRCUIT`, a 30-lap rain-free fixture that no circuit on the calendar resembles.
- `topTeamWinRate: [0.7, 1.0]` encodes a *historically dominant* era (Red Bull 2023 at 95.5%,
  Mercedes 2016 at 90.5%) as the simulation's permanent floor.

This document is therefore **not** a record of a prior validated design. It is a fresh oracle,
built from measurement, and it is honest about its own confidence. Where a figure is inferred
rather than computed, it says so and is **not** used to gate tests.

## 2. Sources

| Source | What it is | Confidence |
|---|---|---|
| `docs/superpowers/specs/baseline-measurements.md` | 19,200 simulated races over the real engine, 12 circuits × 2 difficulties × 2 weather cells, fixed seeds. Traffic figures are exact, not modelled: the engine's pre-penalty ordering was reconstructed and validated to 0.0 mismatch. | **High** — full population, standard errors given |
| Jolpica F1 archive (`api.jolpi.ca`) | 10,550 result rows / 503 races, seasons 2000–2025. Sanity-checked: computed all-time pole win rate 43.1% vs published ~42%; Red Bull 2023 95.5% and Mercedes 2016 90.5% reproduce exactly. | **High** for what it covers |
| Published F1 analyses (web) | Overtake counts, dirty-air penalty, pit-lane loss. | **Mixed** — see §6 |
| Grid sensitivity search | ~55,000 simulated races varying facet values in memory. | **High** |

Ergast is dead (HTML 404 on JSON endpoints); Jolpica is the maintained successor. Note its
`status` vocabulary collapses from 2023 onward to `Finished`/`Lapped`/`Retired` with no cause
strings, and `Lapped` denotes a *classified finisher* — treating it as a retirement produces a
bogus 38% DNF rate. Retirement causes are only computable for 2000–2022.

## 3. The bands

These are the acceptance criteria. A change that moves a **gated** metric out of band must either
be corrected or must update this document with an argument.

| Metric | Real F1 | Sim at 2026-08-22 (post overtaking-race-time) | Band | Gated? |
|---|---|---|---|---|
| Mean \|grid − finish\| | **2.97** ± 0.04 classified (2011–25); 3.70 with DNFs | **2.9896** ± 0.043 pro / 2.7671 ± 0.041 rookie (4-circuit gated sample, n=240); **2.8140** ± 0.029 pro / 2.5812 ± 0.028 rookie (all 12 circuits) | **2.5 – 4.0** — the §3 target, **advanced** §4 | **Yes — primary** |
| Top-team win share | median **58.6%**; min 35.0% (2012); max 95.5% (2023) | **57.9%** ± 3.2 pro / 60.8% ± 3.2 rookie (4-circuit gated sample, n=240); **65.0%** ± 2.2 pro / 71.9% ± 2.1 rookie (all 12 circuits) | **0.35 – 0.55** target; staged at **≤ 0.90** (§4) | **Yes** |
| Distinct winners / season | median **3**, range 2–6 | **8** pro / 7 rookie (4-circuit, n=240); **7** both difficulties (all 12) | **≥ 4** | **Yes** |
| Grid↔finish Spearman ρ | **0.779** ± 0.009 classified; 0.628 with DNFs | **0.7336** pro / 0.7617 rookie (4-circuit, n=240); **0.7579** pro / 0.7862 rookie (all 12) | **0.60 – 0.80** (the §3 target, reached early — §4) | **Yes** |
| Mechanical DNF / car-race | **9.8pp** of an 18.4% total DNF rate (2014–22) | **5.33%** pro / 5.56% rookie (4-circuit, n=240); **4.73%** / 4.99% (all 12). Historical pooled figure **4.67%** ± 0.12 (n = 28,800 car-races) | **6 – 10%** | **Yes** — but not met; assertion skipped, see §4 |
| Per-circuit \|Δpos\| ratio | **1.47× – 2.67×** | no longer 1.00× — circuits are no longer identical (§8), but this ratio was not re-measured by the overtaking work; the differentiation that *was* measured is the per-circuit clearing-failure rate in §9 | **1.5 – 2.5×** | **Yes** |
| Pace-rank ↔ finish correlation (anti-lottery) | — | **0.9636** pro / 0.9152 rookie (4-circuit, n=240); 0.9636 / 0.9152–0.9394 (all 12) | **≥ 0.90** — final, never to be widened | **Yes** |
| Pit lane time loss | 19.7 – 23.8s (2,106 green-flag stops) | 22.0s | 19.5 – 24.0s | Yes |
| Recorded overtake events | not computable — see §5 | **33.3** pro / 33.1 rookie (4-circuit, n=240); 36.7 / 36.8 (all 12). Was 46.3 before overtaking became durable. §5 forbids gating it; it is a **calibration anchor only** | — | **No — diagnostic only** |
| Clearing failure rate, hardest circuit (Harbour Lights, 0.4 s/lap adv) | no published data (§6) | **0.450** ± 0.045 (n=120); 0.550 ± 0.045 on a disjoint seed stream | design target **0.60 – 0.75** (spec §6.1) — **not met**; gated at **> 0.30** | **Yes**, at the reduced bar; the real target is committed **skipped** |
| Clearing failure rate, median circuit | no published data (§6) | **0.008** ± 0.008 (n=120) | design target **0.15 – 0.25** (spec §6.1) — **not met**, and not reachable by any constant (§7) | **No** — committed skipped |
| Laps to clear, 0.3–0.5 s/lap advantage | no published data (§6) | median **2** at every advantage in the bracket and every `overtaking.base` in [0, 0.45] | design target **3 – 8** (spec §6.1) — **not met**; partly a metric artefact (§9) | **No** — committed skipped |
| Hard-vs-easy clearing differentiation | — | pooled hard **0.236** ± 0.022 vs pooled easy **0.003** ± 0.003 (n=360 each), difference **0.233** ± 0.022 | **> 0.10** | **Yes** — 6.0 SE of margin |

**Two deliberate omissions.**

*Pole-position win rate.* Real F1 is **51.5%** ± 2.2pp (2000–2025), rising to 55.4% since 2022.
It is not a band here because **this game has no qualifying** — the starting grid is the fixed
order in `drivers.json`. The metric is meaningless until qualifying exists, and its absence is
itself a design gap worth recording.

*Overtakes per race.* See §5. The metric is not gateable.

## 4. Staged gates

Several §3 targets are **not reachable by data alone**, so gating on them today would ship a
specification whose own tests fail. The grid sensitivity search established why (§7). Those gates
therefore tighten as the work lands. The values in `tuning.json._regressionBands` are always the
**current stage**, never the target — a staged floor must not be read as a goal.

| After | Top-team win share | Distinct winners | Mean \|grid−finish\| | Grid↔finish ρ |
|---|---|---|---|---|
| Pre-competitive-grid | ≤ 0.97 (behaviour then) | ≥ 2 | **1.75 – 4.0** | **0.78 – 0.90** |
| The competitive-grid plan (**landed, met**) | **≤ 0.90** — measured **0.846** pro / **0.881** rookie, 12 circuits | **≥ 4** — measured **7–8** | 1.75 – 4.0 — measured 2.859 / 2.582 | **0.60 – 0.80** (the §3 target, reached early — see below); measured **0.753** / **0.785** |
| The overtaking-race-time plan (**landed, met**) | ≤ 0.90 — measured **0.579** (4-circuit, n=240) / **0.650** (all 12), pro | ≥ 4 — measured **8** / 7 | **2.5 – 4.0** — **advanced to the §3 target** on measurement; 2.9896 ± 0.043 gated sample, 8 SE over the floor | 0.60 – 0.80 — measured **0.734** / 0.758 |
| The race-incidents plan | **0.35 – 0.55** | ≥ 4 | 2.5 – 4.0 (already advanced) | 0.60 – 0.80 |

**Why \|Δpos\| and ρ were staged rather than simply banded at their §3 values.** Before the
competitive-grid change the simulation measured \|Δpos\| **1.83 – 2.06** and ρ **0.834 – 0.856**
(four-circuit samples, both difficulties, n = 120–240), outside §3's 2.5–4.0 and 0.60–0.80 in both
cases. Both gaps had the same cause as the win-share gap — §7's "the simulation has no chaos" —
and were assigned to the race-incidents plan.

**Measured correction (competitive-grid plan).** Narrowing the car spread from 1.482 to 0.674 s/lap
moved both metrics into their §3 target bands on its own, which this section did not predict. Six
independent n=240 pro samples on the four-circuit sample measure \|Δpos\| **2.803 – 2.968**
(± 0.041–0.043) and ρ **0.7357 – 0.7593** (mean 0.7479). Both now sit inside §3's 2.5–4.0 and
0.60–0.80. ρ therefore **advanced straight to its final §3 band**: the old staged floor of 0.78 is
no longer satisfiable and holding it would gate against realism, because the metric moved *toward*
real F1's 0.779, not away from it. Note the net effect is a **tightening**, not a loosening — the
ceiling drops 0.90 → 0.80 — and the anti-lottery job the 0.78 floor was doing is carried by
`minPaceRankCorrelation` (measured 0.9636) plus the oracle's own 0.60 floor.

**`meanAbsPosChange` has since been advanced to \[2.5, 4.0\], its §3 target** (2026-08-22,
overtaking-race-time plan). The competitive-grid plan left it staged at \[1.75, 4.0\] because
advancing it was outside that plan's remit, not because the measurement was short. Durable
overtaking then raised it further, to **2.9896 ± 0.043** pro on the 4-circuit gated sample
(n=240) and 2.8140 ± 0.029 pro over all 12 circuits, and at the n=120 the assertion actually
runs the floor has **8 SE** of margin. Two things on the record with it: this is a tightening
to the target and not past it, per the rule below; and **rookie over all 12 circuits measures
2.5812 ± 0.028**, only 2.9 naive SE above the floor, so a future rookie assertion must
re-measure rather than inherit this band — `monteCarloHarness`'s SE is known to understate
(positions within a race are a permutation, so they are negatively coupled).

Beyond these two, the staged bands **must not be loosened**: a \|Δpos\| floor of 1.5 would let a
genuine *regression* in churn pass CI while still violating this oracle, which is how a staged gate
turns into no gate at all. A band may only ever be advanced to its §3 target, never past it.

**The anti-lottery gate held under durable overtaking, which was the specific worry.** Making passes
change `raceTime` could in principle have decoupled results from pace — a lottery. It did not:
`paceRankCorrelation` measures **0.9636** at pro, **identical** to the pre-change figure, on both the
4-circuit gated sample and all 12 circuits. Results still reflect car-pace ordering; they now reflect
on-track order as well. One caveat for the record: **rookie measures 0.9152–0.9394**, above the 0.90
floor but with only ~1.5–4pp of margin against a metric with no computed SE here. The assertion runs
at pro, so the shipped gate is comfortable, but a rookie assertion should not be added without
measuring its margin first.

Not staged, and not to be widened: `minPaceRankCorrelation` (0.90, met) and
`mechanicalDnfPerCarRace` (§3's 0.06–0.10, **not** met — the sim measures **4.67% ± 0.12pp** pooled over 28,800
car-races, 11 SE below the floor). The DNF assertion is committed skipped, owned by the race-incidents plan.

Each step must be met before the next begins. Do not weaken a gate that has already been met.

**How the win-share gate is measured — this qualification is part of the band.** The figures above
are **field-wide**: pooled over a multi-circuit sample at a single stated difficulty. They are
**not** per-circuit-per-difficulty ceilings, and asserting them that way is invalid. An earlier
version of this section stated `≤ 0.97` unconditionally, which is false as written: on the **old**
grid, measured on a single-circuit fixture, apex's win rate at **rookie was 0.99** (n=100), while
the same cars measured across a 4-circuit sample at pro were **0.921** ± 1.74pp (n=240,
`tests/engine/monteCarloHarness.ts`). Both figures are pre-competitive-grid and are kept here only
as the evidence for the qualification — the current values are in §3. Single-circuit samples are
systematically more
deterministic — one circuit means one lap count, one rain probability and one strategy pattern, so
the disruption that lets a second team win is absent. Any test asserting a win-share band must
therefore state its sample and difficulty, and must pool at least four circuits.

## 5. Why overtake counts are not a band

"Overtakes per race" is two different metrics differing by roughly 2×, and neither can gate this
simulation.

- **Definitional.** Tracing Insights — the only source publishing its method (on-track passes for
  position; excludes lap 1, safety-car periods, pit-lane moves, team orders and lapped traffic) —
  gives **40.25/race for 2022** and 37 for 2021. Aggregators with unpublished methods report
  Las Vegas at 99 and Zandvoort at 78.3.
- **Not computable from results data.** The archive holds no lap-by-lap positions, so the real
  figure cannot be recomputed independently.
- **The simulation's own count is not measuring racing.** It records **46.3 events** per race
  against **1.88** mean positions changed — 3.2 to 4.7 recorded "overtakes" per net position
  change, and a meaningful share of even those 14-of-20 cars finishing off their grid slot comes
  from the 0.7–1.6 DNFs per race rather than from passing.

`|grid − finish|` replaces it: unambiguous, computable in both the simulation and the real
archive, and a direct measure of how much racing actually happened. Keep emitting the event count
as a diagnostic — it is useful for spotting a mechanic that has stopped firing — but do not assert
on it.

## 6. Figures deliberately excluded as too weakly sourced to gate

Recorded so that nobody re-derives them and believes they are validated.

| Figure | Best available | Why it cannot gate |
|---|---|---|
| Hardest:easiest circuit **overtaking** ratio | web sources bound it 2.8× – 13.5× | No per-circuit table exists on the strict definition. The computed \|Δpos\| ratio (1.47–2.67×) is a *poor proxy*: **Monaco is not an outlier** (2.59 vs a 35-circuit median of 3.00), because pit strategy, safety cars and retirements churn positions circuit-independently. |
| Frequency and duration of a faster car being stuck | no published data at all | The dirty-air *penalty* is well sourced; the *frequency* is not. Any target here is a design choice, not realism. |
| Cost of a failed passing attempt | none | Pure game lever. |
| Dirty-air time loss | ~0.018–0.019 s per second of following distance; 1.5–2.0 s/lap in a documented trapped case. A 2022-regulations study (arXiv 2608.03192, 100,486 laps) found the ground-effect rules did **not** measurably reduce it (p = 0.803). | Sourced well enough to *design* against, not precise enough to gate. |

## 7. What the simulation's structure implies — read this before tuning

Three measured structural facts constrain every balance change.

**Every pace edge is multi-sigma, so pace is near-deterministic over a race distance.** Voss's
0.06 s/lap edge over Rossi is 3.36s across 56 laps against a noise SD of 0.97s — **3.45σ before
any car advantage exists.** The shipped car spread is 8.9σ. This is why the top-team win share is
95% and why closing the front-row gap to *zero* only reduces it to 89.0%.

**Win-share sensitivity is a plateau, not a curve.** Measured, n=1000/point:

| Apex→2nd gap (s/lap) | 0.000 | 0.010 | 0.030 | 0.050 | 0.080 | 0.180 (shipped) |
|---|---|---|---|---|---|---|
| Apex win share | 89.0% | 91.9% | 93.4% | 94.8% | 96.8% | 97.6% |

Sensitivity is roughly 48pp per s/lap and *decreasing* toward zero. Compressing the whole grid
asymptotes near **81%**. The decomposition: shipped 96.0% → equal cars, shipped drivers **81.5%**
→ shipped cars, equal drivers 78.1% → both equal 2.4%. **81.5% is the hard floor of any
`cars.json`-only change**; car and driver spread contribute about equally and reinforce, because
Apex has both the best car and the best driver.

**The simulation has no chaos.** `tuning.incidents.dnfPerLap` and `driverErrorPerLap` are both
`0.0` **and have no consumer in `src/engine/`**. There is no safety car, no red flag, no
first-lap incident and no dry-weather driver error. The only stochastic disruption is wet-weather
spins — which is why, with rain disabled, only **two** teams ever win. In real F1 a 0.2 s/lap edge
is not decisive precisely because of the chaos this model lacks. **Adding it is the correct lever;
raising `noise.sigmaPerSector` is not** — reaching the band that way needs 0.8 (a 10× increase,
±2.4 s/lap of unexplained swing), which destroys legibility. And race length is the wrong lever in
the wrong direction: a pace advantage grows as L while noise grows as √L, so *shorter* races are
more deterministic.

**Post-competitive-grid: the plateau held, and it is now the binding constraint.** The numbers
in this section were measured on the old 1.482 s/lap spread; the competitive-grid change narrowed
it to 0.674 s/lap and landed at **84.6%** (pro, 12 circuits) — consistent with the predicted 81.5%
floor plus the residual driver spread this plan deliberately left alone. The table's shape is
therefore unrevised and still correct: the remaining 0.846 → 0.35–0.55 distance is **not** reachable
by any further `cars.json` edit, and belongs entirely to the race-incidents plan.

**The circuit traffic penalty inflates on easy circuits without ever binding — and that is the
resolution, not a defect to tune away.** The layer-2 traffic penalty is scaled per circuit and
per sector by `traffic.hardCircuitScale / max(circuit.overtakingFactor[sector], overtaking.factorFloor)`,
which is what gives track position defensive value: a hard circuit holds a follower up *harder*,
not merely for longer. Scaling only the *cap* does nothing — `traffic.penalty / 3` is 5–20× smaller
than `paceAdv * effectiveCap` at the advantages that matter, so `Math.min` always returned the flat
penalty and the cap never applied.

The measured limitation: **no value of `hardCircuitScale` both differentiates circuits and holds
Veloce near its original 0.040 s/sector.** Differentiation needs ≥2.0; Veloce stays within ~15% of
0.040 only at ≤0.7, where the easy-vs-hard failure-rate difference is 0.000. At the shipped 2.5,
Veloce's per-sector penalty runs 1.9× / 4.2× / 3.6× its old flat value.

That reads alarming and is not, because the behaviour is right even though the constant inflates:

Failure rate = the fraction of trials where a car 0.4 s/lap faster never reached clear air within
15 laps. n=60 trials per cell, so the resolution is 1/60 = 0.017 and the binomial SE at p≈0 is
0.000-0.028:

| `hardCircuitScale` | 1.0 | 1.5 | 2.0 | **2.5** | 3.0 | 4.0 |
|---|---|---|---|---|---|---|
| Veloce failure rate | 0.000 | 0.000 | 0.000 | **0.000** | 0.000 | 0.000 |
| Harbour Lights failure rate | 0.000 | 0.050 | 0.317 | **0.500** | 0.500 | 0.500 |

**No Veloce blocking was observed at any scale tested, including 4.0** — 0/60 trials at each cell.
That is a reading on the metric's floor, not a proof of zero: 0/60 is consistent with a true rate
up to ~0.049 at 95% confidence, so the honest claim is that if the easy circuit blocks anyone it
does so rarely enough to be invisible at this sample size, not that it never does. The mechanism
that explains it is that `paceAdv * effectiveCap` caps the penalty where the pace advantage is
real, so on an easy circuit the larger raw number is rarely the binding term; it binds where
`overtakingFactor` is low, which is where it should. Two limits on how far this table can be
pushed: Harbour Lights saturating at exactly 0.500 across 2.5/3.0/4.0 is likely the same
instrument ceiling seen from the other side, and both columns are near an end of the scale — so
read the table as *ordering* evidence, not as calibrated rates. The takeaway stands regardless:
**judge this mechanism by failure rate per circuit, not by seconds-per-sector.** 2.5 is chosen
because the effect saturates there (3.0 and 4.0 buy nothing) and it clears the differentiation bar
by 3.8 SE, where 2.0 clears it by only 1.1 SE.

Two corollaries for anyone tuning this. Raising `traffic.penalty` is **not** the equivalent lever —
it lifts every circuit together and leaves the differentiation flat. And the measurement itself is
only trustworthy with a non-zero start gap and an advantage spread evenly across all three sectors:
`initRace` puts every car on `raceTime` 0, and `lapModel` gives each sector a single governing car
facet, so a level start or a single-facet advantage measures opening-sector noise rather than
overtaking (both produced a ceiling of 0.033 or less, *below* the bar being asserted).

**`overtaking.base` is not the lever for the clearing targets, and here is the whole search.**
Spec §6.1 sets three design targets for a car 0.3–0.5 s/lap faster: **3–8 laps** to clear, a
**15–25%** failure rate on a median circuit, **60–75%** at Harbour Lights. All three are missed low
(§3). The obvious candidate constant was `overtaking.base`, on the theory that switching
`resolveOvertakes` from the global `sectorFactor` to the per-circuit `overtakingFactor` had moved the
effective probability. **That theory is measurably wrong**: the 12-circuit mean of
`circuit.overtakingFactor` is **0.6055** against the old global mean of **0.6000**. The switch moved
the *spread* (0.217 at Harbour Lights to 0.867 at Veloce), not the average, so there was never a
mean-shift for `base` to compensate.

Swept anyway, at advantage 0.4, n=60 per cell (resolution 1/60 = 0.017):

| `overtaking.base` | 0.00 | 0.05 | 0.10 | 0.15 | **0.22** | 0.30 | 0.45 |
|---|---|---|---|---|---|---|---|
| Harbour Lights failure rate | 0.617 | 0.583 | 0.583 | 0.567 | **0.500** | 0.433 | 0.350 |
| median-circuit failure rate | 0.000 | 0.008 | 0.017 | 0.008 | **0.000** | 0.000 | 0.000 |
| median laps to clear (every circuit) | 2 | 2 | 2 | 2 | **2** | 2 | 2 |
| overtakes/race (4-circuit, n=240, pro) | — | 32.6 | 33.6 | — | **36.7** | — | — |

Read the columns, not one cell. Harbour Lights responds monotonically and its 60–75% band is
reachable — but **only at `base` exactly 0**, which deletes the baseline-pass mechanism entirely,
still misses the other two targets, and drags the overtakes/race calibration anchor further from its
historical 46.3. The median-circuit rate never leaves the metric's resolution floor and shows no
trend at all; the median laps-to-clear never leaves 2. `base` was therefore **left at 0.22**.

Why it cannot work, which is the part to remember. `prob` adds two terms:
`base × sectorEase` and `paceAdv × paceMultiplier × sectorEase`. At the advantage these targets are
defined at, `paceAdv × paceMultiplier` ≈ 0.40 per sector against `base`'s 0.22 — so `base`
contributes about 35% of the pass chance and zeroing it removes about 35%. Sweeping
`paceMultiplier` instead over 0.5 – 3.0, a **6× range**, also tops out at a median-circuit failure
rate of **0.017**. What does reach the targets is suppressing passing outright (`base` 0 **and**
`paceMultiplier` 0), where the median-circuit rate is **0.783** and Harbour Lights is **0.950**. The
instrument therefore has ample dynamic range — 0.00 to 0.95 — and the targets are simply **not a
function of any single constant in `tuning.overtaking`**. Closing this gap is a mechanism question,
not a calibration one, and the un-weakened targets sit committed-skipped in
`tests/engine/overtakeRaceTime.test.ts` as its acceptance test.

One honest caveat on the laps-to-clear miss specifically: the instrument's own zero-blocking floor
is already ~2 laps by construction. The chaser starts 0.3s back and "cleared" requires 1.0s of clear
air, so 1.3s of net gain at 0.4 s/lap is 3.25 laps of pure pace with no blocking whatsoever, and
`clearedLaps` is an integer lap index. A median inside [3, 8] therefore needs blocking to add a
whole lap to the **median** trial, which on a median circuit it does not. Part of that particular
miss is a metric-definition artefact rather than a balance fact — which is a further reason not to
have fitted a constant to it.

## 8. Dead data — fields with no consumer in `src/`

**Rewritten 2026-08-22.** This section previously listed nine fields and made three byte-identity
claims. The overtaking-race-time plan falsified part of it by giving one field a consumer, so it is
rewritten in full rather than patched — but nothing is deleted, because the *reason* the list existed
(authored per-circuit values strongly implying a variety that did not exist) is the whole
justification for the gates that now protect the fix.

### Resolved: `circuit.overtakingFactor` is consumed

It has **two** consumers in `src/engine/race.ts`, both added by the overtaking-race-time plan:

- `:308` — `resolveOvertakes` takes its per-sector pass difficulty from
  `config.circuit.overtakingFactor[sector]`. It previously read the global
  `tuning.overtaking.sectorFactor`, a constant `[1.0, 0.25, 0.55]` identical for every circuit,
  sitting in the exact slot the per-circuit field belongs in.
- `:175` — the layer-2 traffic penalty is scaled by
  `traffic.hardCircuitScale / max(circuit.overtakingFactor[sector], overtaking.factorFloor)`, which
  is what gives track position defensive value per circuit (§7).

`tuning.overtaking.sectorFactor` was the *only* thing standing in its place, so with that slot taken
the global constant became dead in turn and has been **deleted** from `tuning.json`,
`validators.ts` and `types.ts`. Grep-verified: no consumer remains anywhere in `src/` or `tests/`.

### Still dead — eight fields

| Field | Where the behaviour actually comes from | Owner |
|---|---|---|
| `circuit.carSensitivity` | global `tuning.carPerformance.sectorSplit` | unassigned |
| `circuit.driverSensitivity` | global `tuning.driverPerformance.sectorSplit` | unassigned |
| `circuit.pitLaneTimeLoss` | global `tuning.pit.laneTimeLoss` | unassigned |
| path `sectorBoundaries`, `pitEntry`, `pitExit` | unread. They appear in `TrackCanvas.tsx:21`'s type for the canvas-local `CIRCUIT_PATHS` table but are never read from it, so pit entry and exit are still never drawn | unassigned |
| `tuning.incidents.dnfPerLap`, `driverErrorPerLap` | unread; no consumer exists | **the race-incidents plan** ("Plan B") |
| `team.developmentRate` | read by `src/state/seasonStore.ts` (the progression system) only, never by the engine | by design |

Grep-verified 2026-08-22: the first three and the two `incidents` keys have **zero** references
anywhere in `src/` outside `validators.ts` and `types.ts`.

**`circuit.sectorBase` remains the subtler case.** It *is* read — by `lapModel.ts:20` and, for
display only, by `TrackCanvas.tsx:192` — but as a common additive offset applied to every car it
cannot affect any gap, position or overtake, only absolute clock time. Verified: swapping
`sectorBase` between circuits produces byte-identical order, gaps and overtake counts. That claim
is unaffected by the overtaking work and still stands.

### The byte-identity claims, corrected

The previous version of this section asserted three things. Two are now **false**, and both are
false *because the fix landed* — they are recorded here rather than deleted so that nobody
re-derives the old conclusion from the old data.

| Claim, as it used to read | Status now |
|---|---|
| "Scrambling all four dead circuit fields yields byte-identical races." | **False for `overtakingFactor`**; still true for the other three (`carSensitivity`, `driverSensitivity`, `pitLaneTimeLoss`), which have no consumer. |
| "Aurora and Kaido — same 50 laps, different `sectorBase`, `overtakingFactor` and `pitLaneTimeLoss` — produce bit-identical results on every metric across 400 seeds." | **False.** They differ measurably, and by design: at a 0.4 s/lap advantage the clearing failure rate is Aurora **0.008 ± 0.008** against Kaido **0.192 ± 0.036** (n=120 each). That pair was the cleanest possible demonstration of the defect and is now the cleanest demonstration of the fix. |
| "Swapping `sectorBase` yields identical results." | **Still true** (see above). |
| "The only per-circuit inputs that change racing today are `laps` and `rainProbability`/`weatherBias`." | **Superseded.** `overtakingFactor` now changes racing too, calendar-wide: pooled over the three hardest circuits the clearing failure rate is **0.236 ± 0.022** against **0.003 ± 0.003** over the three easiest (n=360 each). |

## 9. Overtaking was decorative — what was wrong, and what it costs now

**Rewritten 2026-08-22 (overtaking-race-time plan). This section used to assert, in the present
tense, that overtaking has no effect on results. That is no longer true.** It is rewritten rather
than deleted because the defect is the entire reason the gates in
`tests/engine/overtakeRaceTime.test.ts` exist, and because one widely-quoted number in this
document was inflated by it.

### 9.1 The defect, stated precisely (historical)

`resolveOvertakes` selected the single most eligible pair per sector boundary, rolled a probability
shaped by `racecraft` and `tuning.overtaking`, then swapped two slots in a **local array copy** and
pushed an `OvertakeEvent`. **It never modified `raceTime`.** Every downstream consumer re-sorts by
`raceTime` — the traffic penalty, dirty air, final classification, and `resolveOvertakes` itself on
its next call — so the swapped order was never read. Only the event survived, feeding commentary and
the UI. Position was determined entirely by cumulative `raceTime`. Consequences:

- `driver.facets.racecraft` was worth **exactly zero**, on both attack and defence.
- The entire `tuning.overtaking` block affected nothing but the commentary feed.
- **A faster car always eventually got past.** The traffic penalty was capped at
  `paceAdv × trafficCap` (0.7), so at least 30% of a pace advantage netted through every sector.
  Nobody could be genuinely stuck behind a car they were faster than — the defining strategic
  reality of a street circuit.

Two measured refinements, both still worth knowing. **The cap made blocking cheap, not short**:
10+ lap held-up runs were common (P(run ≥ 10 sectors) = 0.15; 2.4% ran 30+ sectors; the worst
observed was an entire race), because the longest-stuck pairs are the ones with the *smallest*
advantage. And **traffic penalties did not cascade** — every gap in the traffic pass is computed from
the unpenalised ordering, so a car's penalty never widened the gap seen by the car behind it in the
same sector. Measured cost of all that blocking: **0.58s per car per entire race** (worst 5.9s),
against roughly 24.4s for a pit stop. Blocking was effectively free.

### 9.2 What changed

Three edits in `src/engine/race.ts`:

1. **The pass is durable.** `resolveOvertakes` swaps the pair's `raceTime`, not their array slots, so
   the next sort preserves the pass. A swap conserves total race time; the only accounted addition is
   one `overtaking.fightCost` (0.10s) charged to the **overtaken car alone**. Charging both inverted
   the value of racecraft — the brain that passed most was billed most — and the attacker has already
   paid through the traffic penalty accumulated while following.
2. **Being stuck is possible.** The traffic-penalty *magnitude* is scaled per circuit and per sector
   by `traffic.hardCircuitScale / max(circuit.overtakingFactor[sector], overtaking.factorFloor)`.
   Scaling only the *cap*, as originally designed, does nothing: `traffic.penalty / 3` is 5–20×
   smaller than `paceAdv × effectiveCap` at the advantages that matter, so `Math.min` always returned
   the flat penalty. See §7 for the measured limitation this carries.
3. **Circuits differ.** `sectorEase` reads `circuit.overtakingFactor` rather than the global
   constant that shadowed it (§8).

`racecraft` is consequently worth something on both attack and defence for the first time.

### 9.3 The measured clearing behaviour

Measured with `measureClearing`: two otherwise-identical cars, the chaser 0.4 s/lap faster spread
evenly across all three sectors, starting 0.3s back; "cleared" means ahead on `raceTime` **and** more
than `traffic.gapThreshold` (1.0s) of clear air; 15 laps of patience. Both columns are measured under
the **same fixed instrument**, so they are directly comparable — the pre-change column was taken by
checking out the previous `race.ts` against the current instrument, because the figures originally
recorded for it were taken with a broken one.

| | pre-change | post-change | `overtakingFactor` mean |
|---|---|---|---|
| Veloce | fail 0.000, mean 3.350 laps | fail **0.000**, mean 2.042 | 0.867 |
| Bengaluru | fail 0.000, mean 3.375 | fail **0.067**, mean 1.839 | 0.433 |
| Kaido | (indistinguishable) | fail **0.192**, mean 2.031 | 0.333 |
| Harbour Lights | fail 0.000, mean 3.375 | fail **0.450**, mean 1.697 | 0.217 |

**`meanLapsToClear` is conditional on clearing and must never be read alone.** Harbour Lights' mean
*fell* while its failure rate *rose* to 0.450, because the trials that clear now convert immediately
— a durable pass is not erased by the next sort — while 45% never clear at all. Read by itself the
mean says the circuit got easier. Always quote it beside the failure rate.

Pre-change the circuits were **indistinguishable**: three circuits with `overtakingFactor` spanning
0.217 to 0.867 measured within 0.025 laps of each other, which is the direct evidence for §8's
shadowing finding. Post-change they separate in the authored difficulty order. That separation, not
the absolute levels, is what the active gates assert — see §7 for why the absolute levels
(spec §6.1's 3–8 laps, 15–25% median, 60–75% hardest) are **all missed low** and are not reachable by
any constant in `tuning.overtaking`. The un-weakened targets are committed **skipped** in the suite.

### 9.4 One of the numbers this defect inflated: the OPTIMAL brain's strategic value

`tests/engine/strategy.test.ts` gated OPTIMAL at **≥ 1.5 finishing positions** ahead of NAIVE against
a measured **1.59** — and that figure was earned in a world where track position was free. OPTIMAL's
edge is a surgical undercut that rejoins *behind* cars and drives back through them, so when a pass
costs nothing the edge is pure `raceTime` with no toll to pay. **The gate was certifying the defect
rather than the brain.** Measured decomposition, 2000 races per step:

| configuration | OPTIMAL gain | SMART gain |
|---|---|---|
| pre-change (overtaking cosmetic) | **1.59** | 3.89 |
| passes made durable (`raceTime` swap), no fight cost | 0.87 | 3.69 |
| + `fightCost` on the overtaken car only | 0.19 | 3.59 |
| + traffic penalty scaled per circuit (`hardCircuitScale` 2.5) | **0.17** | 3.60 |

SMART is unaffected across every step (3.89 → 3.60), which is the evidence that this is specific to a
brain whose advantage was *positional* rather than a general dilution of strategy value. Had both
fallen, the honest conclusion would have been that the change broke strategy value in general.

The gate was lowered to **0.05** on this evidence — and it was fixed by improving the *measurement*,
not by lowering a threshold to fit a noisy number. At the original n=2000 the gain is 0.175 ± 0.086,
under which *no* positive gate had a safe margin. Switching to **paired per-race differences** (all
three brains in the same race, so seed-to-seed race difficulty cancels) is what made a usable SE
available, and n was raised to 8000: measured **0.163 ± 0.043**, replicating at 0.228 ± 0.043, so the
gate sits 2.6 SE under the lower estimate and 4.1 SE under the higher.

**Recorded as a known limitation with the owner's decision attached, not as a success.** 0.17
positions is a weak result for a brain named OPTIMAL, and lowering the gate accepts it. The owner's
ruling is that this is the honest number now that track position costs something, and that teaching
the brain to price traffic — to prefer a rejoin into clear air over a nominally faster one into a
queue — is separate, later work. One known weakness of the 0.05 gate, accepted deliberately: it has
low discriminating power against the specific regression it documents, since the two-sided
`fightCost` measures 0.13 and would still pass. It catches "OPTIMAL stops beating NAIVE", not
"the one-sided `fightCost` was reverted"; a tighter gate would be fitted to one counterfactual.

### 9.5 What overtaking still does not do

- The field-wide **overtake event count fell 46.3 → 33.3** (4-circuit, n=240, pro) as a side effect,
  since a durable pass removes the pair from immediate re-passing. Per §5 this is a **calibration
  anchor and never a gate**.
- Spec §6.1's absolute clearing targets are **not met** (§3, §7).
- No safety car, no red flag, no first-lap incident, no dry-weather driver error — §7's "the
  simulation has no chaos" is unchanged by this work, and `tuning.incidents` is still dead (§8).

## 10. Invariants that must never break

Unlike the bands, these are not negotiable and are not subject to rebalancing.

1. **Determinism.** Same seed plus same inputs produces a byte-identical race. Verified: seed 4242
   twice gives JSON-identical results on every metric; 4243 differs. No `Math.random()` in
   `src/engine/`; all randomness flows through the injected seeded RNG.
2. **Engine purity.** `src/engine/` imports nothing from `state/`, `ui/` or `canvas/`.
3. **RNG stream stability under refactor.** Conditional `rng()` calls must not change draw
   ordering. Existing guards (`!updated.retired`, `perLap > 0`) exist solely for this and must not
   be "simplified" away.
4. **No facet may exceed 100.** `facetToRating9` inverts above 100, so 101 makes a car *slower* —
   a bonus silently becoming a penalty. Note `reliability` has a **tighter** bound: at exactly 100,
   `mechanicalFailure`'s `perLap` becomes 0 and the `perLap > 0` short-circuit skips the roll for
   every sector of every race, making the car permanently invulnerable. Anything writing
   `reliability` must cap below 100.
5. **Balance values live in `src/data/*.json`.** Never in logic.

## 11. Known-broken tests

**Reviewed 2026-08-22.** Everything this section previously listed has been fixed; it is kept as the
record of what was wrong, because §1's warning about unattributed reference numbers is the reason.

| Was broken | Status |
|---|---|
| `tests/engine/monteCarlo.test.ts` asserted mean overtakes **20–70**, contradicting `_regressionBands`' 12–22, and failed high on dry Harbour Lights (76.6) | **Fixed.** Both the assertion and the `meanOvertakesPerRace`/`minOvertakesPerRace` keys are gone. §5 forbids gating the metric; the harness still emits it as a diagnostic and §3 records it as a calibration anchor |
| Its "every race has at least 2 overtakes" assertion was **false on real circuits** (Silverpark recorded 0) | **Fixed** — removed with the band above |
| Both passed only because they ran `REFERENCE_CIRCUIT`, a 30-lap rain-free fixture no shipped circuit resembles | **Fixed.** `monteCarlo.test.ts` runs a 4-circuit `SAMPLE` (`monsoon_bay`, `sol_desert`, `harbour_lights`, `veloce`) spanning a rain-heavy round, a dry desert round, the street circuit and a high-speed round. `REFERENCE_CIRCUIT` survives only in genuinely single-mechanism unit tests, where a synthetic fixture is the right tool |
| `_regressionBands` in `tuning.json` should be replaced by the §3 bands | **Done.** It now holds exactly the §3-derived gates, with its own `_note` pointing here for provenance and staging |

Two live items that are **not** broken tests but must not be mistaken for passing evidence:

- `mechanicalDnfPerCarRace`'s assertion is **committed skipped** — §3's 6–10% band is real F1's and
  the sim measures roughly 4.7–5.6%. Owned by the race-incidents plan (§4).
- Spec §6.1's three clearing targets are **committed skipped** in
  `tests/engine/overtakeRaceTime.test.ts`. All three are missed low and §7 shows they are not
  reachable by any constant in `tuning.overtaking`. The active gates beside them assert the
  per-circuit *differentiation* that was actually achieved, at a reduced absolute bar that is
  labelled as such.

## 12. How to re-measure

Every figure in §3 and §7 is reproducible. Drive the real engine (`initRace`/`stepSector`) with
fixed seeds. Two traps:

- **`stepSector` never AI-manages the player's car.** A real `playerDriverId` leaves one car on its
  starting tyre in `neutral` all race, quietly skewing every field-wide statistic. Set
  `playerDriverId` to a non-existent id so every car is AI-driven, or feed the player the engine's
  own `aiDecision` each lap as a competent-player proxy. State which you used.
- **Report standard errors, never bare means.** Win share from 400 races has an SE of about
  2.5pp, so 400 races cannot distinguish 45% from 50%. Finishing-position SD is 2.8–4.8 depending
  on team, which is 3–4× larger than one might assume.
