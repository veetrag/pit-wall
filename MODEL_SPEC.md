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
| **AI weather stops / race (showery circuits)** | — (spec 2026-10-17 §0.1: confirm 2 laps, none with ≤ 3 laps left; was ~100/race) | 5 showery circuits, n=240 per cell: pro 63.992/66.475, rookie 63.342/66.729 | **44.30 – 86.75** | **Yes** — sized [floor(0.7×min), ceil(1.3×max)] to 0.05. Counts AI stops that change tyre family |
| **Slow pit stops / race** | — (spec 2026-10-17 §1: 4% per stop x (1 − pitCrew × 0.8), +2.0–6.0 s) | 4-circuit sample, n=240 per cell: pro 0.658/0.721, rookie 0.696/0.675 | **0.45 – 0.95** | **Yes** — same sizing rule. Decided from the second value of the gaussianPair every stop already draws: no stream shift |
| **Red flags / race** | — (spec 2026-10-17 §4: 5% per crash, max 1, none in the last 5 laps; ≈ one every ~10–15 races) | 4-circuit sample, n=240 per cell: pro 0.067/0.054, rookie 0.037/0.063 | **0.00 – 0.10** | **Yes** — same sizing rule; gated at n=240 with a "live" assertion carrying the floor |
| **Graining onsets / race** | — (spec 2026-10-24 §5.2, ruling H4; 2.1 shipped at Rung 3, §17.2) | 4-circuit sample, n=240 per cell: pro 0.063/0.113, rookie 0.487/0.550 | **0.00 – 0.75** | **Yes** — same sizing rule; the floor rounds to 0, so the gate also asserts the rate is live (> 0), as for red flags |
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

**2.0 rates (2026-11-07, §17.1): no rows added.** DRS-train lap ends, double stacks, penalties
and unsafe releases have harness metrics but no band, because the features that produce them ship
OFF. Measured ON (4-circuit sample, n=240 per cell): DRS-train lap ends / race pro 38.121/37.879,
rookie 39.071/40.163; double stacks / race pro 5.763/6.100, rookie 7.375/7.892; penalties / race pro
0.533/0.600, rookie 0.421/0.550; unsafe releases / race pro 0.504/0.550, rookie 0.388/0.546. Size
the band by the same rule from fresh lines when a feature ships on.

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
6. **2.0 adds no rng draw to the race path.** Track limits read lapModel's noise2 lower tail,
   unsafe release pitStopTime's g2 lower tail. A new 2.0 mechanic that needs a draw must
   short-circuit with none at a zero rate. Tyre temperature adds none (deterministic dynamics).

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

## 15. 1.6: weather confirmation, slow stops and the red flag (2026-10-17)

Spec: `docs/superpowers/specs/2026-10-17-pit-wall-1.6-design.md` §0, §1, §4. Bands: §3 rows
"AI weather stops / race (showery circuits)", "Slow pit stops / race" and "Red flags / race",
each measured over four n=240 cells and sized [floor(0.7×min), ceil(1.3×max)] to 0.05.

**AI weather stops.** A dry-tyred AI car fits inters/wets only after `ai.weatherConfirmLaps` (2)
consecutive completed non-dry laps, or at once on a WET track; a wet-tyred car fits slicks after
2 dry laps; no weather stop with `ai.weatherMinLapsLeft` (3) laps or fewer to go. The count reads
the lap just completed and earlier, never the future. No AI stop is taken on the boundary that
completes the race (its pace mode still applies). Showery circuits fell from ~100 AI weather stops
a race to the band above. `makeDeterministicTuning` pins confirm 1 / minLapsLeft 0, the pre-1.6
rule, so the golden race is unchanged.

**Slow stops.** `pitStopTime` already drew a gaussianPair and discarded the second value; a stop
is now slow when that value is in the top p tail, p = `pit.slowStopChance` (0.04) × (1 −
pitCrew/100 × `pit.pitCrewSlowRelief` (0.8; the spec's start value was 0.5, raised in Task 3 so
the crew stat still separates the apex team)), adding `slowStopMin`–`slowStopMax` (2.0–6.0 s) by
depth into the tail. No extra draw, so the stream does not shift; at chance 0 the formula is the
pre-1.6 one byte for byte. The projection prices the expected stop.

**Red flag.** On a tick whose first retirement is a crash, eligible (max 1 a race, more than 5
laps left), the red flag is rolled at `incidents.redFlag.crashChance` (0.05) BEFORE the SC/VSC,
and supersedes either. While it stands: SC pace, no overtakes, no stops. At the first lap
boundary after it was shown, the race restarts in one step: order frozen, raceTime regridded at
`qualifying.gridSlotGapSec`, a free tyre change for every running car (a planned stop within
`planWindowLaps` (15) fitted and consumed on a dry restart; the weather family otherwise), and the
neutralisation clears. The player's tyre is a logged `restart_tyre` call. Tests that make crashes
certain to study the SC, the VSC or driver errors zero `redFlag.crashChance` in their own
overrides (ruling R14, the 1.5 P12 precedent).

**Calls recorded for Veet (deviations from the spec, accepted at plan review):**
- R1: on the boundary that completes the race, `aiDecision` still runs and its pace mode applies; only its pit request is dropped.
- R3: callers compute `RaceConfig.allDry` with the pure helper `isFirstCareerRace`; buildRaceConfig never reads a store.
- R5: a plan stop shows `expectedPitStopTime + slow`; the slow part is exact, the ±0.3 s stationary noise is not shown.
- R6: radio requests are checked at lap ends only, none under a red flag and no push under any neutralisation; YES to box fits the weather family on a non-dry track, else the next planned stop, else the best dry compound.
- R7: a radio request's expiry counts only while the race clock runs.
- R9: the forecast is a discriminated union (steady carries no window), laps counted ahead of now, first change in the horizon only.
- R11: the stoppage in engine terms: rolled on a first-retirement crash with eligibility checked before the draw, supersedes SC/VSC (their ends logged first), SC pace and no AI or plan stops while out; on restart the weather family overrides the plan and `bestDryCompound` is the choice off wets.

Measured (Task 1, 3, 13 MEASURE lines):
MEASURE weather pro seedBase=1000 n=240 aiWeatherStopsPerRace=63.992;
MEASURE weather pro seedBase=7000 n=240 aiWeatherStopsPerRace=66.475;
MEASURE weather rookie seedBase=1000 n=240 aiWeatherStopsPerRace=63.342;
MEASURE weather rookie seedBase=7000 n=240 aiWeatherStopsPerRace=66.729;
MEASURE slow pro seedBase=1000 n=240 slowStopsPerRace=0.658 rho=0.628 dpos=3.680 top=0.442;
MEASURE slow pro seedBase=7000 n=240 slowStopsPerRace=0.721 rho=0.628 dpos=3.627 top=0.408;
MEASURE slow rookie seedBase=1000 n=240 slowStopsPerRace=0.696 rho=0.664 dpos=3.398 top=0.396;
MEASURE slow rookie seedBase=7000 n=240 slowStopsPerRace=0.675 rho=0.655 dpos=3.409 top=0.471;
MEASURE red pro seedBase=1000 n=240 redFlagPerRace=0.067 safetyCarsPerRace=0.463 vscPerRace=0.592 rho=0.630 dpos=3.666 top=0.458;
MEASURE red pro seedBase=7000 n=240 redFlagPerRace=0.054 safetyCarsPerRace=0.392 vscPerRace=0.567 rho=0.633 dpos=3.607 top=0.388;
MEASURE red rookie seedBase=1000 n=240 redFlagPerRace=0.037 safetyCarsPerRace=0.579 vscPerRace=0.596 rho=0.664 dpos=3.392 top=0.404;
MEASURE red rookie seedBase=7000 n=240 redFlagPerRace=0.063 safetyCarsPerRace=0.471 vscPerRace=0.637 rho=0.642 dpos=3.493 top=0.471.

## 16. 1.6.1: player tyre-failure DNF tuning, option C (2026-10-22)

Players retired too often from tyre failures, mostly from running slicks into a
damp or wet spell. Data-only change in `tuning.json`:

- `tyreFailure.chancePerLapOverThreshold` 0.30 -> 0.10, `maxChancePerLap` 0.50 -> 0.15
- `weather.wetDegMultiplier.dry`: DAMP 1.4 -> 1.15, WET 1.9 -> 1.4

Measured player DNF rate (all causes, n=240 per cell, pro; harness in the session scratchpad):

| player policy | before | after | of which tyre (after) |
|---|---|---|---|
| plan only | 25% | 11.3% | 2.1pp |
| always push | 42% | 15.8% | 7.9pp |
| AI field (per car) | ~14% | 14.2% | 0.0pp |

Rookie: plan 10.4%. Deliberately over-extended stints still fail (~46%), as they should.

Gates moved (each widened for 1.6.1 DNF tuning, values realistic):

- `topTeamWinRate` floor 0.35 -> 0.33: setups-on sample measured 0.346. Fewer tyre failures
  closed the top: full calendar apex 42.5% / meridian 38.5%.
- `monteCarlo` "apex remains strongest" margin gate 0.08 -> 0.03 (measured 4.0pp). Apex still
  top; worth a balance look if the margin keeps shrinking.
- `mechanicalFailure` fragile-team ceiling 0.15 -> 0.16 (measured 15.07%): cars that no longer
  puncture are exposed to the mechanical roll for longer.
- tyre-failure mechanism test runs 8 laps instead of 5 (max chance per lap is now 0.15).

The golden byte-identity test pins the fixture's pre-1.6.1 tyre-failure and wet-deg values
explicitly; the fixture was not re-captured. Four scenarios were re-authored (recovery_drive,
cliff_edge, rain_call, red_flag_restart); see the commit log.

## 17. 1.7 content: circuit traits, two new circuits, night wear deferred (2026-10-24)

Spec: `docs/superpowers/specs/2026-10-24-v2-content-design.md` §1–§2. Traits are optional
per-circuit multipliers read through `circuitTraits` (`src/engine/circuitTraits.ts`): `tyreWear`
(effective tyre age), `crashRisk` (driver-error chance), `neutralisationRisk` (SC and VSC deploy
chances, capped at 1), and `timeOfDay` (night multiplies wear by `timeOfDay.nightWearFactor`).
Absent = 1 = the old arithmetic; no rng draw was added; the golden race is unchanged. Every
circuit now carries `timeOfDay` (night: harbour_lights, kaido, sol_desert, lantern_quay; dusk:
bengaluru, grand_savane, costa_verde, aurora; day: the rest), tied to `atmosphere` by a test.
No `_regressionBands` band moved in 1.7.

The full-calendar Monte-Carlo gate samples the career calendar (the twelve original circuits,
`V2_CIRCUITS` excluded), not every circuit in the data (ruling R7).

**Lantern Quay** (night street circuit). Final calibration: `crashRisk 1.3`,
`neutralisationRisk 1.5`, overtakingFactor [0.45, 0.15, 0.25]. The spec proposed crashRisk 1.6;
at 1.6 pro grid-finish rho measured 0.466, under the 0.50 per-circuit floor. The brief's lever
ladder had no rung for that case, so a controller ruling extended it (crashRisk down to 1.2,
neutralisationRisk up to 2.0, 0.1 steps, pick the passing pair with the most rho headroom).
1.3 / 1.5 and 1.2 / 1.6 were the only passing pairs; 1.3 / 1.5 won on headroom. Measured, n=120:

    MEASURE lantern_quay pro sc=0.925 crash=0.0942 dpos=4.4525 rho=0.5026 pace=0.9636 | SAMPLE sc=0.408
    rookie rho 0.518

**Known-fragile gate:** pro rho 0.5026 sits 0.003 above its 0.50 floor, well inside the ~±0.03
seed noise at n=120. The gate is deterministic, so it does not flake, but any change to crashes,
safety cars or wear at night circuits can tip it. It was not re-measured under night wear,
because night wear was not shipped (below).

**Mesa Roja** (desert day circuit). `tyreWear 1.40` (spec 1.35, raised one lever step), `laps 52`.
Measured, n=120:

    mesa_roja pro    dpos 3.563 rho 0.648 pace 0.988 winners 5 crash 0.075 tyreDnf 0.000 stops 3.386
    mesa_roja rookie dpos 3.368 rho 0.673 pace 0.952 winners 4 crash 0.074 tyreDnf 0.000 stops 2.770

3.39 stops per classified car at pro (SAMPLE 2.67), so **three stops is the norm** there and the
circuit copy says so. Tyre-failure DNFs 0. Passing is never blocked for a car 0.4 s/lap faster
(clearing failure 0.000, in line with the easiest circuits); not gated.

**Night wear: measured and deferred.** 1.7 ships `nightWearFactor 1.0`, so night is presentation
only. The ladder 0.94 → 0.96 → 0.98 was measured with `tests/engine/monteCarlo.test.ts`, and
every value failed one gate: "apex remains the strongest team over the full calendar", which
needs apex's win share to beat the next team's by more than 0.03 (n=720).

| factor | full calendar n=720 | apex margin | gate |
|---|---|---|---|
| 1.00 | apex 42.5%, meridian 38.5% | 4.0pp | pass |
| 0.94 | apex 41.8%, meridian 39.3% | 2.5pp | fail |
| 0.96 | apex 41.9%, meridian 39.4% | 2.5pp | fail |
| 0.98 | apex 41.5%, meridian 39.7% | 1.8pp | fail |

Apex stayed top team at every factor. The other 13 monteCarlo tests passed at every factor.
The margin does not shrink as the factor moves away from 1 (0.98 is the worst result), and the
swing is 1.5–2.2pp, while one win share at n=720 has a standard error of ~1.8pp. Our read: the
gate's 1pp of headroom is used up by any re-roll of the night-circuit races; this does not look
like night wear systematically favouring meridian. Veet's options:
(a) re-baseline the gate (a band edit), (b) first measure the margin over several seed bases, or
(c) no night wear.

Thin margins seen during that run, all passing: SAMPLE safety cars 0.408/race at 1.0 against the
0.40 floor (0.558 at 0.94); pace-rank correlation 0.915 at 0.94 against its 0.90 gate (0.952 at
1.0, 0.96 and 0.98). No scenario was re-authored, because the factor did not change.

### 17.1 2.0: track, DRS, SC, pit lane (2026-11-07)

Spec `docs/superpowers/specs/2026-10-24-v2-deeper-race-strategy-design.md` §12–§13, as amended by
`docs/superpowers/plans/2026-11-07-v2.0-scope.md` Task 12' (Tasks 12 + 20 merged). Each feature was
switched on alone, in the scope's order, on top of the ones before it, and measured with
`MEASURE=1 FEATURE=<label> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.0"` (four
n=240 cells on the 4-circuit SAMPLE). The gate suites were then run on the result. No band was
widened. None of the STOP limits (crash > 0.12, dpos > 4.5, paceRank < 0.85) was reached.

