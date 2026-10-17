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

| Metric | Real F1 | Sim at 2026-08-29 (post race-incidents) | Band | Gated? |
|---|---|---|---|---|
| Mean \|grid − finish\| | **2.97** ± 0.04 classified (2011–25); 3.70 with DNFs | all 12, n=720, two seed bases: **3.6190 / 3.5838** ± 0.028 pro, **3.4361 / 3.4343** ± 0.028 rookie. Incidents raised it from 2.86 | **2.5 – 4.0** | **Yes — primary.** Now nearer the 4.0 CEILING than the floor; anything further raising churn should re-measure |
| Top-team win share | median **58.6%**; min 35.0% (2012); max 95.5% (2023) | all 12, n=720, two seed bases: **58.75% / 56.81%** pro, **57.64% / 61.67%** rookie (SE 1.8pp) | **0.35 – 0.55**, now FINAL — the last staged ceiling to reach its target (2026-09-12) | **Yes.** 0.396–0.489 over 10 seed bases per cell, both difficulties, on both the 12-circuit calendar (n=720) and the 4-circuit gate sample (n=240). Fixed by raising the challengers (Rossi 94→96, Berg 90→93, Silva 85→88), not by flattening Voss — see §4 |
| Distinct winners / season | median **3**, range 2–6 | **7** on all four all-12 n=720 samples, both difficulties — unmoved by incidents | **≥ 4** | **Yes** |
| Grid↔finish Spearman ρ | **0.779** ± 0.009 classified; 0.628 with DNFs | all 12, n=720: **0.6277 / 0.6359** pro, **0.6540 / 0.6508** rookie | **0.60 – 0.80** | **Yes.** Incidents moved this from 0.75–0.79 down to 0.62–0.65, which **resolves the ceiling worry the previous revision flagged** and creates a mild FLOOR one instead: rookie's 0.6393 leaves 0.039 above 0.60. Note it moved further from real F1's 0.779 classified but closer to its 0.628 DNF-inclusive figure, which is the fairer comparison now that DNFs are realistic |
| Mechanical DNF / car-race | **9.8pp** of an 18.4% total DNF rate (2014–22) | all 12, n=720: **7.174% / 7.056%** pro, **7.417% / 7.042%** rookie, after `mechanicalFailure.baseChancePerLap` 0.008 → 0.012 | **6 – 10%** | **Yes — MET, and the assertion is UN-SKIPPED** (2026-08-29) against the same unwidened band |
| **Crashes / car-race** | **7.0pp** accident share (2014–22), computed in §3's own derivation | all 12, n=720: **6.535 / 6.451pp** pro, **6.319 / 6.507pp** rookie | **5 – 9pp** | **Yes — MET.** Solved backwards from the 7.0pp target via `driverErrorPerLap` 0.0105 and `terminalFraction` 0.20; moving either without rechecking that identity breaks this gate |
| **Safety cars / race** | ~0.6–0.7 (the owner's stated choice) | all 12, n=720: **0.551 / 0.535** pro, **0.518 / 0.553** rookie | **0.4 – 0.9** | **Yes — MET.** Band is wider than the crash band on purpose: this rate is a product of four inputs and inherits all their variance |
| **VSCs / race** | — (design choice, spec 2026-10-16 §1: SC 0.30/0.12 first, then VSC 0.25/0.40 by cause) | 4-circuit sample, n=240 per cell: pro 0.637/0.613, rookie 0.662/0.713 | **0.40 – 0.95** | **Yes** — sized [floor(0.7×min), ceil(1.3×max)] to 0.05 |
| **AI stops under a neutralisation / race** | — (smart/optimal box within 6 laps of the plan or at cliff ≥ 0.55; naive ignores) | 4-circuit sample, n=240 per cell: pro 3.183/3.829, rookie 4.267/3.517 | **2.20 – 5.55** | **Yes** — same sizing rule. Counts every AI stop on a boundary where a neutralisation is still out, reaction or not |
| Driver errors / race | not separately published | all 12, n=720: **5.18 / 5.24** pro, **5.08 / 5.28** rookie (field-wide, non-terminal plus terminal) | — | **No — diagnostic.** The gated consequence is the crash rate above |
| Per-circuit \|Δpos\| ratio | **1.47× – 2.67×** | **1.3454** mean over four seed bases (1.3066–1.3769, pro, n=200 per circuit) — **below the 1.5 floor, and the circuit-sensitivity plan moved it DOWN.** Reverting only the two `lapModel.ts` lines that plan changed measures **1.5238** (1.4952–1.5523) on the same seeds: inside the band. Per-circuit, wired, sorted: grand_savane 2.591, altiplano 2.639, sol_desert 2.651, veloce 2.718, silverpark 2.744, highland 2.815, costa_verde 2.835, aurora 2.897, monsoon_bay 3.033, bengaluru 3.045, kaido 3.455, harbour_lights 3.568 | **1.5 – 2.5×** — **NOT MET, and regressed** | **Yes**, but on a *fixed pair* and for a narrower purpose than the band. `tests/engine/circuitDifferentiation.test.ts` gates harbour_lights ÷ grand_savane at **> 1.15** (measured 1.2968 ± 0.0451 pro over six n=120 seed bases) as a floor against the calendar flattening. That gate **cannot** fail on a renormalising of the sensitivities — verified by mutation, which passes at 1.44 — so the wiring itself is guarded by the fingerprint pairs in that file, not by this ratio. See §7 and §4 for the mechanism |
| Pace-rank ↔ finish correlation (anti-lottery) | — | **0.9879** pro / **0.9152–0.9394** rookie post-incidents — it went UP, from 0.9636 / 0.9152. Chaos removed cars without decoupling results from pace, which is the reassuring result and the opposite of the lottery this gate exists to catch. **Read it narrowly.** The reference pace ranking is computed from the *global* `sectorSplit`, not from `circuit.carSensitivity`, so it is circuit-blind and disagrees with the engine's own per-circuit order on 9 of 12 circuits. An unmoved value therefore shows results are still tied to car quality **in general** — the lottery failure mode is absent — and is **not** evidence that per-circuit weighting left pace ordering untouched, which an earlier version of this row wrongly inferred. See `tests/engine/monteCarloHarness.ts` | **≥ 0.90** — final, never to be widened | **Yes** |
| Pit lane time loss, **calendar mean** | 19.7 – 23.8s (2,106 green-flag stops) — a population mean **across circuits** | **21.00s** exactly; per-circuit range **18.0 – 24.0s**, with three members below the band floor: veloce 18.0, harbour_lights 19.0, altiplano 19.0 | 19.5 – 24.0s, **on the mean** | **Yes.** The metric is the mean across the calendar, because that is the quantity the real-world figure was always derived from — real pit lanes do vary below 19.7s, and a per-circuit reading was never what the band measured. **This is a clarification of the metric, not a loosening of the band: both endpoints are untouched.** It is not precedent for widening a band to fit data — widening 19.5 to 18.0 would have been that, and was rejected. A spread gate (≥ 4.0s) sits beside it so the calendar cannot be flattened back |
| Recorded overtake events | not computable — see §5 | **33.3** pro / 33.1 rookie (4-circuit, n=240); 36.7 / 36.8 (all 12). Was 46.3 before overtaking became durable. §5 forbids gating it; it is a **calibration anchor only** | — | **No — diagnostic only** |
| Clearing failure rate, hardest circuit (Harbour Lights, 0.4 s/lap adv) | no published data (§6) | **0.450** ± 0.045 (n=120); 0.550 ± 0.045 on a disjoint seed stream | design target **0.60 – 0.75** (spec §6.1) — **not met**; gated at **> 0.30** | **Yes**, at the reduced bar; the real target is committed **skipped** |
| Clearing failure rate, median circuit | no published data (§6) | **0.008** ± 0.008 (n=120) | design target **0.15 – 0.25** (spec §6.1) — **not met**, and not reachable by any constant (§7) | **No** — committed skipped |
| Laps to clear, 0.3–0.5 s/lap advantage | no published data (§6) | median **2** on the median circuit at every advantage in the bracket and every `overtaking.base` in [0, 0.45]. **Not "every circuit":** harbour_lights measures median **1** at 0.4 and 0.5 s/lap advantage (n=120) — the median is taken over the trials that cleared, and on harbour_lights those convert immediately while 45% never clear at all, so a *lower* median there means a *harder* circuit; see the `meanLapsToClear`-is-conditional warning in §9.3 | design target **3 – 8** (spec §6.1) — **not met**; partly a metric artefact (§9) | **No** — committed skipped |
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
| The circuit-sensitivity plan (**landed; every *banded* metric met — but see the \|Δpos\|-ratio regression below**) | ≤ 0.90 — measured **0.567 / 0.592** pro, **0.642 / 0.600** rookie (all 12, n=720) | ≥ 4 — measured **7**, both difficulties | 2.5 – 4.0 (already advanced) — measured **2.863 / 2.837** pro, **2.618 / 2.581** rookie | 0.60 – 0.80 — measured **0.750 / 0.756** pro, **0.777 / 0.787** rookie |
| The race-incidents plan (**landed 2026-08-29; win share NOT met, every other band met**) | target **0.35 – 0.55** — measured **0.588 / 0.568** pro, **0.576 / 0.617** rookie. **Ceiling left at 0.90, deliberately not tightened** — superseded by the win-share plan below | ≥ 4 — measured **7** | 2.5 – 4.0 — measured **3.619 / 3.584** pro, **3.436 / 3.434** rookie (up from 2.86) | 0.60 – 0.80 — measured **0.628 / 0.636** pro, **0.654 / 0.651** rookie (down from 0.75–0.79) |

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

**The race-incidents plan missed the win-share band, and this is the argument §3 requires
(2026-08-29).**

Every band this plan owned except one is met, and the one it missed it did not move at all:

| Band | Before | After | Verdict |
|---|---|---|---|
| Mechanical DNF / car-race | 4.51–5.06% | **7.04–7.42%** | **MET** — assertion un-skipped |
| Crashes / car-race | 0 | **6.32–6.54pp** | **MET** vs a 7.0pp real-F1 anchor |
| Safety cars / race | 0 | **0.518–0.553** | **MET** |
| Distinct winners | 7 | 7 | met, unmoved |
| Mean \|Δpos\| | 2.86 | **3.43–3.62** | in band, now nearer the ceiling |
| Grid↔finish ρ | 0.75–0.79 | **0.63–0.65** | in band; ceiling worry resolved |
| `paceRankCorrelation` | 0.9636 | **0.9879** | met, and it went **up** |
| **Top-team win share** | 56.7–59.2% | **56.8–58.8%** | **MISSED (target 0.35–0.55)** — resolved 2026-09-12, see below |

**One magnitude did move, and for a reason unrelated to win share.** The spec proposed
`mechanicalFailure.baseChancePerLap` 0.008 → **0.014**; the value shipped is **0.012**. At 0.014 the
field-wide band is met (8.03–8.34%) but the *reliability* spec's per-team targets are not: the
fragile team (Halcyon, reliability 72) retires from ~19.5% of races against a 10–15% target. The two
specs looked irreconcilable until the cause was found — `tests/engine/mechanicalFailure.test.ts`
measured its per-team bands on a **56-lap** reference circuit while §3's band is calendar-wide (46.67
mean), and DNF probability goes as `1 - exp(-rate × laps)`, so the per-team figures were overstated
by ~20%. Measuring on a representative **47 laps**, `0.012` satisfies all three simultaneously:
Halcyon 14.5%, Zenith 3.3%, field-wide 7.04–7.42%. A per-team band is a claim about a typical race
and must be measured on a typical race length.