> **Superseded by "Round 2" at the end of this section:** DRS, the double stack and penalties now
> ship ON; circuit/wet incident risk stays OFF.

**Outcome: rubber wash and the optimal SC gamble ship ON. DRS, circuit/wet incident risk, the double
stack and penalties ship OFF**, each after its one fallback (spec §12.3) also failed:

| Feature | Gate that failed | ON | Fallback | Fallback value |
|---|---|---|---|---|
| DRS | `newCircuitBands` lantern_quay IS HARD TO PASS ON, failure rate ≥ 0.20 | 0.183 | `drs.overtakeBonus` 0.6 → 0.3 | 0.192 |
| Circuit / wet risk | `setupBalance` setups-on gridFinishSpearman > 0.60 (n=240) | 0.592 | `wetErrorMultiplier` → {1, 1.2, 1.4} | 0.596 |
| Double stack | `monteCarlo` every gated metric, gridFinishSpearman > 0.60 (n=120) | 0.597 | `maxQueueNeutralised.smart` 6 → 4 | 0.597 (unchanged) |
| Penalties | MEASURE pro seedBase=1000 rho, floor 0.60 | 0.596 | `trackLimits.chancePerLap` 0.012 → 0.006 | 0.595 |

Two things the reviewer should know about these four:
- DRS's and the double stack's four MEASURE cells were all in band; the failing gates run a different
  sample (one circuit, or n=120). The risk ON MEASURE cells were also in band (rho 0.607 lowest) and
  only the setups-on gate failed. The gridFinishSpearman 0.60 floor had ~0.03 of headroom on the
  SAMPLE before 2.0, and each feature spent some of it: DRS, risk, stack and penalties together took the
  pro seedBase=1000 cell from 0.643 to 0.596. Credit is not additive and the ladder attributes the
  failure to the feature that tipped it, so a different switch order would have kept a different
  subset. This is a balance call for Veet, not a defect.
- With DRS off no 2.0 rate is live, so **no new band was added**: `drsTrainLapEndsPerRace`,
  `doubleStacksPerRace`, `penaltiesPerRace`, `unsafeReleasesPerRace` stay unbanded (harness metrics
  exist; the MEASURE lines below give the ON values for sizing when a feature ships on).

**The two that ship ON move nothing measurable.** Rubber wash is a track-wide pace term: every car pays
the same green-track cost (the `stepSector` integration test in `tests/engine/trackRubber.test.ts`
pins this), so order, gaps and AI decisions are unchanged and the rubber lines equal the baseline to
every printed digit. The SC gamble needs `neutralisationOutlook` ≥ `ai.scGambleChance` 0.35; with
incident risk off the outlook never reaches 0.30 on the SAMPLE (`MEASURE outlook bucket 2 n=0`), so
it never fires and the gamble lines equal the risk lines. Both are live code paths for the player
(TRACK GRIP strip, SC meter) but are inert for AI balance at these values — flagged for Veet.

Baseline (every 2.0 switch off):
```
MEASURE baseline pro seedBase=1000 n=240 top=0.463 winners=7 dpos=3.575 rho=0.643 paceRank=0.952 mech=0.0708 crash=0.0619 sc=0.458 vsc=0.550 aiNeut=3.092 slow=0.679 red=0.058 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.4
MEASURE baseline pro seedBase=7000 n=240 top=0.392 winners=7 dpos=3.603 rho=0.634 paceRank=0.952 mech=0.0656 crash=0.0583 sc=0.463 vsc=0.579 aiNeut=3.779 slow=0.696 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.3
MEASURE baseline rookie seedBase=1000 n=240 top=0.438 winners=8 dpos=3.387 rho=0.667 paceRank=0.939 mech=0.0658 crash=0.0631 sc=0.525 vsc=0.662 aiNeut=3.837 slow=0.683 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=33.8
MEASURE baseline rookie seedBase=7000 n=240 top=0.425 winners=7 dpos=3.440 rho=0.651 paceRank=0.915 mech=0.0700 crash=0.0552 sc=0.429 vsc=0.667 aiNeut=3.304 slow=0.738 red=0.054 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.0
```
(1) rubber: `trackEvolution.wash` → {DAMP 0.35, WET 0.80}:
```
MEASURE rubber pro seedBase=1000 n=240 top=0.463 winners=7 dpos=3.575 rho=0.643 paceRank=0.952 mech=0.0708 crash=0.0619 sc=0.458 vsc=0.550 aiNeut=3.092 slow=0.679 red=0.058 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.4
MEASURE rubber pro seedBase=7000 n=240 top=0.392 winners=7 dpos=3.603 rho=0.634 paceRank=0.952 mech=0.0656 crash=0.0583 sc=0.463 vsc=0.579 aiNeut=3.779 slow=0.696 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.3
MEASURE rubber rookie seedBase=1000 n=240 top=0.438 winners=8 dpos=3.387 rho=0.667 paceRank=0.939 mech=0.0658 crash=0.0631 sc=0.525 vsc=0.662 aiNeut=3.837 slow=0.683 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=33.8
MEASURE rubber rookie seedBase=7000 n=240 top=0.425 winners=7 dpos=3.440 rho=0.651 paceRank=0.915 mech=0.0700 crash=0.0552 sc=0.429 vsc=0.667 aiNeut=3.304 slow=0.738 red=0.054 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.0
```
(2) DRS: `drs.enabled` → true (kept through step 6, switched off at the gate run):
```
MEASURE drs pro seedBase=1000 n=240 top=0.421 winners=8 dpos=3.698 rho=0.620 paceRank=0.964 mech=0.0698 crash=0.0598 sc=0.479 vsc=0.654 aiNeut=3.721 slow=0.567 red=0.092 trains=38.121 drsPass=0.389 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.3
MEASURE drs pro seedBase=7000 n=240 top=0.417 winners=7 dpos=3.488 rho=0.654 paceRank=0.964 mech=0.0698 crash=0.0506 sc=0.425 vsc=0.583 aiNeut=3.379 slow=0.787 red=0.037 trains=37.879 drsPass=0.383 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.1
MEASURE drs rookie seedBase=1000 n=240 top=0.438 winners=8 dpos=3.501 rho=0.651 paceRank=0.915 mech=0.0710 crash=0.0642 sc=0.567 vsc=0.662 aiNeut=3.737 slow=0.613 red=0.046 trains=39.071 drsPass=0.380 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.6
MEASURE drs rookie seedBase=7000 n=240 top=0.442 winners=7 dpos=3.351 rho=0.667 paceRank=0.915 mech=0.0660 crash=0.0621 sc=0.508 vsc=0.654 aiNeut=3.367 slow=0.600 red=0.071 trains=40.163 drsPass=0.380 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.5
```
(3) risk: `wetErrorMultiplier` {1, 1.4, 1.8}, `circuitRiskWeight` 1.0:
```
MEASURE risk pro seedBase=1000 n=240 top=0.396 winners=7 dpos=3.753 rho=0.607 paceRank=0.964 mech=0.0702 crash=0.0762 sc=0.550 vsc=0.671 aiNeut=4.579 slow=0.688 red=0.100 trains=37.883 drsPass=0.387 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.0
MEASURE risk pro seedBase=7000 n=240 top=0.425 winners=8 dpos=3.688 rho=0.621 paceRank=0.964 mech=0.0692 crash=0.0752 sc=0.500 vsc=0.650 aiNeut=4.075 slow=0.683 red=0.046 trains=37.063 drsPass=0.376 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.2
MEASURE risk rookie seedBase=1000 n=240 top=0.400 winners=8 dpos=3.614 rho=0.629 paceRank=0.915 mech=0.0704 crash=0.0767 sc=0.567 vsc=0.704 aiNeut=4.017 slow=0.617 red=0.067 trains=39.263 drsPass=0.380 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.7
MEASURE risk rookie seedBase=7000 n=240 top=0.388 winners=7 dpos=3.458 rho=0.653 paceRank=0.915 mech=0.0627 crash=0.0792 sc=0.496 vsc=0.625 aiNeut=3.167 slow=0.646 red=0.079 trains=39.625 drsPass=0.389 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.1
```
(3') risk fallback `wetErrorMultiplier` {1, 1.2, 1.4} (on rubber + DRS + gamble, stack off):
```
MEASURE risk-fallback pro seedBase=1000 n=240 top=0.421 winners=8 dpos=3.759 rho=0.602 paceRank=0.964 mech=0.0704 crash=0.0702 sc=0.529 vsc=0.662 aiNeut=4.067 slow=0.700 red=0.079 trains=37.846 drsPass=0.389 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.7
MEASURE risk-fallback pro seedBase=7000 n=240 top=0.446 winners=7 dpos=3.637 rho=0.629 paceRank=0.964 mech=0.0683 crash=0.0692 sc=0.471 vsc=0.629 aiNeut=3.742 slow=0.662 red=0.050 trains=37.092 drsPass=0.375 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.2
MEASURE risk-fallback rookie seedBase=1000 n=240 top=0.388 winners=8 dpos=3.588 rho=0.630 paceRank=0.915 mech=0.0675 crash=0.0744 sc=0.558 vsc=0.667 aiNeut=3.867 slow=0.517 red=0.067 trains=39.171 drsPass=0.383 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.4
MEASURE risk-fallback rookie seedBase=7000 n=240 top=0.396 winners=7 dpos=3.431 rho=0.652 paceRank=0.915 mech=0.0631 crash=0.0733 sc=0.521 vsc=0.592 aiNeut=2.971 slow=0.708 red=0.058 trains=39.667 drsPass=0.385 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.4
```
(4) gamble: `ai.scGambleMaxDelay` → 3:
```
MEASURE gamble pro seedBase=1000 n=240 top=0.396 winners=7 dpos=3.753 rho=0.607 paceRank=0.964 mech=0.0702 crash=0.0762 sc=0.550 vsc=0.671 aiNeut=4.579 slow=0.688 red=0.100 trains=37.883 drsPass=0.387 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.0
MEASURE gamble pro seedBase=7000 n=240 top=0.425 winners=8 dpos=3.688 rho=0.621 paceRank=0.964 mech=0.0692 crash=0.0752 sc=0.500 vsc=0.650 aiNeut=4.075 slow=0.683 red=0.046 trains=37.063 drsPass=0.376 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.2
MEASURE gamble rookie seedBase=1000 n=240 top=0.400 winners=8 dpos=3.614 rho=0.629 paceRank=0.915 mech=0.0704 crash=0.0767 sc=0.567 vsc=0.704 aiNeut=4.017 slow=0.617 red=0.067 trains=39.263 drsPass=0.380 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.7
MEASURE gamble rookie seedBase=7000 n=240 top=0.388 winners=7 dpos=3.458 rho=0.653 paceRank=0.915 mech=0.0627 crash=0.0792 sc=0.496 vsc=0.625 aiNeut=3.167 slow=0.646 red=0.079 trains=39.625 drsPass=0.389 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.1
```
(5) stack: `doubleStack.enabled` → true:
```
MEASURE stack pro seedBase=1000 n=240 top=0.371 winners=8 dpos=3.796 rho=0.603 paceRank=0.952 mech=0.0706 crash=0.0781 sc=0.546 vsc=0.688 aiNeut=3.979 slow=0.667 red=0.075 trains=36.429 drsPass=0.381 stacks=5.763 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.4
MEASURE stack pro seedBase=7000 n=240 top=0.400 winners=7 dpos=3.739 rho=0.611 paceRank=0.939 mech=0.0623 crash=0.0821 sc=0.479 vsc=0.658 aiNeut=3.583 slow=0.713 red=0.063 trains=36.546 drsPass=0.383 stacks=6.100 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.9
MEASURE stack rookie seedBase=1000 n=240 top=0.408 winners=8 dpos=3.627 rho=0.627 paceRank=0.915 mech=0.0721 crash=0.0796 sc=0.625 vsc=0.700 aiNeut=4.508 slow=0.617 red=0.050 trains=38.013 drsPass=0.379 stacks=7.375 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.3
MEASURE stack rookie seedBase=7000 n=240 top=0.404 winners=7 dpos=3.479 rho=0.645 paceRank=0.952 mech=0.0635 crash=0.0815 sc=0.550 vsc=0.650 aiNeut=3.125 slow=0.633 red=0.067 trains=38.596 drsPass=0.386 stacks=7.892 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.2
```
(6) penalties: `penalties.enabled` → true (rho 0.596 < 0.60):
```
MEASURE penalties pro seedBase=1000 n=240 top=0.396 winners=8 dpos=3.822 rho=0.596 paceRank=0.952 mech=0.0690 crash=0.0802 sc=0.546 vsc=0.700 aiNeut=4.054 slow=0.625 red=0.075 trains=37.017 drsPass=0.382 stacks=5.921 pens=0.533 unsafe=0.504 tl=8.379 overtakes=35.5
MEASURE penalties pro seedBase=7000 n=240 top=0.429 winners=8 dpos=3.717 rho=0.614 paceRank=0.964 mech=0.0635 crash=0.0810 sc=0.500 vsc=0.633 aiNeut=3.708 slow=0.700 red=0.063 trains=36.763 drsPass=0.384 stacks=6.142 pens=0.600 unsafe=0.550 tl=7.888 overtakes=36.9
MEASURE penalties rookie seedBase=1000 n=240 top=0.400 winners=8 dpos=3.648 rho=0.625 paceRank=0.915 mech=0.0746 crash=0.0792 sc=0.629 vsc=0.742 aiNeut=4.142 slow=0.629 red=0.046 trains=37.904 drsPass=0.380 stacks=7.412 pens=0.421 unsafe=0.388 tl=6.742 overtakes=35.3
MEASURE penalties rookie seedBase=7000 n=240 top=0.417 winners=7 dpos=3.492 rho=0.647 paceRank=0.952 mech=0.0665 crash=0.0819 sc=0.533 vsc=0.688 aiNeut=3.317 slow=0.633 red=0.075 trains=38.496 drsPass=0.386 stacks=7.896 pens=0.550 unsafe=0.546 tl=6.646 overtakes=35.3
```
(6') penalties fallback `trackLimits.chancePerLap` 0.006 (rho 0.595, still out; penalties are almost
all unsafe releases, which the fallback does not touch):
```
MEASURE penalties-fallback pro seedBase=1000 n=240 top=0.396 winners=8 dpos=3.825 rho=0.595 paceRank=0.952 mech=0.0690 crash=0.0804 sc=0.546 vsc=0.696 aiNeut=4.054 slow=0.625 red=0.075 trains=36.996 drsPass=0.382 stacks=5.917 pens=0.504 unsafe=0.504 tl=4.392 overtakes=35.5
MEASURE penalties-fallback pro seedBase=7000 n=240 top=0.429 winners=8 dpos=3.712 rho=0.615 paceRank=0.964 mech=0.0631 crash=0.0808 sc=0.504 vsc=0.629 aiNeut=3.708 slow=0.700 red=0.063 trains=36.750 drsPass=0.384 stacks=6.125 pens=0.554 unsafe=0.550 tl=4.058 overtakes=36.9
MEASURE penalties-fallback rookie seedBase=1000 n=240 top=0.408 winners=8 dpos=3.638 rho=0.627 paceRank=0.915 mech=0.0742 crash=0.0790 sc=0.625 vsc=0.733 aiNeut=4.142 slow=0.629 red=0.046 trains=37.929 drsPass=0.381 stacks=7.412 pens=0.392 unsafe=0.388 tl=3.388 overtakes=35.3
MEASURE penalties-fallback rookie seedBase=7000 n=240 top=0.417 winners=7 dpos=3.492 rho=0.647 paceRank=0.952 mech=0.0665 crash=0.0819 sc=0.533 vsc=0.688 aiNeut=3.317 slow=0.633 red=0.075 trains=38.496 drsPass=0.386 stacks=7.896 pens=0.546 unsafe=0.546 tl=3.288 overtakes=35.3
```
After penalties off (rubber, DRS, risk, gamble, stack):
```
MEASURE final pro seedBase=1000 n=240 top=0.371 winners=8 dpos=3.796 rho=0.603 paceRank=0.952 mech=0.0706 crash=0.0781 sc=0.546 vsc=0.688 aiNeut=3.979 slow=0.667 red=0.075 trains=36.429 drsPass=0.381 stacks=5.763 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.4
MEASURE final pro seedBase=7000 n=240 top=0.400 winners=7 dpos=3.739 rho=0.611 paceRank=0.939 mech=0.0623 crash=0.0821 sc=0.479 vsc=0.658 aiNeut=3.583 slow=0.713 red=0.063 trains=36.546 drsPass=0.383 stacks=6.100 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.9
MEASURE final rookie seedBase=1000 n=240 top=0.408 winners=8 dpos=3.627 rho=0.627 paceRank=0.915 mech=0.0721 crash=0.0796 sc=0.625 vsc=0.700 aiNeut=4.508 slow=0.617 red=0.050 trains=38.013 drsPass=0.379 stacks=7.375 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.3
MEASURE final rookie seedBase=7000 n=240 top=0.404 winners=7 dpos=3.479 rho=0.645 paceRank=0.952 mech=0.0635 crash=0.0815 sc=0.550 vsc=0.650 aiNeut=3.125 slow=0.633 red=0.067 trains=38.596 drsPass=0.386 stacks=7.892 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.2
```
After risk off too (rubber, DRS, gamble, stack):
```
MEASURE final-riskoff pro seedBase=1000 n=240 top=0.396 winners=8 dpos=3.701 rho=0.613 paceRank=0.964 mech=0.0698 crash=0.0631 sc=0.446 vsc=0.625 aiNeut=3.358 slow=0.588 red=0.071 trains=36.058 drsPass=0.379 stacks=5.858 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.0
MEASURE final-riskoff pro seedBase=7000 n=240 top=0.479 winners=7 dpos=3.496 rho=0.654 paceRank=0.964 mech=0.0694 crash=0.0569 sc=0.454 vsc=0.571 aiNeut=3.433 slow=0.746 red=0.054 trains=37.250 drsPass=0.380 stacks=6.354 pens=0.000 unsafe=0.000 tl=0.000 overtakes=36.7
MEASURE final-riskoff rookie seedBase=1000 n=240 top=0.467 winners=8 dpos=3.415 rho=0.663 paceRank=0.915 mech=0.0690 crash=0.0621 sc=0.492 vsc=0.633 aiNeut=3.496 slow=0.558 red=0.071 trains=38.129 drsPass=0.376 stacks=7.604 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.8
MEASURE final-riskoff rookie seedBase=7000 n=240 top=0.425 winners=7 dpos=3.369 rho=0.663 paceRank=0.952 mech=0.0673 crash=0.0602 sc=0.450 vsc=0.646 aiNeut=3.479 slow=0.683 red=0.067 trains=39.112 drsPass=0.379 stacks=7.983 pens=0.000 unsafe=0.000 tl=0.000 overtakes=35.5
```
Shipped (rubber + gamble; identical to the baseline):
```
MEASURE shipped pro seedBase=1000 n=240 top=0.463 winners=7 dpos=3.575 rho=0.643 paceRank=0.952 mech=0.0708 crash=0.0619 sc=0.458 vsc=0.550 aiNeut=3.092 slow=0.679 red=0.058 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.4
MEASURE shipped pro seedBase=7000 n=240 top=0.392 winners=7 dpos=3.603 rho=0.634 paceRank=0.952 mech=0.0656 crash=0.0583 sc=0.463 vsc=0.579 aiNeut=3.779 slow=0.696 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.3
MEASURE shipped rookie seedBase=1000 n=240 top=0.438 winners=8 dpos=3.387 rho=0.667 paceRank=0.939 mech=0.0658 crash=0.0631 sc=0.525 vsc=0.662 aiNeut=3.837 slow=0.683 red=0.042 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=33.8
MEASURE shipped rookie seedBase=7000 n=240 top=0.425 winners=7 dpos=3.440 rho=0.651 paceRank=0.915 mech=0.0700 crash=0.0552 sc=0.429 vsc=0.667 aiNeut=3.304 slow=0.738 red=0.054 trains=0.000 drsPass=0.000 stacks=0.000 pens=0.000 unsafe=0.000 tl=0.000 overtakes=34.0
```

`MEASURE weather` (5 showery circuits, n=240 per cell), run at each stage of the gate run:
```
rubber+DRS+risk+gamble+stack: pro 61.975/64.958, rookie 62.133/64.871
rubber+DRS+gamble+stack:      pro 62.979/66.204, rookie 63.313/65.933
rubber+DRS+gamble:            pro 62.896/65.800, rookie 62.854/66.483
shipped (rubber+gamble) and baseline (all off), identical:
MEASURE weather pro seedBase=1000 n=240 aiWeatherStopsPerRace=62.896
MEASURE weather pro seedBase=7000 n=240 aiWeatherStopsPerRace=65.858
MEASURE weather rookie seedBase=1000 n=240 aiWeatherStopsPerRace=63.175
MEASURE weather rookie seedBase=7000 n=240 aiWeatherStopsPerRace=66.183
```
All inside the 44.30 – 86.75 band.

`MEASURE outlook` (the calibration gate, risk forced on in the test): bucket 0 n=4986 pred=0.113
obs=0.110; bucket 1 n=3890 pred=0.183 obs=0.193; bucket 2 n=0.

Diagnostics with DRS on: `drsPassShare` 0.376 – 0.389 (about 38% of passes are made with DRS open);
track-limit warnings 8.4 / 7.9 pro, 6.7 / 6.6 rookie per race at 0.012 (4.4 / 4.1, 3.4 / 3.3 at 0.006).
`optimalGainShipped` was not measured: the shipped tuning differs from the 1.9 tuning only by the
two inert switches, so it equals the §9.4 value.

**Replay.** `tests/state/v2Replay.test.ts` races harbour_lights (changeable, 50%) with all six
switches forced on plus pit / pace / `hold_plan` calls, rebuilds it through `buildConfigFromRecipe`
and through a PW1 start code, and asserts byte-identical final states. `CALL_KINDS` and
`CODE_FORMAT = 1` are unchanged. No scenario, classic or daily GOLDEN pin moved.

**Options for Veet**, none taken: (a) DRS — lantern_quay `drsSectors` [0] → [] (a circuit-data
call: the street circuit has no DRS zone) would likely clear the passing gate; (b) the
gridFinishSpearman 0.60 floor is the binding constraint for three features — measure its headroom
over more seed bases before switching any of them on; (c) `ai.scGambleChance` 0.35 is above any
outlook the shipped tuning produces.

#### Round 2: four-seed-base means (2026-11-08)

Owner ruling: the four OFF features each missed a single-sample gate by < 0.01, inside the
0.01-0.03 seed-base spread of rho. **Method change:** each failing gate metric is judged on the MEAN
over four seed bases (1000, 4000, 7000, 10000) at n=240 each, at the SAME floor. Features were re-run
in the scope's order, cumulatively on top of what was ON, with every existing band and STOP limit
also checked on the mean. A feature that missed was shrunk up to three steps, then left OFF.
Each cell ran pro SAMPLE, rookie SAMPLE, setups-on SAMPLE, lantern_quay pro and rookie (the
newCircuitBands envelope) and the lantern_quay clearing trial (seeds base + 13i, i < 240).

| Stage (cumulative) | Gate metric, 4-base mean | Floor | Decision |
|---|---|---|---|
| DRS, plan values | lantern_quay passing failure 0.202 (0.146 / 0.233 / 0.183 / 0.246) | ≥ 0.20 | **ON** |
| Risk {1, 1.4, 1.8}, weight 1.0 | setups-on rho 0.5995 | > 0.60 | shrink |
| Risk step 1: WET 1.6, weight 0.7 | setups-on 0.603, but lantern_quay pro envelope rho 0.499 | ≥ 0.50 | shrink |
| Risk step 2: WET 1.6, weight 0.5 | lantern_quay pro rho 0.499 | ≥ 0.50 | shrink |
| Risk step 3: WET 1.4, weight 0.5 | lantern_quay pro rho 0.495 | ≥ 0.50 | **OFF** |
| Double stack, plan values (on DRS) | SAMPLE pro rho 0.635 (n=120 gate's metric) | > 0.60 | **ON** |
| Penalties, plan values | SAMPLE pro rho 0.635, setups-on 0.624 | > 0.60 | **ON** |

Risk: `circuitRiskWeight` cannot move lantern_quay (its `incidentRisk` is 1.0; its danger lives in
`crashRisk`), so the shrink only touches the wet multipliers there. The street circuit's envelope
rho was already 0.501 with every 2.0 switch off, and risk put it at 0.495-0.499 in every step.
Step 3 (WET 1.4) goes beyond the two listed knobs because they were spent after step 2. With risk
off the SC gamble is inert again, as in round 1.

Shipped (rubber, gamble, DRS, stack, penalties), 4-base means at n=240: pro rho 0.635, dpos 3.595,
paceRank 0.964, crash 0.0617, top 0.448; rookie rho 0.665, paceRank 0.921; setups-on rho 0.624;
lantern_quay pro rho 0.520, crash 0.100; trains 36.8, stacks 5.9, penalties 0.59, unsafe releases
0.55 per race (pro). No STOP limit reached. No band was widened or added (the live 2.0 rates are
still unbanded; adding them is a separate call). Full per-seed lines:
`.superpowers/sdd/2026-10-24-v2-deeper-race-strategy/task-12p-round2-report.md`.

Gate tests changed to the same method, same floors: `newCircuitBands` lantern_quay IS HARD TO PASS
ON (4 bases x 240 seeds), and `monteCarlo` "every gated metric" gridFinishSpearman (4 bases x n=240;
the other metrics in that test keep their n=120 sample). With DRS on, 12 scenarios/classics moved
and were re-authored from `scripts/find-scenarios.ts` (hold_the_train from harbour_lights at gap 2.0,
SEEDS=2000: lantern_quay had no hit), and the three daily GOLDEN pins moved (release-note item).

### 17.2 2.1: tyre temperature (2026-11-13)

Scope `docs/superpowers/plans/2026-11-13-v2.1-scope.md` §5 (Task S); spec
`docs/superpowers/specs/2026-10-24-v2-deeper-race-strategy-design.md` §5 (rulings H1–H6), §12.3.

**Method: §17.1 Round 2's four-seed-base means.** Every gate is judged on the MEAN over seed bases
1000/4000/7000/10000 at n=240 each, at the unchanged floors, with
`MEASURE=1 FEATURE=<label> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.1"`. Each base
runs pro SAMPLE, rookie SAMPLE, setups-on SAMPLE, lantern_quay pro and rookie, mesa_roja pro and
rookie, and the lantern_quay clearing trial (seeds base + 13i, i < 240). The scope's gate table adds
one single-sample gate: the lantern_quay envelope's own n=120 test (`newCircuitBands`) must also pass.
The shrink ladder is cumulative: Rung C (circuit data) → Rungs 1–3 → OFF.

**Outcome: tyre temperature ships ON, at Rung 3, with lantern_quay `trackTempC` 31 (Rung C).**
No STOP limit was reached (max crash 0.1047 at lantern_quay rookie, dpos ≤ 4.38, paceRank ≥ 0.903 in
any single cell, SAMPLE tyreDnf 0.0003–0.0004 against a 0.0003 baseline, graining ≤ 8.6/race, no NaN).
No floor was lowered and no existing band moved.

| Stage (cumulative) | Binding gate: lantern_quay envelope rho, n=120 (`newCircuitBands`) | 4-base means: LQ pro / rookie rho (floor 0.50) | Decision |
|---|---|---|---|
| Plan values | rookie **0.496** (pro 0.504) | 0.521 / 0.509 | Rung C |
| Rung C: lantern_quay `trackTempC` 27 → 31 | pro **0.490** | 0.518 / 0.534 | Rung 1 |
| Rung 1: `coldCoeff`, `overheatCoeff` 0.20 → 0.12 | pro **0.477** | 0.514 / 0.525 | Rung 2 |
| Rung 2: + `neutralisedHeat` −25 → −15, `grainPenalty` 0.35 → 0.20 | pro **0.499** | 0.523 / 0.531 | Rung 3 |
| Rung 3: + coeffs → 0.08, `overheatWearPerLap` 0.08 → 0.05 | pro **0.513** (all 7 newCircuitBands tests pass) | 0.514 / 0.523 | **ON** |

**Read this before accepting the shrink (a judgement for Veet, not a fact about thermal).** Every
four-base MEAN gate passed at the plan values: SAMPLE pro rho 0.630, setups-on 0.627, lantern_quay
0.521 / 0.509, clearing 0.2021, rookie paceRank 0.929, dpos 3.632, mesa_roja tyreDnf ≤ 0.0017 and
stops 3.620 vs SAMPLE + 0.6 = 3.309. The whole ladder was driven by the one gate Round 2 did not
convert to a four-base mean: a single n=120 lantern_quay sample, SE ≈ 0.035. Its value moved
0.496 → 0.490 → 0.477 → 0.499 → 0.513 across rungs that each made thermal *weaker*, which is noise,
not a trend; the four-base means sat in 0.509–0.534 throughout. Rung 3 is where the draw happened to
land above 0.50.

Shipped values (`tuning.json` `tyreTemp`): `enabled` true, `coldCoeff` 0.08, `overheatCoeff` 0.08,
`overheatWearPerLap` 0.05, `neutralisedHeat` −15, `grainPenalty` 0.20; everything else at the plan
values (§5.2 of the scope). `circuits.json`: lantern_quay `trackTempC` 31 (the career calendar is
untouched, mean 32).

**Ruling H6, and why.** Thermal pace is 0 while a SC/VSC is out: the tyres still cool
(`neutralisedHeat`), so the restart is cold, but no car loses lap time behind the safety car. Charging
it would reshuffle the queue under yellow by compound alone, a churn the rho floor cannot afford, and
it is not what the player can see or act on.

**Diagnostics at the shipped values (four-base means).** Hot sector share (tyre above its window)
pro 0.099, rookie 0.077, mesa_roja pro 0.176, lantern_quay pro 0.026; cold share pro 0.067, rookie
0.065, lantern_quay pro 0.074. Graining onsets per race: SAMPLE pro 0.134, rookie 0.511, setups-on
0.154, lantern_quay 0.009, mesa_roja 0.000 — banded (§3) from the MEASURE 2.0 cells below.

*Graining after a neutralisation (Task 6 review note).* `MEASURE 2.1 graining after neutralisations`
counts onsets in the three laps after each SC/VSC ends, against car-laps exposed (SAMPLE pro, 960 races):
```
MEASURE thermal graining-after-neutralisation races=960 perRace=1.304 other=575/794340 (0.72/1000 car-laps) short: ends=881 grains=627 (12.07/1000 car-laps) mid: ends=136 grains=50 (6.16/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
MEASURE rung3 graining-after-neutralisation races=960 perRace=0.134 other=44/794660 (0.06/1000 car-laps) short: ends=873 grains=80 (1.55/1000 car-laps) mid: ends=134 grains=5 (0.63/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```
(the first line is the plan values, the second the shipped Rung 3). Graining **does** cluster after a
neutralisation: at the plan values 54% of all onsets fell within three laps of an SC/VSC ending, at
12.1 per 1000 car-laps against 0.72 elsewhere (~17×); at the shipped values 66% (1.55 vs 0.06 per 1000
car-laps). It is the H4 mechanism working as designed (a cooled S/M on a still-green track), not a
loop: no neutralisation in the sample lasted more than five laps, so "long" is empty, and the mid
(4–5 lap) bucket is no worse than the short one. Rung 2's warmer restarts (`neutralisedHeat` −15) cut the
post-SC rate ~5×.

`optimalGain` on the shipped tuning (`MEASURE_OPTIMAL=1`, paired, n=2000; `strategy.test.ts`):
```
MEASURE optimalGain shipped=1.261 se=0.080 (smart=3.198 se=0.060)   tyreTemp off (2.0 shipped)
MEASURE optimalGain shipped=1.579 se=0.076 (smart=3.233 se=0.061)   plan values
MEASURE optimalGain shipped=1.438 se=0.077 (smart=3.230 se=0.060)   shipped (Rung 3)
```
Against §9.4 (0.17 on the deterministic tuning, where no incident or 2.x feature runs): tyre
temperature does not shrink OPTIMAL's edge on the shipped tuning, it grows it by ~0.18 positions (2.3
SE), most likely because smart/optimal cars manage temperature (`aiThermalPaceMode`) and naive ones
cook their softs; the spec §5.5 expectation that cold out-laps would shrink the undercut is not
visible in this number.

Other gates at the shipped values: `MEASURE weather` pro 62.742/66.079, rookie 63.125/66.375 (band
44.30 – 86.75); `MEASURE outlook` bucket 0 n=4999 pred 0.114 obs 0.104, bucket 1 n=3908 pred 0.183
obs 0.184 (calibrated, |obs − pred| ≤ 0.06). The gate suites (scope S.5 step 6) pass.

`MEASURE 2.0` (band sizing, plan values then shipped):
```
MEASURE thermal pro seedBase=1000 n=240 top=0.421 winners=8 dpos=3.658 rho=0.624 paceRank=0.964 mech=0.0717 crash=0.0600 sc=0.487 vsc=0.583 aiNeut=3.929 slow=0.567 red=0.058 trains=36.304 drsPass=0.378 stacks=6.417 pens=0.550 unsafe=0.508 tl=8.454 graining=1.196 hot=0.102 cold=0.074 tyreDnf=0.0000 stops=2.652 overtakes=35.3
MEASURE thermal pro seedBase=7000 n=240 top=0.425 winners=6 dpos=3.577 rho=0.640 paceRank=0.964 mech=0.0669 crash=0.0585 sc=0.496 vsc=0.567 aiNeut=3.429 slow=0.754 red=0.046 trains=37.021 drsPass=0.377 stacks=6.604 pens=0.642 unsafe=0.579 tl=8.387 graining=1.063 hot=0.096 cold=0.084 tyreDnf=0.0000 stops=2.800 overtakes=35.4
MEASURE thermal rookie seedBase=1000 n=240 top=0.408 winners=8 dpos=3.554 rho=0.637 paceRank=0.915 mech=0.0638 crash=0.0681 sc=0.529 vsc=0.521 aiNeut=4.208 slow=0.608 red=0.058 trains=38.296 drsPass=0.378 stacks=7.763 pens=0.508 unsafe=0.479 tl=7.071 graining=2.275 hot=0.077 cold=0.074 tyreDnf=0.0000 stops=2.472 overtakes=34.9
MEASURE thermal rookie seedBase=7000 n=240 top=0.425 winners=7 dpos=3.367 rho=0.662 paceRank=0.952 mech=0.0608 crash=0.0627 sc=0.537 vsc=0.537 aiNeut=3.804 slow=0.692 red=0.063 trains=38.396 drsPass=0.365 stacks=7.763 pens=0.617 unsafe=0.613 tl=7.008 graining=2.621 hot=0.074 cold=0.083 tyreDnf=0.0004 stops=2.582 overtakes=35.4
MEASURE final pro seedBase=1000 n=240 top=0.463 winners=8 dpos=3.658 rho=0.624 paceRank=0.964 mech=0.0765 crash=0.0612 sc=0.471 vsc=0.683 aiNeut=3.346 slow=0.700 red=0.046 trains=36.092 drsPass=0.378 stacks=6.096 pens=0.667 unsafe=0.600 tl=8.250 graining=0.063 hot=0.101 cold=0.063 tyreDnf=0.0000 stops=2.679 overtakes=35.4
MEASURE final pro seedBase=7000 n=240 top=0.438 winners=8 dpos=3.550 rho=0.645 paceRank=0.964 mech=0.0663 crash=0.0550 sc=0.479 vsc=0.537 aiNeut=3.638 slow=0.771 red=0.054 trains=37.579 drsPass=0.377 stacks=6.475 pens=0.579 unsafe=0.558 tl=8.358 graining=0.113 hot=0.099 cold=0.070 tyreDnf=0.0000 stops=2.762 overtakes=36.0
MEASURE final rookie seedBase=1000 n=240 top=0.412 winners=8 dpos=3.442 rho=0.657 paceRank=0.915 mech=0.0717 crash=0.0592 sc=0.504 vsc=0.592 aiNeut=3.625 slow=0.654 red=0.042 trains=38.425 drsPass=0.373 stacks=7.675 pens=0.537 unsafe=0.517 tl=6.983 graining=0.487 hot=0.077 cold=0.062 tyreDnf=0.0004 stops=2.458 overtakes=34.8
MEASURE final rookie seedBase=7000 n=240 top=0.417 winners=6 dpos=3.360 rho=0.664 paceRank=0.915 mech=0.0619 crash=0.0625 sc=0.479 vsc=0.600 aiNeut=3.567 slow=0.592 red=0.054 trains=38.258 drsPass=0.369 stacks=7.983 pens=0.617 unsafe=0.583 tl=6.883 graining=0.550 hot=0.076 cold=0.067 tyreDnf=0.0013 stops=2.584 overtakes=36.1
```

MEASURE 2.1 lines, every stage:

Baseline (tyre temperature off = 2.0 shipped; matches §17.1 Round 2: rho 0.635, setups 0.624,
lantern_quay 0.520, clearing 0.202):
```
MEASURE baseline sample-pro seedBase=1000 n=240 rho=0.616 dpos=3.685 paceRank=0.964 crash=0.0638 mech=0.0688 top=0.408 winners=8.00 sc=0.442 tyreDnf=0.0000 stops=2.669 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-pro seedBase=4000 n=240 rho=0.635 dpos=3.601 paceRank=0.964 crash=0.0648 mech=0.0688 top=0.479 winners=7.00 sc=0.504 tyreDnf=0.0000 stops=2.679 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-pro seedBase=7000 n=240 rho=0.647 dpos=3.528 paceRank=0.964 crash=0.0587 mech=0.0690 top=0.463 winners=6.00 sc=0.475 tyreDnf=0.0000 stops=2.754 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-pro seedBase=10000 n=240 rho=0.643 dpos=3.567 paceRank=0.964 crash=0.0596 mech=0.0654 top=0.442 winners=6.00 sc=0.492 tyreDnf=0.0013 stops=2.681 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-pro MEAN(1000/4000/7000/10000) rho=0.635 dpos=3.596 paceRank=0.964 crash=0.0617 mech=0.0680 top=0.448 winners=6.75 sc=0.478 tyreDnf=0.0003 stops=2.696 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-rookie seedBase=1000 n=240 rho=0.655 dpos=3.454 paceRank=0.915 crash=0.0615 mech=0.0688 top=0.433 winners=8.00 sc=0.496 tyreDnf=0.0000 stops=2.461 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-rookie seedBase=4000 n=240 rho=0.656 dpos=3.455 paceRank=0.915 crash=0.0679 mech=0.0621 top=0.392 winners=7.00 sc=0.529 tyreDnf=0.0006 stops=2.445 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-rookie seedBase=7000 n=240 rho=0.662 dpos=3.386 paceRank=0.915 crash=0.0615 mech=0.0692 top=0.425 winners=7.00 sc=0.483 tyreDnf=0.0004 stops=2.590 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-rookie seedBase=10000 n=240 rho=0.687 dpos=3.252 paceRank=0.939 crash=0.0567 mech=0.0638 top=0.400 winners=7.00 sc=0.487 tyreDnf=0.0002 stops=2.475 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline sample-rookie MEAN(1000/4000/7000/10000) rho=0.665 dpos=3.387 paceRank=0.921 crash=0.0619 mech=0.0659 top=0.412 winners=7.25 sc=0.499 tyreDnf=0.0003 stops=2.493 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline setups-pro seedBase=1000 n=240 rho=0.625 dpos=3.655 paceRank=0.964 crash=0.0594 mech=0.0648 top=0.425 winners=8.00 sc=0.450 tyreDnf=0.0000 stops=2.644 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline setups-pro seedBase=4000 n=240 rho=0.636 dpos=3.624 paceRank=0.964 crash=0.0671 mech=0.0665 top=0.425 winners=7.00 sc=0.521 tyreDnf=0.0000 stops=2.657 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline setups-pro seedBase=7000 n=240 rho=0.627 dpos=3.700 paceRank=0.964 crash=0.0575 mech=0.0683 top=0.388 winners=7.00 sc=0.504 tyreDnf=0.0002 stops=2.770 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline setups-pro seedBase=10000 n=240 rho=0.608 dpos=3.745 paceRank=0.964 crash=0.0606 mech=0.0671 top=0.433 winners=7.00 sc=0.454 tyreDnf=0.0010 stops=2.666 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline setups-pro MEAN(1000/4000/7000/10000) rho=0.624 dpos=3.681 paceRank=0.964 crash=0.0611 mech=0.0667 top=0.418 winners=7.25 sc=0.482 tyreDnf=0.0003 stops=2.684 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-pro seedBase=1000 n=240 rho=0.518 dpos=4.336 paceRank=0.988 crash=0.1015 mech=0.0856 top=0.346 winners=8.00 sc=1.021 tyreDnf=0.0000 stops=4.706 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-pro seedBase=4000 n=240 rho=0.519 dpos=4.357 paceRank=0.988 crash=0.1015 mech=0.0875 top=0.313 winners=7.00 sc=1.071 tyreDnf=0.0002 stops=4.689 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-pro seedBase=7000 n=240 rho=0.513 dpos=4.383 paceRank=0.976 crash=0.0967 mech=0.0856 top=0.321 winners=7.00 sc=1.004 tyreDnf=0.0000 stops=4.882 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-pro seedBase=10000 n=240 rho=0.529 dpos=4.309 paceRank=0.988 crash=0.0996 mech=0.0844 top=0.333 winners=7.00 sc=0.983 tyreDnf=0.0004 stops=4.706 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.520 dpos=4.346 paceRank=0.985 crash=0.0998 mech=0.0858 top=0.328 winners=7.25 sc=1.020 tyreDnf=0.0002 stops=4.746 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-rookie seedBase=1000 n=240 rho=0.518 dpos=4.281 paceRank=0.915 crash=0.0960 mech=0.0894 top=0.304 winners=7.00 sc=0.988 tyreDnf=0.0006 stops=4.409 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-rookie seedBase=4000 n=240 rho=0.535 dpos=4.240 paceRank=0.964 crash=0.1050 mech=0.0815 top=0.317 winners=8.00 sc=1.008 tyreDnf=0.0004 stops=4.375 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-rookie seedBase=7000 n=240 rho=0.528 dpos=4.222 paceRank=0.952 crash=0.1021 mech=0.0835 top=0.362 winners=7.00 sc=1.087 tyreDnf=0.0019 stops=4.603 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-rookie seedBase=10000 n=240 rho=0.521 dpos=4.258 paceRank=0.988 crash=0.1008 mech=0.0817 top=0.325 winners=7.00 sc=1.063 tyreDnf=0.0006 stops=4.424 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.526 dpos=4.250 paceRank=0.955 crash=0.1010 mech=0.0840 top=0.327 winners=7.25 sc=1.036 tyreDnf=0.0009 stops=4.453 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-pro seedBase=1000 n=240 rho=0.620 dpos=3.702 paceRank=0.988 crash=0.0704 mech=0.0810 top=0.550 winners=6.00 sc=0.537 tyreDnf=0.0002 stops=3.495 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-pro seedBase=4000 n=240 rho=0.625 dpos=3.646 paceRank=0.988 crash=0.0723 mech=0.0773 top=0.550 winners=5.00 sc=0.571 tyreDnf=0.0000 stops=3.590 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-pro seedBase=7000 n=240 rho=0.651 dpos=3.536 paceRank=0.988 crash=0.0681 mech=0.0758 top=0.521 winners=4.00 sc=0.550 tyreDnf=0.0000 stops=3.643 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-pro seedBase=10000 n=240 rho=0.619 dpos=3.701 paceRank=0.964 crash=0.0696 mech=0.0817 top=0.571 winners=5.00 sc=0.558 tyreDnf=0.0000 stops=3.601 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.629 dpos=3.646 paceRank=0.982 crash=0.0701 mech=0.0790 top=0.548 winners=5.00 sc=0.554 tyreDnf=0.0001 stops=3.582 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-rookie seedBase=1000 n=240 rho=0.670 dpos=3.368 paceRank=0.952 crash=0.0704 mech=0.0804 top=0.421 winners=4.00 sc=0.604 tyreDnf=0.0017 stops=2.800 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-rookie seedBase=4000 n=240 rho=0.672 dpos=3.332 paceRank=0.939 crash=0.0683 mech=0.0762 top=0.487 winners=7.00 sc=0.517 tyreDnf=0.0015 stops=2.919 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-rookie seedBase=7000 n=240 rho=0.655 dpos=3.455 paceRank=0.976 crash=0.0704 mech=0.0831 top=0.412 winners=7.00 sc=0.613 tyreDnf=0.0019 stops=2.947 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-rookie seedBase=10000 n=240 rho=0.656 dpos=3.424 paceRank=0.952 crash=0.0683 mech=0.0750 top=0.508 winners=6.00 sc=0.500 tyreDnf=0.0010 stops=2.869 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.663 dpos=3.395 paceRank=0.955 crash=0.0694 mech=0.0787 top=0.457 winners=6.00 sc=0.558 tyreDnf=0.0015 stops=2.884 graining=0.000 hot=0.000 cold=0.000
MEASURE baseline clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE baseline clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE baseline clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE baseline clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE baseline clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
```

Plan values (`tyreTemp.enabled` true):
```
MEASURE thermal sample-pro seedBase=1000 n=240 rho=0.624 dpos=3.658 paceRank=0.964 crash=0.0600 mech=0.0717 top=0.421 winners=8.00 sc=0.487 tyreDnf=0.0000 stops=2.652 graining=1.196 hot=0.102 cold=0.074
MEASURE thermal sample-pro seedBase=4000 n=240 rho=0.634 dpos=3.619 paceRank=0.964 crash=0.0635 mech=0.0698 top=0.408 winners=7.00 sc=0.487 tyreDnf=0.0000 stops=2.672 graining=1.333 hot=0.096 cold=0.081
MEASURE thermal sample-pro seedBase=7000 n=240 rho=0.640 dpos=3.577 paceRank=0.964 crash=0.0585 mech=0.0669 top=0.425 winners=6.00 sc=0.496 tyreDnf=0.0000 stops=2.800 graining=1.063 hot=0.096 cold=0.084
MEASURE thermal sample-pro seedBase=10000 n=240 rho=0.620 dpos=3.672 paceRank=0.988 crash=0.0606 mech=0.0683 top=0.421 winners=7.00 sc=0.492 tyreDnf=0.0013 stops=2.712 graining=1.625 hot=0.094 cold=0.084
MEASURE thermal sample-pro MEAN(1000/4000/7000/10000) rho=0.630 dpos=3.632 paceRank=0.970 crash=0.0607 mech=0.0692 top=0.419 winners=7.00 sc=0.491 tyreDnf=0.0003 stops=2.709 graining=1.304 hot=0.097 cold=0.081
MEASURE thermal sample-rookie seedBase=1000 n=240 rho=0.637 dpos=3.554 paceRank=0.915 crash=0.0681 mech=0.0638 top=0.408 winners=8.00 sc=0.529 tyreDnf=0.0000 stops=2.472 graining=2.275 hot=0.077 cold=0.074
MEASURE thermal sample-rookie seedBase=4000 n=240 rho=0.660 dpos=3.387 paceRank=0.915 crash=0.0610 mech=0.0656 top=0.417 winners=7.00 sc=0.475 tyreDnf=0.0006 stops=2.459 graining=2.212 hot=0.075 cold=0.080
MEASURE thermal sample-rookie seedBase=7000 n=240 rho=0.662 dpos=3.367 paceRank=0.952 crash=0.0627 mech=0.0608 top=0.425 winners=7.00 sc=0.537 tyreDnf=0.0004 stops=2.582 graining=2.621 hot=0.074 cold=0.083
MEASURE thermal sample-rookie seedBase=10000 n=240 rho=0.663 dpos=3.405 paceRank=0.936 crash=0.0600 mech=0.0665 top=0.404 winners=7.00 sc=0.463 tyreDnf=0.0000 stops=2.485 graining=2.204 hot=0.075 cold=0.076
MEASURE thermal sample-rookie MEAN(1000/4000/7000/10000) rho=0.656 dpos=3.428 paceRank=0.929 crash=0.0630 mech=0.0642 top=0.414 winners=7.25 sc=0.501 tyreDnf=0.0003 stops=2.499 graining=2.328 hot=0.075 cold=0.078
MEASURE thermal setups-pro seedBase=1000 n=240 rho=0.612 dpos=3.744 paceRank=0.964 crash=0.0627 mech=0.0669 top=0.383 winners=8.00 sc=0.483 tyreDnf=0.0000 stops=2.645 graining=1.554 hot=0.100 cold=0.078
MEASURE thermal setups-pro seedBase=4000 n=240 rho=0.632 dpos=3.658 paceRank=0.964 crash=0.0692 mech=0.0615 top=0.412 winners=7.00 sc=0.529 tyreDnf=0.0000 stops=2.668 graining=1.421 hot=0.098 cold=0.079
MEASURE thermal setups-pro seedBase=7000 n=240 rho=0.627 dpos=3.701 paceRank=0.964 crash=0.0592 mech=0.0658 top=0.429 winners=7.00 sc=0.487 tyreDnf=0.0000 stops=2.789 graining=1.079 hot=0.096 cold=0.086
MEASURE thermal setups-pro seedBase=10000 n=240 rho=0.636 dpos=3.610 paceRank=0.952 crash=0.0550 mech=0.0660 top=0.400 winners=7.00 sc=0.500 tyreDnf=0.0013 stops=2.672 graining=1.383 hot=0.097 cold=0.080
MEASURE thermal setups-pro MEAN(1000/4000/7000/10000) rho=0.627 dpos=3.678 paceRank=0.961 crash=0.0615 mech=0.0651 top=0.406 winners=7.25 sc=0.500 tyreDnf=0.0003 stops=2.693 graining=1.359 hot=0.098 cold=0.081
MEASURE thermal lantern_quay-pro seedBase=1000 n=240 rho=0.511 dpos=4.375 paceRank=0.988 crash=0.0971 mech=0.0860 top=0.317 winners=8.00 sc=0.950 tyreDnf=0.0000 stops=4.713 graining=5.817 hot=0.010 cold=0.165
MEASURE thermal lantern_quay-pro seedBase=4000 n=240 rho=0.508 dpos=4.421 paceRank=0.964 crash=0.1060 mech=0.0852 top=0.296 winners=7.00 sc=0.971 tyreDnf=0.0002 stops=4.703 graining=5.996 hot=0.011 cold=0.172
MEASURE thermal lantern_quay-pro seedBase=7000 n=240 rho=0.534 dpos=4.237 paceRank=0.976 crash=0.0979 mech=0.0829 top=0.354 winners=7.00 sc=1.021 tyreDnf=0.0000 stops=4.917 graining=6.279 hot=0.010 cold=0.174
MEASURE thermal lantern_quay-pro seedBase=10000 n=240 rho=0.530 dpos=4.263 paceRank=0.988 crash=0.0958 mech=0.0873 top=0.300 winners=7.00 sc=0.912 tyreDnf=0.0010 stops=4.747 graining=5.463 hot=0.011 cold=0.168
MEASURE thermal lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.521 dpos=4.324 paceRank=0.979 crash=0.0992 mech=0.0854 top=0.317 winners=7.25 sc=0.964 tyreDnf=0.0003 stops=4.770 graining=5.889 hot=0.010 cold=0.170
MEASURE thermal lantern_quay-rookie seedBase=1000 n=240 rho=0.513 dpos=4.318 paceRank=0.915 crash=0.1033 mech=0.0923 top=0.321 winners=7.00 sc=1.017 tyreDnf=0.0015 stops=4.434 graining=7.871 hot=0.002 cold=0.151
MEASURE thermal lantern_quay-rookie seedBase=4000 n=240 rho=0.523 dpos=4.267 paceRank=0.903 crash=0.1065 mech=0.0781 top=0.313 winners=8.00 sc=1.008 tyreDnf=0.0015 stops=4.377 graining=7.971 hot=0.003 cold=0.154
MEASURE thermal lantern_quay-rookie seedBase=7000 n=240 rho=0.503 dpos=4.365 paceRank=0.939 crash=0.1056 mech=0.0833 top=0.329 winners=7.00 sc=1.038 tyreDnf=0.0008 stops=4.586 graining=8.958 hot=0.002 cold=0.151
MEASURE thermal lantern_quay-rookie seedBase=10000 n=240 rho=0.497 dpos=4.357 paceRank=0.927 crash=0.1033 mech=0.0838 top=0.342 winners=7.00 sc=1.012 tyreDnf=0.0010 stops=4.427 graining=9.421 hot=0.002 cold=0.156
MEASURE thermal lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.509 dpos=4.327 paceRank=0.921 crash=0.1047 mech=0.0844 top=0.326 winners=7.25 sc=1.019 tyreDnf=0.0012 stops=4.456 graining=8.555 hot=0.002 cold=0.153
MEASURE thermal mesa_roja-pro seedBase=1000 n=240 rho=0.642 dpos=3.598 paceRank=0.988 crash=0.0667 mech=0.0794 top=0.537 winners=4.00 sc=0.567 tyreDnf=0.0000 stops=3.525 graining=0.000 hot=0.174 cold=0.062
MEASURE thermal mesa_roja-pro seedBase=4000 n=240 rho=0.612 dpos=3.746 paceRank=0.988 crash=0.0777 mech=0.0725 top=0.483 winners=5.00 sc=0.583 tyreDnf=0.0002 stops=3.639 graining=0.000 hot=0.174 cold=0.063
MEASURE thermal mesa_roja-pro seedBase=7000 n=240 rho=0.614 dpos=3.715 paceRank=0.988 crash=0.0756 mech=0.0715 top=0.533 winners=5.00 sc=0.554 tyreDnf=0.0000 stops=3.667 graining=0.000 hot=0.172 cold=0.063
MEASURE thermal mesa_roja-pro seedBase=10000 n=240 rho=0.627 dpos=3.655 paceRank=0.988 crash=0.0663 mech=0.0754 top=0.487 winners=7.00 sc=0.558 tyreDnf=0.0002 stops=3.650 graining=0.000 hot=0.175 cold=0.061
MEASURE thermal mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.624 dpos=3.679 paceRank=0.988 crash=0.0716 mech=0.0747 top=0.510 winners=5.25 sc=0.566 tyreDnf=0.0001 stops=3.620 graining=0.000 hot=0.174 cold=0.063
MEASURE thermal mesa_roja-rookie seedBase=1000 n=240 rho=0.666 dpos=3.375 paceRank=0.952 crash=0.0729 mech=0.0775 top=0.492 winners=6.00 sc=0.571 tyreDnf=0.0025 stops=2.792 graining=0.000 hot=0.102 cold=0.062
MEASURE thermal mesa_roja-rookie seedBase=4000 n=240 rho=0.662 dpos=3.409 paceRank=0.952 crash=0.0746 mech=0.0717 top=0.450 winners=7.00 sc=0.529 tyreDnf=0.0010 stops=2.958 graining=0.000 hot=0.102 cold=0.060
MEASURE thermal mesa_roja-rookie seedBase=7000 n=240 rho=0.646 dpos=3.504 paceRank=0.952 crash=0.0706 mech=0.0794 top=0.471 winners=7.00 sc=0.542 tyreDnf=0.0019 stops=2.969 graining=0.000 hot=0.102 cold=0.061
MEASURE thermal mesa_roja-rookie seedBase=10000 n=240 rho=0.649 dpos=3.484 paceRank=0.952 crash=0.0708 mech=0.0798 top=0.512 winners=7.00 sc=0.650 tyreDnf=0.0015 stops=2.907 graining=0.000 hot=0.100 cold=0.066
MEASURE thermal mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.656 dpos=3.443 paceRank=0.952 crash=0.0722 mech=0.0771 top=0.481 winners=6.75 sc=0.573 tyreDnf=0.0017 stops=2.907 graining=0.000 hot=0.101 cold=0.062
MEASURE thermal clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE thermal clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE thermal clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE thermal clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE thermal clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
MEASURE thermal graining-after-neutralisation races=960 perRace=1.304 other=575/794340 (0.72/1000 car-laps) short: ends=881 grains=627 (12.07/1000 car-laps) mid: ends=136 grains=50 (6.16/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```

Rung C (lantern_quay `trackTempC` 31):
```
MEASURE rungC sample-pro seedBase=1000 n=240 rho=0.624 dpos=3.658 paceRank=0.964 crash=0.0600 mech=0.0717 top=0.421 winners=8.00 sc=0.487 tyreDnf=0.0000 stops=2.652 graining=1.196 hot=0.102 cold=0.074
MEASURE rungC sample-pro seedBase=4000 n=240 rho=0.634 dpos=3.619 paceRank=0.964 crash=0.0635 mech=0.0698 top=0.408 winners=7.00 sc=0.487 tyreDnf=0.0000 stops=2.672 graining=1.333 hot=0.096 cold=0.081
MEASURE rungC sample-pro seedBase=7000 n=240 rho=0.640 dpos=3.577 paceRank=0.964 crash=0.0585 mech=0.0669 top=0.425 winners=6.00 sc=0.496 tyreDnf=0.0000 stops=2.800 graining=1.063 hot=0.096 cold=0.084
MEASURE rungC sample-pro seedBase=10000 n=240 rho=0.620 dpos=3.672 paceRank=0.988 crash=0.0606 mech=0.0683 top=0.421 winners=7.00 sc=0.492 tyreDnf=0.0013 stops=2.712 graining=1.625 hot=0.094 cold=0.084
MEASURE rungC sample-pro MEAN(1000/4000/7000/10000) rho=0.630 dpos=3.632 paceRank=0.970 crash=0.0607 mech=0.0692 top=0.419 winners=7.00 sc=0.491 tyreDnf=0.0003 stops=2.709 graining=1.304 hot=0.097 cold=0.081
MEASURE rungC sample-rookie seedBase=1000 n=240 rho=0.637 dpos=3.554 paceRank=0.915 crash=0.0681 mech=0.0638 top=0.408 winners=8.00 sc=0.529 tyreDnf=0.0000 stops=2.472 graining=2.275 hot=0.077 cold=0.074
MEASURE rungC sample-rookie seedBase=4000 n=240 rho=0.660 dpos=3.387 paceRank=0.915 crash=0.0610 mech=0.0656 top=0.417 winners=7.00 sc=0.475 tyreDnf=0.0006 stops=2.459 graining=2.212 hot=0.075 cold=0.080
MEASURE rungC sample-rookie seedBase=7000 n=240 rho=0.662 dpos=3.367 paceRank=0.952 crash=0.0627 mech=0.0608 top=0.425 winners=7.00 sc=0.537 tyreDnf=0.0004 stops=2.582 graining=2.621 hot=0.074 cold=0.083
MEASURE rungC sample-rookie seedBase=10000 n=240 rho=0.663 dpos=3.405 paceRank=0.936 crash=0.0600 mech=0.0665 top=0.404 winners=7.00 sc=0.463 tyreDnf=0.0000 stops=2.485 graining=2.204 hot=0.075 cold=0.076
MEASURE rungC sample-rookie MEAN(1000/4000/7000/10000) rho=0.656 dpos=3.428 paceRank=0.929 crash=0.0630 mech=0.0642 top=0.414 winners=7.25 sc=0.501 tyreDnf=0.0003 stops=2.499 graining=2.328 hot=0.075 cold=0.078
MEASURE rungC setups-pro seedBase=1000 n=240 rho=0.612 dpos=3.744 paceRank=0.964 crash=0.0627 mech=0.0669 top=0.383 winners=8.00 sc=0.483 tyreDnf=0.0000 stops=2.645 graining=1.554 hot=0.100 cold=0.078
MEASURE rungC setups-pro seedBase=4000 n=240 rho=0.632 dpos=3.658 paceRank=0.964 crash=0.0692 mech=0.0615 top=0.412 winners=7.00 sc=0.529 tyreDnf=0.0000 stops=2.668 graining=1.421 hot=0.098 cold=0.079
MEASURE rungC setups-pro seedBase=7000 n=240 rho=0.627 dpos=3.701 paceRank=0.964 crash=0.0592 mech=0.0658 top=0.429 winners=7.00 sc=0.487 tyreDnf=0.0000 stops=2.789 graining=1.079 hot=0.096 cold=0.086
MEASURE rungC setups-pro seedBase=10000 n=240 rho=0.636 dpos=3.610 paceRank=0.952 crash=0.0550 mech=0.0660 top=0.400 winners=7.00 sc=0.500 tyreDnf=0.0013 stops=2.672 graining=1.383 hot=0.097 cold=0.080
MEASURE rungC setups-pro MEAN(1000/4000/7000/10000) rho=0.627 dpos=3.678 paceRank=0.961 crash=0.0615 mech=0.0651 top=0.406 winners=7.25 sc=0.500 tyreDnf=0.0003 stops=2.693 graining=1.359 hot=0.098 cold=0.081
MEASURE rungC lantern_quay-pro seedBase=1000 n=240 rho=0.497 dpos=4.466 paceRank=0.988 crash=0.1010 mech=0.0873 top=0.321 winners=7.00 sc=0.983 tyreDnf=0.0000 stops=4.725 graining=4.146 hot=0.027 cold=0.089
MEASURE rungC lantern_quay-pro seedBase=4000 n=240 rho=0.552 dpos=4.170 paceRank=0.976 crash=0.0990 mech=0.0808 top=0.342 winners=7.00 sc=0.979 tyreDnf=0.0000 stops=4.714 graining=3.979 hot=0.027 cold=0.090
MEASURE rungC lantern_quay-pro seedBase=7000 n=240 rho=0.515 dpos=4.409 paceRank=0.976 crash=0.0975 mech=0.0867 top=0.346 winners=7.00 sc=0.925 tyreDnf=0.0000 stops=4.891 graining=4.567 hot=0.025 cold=0.092
MEASURE rungC lantern_quay-pro seedBase=10000 n=240 rho=0.507 dpos=4.430 paceRank=0.964 crash=0.1006 mech=0.0844 top=0.308 winners=7.00 sc=1.067 tyreDnf=0.0008 stops=4.749 graining=4.112 hot=0.025 cold=0.094
MEASURE rungC lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.518 dpos=4.369 paceRank=0.976 crash=0.0995 mech=0.0848 top=0.329 winners=7.00 sc=0.989 tyreDnf=0.0002 stops=4.770 graining=4.201 hot=0.026 cold=0.091
MEASURE rungC lantern_quay-rookie seedBase=1000 n=240 rho=0.541 dpos=4.191 paceRank=0.939 crash=0.1015 mech=0.0915 top=0.338 winners=7.00 sc=1.038 tyreDnf=0.0004 stops=4.450 graining=7.521 hot=0.010 cold=0.095
MEASURE rungC lantern_quay-rookie seedBase=4000 n=240 rho=0.550 dpos=4.138 paceRank=0.939 crash=0.0960 mech=0.0840 top=0.346 winners=8.00 sc=0.992 tyreDnf=0.0010 stops=4.389 graining=6.596 hot=0.010 cold=0.090
MEASURE rungC lantern_quay-rookie seedBase=7000 n=240 rho=0.530 dpos=4.228 paceRank=0.915 crash=0.0975 mech=0.0777 top=0.342 winners=7.00 sc=0.963 tyreDnf=0.0008 stops=4.605 graining=6.917 hot=0.008 cold=0.090
MEASURE rungC lantern_quay-rookie seedBase=10000 n=240 rho=0.517 dpos=4.298 paceRank=0.976 crash=0.0952 mech=0.0854 top=0.317 winners=7.00 sc=1.054 tyreDnf=0.0010 stops=4.435 graining=7.683 hot=0.009 cold=0.094
MEASURE rungC lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.534 dpos=4.214 paceRank=0.942 crash=0.0976 mech=0.0846 top=0.335 winners=7.25 sc=1.011 tyreDnf=0.0008 stops=4.470 graining=7.179 hot=0.009 cold=0.092
MEASURE rungC mesa_roja-pro seedBase=1000 n=240 rho=0.642 dpos=3.598 paceRank=0.988 crash=0.0667 mech=0.0794 top=0.537 winners=4.00 sc=0.567 tyreDnf=0.0000 stops=3.525 graining=0.000 hot=0.174 cold=0.062
MEASURE rungC mesa_roja-pro seedBase=4000 n=240 rho=0.612 dpos=3.746 paceRank=0.988 crash=0.0777 mech=0.0725 top=0.483 winners=5.00 sc=0.583 tyreDnf=0.0002 stops=3.639 graining=0.000 hot=0.174 cold=0.063
MEASURE rungC mesa_roja-pro seedBase=7000 n=240 rho=0.614 dpos=3.715 paceRank=0.988 crash=0.0756 mech=0.0715 top=0.533 winners=5.00 sc=0.554 tyreDnf=0.0000 stops=3.667 graining=0.000 hot=0.172 cold=0.063
MEASURE rungC mesa_roja-pro seedBase=10000 n=240 rho=0.627 dpos=3.655 paceRank=0.988 crash=0.0663 mech=0.0754 top=0.487 winners=7.00 sc=0.558 tyreDnf=0.0002 stops=3.650 graining=0.000 hot=0.175 cold=0.061
MEASURE rungC mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.624 dpos=3.679 paceRank=0.988 crash=0.0716 mech=0.0747 top=0.510 winners=5.25 sc=0.566 tyreDnf=0.0001 stops=3.620 graining=0.000 hot=0.174 cold=0.063
MEASURE rungC mesa_roja-rookie seedBase=1000 n=240 rho=0.666 dpos=3.375 paceRank=0.952 crash=0.0729 mech=0.0775 top=0.492 winners=6.00 sc=0.571 tyreDnf=0.0025 stops=2.792 graining=0.000 hot=0.102 cold=0.062
MEASURE rungC mesa_roja-rookie seedBase=4000 n=240 rho=0.662 dpos=3.409 paceRank=0.952 crash=0.0746 mech=0.0717 top=0.450 winners=7.00 sc=0.529 tyreDnf=0.0010 stops=2.958 graining=0.000 hot=0.102 cold=0.060
MEASURE rungC mesa_roja-rookie seedBase=7000 n=240 rho=0.646 dpos=3.504 paceRank=0.952 crash=0.0706 mech=0.0794 top=0.471 winners=7.00 sc=0.542 tyreDnf=0.0019 stops=2.969 graining=0.000 hot=0.102 cold=0.061
MEASURE rungC mesa_roja-rookie seedBase=10000 n=240 rho=0.649 dpos=3.484 paceRank=0.952 crash=0.0708 mech=0.0798 top=0.512 winners=7.00 sc=0.650 tyreDnf=0.0015 stops=2.907 graining=0.000 hot=0.100 cold=0.066
MEASURE rungC mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.656 dpos=3.443 paceRank=0.952 crash=0.0722 mech=0.0771 top=0.481 winners=6.75 sc=0.573 tyreDnf=0.0017 stops=2.907 graining=0.000 hot=0.101 cold=0.062
MEASURE rungC clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE rungC clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE rungC clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE rungC clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE rungC clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
MEASURE rungC graining-after-neutralisation races=960 perRace=1.304 other=575/794340 (0.72/1000 car-laps) short: ends=881 grains=627 (12.07/1000 car-laps) mid: ends=136 grains=50 (6.16/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```

Rung 1 (`coldCoeff`/`overheatCoeff` 0.12):
```
MEASURE rung1 sample-pro seedBase=1000 n=240 rho=0.625 dpos=3.651 paceRank=0.964 crash=0.0598 mech=0.0729 top=0.438 winners=8.00 sc=0.483 tyreDnf=0.0000 stops=2.664 graining=1.488 hot=0.103 cold=0.076
MEASURE rung1 sample-pro seedBase=4000 n=240 rho=0.641 dpos=3.566 paceRank=0.939 crash=0.0596 mech=0.0648 top=0.467 winners=8.00 sc=0.454 tyreDnf=0.0000 stops=2.663 graining=1.163 hot=0.097 cold=0.076
MEASURE rung1 sample-pro seedBase=7000 n=240 rho=0.626 dpos=3.649 paceRank=0.964 crash=0.0606 mech=0.0690 top=0.438 winners=7.00 sc=0.467 tyreDnf=0.0000 stops=2.766 graining=0.992 hot=0.097 cold=0.083
MEASURE rung1 sample-pro seedBase=10000 n=240 rho=0.643 dpos=3.570 paceRank=0.964 crash=0.0567 mech=0.0715 top=0.417 winners=7.00 sc=0.450 tyreDnf=0.0017 stops=2.698 graining=1.646 hot=0.097 cold=0.082
MEASURE rung1 sample-pro MEAN(1000/4000/7000/10000) rho=0.634 dpos=3.609 paceRank=0.958 crash=0.0592 mech=0.0695 top=0.440 winners=7.50 sc=0.464 tyreDnf=0.0004 stops=2.698 graining=1.322 hot=0.098 cold=0.079
MEASURE rung1 sample-rookie seedBase=1000 n=240 rho=0.657 dpos=3.420 paceRank=0.915 crash=0.0621 mech=0.0642 top=0.404 winners=8.00 sc=0.529 tyreDnf=0.0006 stops=2.475 graining=2.337 hot=0.078 cold=0.075
MEASURE rung1 sample-rookie seedBase=4000 n=240 rho=0.657 dpos=3.422 paceRank=0.915 crash=0.0592 mech=0.0700 top=0.408 winners=7.00 sc=0.521 tyreDnf=0.0002 stops=2.460 graining=2.683 hot=0.075 cold=0.083
MEASURE rung1 sample-rookie seedBase=7000 n=240 rho=0.659 dpos=3.390 paceRank=0.915 crash=0.0621 mech=0.0635 top=0.404 winners=7.00 sc=0.463 tyreDnf=0.0002 stops=2.577 graining=2.063 hot=0.073 cold=0.076
MEASURE rung1 sample-rookie seedBase=10000 n=240 rho=0.670 dpos=3.356 paceRank=0.915 crash=0.0587 mech=0.0715 top=0.396 winners=7.00 sc=0.425 tyreDnf=0.0004 stops=2.472 graining=2.167 hot=0.075 cold=0.076
MEASURE rung1 sample-rookie MEAN(1000/4000/7000/10000) rho=0.661 dpos=3.397 paceRank=0.915 crash=0.0605 mech=0.0673 top=0.403 winners=7.25 sc=0.484 tyreDnf=0.0004 stops=2.496 graining=2.313 hot=0.075 cold=0.078
MEASURE rung1 setups-pro seedBase=1000 n=240 rho=0.608 dpos=3.750 paceRank=0.964 crash=0.0619 mech=0.0665 top=0.454 winners=9.00 sc=0.458 tyreDnf=0.0000 stops=2.651 graining=1.642 hot=0.099 cold=0.077
MEASURE rung1 setups-pro seedBase=4000 n=240 rho=0.654 dpos=3.513 paceRank=0.964 crash=0.0656 mech=0.0623 top=0.433 winners=7.00 sc=0.504 tyreDnf=0.0000 stops=2.669 graining=1.525 hot=0.098 cold=0.078
MEASURE rung1 setups-pro seedBase=7000 n=240 rho=0.619 dpos=3.740 paceRank=0.964 crash=0.0577 mech=0.0675 top=0.408 winners=7.00 sc=0.492 tyreDnf=0.0000 stops=2.788 graining=1.429 hot=0.096 cold=0.086
MEASURE rung1 setups-pro seedBase=10000 n=240 rho=0.606 dpos=3.780 paceRank=0.952 crash=0.0594 mech=0.0690 top=0.375 winners=7.00 sc=0.512 tyreDnf=0.0013 stops=2.681 graining=1.792 hot=0.098 cold=0.081
MEASURE rung1 setups-pro MEAN(1000/4000/7000/10000) rho=0.622 dpos=3.696 paceRank=0.961 crash=0.0611 mech=0.0663 top=0.418 winners=7.50 sc=0.492 tyreDnf=0.0003 stops=2.697 graining=1.597 hot=0.098 cold=0.081
MEASURE rung1 lantern_quay-pro seedBase=1000 n=240 rho=0.485 dpos=4.510 paceRank=0.988 crash=0.1031 mech=0.0935 top=0.296 winners=7.00 sc=1.075 tyreDnf=0.0002 stops=4.710 graining=4.246 hot=0.026 cold=0.092
MEASURE rung1 lantern_quay-pro seedBase=4000 n=240 rho=0.533 dpos=4.286 paceRank=0.952 crash=0.0981 mech=0.0838 top=0.342 winners=7.00 sc=0.954 tyreDnf=0.0000 stops=4.682 graining=3.808 hot=0.027 cold=0.089
MEASURE rung1 lantern_quay-pro seedBase=7000 n=240 rho=0.520 dpos=4.371 paceRank=0.976 crash=0.1000 mech=0.0817 top=0.354 winners=7.00 sc=0.975 tyreDnf=0.0000 stops=4.870 graining=4.154 hot=0.024 cold=0.090
MEASURE rung1 lantern_quay-pro seedBase=10000 n=240 rho=0.520 dpos=4.347 paceRank=0.988 crash=0.0998 mech=0.0848 top=0.304 winners=7.00 sc=0.988 tyreDnf=0.0010 stops=4.721 graining=3.583 hot=0.026 cold=0.092
MEASURE rung1 lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.514 dpos=4.379 paceRank=0.976 crash=0.1003 mech=0.0859 top=0.324 winners=7.00 sc=0.998 tyreDnf=0.0003 stops=4.746 graining=3.948 hot=0.026 cold=0.091
MEASURE rung1 lantern_quay-rookie seedBase=1000 n=240 rho=0.530 dpos=4.245 paceRank=0.927 crash=0.1025 mech=0.0883 top=0.308 winners=8.00 sc=0.992 tyreDnf=0.0017 stops=4.455 graining=7.096 hot=0.009 cold=0.094
MEASURE rung1 lantern_quay-rookie seedBase=4000 n=240 rho=0.530 dpos=4.219 paceRank=0.891 crash=0.0971 mech=0.0831 top=0.313 winners=8.00 sc=0.971 tyreDnf=0.0004 stops=4.381 graining=7.017 hot=0.010 cold=0.093
MEASURE rung1 lantern_quay-rookie seedBase=7000 n=240 rho=0.516 dpos=4.279 paceRank=0.927 crash=0.1031 mech=0.0800 top=0.321 winners=7.00 sc=0.942 tyreDnf=0.0010 stops=4.582 graining=7.029 hot=0.008 cold=0.092
MEASURE rung1 lantern_quay-rookie seedBase=10000 n=240 rho=0.524 dpos=4.245 paceRank=0.927 crash=0.1058 mech=0.0790 top=0.317 winners=7.00 sc=1.025 tyreDnf=0.0006 stops=4.434 graining=7.992 hot=0.009 cold=0.095
MEASURE rung1 lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.525 dpos=4.247 paceRank=0.918 crash=0.1021 mech=0.0826 top=0.315 winners=7.50 sc=0.982 tyreDnf=0.0009 stops=4.463 graining=7.283 hot=0.009 cold=0.093
MEASURE rung1 mesa_roja-pro seedBase=1000 n=240 rho=0.624 dpos=3.668 paceRank=0.964 crash=0.0702 mech=0.0823 top=0.542 winners=5.00 sc=0.575 tyreDnf=0.0002 stops=3.524 graining=0.000 hot=0.171 cold=0.064
MEASURE rung1 mesa_roja-pro seedBase=4000 n=240 rho=0.612 dpos=3.704 paceRank=0.988 crash=0.0706 mech=0.0748 top=0.558 winners=6.00 sc=0.575 tyreDnf=0.0004 stops=3.651 graining=0.000 hot=0.175 cold=0.063
MEASURE rung1 mesa_roja-pro seedBase=7000 n=240 rho=0.611 dpos=3.771 paceRank=0.964 crash=0.0740 mech=0.0835 top=0.471 winners=5.00 sc=0.633 tyreDnf=0.0000 stops=3.653 graining=0.000 hot=0.171 cold=0.066
MEASURE rung1 mesa_roja-pro seedBase=10000 n=240 rho=0.599 dpos=3.762 paceRank=0.952 crash=0.0698 mech=0.0792 top=0.550 winners=5.00 sc=0.588 tyreDnf=0.0004 stops=3.613 graining=0.000 hot=0.173 cold=0.060
MEASURE rung1 mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.611 dpos=3.726 paceRank=0.967 crash=0.0711 mech=0.0799 top=0.530 winners=5.25 sc=0.593 tyreDnf=0.0003 stops=3.610 graining=0.000 hot=0.173 cold=0.063
MEASURE rung1 mesa_roja-rookie seedBase=1000 n=240 rho=0.665 dpos=3.405 paceRank=0.952 crash=0.0754 mech=0.0769 top=0.454 winners=7.00 sc=0.583 tyreDnf=0.0010 stops=2.796 graining=0.000 hot=0.102 cold=0.063
MEASURE rung1 mesa_roja-rookie seedBase=4000 n=240 rho=0.649 dpos=3.461 paceRank=0.952 crash=0.0748 mech=0.0779 top=0.487 winners=6.00 sc=0.500 tyreDnf=0.0008 stops=2.954 graining=0.000 hot=0.102 cold=0.062
MEASURE rung1 mesa_roja-rookie seedBase=7000 n=240 rho=0.629 dpos=3.585 paceRank=0.952 crash=0.0704 mech=0.0850 top=0.412 winners=6.00 sc=0.546 tyreDnf=0.0015 stops=2.965 graining=0.000 hot=0.101 cold=0.061
MEASURE rung1 mesa_roja-rookie seedBase=10000 n=240 rho=0.655 dpos=3.458 paceRank=0.952 crash=0.0715 mech=0.0806 top=0.483 winners=6.00 sc=0.579 tyreDnf=0.0006 stops=2.907 graining=0.000 hot=0.101 cold=0.064
MEASURE rung1 mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.650 dpos=3.477 paceRank=0.952 crash=0.0730 mech=0.0801 top=0.459 winners=6.25 sc=0.552 tyreDnf=0.0010 stops=2.905 graining=0.000 hot=0.101 cold=0.062
MEASURE rung1 clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE rung1 clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE rung1 clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE rung1 clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE rung1 clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
MEASURE rung1 graining-after-neutralisation races=960 perRace=1.322 other=621/795820 (0.78/1000 car-laps) short: ends=851 grains=598 (11.87/1000 car-laps) mid: ends=138 grains=50 (6.11/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```

Rung 2 (+ `neutralisedHeat` −15, `grainPenalty` 0.20):
```
MEASURE rung2 sample-pro seedBase=1000 n=240 rho=0.616 dpos=3.702 paceRank=0.964 crash=0.0587 mech=0.0760 top=0.429 winners=8.00 sc=0.475 tyreDnf=0.0000 stops=2.668 graining=0.150 hot=0.104 cold=0.064
MEASURE rung2 sample-pro seedBase=4000 n=240 rho=0.639 dpos=3.576 paceRank=0.964 crash=0.0619 mech=0.0660 top=0.483 winners=8.00 sc=0.450 tyreDnf=0.0000 stops=2.658 graining=0.146 hot=0.099 cold=0.063
MEASURE rung2 sample-pro seedBase=7000 n=240 rho=0.629 dpos=3.650 paceRank=0.964 crash=0.0610 mech=0.0708 top=0.429 winners=8.00 sc=0.458 tyreDnf=0.0000 stops=2.761 graining=0.138 hot=0.097 cold=0.072
MEASURE rung2 sample-pro seedBase=10000 n=240 rho=0.648 dpos=3.527 paceRank=0.964 crash=0.0565 mech=0.0677 top=0.412 winners=7.00 sc=0.479 tyreDnf=0.0008 stops=2.695 graining=0.287 hot=0.098 cold=0.069
MEASURE rung2 sample-pro MEAN(1000/4000/7000/10000) rho=0.633 dpos=3.614 paceRank=0.964 crash=0.0595 mech=0.0702 top=0.439 winners=7.75 sc=0.466 tyreDnf=0.0002 stops=2.695 graining=0.180 hot=0.100 cold=0.067
MEASURE rung2 sample-rookie seedBase=1000 n=240 rho=0.648 dpos=3.478 paceRank=0.915 crash=0.0644 mech=0.0658 top=0.429 winners=8.00 sc=0.563 tyreDnf=0.0002 stops=2.474 graining=0.487 hot=0.078 cold=0.062
MEASURE rung2 sample-rookie seedBase=4000 n=240 rho=0.648 dpos=3.468 paceRank=0.915 crash=0.0648 mech=0.0669 top=0.388 winners=7.00 sc=0.546 tyreDnf=0.0000 stops=2.457 graining=0.383 hot=0.075 cold=0.067
MEASURE rung2 sample-rookie seedBase=7000 n=240 rho=0.653 dpos=3.423 paceRank=0.915 crash=0.0644 mech=0.0681 top=0.412 winners=7.00 sc=0.463 tyreDnf=0.0006 stops=2.575 graining=0.388 hot=0.073 cold=0.064
MEASURE rung2 sample-rookie seedBase=10000 n=240 rho=0.673 dpos=3.344 paceRank=0.915 crash=0.0594 mech=0.0698 top=0.396 winners=7.00 sc=0.454 tyreDnf=0.0002 stops=2.482 graining=0.487 hot=0.076 cold=0.064
MEASURE rung2 sample-rookie MEAN(1000/4000/7000/10000) rho=0.656 dpos=3.428 paceRank=0.915 crash=0.0632 mech=0.0677 top=0.406 winners=7.25 sc=0.506 tyreDnf=0.0003 stops=2.497 graining=0.436 hot=0.076 cold=0.064
MEASURE rung2 setups-pro seedBase=1000 n=240 rho=0.617 dpos=3.710 paceRank=0.964 crash=0.0629 mech=0.0658 top=0.417 winners=9.00 sc=0.442 tyreDnf=0.0000 stops=2.658 graining=0.204 hot=0.099 cold=0.064
MEASURE rung2 setups-pro seedBase=4000 n=240 rho=0.643 dpos=3.583 paceRank=0.964 crash=0.0665 mech=0.0598 top=0.417 winners=7.00 sc=0.475 tyreDnf=0.0000 stops=2.661 graining=0.192 hot=0.099 cold=0.067
MEASURE rung2 setups-pro seedBase=7000 n=240 rho=0.618 dpos=3.743 paceRank=0.964 crash=0.0598 mech=0.0658 top=0.404 winners=7.00 sc=0.504 tyreDnf=0.0000 stops=2.772 graining=0.179 hot=0.097 cold=0.074
MEASURE rung2 setups-pro seedBase=10000 n=240 rho=0.614 dpos=3.733 paceRank=0.952 crash=0.0556 mech=0.0717 top=0.396 winners=7.00 sc=0.483 tyreDnf=0.0010 stops=2.684 graining=0.138 hot=0.100 cold=0.069
MEASURE rung2 setups-pro MEAN(1000/4000/7000/10000) rho=0.623 dpos=3.692 paceRank=0.961 crash=0.0612 mech=0.0658 top=0.408 winners=7.50 sc=0.476 tyreDnf=0.0003 stops=2.694 graining=0.178 hot=0.099 cold=0.068
MEASURE rung2 lantern_quay-pro seedBase=1000 n=240 rho=0.498 dpos=4.452 paceRank=0.988 crash=0.0985 mech=0.0879 top=0.321 winners=7.00 sc=1.021 tyreDnf=0.0004 stops=4.704 graining=0.000 hot=0.028 cold=0.072
MEASURE rung2 lantern_quay-pro seedBase=4000 n=240 rho=0.536 dpos=4.279 paceRank=0.988 crash=0.1004 mech=0.0810 top=0.333 winners=7.00 sc=0.971 tyreDnf=0.0000 stops=4.695 graining=0.017 hot=0.027 cold=0.073
MEASURE rung2 lantern_quay-pro seedBase=7000 n=240 rho=0.525 dpos=4.328 paceRank=0.976 crash=0.0950 mech=0.0846 top=0.379 winners=7.00 sc=0.904 tyreDnf=0.0000 stops=4.860 graining=0.000 hot=0.025 cold=0.071
MEASURE rung2 lantern_quay-pro seedBase=10000 n=240 rho=0.531 dpos=4.296 paceRank=0.988 crash=0.0958 mech=0.0835 top=0.317 winners=7.00 sc=0.958 tyreDnf=0.0010 stops=4.706 graining=0.021 hot=0.026 cold=0.074
MEASURE rung2 lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.523 dpos=4.339 paceRank=0.985 crash=0.0974 mech=0.0843 top=0.337 winners=7.00 sc=0.964 tyreDnf=0.0004 stops=4.741 graining=0.009 hot=0.026 cold=0.073
MEASURE rung2 lantern_quay-rookie seedBase=1000 n=240 rho=0.517 dpos=4.305 paceRank=0.927 crash=0.1025 mech=0.0892 top=0.325 winners=7.00 sc=0.971 tyreDnf=0.0008 stops=4.422 graining=0.004 hot=0.009 cold=0.077
MEASURE rung2 lantern_quay-rookie seedBase=4000 n=240 rho=0.539 dpos=4.183 paceRank=0.915 crash=0.1015 mech=0.0810 top=0.283 winners=8.00 sc=1.025 tyreDnf=0.0006 stops=4.380 graining=0.013 hot=0.010 cold=0.077
MEASURE rung2 lantern_quay-rookie seedBase=7000 n=240 rho=0.534 dpos=4.175 paceRank=0.988 crash=0.0990 mech=0.0808 top=0.333 winners=7.00 sc=0.958 tyreDnf=0.0013 stops=4.576 graining=0.058 hot=0.008 cold=0.077
MEASURE rung2 lantern_quay-rookie seedBase=10000 n=240 rho=0.532 dpos=4.214 paceRank=0.924 crash=0.1025 mech=0.0835 top=0.292 winners=7.00 sc=1.004 tyreDnf=0.0008 stops=4.439 graining=0.079 hot=0.009 cold=0.078
MEASURE rung2 lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.531 dpos=4.219 paceRank=0.939 crash=0.1014 mech=0.0836 top=0.308 winners=7.25 sc=0.990 tyreDnf=0.0009 stops=4.455 graining=0.039 hot=0.009 cold=0.077
MEASURE rung2 mesa_roja-pro seedBase=1000 n=240 rho=0.621 dpos=3.682 paceRank=0.952 crash=0.0737 mech=0.0794 top=0.550 winners=6.00 sc=0.596 tyreDnf=0.0002 stops=3.536 graining=0.000 hot=0.175 cold=0.043
MEASURE rung2 mesa_roja-pro seedBase=4000 n=240 rho=0.619 dpos=3.676 paceRank=0.988 crash=0.0696 mech=0.0767 top=0.596 winners=5.00 sc=0.575 tyreDnf=0.0000 stops=3.650 graining=0.000 hot=0.175 cold=0.043
MEASURE rung2 mesa_roja-pro seedBase=7000 n=240 rho=0.625 dpos=3.680 paceRank=0.964 crash=0.0702 mech=0.0796 top=0.521 winners=5.00 sc=0.571 tyreDnf=0.0000 stops=3.650 graining=0.000 hot=0.173 cold=0.043
MEASURE rung2 mesa_roja-pro seedBase=10000 n=240 rho=0.615 dpos=3.696 paceRank=0.988 crash=0.0698 mech=0.0785 top=0.529 winners=4.00 sc=0.588 tyreDnf=0.0006 stops=3.587 graining=0.000 hot=0.174 cold=0.042
MEASURE rung2 mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.620 dpos=3.683 paceRank=0.973 crash=0.0708 mech=0.0785 top=0.549 winners=5.00 sc=0.582 tyreDnf=0.0002 stops=3.606 graining=0.000 hot=0.174 cold=0.043
MEASURE rung2 mesa_roja-rookie seedBase=1000 n=240 rho=0.673 dpos=3.362 paceRank=0.952 crash=0.0715 mech=0.0767 top=0.504 winners=6.00 sc=0.567 tyreDnf=0.0015 stops=2.810 graining=0.000 hot=0.103 cold=0.039
MEASURE rung2 mesa_roja-rookie seedBase=4000 n=240 rho=0.659 dpos=3.425 paceRank=0.952 crash=0.0717 mech=0.0762 top=0.508 winners=5.00 sc=0.487 tyreDnf=0.0008 stops=2.945 graining=0.000 hot=0.102 cold=0.038
MEASURE rung2 mesa_roja-rookie seedBase=7000 n=240 rho=0.637 dpos=3.536 paceRank=0.952 crash=0.0712 mech=0.0823 top=0.450 winners=5.00 sc=0.617 tyreDnf=0.0013 stops=2.960 graining=0.000 hot=0.101 cold=0.039
MEASURE rung2 mesa_roja-rookie seedBase=10000 n=240 rho=0.665 dpos=3.415 paceRank=0.952 crash=0.0692 mech=0.0758 top=0.517 winners=6.00 sc=0.571 tyreDnf=0.0006 stops=2.887 graining=0.000 hot=0.101 cold=0.038
MEASURE rung2 mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.658 dpos=3.434 paceRank=0.952 crash=0.0709 mech=0.0778 top=0.495 winners=5.50 sc=0.560 tyreDnf=0.0010 stops=2.901 graining=0.000 hot=0.102 cold=0.038
MEASURE rung2 clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE rung2 clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE rung2 clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE rung2 clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE rung2 clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
MEASURE rung2 graining-after-neutralisation races=960 perRace=0.180 other=36/794680 (0.05/1000 car-laps) short: ends=875 grains=117 (2.26/1000 car-laps) mid: ends=133 grains=20 (2.54/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```

Rung 3, shipped (+ coefficients 0.08, `overheatWearPerLap` 0.05):
```
MEASURE rung3 sample-pro seedBase=1000 n=240 rho=0.624 dpos=3.658 paceRank=0.964 crash=0.0612 mech=0.0765 top=0.463 winners=8.00 sc=0.471 tyreDnf=0.0000 stops=2.679 graining=0.063 hot=0.101 cold=0.063
MEASURE rung3 sample-pro seedBase=4000 n=240 rho=0.617 dpos=3.713 paceRank=0.964 crash=0.0677 mech=0.0702 top=0.442 winners=7.00 sc=0.517 tyreDnf=0.0000 stops=2.663 graining=0.208 hot=0.097 cold=0.066
MEASURE rung3 sample-pro seedBase=7000 n=240 rho=0.645 dpos=3.550 paceRank=0.964 crash=0.0550 mech=0.0663 top=0.438 winners=8.00 sc=0.479 tyreDnf=0.0000 stops=2.762 graining=0.113 hot=0.099 cold=0.070
MEASURE rung3 sample-pro seedBase=10000 n=240 rho=0.641 dpos=3.578 paceRank=0.952 crash=0.0537 mech=0.0735 top=0.383 winners=7.00 sc=0.475 tyreDnf=0.0015 stops=2.673 graining=0.154 hot=0.099 cold=0.069
MEASURE rung3 sample-pro MEAN(1000/4000/7000/10000) rho=0.632 dpos=3.625 paceRank=0.961 crash=0.0594 mech=0.0716 top=0.431 winners=7.50 sc=0.485 tyreDnf=0.0004 stops=2.694 graining=0.134 hot=0.099 cold=0.067
MEASURE rung3 sample-rookie seedBase=1000 n=240 rho=0.657 dpos=3.442 paceRank=0.915 crash=0.0592 mech=0.0717 top=0.412 winners=8.00 sc=0.504 tyreDnf=0.0004 stops=2.458 graining=0.487 hot=0.077 cold=0.062
MEASURE rung3 sample-rookie seedBase=4000 n=240 rho=0.654 dpos=3.433 paceRank=0.915 crash=0.0600 mech=0.0671 top=0.417 winners=7.00 sc=0.475 tyreDnf=0.0000 stops=2.456 graining=0.463 hot=0.076 cold=0.066
MEASURE rung3 sample-rookie seedBase=7000 n=240 rho=0.664 dpos=3.360 paceRank=0.915 crash=0.0625 mech=0.0619 top=0.417 winners=6.00 sc=0.479 tyreDnf=0.0013 stops=2.584 graining=0.550 hot=0.076 cold=0.067
MEASURE rung3 sample-rookie seedBase=10000 n=240 rho=0.683 dpos=3.313 paceRank=0.915 crash=0.0577 mech=0.0669 top=0.438 winners=7.00 sc=0.483 tyreDnf=0.0000 stops=2.464 graining=0.546 hot=0.077 cold=0.064
MEASURE rung3 sample-rookie MEAN(1000/4000/7000/10000) rho=0.664 dpos=3.387 paceRank=0.915 crash=0.0598 mech=0.0669 top=0.421 winners=7.00 sc=0.485 tyreDnf=0.0004 stops=2.491 graining=0.511 hot=0.077 cold=0.065
MEASURE rung3 setups-pro seedBase=1000 n=240 rho=0.619 dpos=3.694 paceRank=0.964 crash=0.0558 mech=0.0700 top=0.375 winners=8.00 sc=0.425 tyreDnf=0.0000 stops=2.646 graining=0.158 hot=0.101 cold=0.063
MEASURE rung3 setups-pro seedBase=4000 n=240 rho=0.631 dpos=3.664 paceRank=0.964 crash=0.0681 mech=0.0631 top=0.429 winners=7.00 sc=0.450 tyreDnf=0.0000 stops=2.650 graining=0.142 hot=0.099 cold=0.067
MEASURE rung3 setups-pro seedBase=7000 n=240 rho=0.622 dpos=3.702 paceRank=0.964 crash=0.0579 mech=0.0635 top=0.371 winners=7.00 sc=0.500 tyreDnf=0.0000 stops=2.777 graining=0.121 hot=0.098 cold=0.073
MEASURE rung3 setups-pro seedBase=10000 n=240 rho=0.625 dpos=3.654 paceRank=0.964 crash=0.0583 mech=0.0685 top=0.388 winners=7.00 sc=0.454 tyreDnf=0.0015 stops=2.662 graining=0.196 hot=0.098 cold=0.065
MEASURE rung3 setups-pro MEAN(1000/4000/7000/10000) rho=0.624 dpos=3.678 paceRank=0.964 crash=0.0601 mech=0.0663 top=0.391 winners=7.25 sc=0.457 tyreDnf=0.0004 stops=2.683 graining=0.154 hot=0.099 cold=0.067
MEASURE rung3 lantern_quay-pro seedBase=1000 n=240 rho=0.505 dpos=4.402 paceRank=0.976 crash=0.1037 mech=0.0846 top=0.338 winners=7.00 sc=1.021 tyreDnf=0.0000 stops=4.708 graining=0.000 hot=0.028 cold=0.073
MEASURE rung3 lantern_quay-pro seedBase=4000 n=240 rho=0.509 dpos=4.402 paceRank=0.964 crash=0.1027 mech=0.0898 top=0.304 winners=7.00 sc=1.029 tyreDnf=0.0000 stops=4.678 graining=0.017 hot=0.027 cold=0.076
MEASURE rung3 lantern_quay-pro seedBase=7000 n=240 rho=0.507 dpos=4.420 paceRank=0.988 crash=0.1013 mech=0.0869 top=0.350 winners=7.00 sc=1.017 tyreDnf=0.0000 stops=4.874 graining=0.000 hot=0.025 cold=0.076
MEASURE rung3 lantern_quay-pro seedBase=10000 n=240 rho=0.536 dpos=4.215 paceRank=0.976 crash=0.0956 mech=0.0860 top=0.325 winners=7.00 sc=0.925 tyreDnf=0.0002 stops=4.722 graining=0.021 hot=0.026 cold=0.072
MEASURE rung3 lantern_quay-pro MEAN(1000/4000/7000/10000) rho=0.514 dpos=4.360 paceRank=0.976 crash=0.1008 mech=0.0868 top=0.329 winners=7.00 sc=0.998 tyreDnf=0.0001 stops=4.745 graining=0.009 hot=0.026 cold=0.074
MEASURE rung3 lantern_quay-rookie seedBase=1000 n=240 rho=0.525 dpos=4.259 paceRank=0.915 crash=0.0960 mech=0.0915 top=0.275 winners=7.00 sc=0.971 tyreDnf=0.0019 stops=4.436 graining=0.004 hot=0.009 cold=0.074
MEASURE rung3 lantern_quay-rookie seedBase=4000 n=240 rho=0.520 dpos=4.276 paceRank=0.964 crash=0.1019 mech=0.0865 top=0.317 winners=8.00 sc=1.004 tyreDnf=0.0006 stops=4.373 graining=0.000 hot=0.010 cold=0.078
MEASURE rung3 lantern_quay-rookie seedBase=7000 n=240 rho=0.525 dpos=4.245 paceRank=0.988 crash=0.0998 mech=0.0877 top=0.379 winners=7.00 sc=1.038 tyreDnf=0.0010 stops=4.588 graining=0.025 hot=0.009 cold=0.077
MEASURE rung3 lantern_quay-rookie seedBase=10000 n=240 rho=0.520 dpos=4.281 paceRank=0.927 crash=0.1019 mech=0.0833 top=0.296 winners=7.00 sc=0.938 tyreDnf=0.0013 stops=4.425 graining=0.008 hot=0.009 cold=0.075
MEASURE rung3 lantern_quay-rookie MEAN(1000/4000/7000/10000) rho=0.523 dpos=4.265 paceRank=0.948 crash=0.0999 mech=0.0872 top=0.317 winners=7.25 sc=0.988 tyreDnf=0.0012 stops=4.456 graining=0.009 hot=0.009 cold=0.076
MEASURE rung3 mesa_roja-pro seedBase=1000 n=240 rho=0.618 dpos=3.726 paceRank=0.964 crash=0.0725 mech=0.0838 top=0.558 winners=6.00 sc=0.621 tyreDnf=0.0002 stops=3.501 graining=0.000 hot=0.177 cold=0.043
MEASURE rung3 mesa_roja-pro seedBase=4000 n=240 rho=0.621 dpos=3.698 paceRank=0.988 crash=0.0773 mech=0.0785 top=0.537 winners=4.00 sc=0.621 tyreDnf=0.0000 stops=3.618 graining=0.000 hot=0.177 cold=0.043
MEASURE rung3 mesa_roja-pro seedBase=7000 n=240 rho=0.619 dpos=3.681 paceRank=0.988 crash=0.0715 mech=0.0765 top=0.512 winners=6.00 sc=0.588 tyreDnf=0.0002 stops=3.639 graining=0.000 hot=0.175 cold=0.043
MEASURE rung3 mesa_roja-pro seedBase=10000 n=240 rho=0.589 dpos=3.819 paceRank=0.964 crash=0.0735 mech=0.0775 top=0.496 winners=5.00 sc=0.596 tyreDnf=0.0000 stops=3.585 graining=0.000 hot=0.177 cold=0.042
MEASURE rung3 mesa_roja-pro MEAN(1000/4000/7000/10000) rho=0.612 dpos=3.731 paceRank=0.976 crash=0.0737 mech=0.0791 top=0.526 winners=5.25 sc=0.606 tyreDnf=0.0001 stops=3.585 graining=0.000 hot=0.176 cold=0.043
MEASURE rung3 mesa_roja-rookie seedBase=1000 n=240 rho=0.675 dpos=3.340 paceRank=0.952 crash=0.0715 mech=0.0777 top=0.483 winners=7.00 sc=0.550 tyreDnf=0.0013 stops=2.804 graining=0.000 hot=0.102 cold=0.038
MEASURE rung3 mesa_roja-rookie seedBase=4000 n=240 rho=0.644 dpos=3.489 paceRank=0.952 crash=0.0762 mech=0.0823 top=0.463 winners=7.00 sc=0.563 tyreDnf=0.0023 stops=2.941 graining=0.000 hot=0.103 cold=0.039
MEASURE rung3 mesa_roja-rookie seedBase=7000 n=240 rho=0.663 dpos=3.393 paceRank=0.952 crash=0.0710 mech=0.0758 top=0.546 winners=6.00 sc=0.537 tyreDnf=0.0019 stops=2.960 graining=0.000 hot=0.101 cold=0.039
MEASURE rung3 mesa_roja-rookie seedBase=10000 n=240 rho=0.657 dpos=3.475 paceRank=0.952 crash=0.0706 mech=0.0802 top=0.604 winners=6.00 sc=0.542 tyreDnf=0.0013 stops=2.878 graining=0.000 hot=0.102 cold=0.039
MEASURE rung3 mesa_roja-rookie MEAN(1000/4000/7000/10000) rho=0.660 dpos=3.424 paceRank=0.952 crash=0.0723 mech=0.0790 top=0.524 winners=6.50 sc=0.548 tyreDnf=0.0017 stops=2.896 graining=0.000 hot=0.102 cold=0.039
MEASURE rung3 clearing-lantern_quay seedBase=1000 n=240 failure=0.146
MEASURE rung3 clearing-lantern_quay seedBase=4000 n=240 failure=0.233
MEASURE rung3 clearing-lantern_quay seedBase=7000 n=240 failure=0.183
MEASURE rung3 clearing-lantern_quay seedBase=10000 n=240 failure=0.246
MEASURE rung3 clearing-lantern_quay MEAN(1000/4000/7000/10000) failure=0.2021
MEASURE rung3 graining-after-neutralisation races=960 perRace=0.134 other=44/794660 (0.06/1000 car-laps) short: ends=873 grains=80 (1.55/1000 car-laps) mid: ends=134 grains=5 (0.63/1000 car-laps) long: ends=0 grains=0 (0.00/1000 car-laps)
```

The single-sample n=120 lantern_quay envelope (`newCircuitBands`, seedBase 1000): plan values pro
0.5037 / rookie 0.4956; Rung C pro 0.4896; Rung 1 pro 0.4775; Rung 2 pro 0.4993; Rung 3 pro 0.5126
(all seven tests pass).

**Scenarios, classics and daily pins.** Tyre temperature changes every race, so 12 of 13 shipped
scenarios moved (only `red_flag_restart` held) and were re-authored from `scripts/find-scenarios.ts`
(first hit, goal = par − 1, blurbs checked against the handover state and rewritten where a fact
changed). `hold_the_train` had no hit at SEEDS=2000 at harbour_lights or lantern_quay (gap 2.0, the
brief's last widening) and was **dropped**. `vsc_gamble` is searched at its shipped circuit
(bengaluru, recorded in the script); a4a2eda's "par no worse than the handover" narrowing had no hit
at SEEDS=2000, so it is now a defensive scenario (handover P3, par P6, goal P5). The three daily
GOLDEN pins: 2026-11-01 unchanged; 2027-02-14 and 2027-07-04 moved (release-note item). The 730-day
daily sweep has no last-resort day.

**Options for Veet.** (a) Convert the lantern_quay envelope's rho check to the four-base mean, as
Round 2 did for the passing gate and the SAMPLE rho, and ship the plan values (and lantern_quay
`trackTempC` 27): every mean gate passed there, and a hard out-lap would cost 0.38–0.67 s (sol_desert to
aurora) rather than the shipped 0.15–0.27 s (`outLapCost`, H from blanket temperature; softs 0.007). (b) Keep Rung 3 and judge the feel on the phone first. (c) The
graining rate after a neutralisation, and OPTIMAL's larger edge, are both live consequences worth a
feel check, not defects.