**The incident magnitudes were not touched to chase win share, in either direction**, per the spec's §2.1: they are
anchored to real F1 (7.0pp accidents, 6–10% mechanical DNF), and both raising them to force the band
and shaving them to protect a number are named there as the same defect. `paceRankCorrelation` rising
to 0.9879 is the evidence that nothing was bought with noise.

**Why chaos could not move it** — the finding, stated in full in §7: win-share concentration is a
**driver**-pace effect and incidents are driver-agnostic. `d_voss` alone wins **55.0%** of races and
two drivers take **86.2%**; `drivers.json` has a pace cliff at the top (96, 94, then 90, 86, 85), and
removing ~15% of the fastest pairing's races through DNFs does not change who is fastest in the
other 85%.

**So `topTeamWinRate`'s ceiling stays staged at 0.90 and is NOT advanced to 0.55.** Advancing it
would red the suite on a target no landed mechanism can reach. The remaining distance belongs to
`drivers.json`'s top-end spread or to driver-car pairing — explicitly out of scope for all three
plans so far, and carrying an owner-facing trade-off: a flatter driver spread makes the
championship closer and an elite driver mean less.

### The win-share plan (landed 2026-09-12) — the last staged ceiling reaches its target

`topTeamWinRate` is now **[0.35, 0.55]**, final. Measured **0.396–0.489** over 10 seed bases per
cell, both difficulties, on both the 12-circuit calendar (n=720) and the 4-circuit sample the gates
actually assert on (n=240), down from **0.550–0.617**.

**The prediction above was half right.** It correctly named `drivers.json`'s top-end spread as the
remaining distance. It was wrong about the trade-off: *flattening the leader does not work*, and the
owner-facing cost it feared — "an elite driver mean less" — was never paid.

Three approaches were measured before one was chosen:

| Approach | 12-circuit calendar | 4-circuit gate sample | Verdict |
|---|---|---|---|
| Flatten Voss (96→92/93, ±Rossi) | in band, 0.41–0.48 | top share **0.317** (< 0.35 floor), ρ **0.584** (< 0.60 floor) | **Fails the gates** |
| Compress Apex's car (k = 0.6 / 0.3) | in band | `paceRankCorrelation` **0.891 / 0.794** | **Red-lines a FINAL 0.90 gate** |
| **Raise the challengers** | **0.404–0.489** | **0.396–0.471** | **Chosen** |

**Why flattening fails, and it is a consequence of Plan A.** Race incidents had already pulled
`gridFinishSpearman` from ~0.75 down to ~0.62 — within **0.013** of its 0.60 floor. Compressing the
field spends that same budget, and there was none left. Widening the top instead of compressing it
costs nothing from it.

**The change** (`drivers.json`): Rossi **94 → 96**, a genuine equal to Voss rather than a clear
second; Berg **90 → 93**, making Kestrel a third force; Silva **85 → 88**, lifting Vortex into
occasional-winner range. Potentials raised to stay above pace. **Voss keeps his 96** — the four-time
champion of his own backstory is untouched, and he is still the fastest driver on the grid.

**Three metrics improved rather than degrading**, which is the evidence that nothing was bought with
noise: `gridFinishSpearman` **0.622–0.691** (was 0.613–0.628), `paceRankCorrelation` min **0.9394**
on the calendar (was 0.9152), `meanAbsPosChange` max **3.650** (was 3.663). Distinct winners ≥ 6.
Incident rates untouched. Tightest remaining margin is `paceRankCorrelation` at **+0.0152** on the
rookie gate sample. Representative win share: **apex 45.8 / meridian 36.4 / vortex 8.8**.

**That rookie caveat has since improved, and no band moved (2026-08-23, circuit-sensitivity plan).**
Re-measured over all 12 circuits at n=720 on two seed bases: pro **2.8633 / 2.8371** ± 0.024, rookie
**2.6183 / 2.5814** ± 0.023. Rookie's margin over the 2.5 floor is therefore now **3.6 SE** at its
worst sample, up from 2.9. No band was advanced by this plan, and none needed to be: `meanAbsPosChange`
and `gridFinishSpearman` were already at their §3 targets, `minPaceRankCorrelation` and
`mechanicalDnfPerCarRace` are final, and `topTeamWinRate`'s remaining step — the 0.55 ceiling — stays
with the race-incidents plan, since pro measures 0.567–0.592 and is still 2–4pp above it. **Nothing
was widened to accommodate a measurement**, which was the live risk in a plan whose whole effect is to
change how much the car matters.

**The one metric that plan moved the wrong way, and it is that plan's own headline (2026-08-23).** The
per-circuit \|Δpos\| ratio in §3 fell from **1.5238** to **1.3454** — from inside the 1.5–2.5 band to
below its floor — measured by reverting only the two `lapModel.ts` lines the plan changed and re-running
the identical sweep on four seed bases. It is **not** a band that was widened or a gate that was
weakened; it is an ungated §3 target the work intended to advance and instead set back, recorded here
rather than smoothed over.

The mechanism is a finding for the calendar's owner, not a defect in the code. `harbour_lights` is the
most position-shuffling circuit and is authored with the **lowest** `carSensitivity` of the 12 (sum
0.78) and the **highest** `driverSensitivity` (1.36). That is realistic — a street circuit is where the
driver matters — but driver skill also helps set the grid, so amplifying the driver by 36% makes the
result *more* grid-ordered: harbour_lights' own \|Δpos\| fell 3.770 → 3.567, while the old floor
circuit (veloce, 1.00/1.00) rose. The sensitivities as authored **anti-correlate with position churn**
and squeeze the range from both ends. Closing the gap is therefore not a matter of widening the spread
in the direction it already runs: it needs the spread re-authored so high-churn circuits carry high car
sensitivity, or `overtaking.factorFloor` lowered (§7). Both are owner decisions.

**A correction on the record, because it is the more instructive half.** The first version of this
section, and of §3's row, claimed the ratio rose "from exactly 1.00×". It did not. 1.00× predates the
overtaking-race-time plan, which made `overtakingFactor` live and had already carried the ratio to
~1.52 on its own — and §3's row said so explicitly, in the words "not re-measured by the overtaking
work". That warning was **deleted and replaced with a number nobody had measured**, turning a −0.18
regression into a claimed +0.38 improvement. The lesson is narrow and worth keeping: a metric marked
"not re-measured" is not a baseline, and inheriting one is how an oracle acquires a false number.

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

**~~The simulation has no chaos.~~ FALSIFIED 2026-08-29 by the race-incidents plan.** Recorded
rather than deleted, in the style §8 and §9 already use, because the reasoning that followed from it
was sound and its *conclusion* turned out to be wrong in an instructive way.

It claimed: `tuning.incidents.dnfPerLap` and `driverErrorPerLap` are both `0.0` with no consumer in
`src/engine/`; there is no safety car, no first-lap incident, no dry-weather driver error; the only
stochastic disruption is wet-weather spins, which is why with rain disabled only **two** teams ever
win. In real F1 a 0.2 s/lap edge is not decisive precisely because of the chaos this model lacks.
**Adding it is the correct lever; raising `noise.sigmaPerSector` is not** — reaching the band that
way needs 0.8 (a 10× increase, ±2.4 s/lap of unexplained swing), which destroys legibility. And race
length is the wrong lever in the wrong direction: a pace advantage grows as L while noise grows as
√L, so *shorter* races are more deterministic.

**What is true now.** Driver error, crashes and safety cars are all implemented and live
(`src/engine/incidents.ts`, `tuning.incidents`). Measured over all 12 circuits, n=720, both
difficulties, two seed bases: **6.32–6.54pp crashes per car-race** (§3's real-F1 accident share is
7.0pp), **0.518–0.553 safety cars per race**, **5.08–5.28 driver errors per race**, and mechanical
DNFs raised into band at **7.04–7.42%**.

**What is still true — and this is the correction worth keeping.** The rejection of
`noise.sigmaPerSector` stands. But the claim that chaos was *the* lever for win share does **not**:
adding real-F1-accurate chaos moved top-team win share from 56.7–59.2% to **56.8–58.8% pro**, i.e.
**not at all**. The reason is structural and was not anticipated anywhere in this document:

> **Win-share concentration is a DRIVER-pace effect, and incidents are driver-agnostic.**
> `d_voss` alone wins **55.0%** of races (n=600, all 12 circuits); `d_rossi` wins 31.2%; together
> two drivers take **86.2%** of all wins. `drivers.json`'s pace distribution has a cliff at the
> top — 96, 94, then 90, 86, 85 — and Voss pairs the single highest pace with the best car.
> Removing ~15% of his races through DNFs does not change who is fastest in the other 85%, so a
> team-and-driver-agnostic mechanism cannot compress it. Two-car absorption is a minor factor by
> comparison (34 of Apex's 338 wins came after losing its other car).

So the remaining 57.5% → 0.35–0.55 distance is reachable by neither `cars.json` (§7's plateau) nor
incident rates (measured above). It lives in **`drivers.json`'s top-end pace spread**, or in how
drivers are paired to cars — both of which the competitive-grid, circuits-that-matter and
race-incidents specs each explicitly declared out of scope. That is now the open question, and it
has an owner-facing decision in it: compressing the driver spread makes the grid closer but makes
an elite driver mean less.

**CLOSED 2026-09-12 — the diagnosis was right, the proposed remedy was not.** The distance did live
in `drivers.json`'s top-end pace spread, exactly as stated. But the "owner-facing decision" framed
here — compress the spread and accept that an elite driver means less — turned out to be a false
dilemma, and measurably the *wrong* move: flattening Voss to 92–93 reaches the band on the 12-circuit
calendar yet **fails the gate sample**, dropping top-team share to 0.317 (below the 0.35 floor) and
`gridFinishSpearman` to 0.584 (below its 0.60 floor), because this plan's own incidents had already
left only 0.013 of headroom above that floor.

The fix was the opposite operation: **widen the top rather than compress the field.** Raising Rossi
to 96, Berg to 93 and Silva to 88 puts top-team share at 0.396–0.489 with `gridFinishSpearman` and
`paceRankCorrelation` both *improving*, and Voss keeps his 96. No elite driver was made to mean less.
Full measurements and the three-way comparison are in §4.

**Post-competitive-grid: the plateau held, and it is now the binding constraint.** The numbers
in this section were measured on the old 1.482 s/lap spread; the competitive-grid change narrowed
it to 0.674 s/lap and landed at **84.6%** (pro, 12 circuits) — consistent with the predicted 81.5%
floor plus the residual driver spread this plan deliberately left alone. The table's shape is
therefore unrevised and still correct: the remaining distance is **not** reachable by any further
`cars.json` edit. ~~and belongs entirely to the race-incidents plan~~ — **that last clause is now
known to be wrong**; race incidents landed and moved win share by ~0pp. See the falsification note
above for where the distance actually lives.

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
`overtakingFactor` is low, which is where it should — with the important qualification that **below
`overtaking.factorFloor` (0.35) it binds *identically* no matter how much lower the factor goes**, so
the differentiation this mechanism provides saturates at the hard end of the calendar. That is the
subject of the next subsection, and it is a plausible contributing cause of the `hardCircuitScale`
saturation this table reports. Two limits on how far this table can be
pushed: Harbour Lights saturating at exactly 0.500 across 2.5/3.0/4.0 is likely the same
instrument ceiling seen from the other side, and both columns are near an end of the scale — so
read the table as *ordering* evidence, not as calibrated rates. The takeaway stands regardless:
**judge this mechanism by failure rate per circuit, not by seconds-per-sector.** 2.5 is chosen
because the effect saturates there (3.0 and 4.0 buy nothing) and it clears the differentiation bar
by 3.8 SE, where 2.0 clears it by only 1.1 SE.

### `overtaking.factorFloor` is a balance constant that clips real circuits — measured, and kept

`factorFloor: 0.35` is named and was originally documented as a divide-by-zero guard. It is not only
that. It is the lower bound on the divisor in the expression above, and at 0.35 it clips:

| circuit | `overtakingFactor` | sectors clipped | penalty scale `2.5 / max(f, 0.35)` |
|---|---|---|---|
| harbour_lights | `[0.35, 0.10, 0.20]` | **2 of 3** | 7.14 / **7.14** / **7.14** |
| kaido | `[0.55, 0.15, 0.30]` | **2 of 3** | 4.55 / **7.14** / **7.14** |
| bengaluru | `[0.60, 0.30, 0.40]` | 1 of 3 | 4.17 / **7.14** / 6.25 |
| monsoon_bay | `[0.90, 0.30, 0.55]` | 1 of 3 | 2.78 / **7.14** / 4.55 |

So for the traffic penalty **harbour_lights and kaido are identical to each other in S2 and S3**, and
harbour_lights' authored intent (S2 3.5× harder to pass in than S1) is erased — a flat 0.286 s/sector
across the whole lap. The mechanism saturates on exactly the circuits it exists to differentiate;
what still separates them is `sectorEase` in `resolveOvertakes`, which reads the **unclipped** factor.

**Swept before deciding.** `measureClearing`, advantage 0.4, n=120 (seeds `500 + 13i`), patience 15,
startGap 0.3. `meanLapsToClear` is conditional on clearing and is reported beside every rate:

| `factorFloor` | veloce | harbour_lights | kaido | easy−hard (veloce−harbour) | harbour−kaido separation |
|---|---|---|---|---|---|
| **0.35 (shipped)** | 0.0000 ± 0.000, med 2, mean 2.042 | 0.4500 ± 0.0454, med 1, mean 1.697 | 0.1917 ± 0.0359, med 2, mean 2.031 | 0.450 | **0.258** ± 0.058 |
| 0.20 | 0.0000 ± 0.000, med 2, mean 2.042 | 0.6000 ± 0.0447, med 1, mean 2.625 | 0.2833 ± 0.0411, med 1, mean 2.488 | 0.600 | **0.317** ± 0.061 |
| 0.10 | 0.0000 ± 0.000, med 2, mean 2.042 | 0.6750 ± 0.0428, med 2, mean 2.923 | 0.3917 ± 0.0446, med 2, mean 3.000 | 0.675 | **0.283** ± 0.062 |
| 0.05 | identical to 0.10 to every digit | identical | identical | 0.675 | 0.283 |

0.05 and 0.10 are bit-identical because **0.10 is the calendar's minimum `overtakingFactor`**
(harbour_lights S2), so any floor at or below 0.10 clips nothing and the constant becomes a true
guard. That makes 0.10 the interesting candidate, not 0.05.

**Decision: kept at 0.35.** The evidence, stated in full because the choice is close:

- **The separation the finding is actually about barely moves.** Harbour-vs-kaido is 0.258 ± 0.058 at
  0.35, 0.317 ± 0.061 at 0.20 and 0.283 ± 0.062 at 0.10. The best swept value is **1.0 SE** better
  than the shipped one. There is no measured differentiation win to buy here — the clipping is real
  but unclipping it does not separate the two hardest circuits meaningfully further, because
  `sectorEase` is already doing that work on the unclipped factor.
- **What lowering it *does* buy, and it is real:** harbour_lights' clearing failure rate rises
  0.450 → 0.675 ± 0.043 at floor 0.10, which lands **inside spec §6.1's 60–75% target band** — a
  target §7 above records as missed and unreachable by `overtaking.base`. Its median laps also rise
  1 → 2 with the conditional mean 1.697 → 2.923, i.e. the trials that clear stop converting
  instantly. Easy circuits are untouched: veloce stays at 0.0000 at every floor, and the median
  circuit stays at the metric's floor (0.000–0.008 over all 12 circuits at floor 0.10), so the other
  two §6.1 targets remain missed either way.
- **Why that was not taken: it turns a shipped gate red, and the gate is not stale.** At floor 0.20
  *or* 0.10 the OPTIMAL-brain gate in `tests/engine/strategy.test.ts` measures
  **gain 0.013 ± 0.043** — statistically indistinguishable from zero — against its 0.05 bar, down
  from 0.163 ± 0.043. (0.20 and 0.10 give the *same* figure because that test's synthetic circuit has
  `overtakingFactor [1.0, 0.25, 0.55]`: S2's 0.25 is clipped at 0.35 and unclipped at either lower
  floor, so its penalty grows the same 7.14 → 10.0 in both.) The mechanism is §9.4's: a brain that
  pits into traffic suffers the traffic, and this one does not yet price it. Adopting a lower floor
  therefore means lowering that gate a second time to fit a balance change — exactly the move this
  branch exists to stop.
- **Escalated, not silently closed** (CLAUDE.md §8): trading harbour_lights into its §6.1 band
  against the OPTIMAL gate is a game-feel call for the owner. The numbers above are the whole input.
  The path that costs nothing is teaching the OPTIMAL brain about traffic first (§9.4's "separate,
  later work"), after which floor 0.10 becomes free.

`factorFloor` is upper-bounded at **0.35** in `validators.ts` — the smallest per-circuit *maximum*
`overtakingFactor` on the calendar, which is harbour_lights'. Above that, some circuit has all three
sectors clipped and the per-circuit mechanism is silently off there.

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

### No longer dead — the three circuit fields, wired 2026-08-23

The circuit-sensitivity plan wired the last three dead *circuit* fields.

One global was displaced entirely and **was** deleted: `tuning.pit.laneTimeLoss`, gone from
`tuning.json`, `validators.ts` and `types.ts`, since nothing read it afterwards. **The other two were
not, and an earlier version of this section wrongly said they were.** `tuning.carPerformance.sectorSplit`
and `tuning.driverPerformance.sectorSplit` are still present in all three files — correctly, because
they still have live consumers outside the engine: `src/ui/Development.tsx:48,53` and
`src/state/seasonStore.ts:72-73` price development points off them. They are no longer the *engine's*
weighting, and that split is itself a defect worth naming (below), but they are not dead constants and
deleting them would break the upgrade shop.

| Field | Now read at | The global it replaced |
|---|---|---|
| `circuit.carSensitivity` | `lapModel.ts` — per-sector weight on the car-performance delta, used **raw** rather than normalised, so a circuit compresses or amplifies the whole car spread (measured sums 0.78–1.05) | `tuning.carPerformance.sectorSplit` — still live, but only for the upgrade shop's pricing |
| `circuit.driverSensitivity` | `lapModel.ts` — the same, for the driver delta (measured sums 1.00–1.36) | `tuning.driverPerformance.sectorSplit` — same |
| `circuit.pitLaneTimeLoss` | five call sites, moved in lockstep: `race.ts` applies the stop, `projection.ts` prices the "if you pit now" overlay, `raceStore.ts` (×2) drives the player's stop and decides when they are still in the lane, and `PitTimer.tsx` displays the duration. Circuits specify 18.0–24.0 s against the old flat 22.0 | `tuning.pit.laneTimeLoss`, deleted |

The lockstep on `pitLaneTimeLoss` is load-bearing: had `projection.ts` and `race.ts` disagreed, the
projection overlay would have lied to the player by 2–4 s — the exact magnitude that decides an
undercut — and lied silently. `tests/engine/circuitDifferentiation.test.ts` asserts the two agree
**exactly**, not approximately, at both extremes of the range.

What this cost, and it is the point rather than a side effect: top-team win share is now **56.7 /
59.2 / 56.5 %** over the full calendar at n=720 across three independent seed bases, against a
pre-overtaking 84.6 %. Apex still leads by **+25.1 pp ± 2.9** over Meridian and wins 11 of the 12
circuits singly (+25.1 pp mean margin over three n=720 seed bases, ~7 SE on the margin's own
sampling error) — but *which* circuits favour whom is now a property of the circuit, because Apex
(aero 95, power 92) and Meridian (power 98, aero 91) are one facet point apart and the sensitivities
decide where that point lands. Meridian owns Veloce outright at 69.5 %; Kaido is Vortex's best
circuit at 31.5 %. This is the feature, and it is why the Monte-Carlo gate's team-identity
assertion had to move from a 4-circuit sample to the whole calendar: on a sample containing Veloce,
at n=240, the Apex–Meridian margin is ~6 pp against an SE on the difference of ~4.5 pp, so the gate
was measuring sampling power rather than the grid. The reasoning is recorded in full in
`tests/engine/monteCarlo.test.ts`.

§3's "Sim at" column and §4's staging table were both re-measured against this wiring on
2026-08-23 and agree with the figures above.

### The upgrade shop now prices against a weighting the engine does not use

Wiring the sensitivities split the engine's arithmetic from the progression system's. The engine weights
a facet point by `circuit.carSensitivity[sector]`; `src/ui/Development.tsx:48,53` and
`src/state/seasonStore.ts:72-73` still weight it by the global `sectorSplit`. So the "+0.0Ns/lap" figure
the shop shows the player is a **season-average rate, not the rate at any circuit**.

The magnitude is not negligible, and on the driver path the error is one-sided. The global driver vector
sums to exactly 1.00 while `driverSensitivity` sums 1.00–1.36, so the shop **understates a driver upgrade
by up to 36%** — worst at harbour_lights — and never overstates it. Car upgrades are misstated in both
directions (`carSensitivity` sums 0.78–1.05).

Recorded rather than changed, deliberately: a season-long purchase priced at a season-average rate is
defensible, and re-pricing it per circuit is a game-feel decision for the owner, not a correctness fix.
What is *not* defensible is that it became an implicit design choice with nothing documenting it. It is
documented now.

### Still dead — six fields

| Field | Where the behaviour actually comes from | Owner |
|---|---|---|
| path `sectorBoundaries`, `pitEntry`, `pitExit` | unread. They appear in `TrackCanvas.tsx:21`'s type for the canvas-local `CIRCUIT_PATHS` table but are never read from it, so pit entry and exit are still never drawn | unassigned |
| `tuning.incidents.dnfPerLap`, `driverErrorPerLap` | unread; no consumer exists | **the race-incidents plan** ("Plan B") |
| `team.developmentRate` | read by `src/state/seasonStore.ts` (the progression system) only, never by the engine | by design |

Grep-verified 2026-08-23: the two `incidents` keys have **zero** references anywhere in `src/`
outside `validators.ts` and `types.ts`.

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
| "Scrambling all four dead circuit fields yields byte-identical races." | **False for all four.** It went false for `overtakingFactor` first, then for `carSensitivity`, `driverSensitivity` and `pitLaneTimeLoss` when the circuit-sensitivity plan wired them (see above). No circuit field is scramble-invariant any more. |
| "Aurora and Kaido — same 50 laps, different `sectorBase`, `overtakingFactor` and `pitLaneTimeLoss` — produce bit-identical results on every metric across 400 seeds." | **False.** They differ measurably, and by design: at a 0.4 s/lap advantage the clearing failure rate is Aurora **0.008 ± 0.008** against Kaido **0.192 ± 0.036** (n=120 each). That pair was the cleanest possible demonstration of the defect and is now the cleanest demonstration of the fix. |
| "Swapping `sectorBase` yields identical results." | **Still true** (see above). |
| "The only per-circuit inputs that change racing today are `laps` and `rainProbability`/`weatherBias`." | **Superseded twice over.** `carSensitivity`, `driverSensitivity` and `pitLaneTimeLoss` all change racing as well, calendar-wide.  Also: `overtakingFactor` now changes racing too, calendar-wide: pooled over the three hardest circuits the clearing failure rate is **0.236 ± 0.022** against **0.003 ± 0.003** over the three easiest (n=360 each). |

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
   the flat penalty. See §7 for the two measured limitations this carries: `hardCircuitScale` cannot
   both differentiate and hold Veloce's absolute penalty, and `factorFloor` clips 2 of 3 sectors at
   both of the hardest circuits, so the penalty does not differentiate *between* them at all.
3. **Circuits differ.** `sectorEase` reads `circuit.overtakingFactor` rather than the global
   constant that shadowed it (§8).

`racecraft` is consequently worth something on both attack and defence for the first time.

### 9.3 The measured clearing behaviour

Measured with `measureClearing`: two otherwise-identical cars, the chaser 0.4 s/lap faster spread
evenly across all three sectors, starting 0.3s back; "cleared" means ahead on `raceTime` **and** more
than `traffic.gapThreshold` (1.0s) of clear air; 15 laps of patience.

**The before/after table below is a *matched* comparison: both columns are n=40 on the same seed
stream (seeds `1000 + 17i`, `i` in [0, 40)) under the same fixed instrument.** The pre-change column
was taken by checking out `47ea4a0`'s `race.ts` against the current instrument, because the figures
originally recorded for it were taken with a broken one. An earlier version of this table paired the
n=40 pre-change column against the n=120 post-change column (seeds `500 + 13i`) while claiming
comparability; the two samples are disjoint, so the numbers did not reconcile with the ones in
`tests/engine/overtakeRaceTime.test.ts`'s header. The matched n=40 post-change figures are the ones
below, re-verified at HEAD; the n=120 column beside them is a *separate, larger* sample on a
different seed stream and is labelled as such.

| | pre-change, n=40 (seeds 1000+17i) | post-change, n=40 (same seeds) | post-change, n=120 (seeds 500+13i) | `overtakingFactor` mean |
|---|---|---|---|---|
| Veloce | fail 0.000, med 3, mean 3.350 | fail **0.000**, med 2, mean 2.225 | fail 0.000, mean 2.042 | 0.867 |
| Bengaluru | fail 0.000, med 3, mean 3.375 | fail **0.075** ± 0.042, med 2, mean 2.243 | fail 0.067, mean 2.288 | 0.433 |
| Kaido | (indistinguishable) | fail **0.200** ± 0.063, med 2, mean 1.969 | fail 0.192, mean 2.031 | 0.333 |
| Harbour Lights | fail 0.000, med 3, mean 3.375 | fail **0.375** ± 0.077, med 1, mean 1.920 | fail 0.450 ± 0.045, med 1, mean 1.697 | 0.217 |

The two post-change samples agree within ~1 SE on every circuit, which is why the conclusion is the
same either way — but only the first two columns are a matched pair, and only they should be
differenced.

**`meanLapsToClear` is conditional on clearing and must never be read alone.** Harbour Lights' mean
*fell* (3.375 → 1.920 on the matched pair) while its failure rate *rose* (0.000 → 0.375), because the
trials that clear now convert immediately — a durable pass is not erased by the next sort — while
37.5% never clear at all. Read by itself the mean says the circuit got easier. Always quote it beside
the failure rate.

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
- ~~No safety car, no red flag, no first-lap incident, no dry-weather driver error — §7's "the
  simulation has no chaos" is unchanged by this work, and `tuning.incidents` is still dead (§8).~~
  **Superseded 2026-08-29:** the race-incidents plan implemented driver error, crashes and safety
  cars, and `tuning.incidents` is live. Red flags and first-lap incidents remain out (spec §3).

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

## 13. Car setup (rear wing) — measured 2026-10-09

Spec: `docs/superpowers/specs/2026-10-09-car-setup-design.md` (§2 model, §5 targets). Reproduce with
`npx tsx scripts/calibrate-setup.ts`. The analytic targets and the Monte-Carlo bands are pinned in
`tests/engine/setupBalance.test.ts`; the race-level place deltas below are recorded here only.

**Final `tuning.setup`:** `speedGain 5.8`, `gripGain 2.8`, `balanceCost 0.78`, `overtakeGain 0.3`,
`wetGain 0.15`, `wetSeverity {DAMP 0.5, WET 1.0}`, `aiNoise 0.25`, `seedOffset 104729`.
(`seedOffset` moved from 7919, which equals the Monte-Carlo harness's per-race seed stride, so race
r's wing stream was race r+1's main stream.)

**Per circuit** (dry optimum `d* = (gripGain·(w₁+w₂) − speedGain·w₀) / (2·balanceCost)`; step-off =
the smaller loss of the two neighbouring levels, dry; worst = the furthest level, dry):

| circuit | rain | best (rain-weighted) | best (dry) | d* | step-off s/lap | worst level | worst s/lap |
|---|---|---|---|---|---|---|---|
| bengaluru | 0.25 | 3 | 3 | +0.036 | 0.167 | 1 | 0.836 |
| monsoon_bay | 0.75 | 3 | 3 | +0.067 | 0.143 | 1 | 0.884 |
| veloce | 0.20 | 1 | 1 | −1.072 | 0.251 | 5 | 3.344 |
| harbour_lights | 0.30 | 3 | 3 | +0.022 | 0.178 | 1 | 0.814 |
| sol_desert | 0.05 | 3 | 3 | −0.081 | 0.132 | 5 | 0.906 |
| highland | 0.40 | 2 | 2 | −0.374 | 0.097 | 5 | 1.461 |
| grand_savane | 0.20 | 3 | 3 | −0.045 | 0.160 | 5 | 0.850 |
| aurora | 0.45 | 3 | 3 | +0.029 | 0.172 | 1 | 0.826 |
| silverpark | 0.45 | 3 | 3 | −0.079 | 0.133 | 5 | 0.904 |
| costa_verde | 0.30 | 3 | 3 | +0.141 | **0.085** | 1 | 1.000 |
| kaido | 0.35 | 4 | 4 | +0.362 | **0.087** | 1 | 1.431 |
| altiplano | 0.15 | 4 | 4 | +0.472 | 0.173 | 1 | 1.689 |

Levels covered: **1, 2, 3, 4 (4 of 5)** — target ≥ 4, met. Step-off **0.085–0.251 s/lap** — target
0.08–0.30, met. Level 5 is never best: no circuit's carSensitivity puts d* above +0.5.

**Why the step-off floor is tight, structurally.** With a quadratic, a circuit whose d* sits δ from
the nearest level (0 ≤ δ ≤ 0.25) loses `balanceCost·(0.25 − δ)` one step off on the nearer side, so
a circuit whose optimum falls near a midpoint between levels always fails the 0.08 floor. Scaling
all three gains together moves no optimum, so the floor can only be met by placing all 12 d* values
near a level at once. A grid search over speedGain 2–9, gripGain 1–6, balanceCost 0.32–1.2 (with
coverage ≥ 4 for some wetGain) found that every passing set clears 0.08 by at most ~0.015 while the
mean worst-level loss stays under 1.4 s/lap; margins above 0.12 need a mean worst-level loss near
2.8 s/lap. The chosen set has the smallest worst-level loss among those clearing 0.08 by ≥ 0.005.
costa_verde and kaido are the binding pair (d* +0.141 and +0.362 straddle the 2–4 midpoint
symmetrically). Editing carSensitivity on either circuit will likely break the step-off test; that
is the test working, not noise.

**Why wetGain dropped 0.36 → 0.15.** It is what the rain-weighted coverage needs: highland (rain
0.40) stays on level 2 only while wetGain ≤ 0.21. Above that it rounds to 3 and coverage falls to
{1, 3, 4}. A second window opens at wetGain ≥ 0.64, where monsoon_bay rounds to 5, but that makes
level 5 vs 3 in the WET worth 1.9 s/lap, so it was not taken. Consequence: rain is a mild pull
towards more wing (level 1 vs 3 in the WET costs 0.45 s/lap), not a dominant one.

**Best vs worst over a dry race** (d_rossi, pro, M→H stop at 45% of laps, rivals on `aiSetups`,
no player calls, n=100 seeds paired by seed, retired = 21):

| circuit | best/worst level | mean pos best | mean pos worst | places | SE |
|---|---|---|---|---|---|
| bengaluru | 3 / 1 | 12.72 | 13.89 | 1.17 | 0.82 |
| monsoon_bay | 3 / 1 | 18.26 | 17.84 | −0.42 | 0.33 |
| veloce | 1 / 5 | 3.09 | 18.33 | 15.24 | 0.59 |
| harbour_lights | 3 / 1 | 14.71 | 15.72 | 1.01 | 0.77 |
| sol_desert | 3 / 5 | 3.97 | 9.85 | 5.88 | 0.83 |
| highland | 2 / 5 | 9.77 | 13.23 | 3.46 | 0.91 |
| grand_savane | 3 / 5 | 2.85 | 9.57 | 6.72 | 0.78 |
| aurora | 3 / 1 | 10.40 | 12.44 | 2.04 | 0.90 |
| silverpark | 3 / 5 | 10.37 | 11.19 | 0.82 | 0.70 |
| costa_verde | 3 / 1 | 3.30 | 9.63 | 6.33 | 0.81 |
| kaido | 4 / 1 | 9.98 | 13.54 | 3.56 | 0.76 |
| altiplano | 4 / 1 | 4.10 | 15.04 | 10.94 | 0.73 |

**Caveat: no qualifying.** These best-vs-worst places were measured without qualifying (the grid was
not re-run per wing), so the in-game spread is larger: a wrong wing also costs grid slots. The debrief
verdicts share this limit (they reuse the real grid and measure race pace only).

**Mean 4.73 places, median 3.51** against the ~1.5–4 target: **the median meets it, the mean
does not.** The mean is carried by the two circuits whose optimum is at an end of the scale (veloce
level 1, worst 5; altiplano level 4, worst 1): the worst level there is three or four steps off and
costs 1.7–3.3 s/lap. That is inherent to a quadratic with an extreme optimum and cannot be pulled in
without pulling the step-off losses below 0.08. The Task 1 starting values (4.0/2.0/0.6, wetGain
0.36) measured mean 3.97 / median 2.39 but failed both analytic targets (3 levels covered, step-off
floor 0.030 at highland). Two caveats on the measurement: monsoon_bay and harbour_lights saturate,
because this fixed plan with no player calls finishes P15–P19 there whatever the wing (high
retirement count, and the player car stays in `neutral` all race — see §12), so those two rows
understate the effect.

**Monte-Carlo with AI setups on vs off** (4-circuit `SAMPLE`, pro, seed base 1000, every car on
`aiSetups`):

| metric | band | off n=240 | on n=240 | off n=120 | on n=120 |
|---|---|---|---|---|---|
| topTeamShare | (0.35, 0.55] | 0.450 | 0.4125 | 0.500 | 0.442 |
| meanAbsPosChange | (2.5, 4.0) | 3.639 | 3.669 | 3.626 | 3.689 |
| gridFinishSpearman | (0.60, 0.80) | 0.631 | 0.624 | 0.632 | 0.622 |
| paceRankCorrelation | ≥ 0.90 | 0.964 | 0.939 | 0.952 | 0.927 |
| distinctWinners | ≥ 4 | 8 | 8 | 8 | 7 |
| mechanicalDnfPerCarRace | [0.06, 0.10] | 0.0727 | 0.0698 | 0.075 | 0.070 |
| crashesPerCarRace | [0.05, 0.09] | 0.0623 | 0.0585 | 0.0658 | 0.0563 |
| safetyCarsPerRace | [0.40, 0.90] | 0.550 | 0.542 | 0.500 | 0.508 |
| meanOvertakeEvents (unbanded) | — | 33.2 | 36.7 | 33.0 | 37.2 |

Every band holds with setups on. The tightest margins are gridFinishSpearman (0.024 above its
0.60 floor) and paceRankCorrelation (0.039 above 0.90). Setups cost both a little because the
±1 `aiNoise` level gives a quarter of the rivals a random pace offset of one step-off loss (table
above) or more. Overtakes rise
~10% because unequal wings now change the pass probability on the straights.

## 14. 1.5: the virtual safety car and the AI's neutralisation reaction (2026-10-16)

Spec: `docs/superpowers/specs/2026-10-16-pit-wall-1.5-features-design.md` §1. Bands: §3 rows
"VSCs / race" and "AI stops under a neutralisation / race" (measured over four n=240 cells on the
4-circuit sample; sizing rule [floor(0.7×min), ceil(1.3×max)] to 0.05).

**Trigger.** On a tick where a car newly retires, the SC is rolled first and exactly as before
(`crashDeployChance` 0.30, `mechanicalDeployChance` 0.12, tyre failures count as mechanical).
Only if it stays in is the VSC rolled (`incidents.vsc.crashDeployChance` 0.25,
`mechanicalDeployChance` 0.40). One neutralisation at a time: a VSC only opens on a green track;
an SC may supersede a running VSC (logged `vsc_ended` then `safety_car_deployed` on the same
tick, and the field IS compressed, because it is now a safety car); a VSC never supersedes an SC.
VSCs count against their own `maxPerRace` (2), so a VSC can still come out after the SC cap is
reached.

**Under a VSC.** Every car laps at `vsc.paceMultiplier` (1.30, applied in lapModel like the SC's).
Gaps are not compressed: no `compressRaceTimes`, so the existing pace differences carry on, slowed
by the multiplier. Overtakes are suspended (same
`safetyCar === null` gate as the SC). A stop costs `pitLaneTimeLoss × vsc.laneLossFactor` (0.60)
through `effectivePitLaneLoss`, the single source the projection, pit panel, pit timer and race
all read. Duration uniform 1–3 laps, ticked down per lap, starting at the first lap boundary
after the deploy tick (so a VSC always runs across at least one boundary; the SC still counts
down on its deploy tick).

**AI reaction (SC and VSC).** Smart and optimal brains box at a lap boundary when a planned stop
remains and either it is within `ai.neutralisationWindowLaps` (6) or the tyre's cliff fraction is
at least `ai.neutralisationCliffFrac` (0.55), fitting the plan's compound on neutral pace. Naive
brains ignore it. It is a pure threshold with no rng draw. The AI decides on the neutralisation as
it stands AFTER the tick -- the same value `pitStopTime` charges -- so it never boxes on the
boundary where the SC/VSC ends and pays the green-flag loss. This is the balance call with real
feel impact (spec "Balance calls"): the cheap stop becomes a race against the smart teams.

**Invariants kept.** With both VSC chances at 0 the VSC roll draws nothing and the AI reaction
can never fire, so `tests/engine/byteIdentity.test.ts` reproduces the golden race with the fixture
unchanged (`makeDeterministicTuning` zeroes the VSC chances alongside the SC's). `SafetyCarState.kind`
is optional and read through `neutralisationKind` (absent = SC), so no older state changes meaning.

**Also pure, also outside RaceState.** `lapHistory` (`src/engine/raceHistory.ts`) replays
(config, seed, calls) on the replay loop and samples every lap end; `rivalIntel`
(`src/engine/rivalIntel.ts`) projects a rival's stop from the same per-brain thresholds
strategy.ts acts on (`PIT_CLIFF_THRESHOLD`), with a ±1 lap offset from a hash of the car id
rather than the rng. Neither can perturb a race.

**Sprints.** `RaceConfig.lapsOverride` (absent = circuit laps) and `mandatoryTwoCompound: false`;
sprint AI strategies carry no planned stops. The Monte-Carlo bands are Grand Prix bands and were
not re-measured on sprint distance.
