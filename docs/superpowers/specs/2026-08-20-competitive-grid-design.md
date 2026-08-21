# Competitive Grid — design

**Date:** 2026-08-20
**Oracle:** `MODEL_SPEC.md` (read §3, §4 and §7 before starting)
**Scope:** data only. `src/engine/` must not change.

## 1. The problem

Measured over 19,200 races (`docs/superpowers/specs/baseline-measurements.md`):

- **Apex wins 95.08%** ± 0.22 of all races.
- Meridian 3.7%, Vortex 0.68%, then a long tail of near-zeroes.
- **Nimbus, Terra and Zenith won zero races in 9,600.**
- With rain disabled, **only two teams ever win** and only three drivers. Rain is the sole
  mechanism giving anyone outside the top two a chance.
- Mean `|grid − finish|` is **1.88**, against 2.97 in real F1.
- Grid↔finish Spearman ρ is **0.857**, against 0.779 in real F1.

The cause is the car facet spread in `src/data/cars.json`: about 30 facet points top-to-bottom,
worth **1.482 s/lap** between Apex and Zenith, against a per-race noise SD of 0.97s. That is
8.9σ. Nothing survives that.

This also explains a finding from the Development Points work: a maxed-out Zenith, having spent a
full season's 110 DP optimally, still finished **P15** and scored almost nothing. The progression
system was working correctly; it was pushing against an unclosable gap.

## 2. Goal

Per the owner's decision: the strongest team wins **35–55%** of races with **at least four**
distinct winners. `MODEL_SPEC.md` §4 stages this, because it is not reachable by data alone. This
plan's gate is:

- Top-team win share **≤ 0.90**
- Distinct winners across a season **≥ 4**
- No regression in `corr(pace rank, mean finish)` below **0.90**

The remaining distance to 0.35–0.55 belongs to the race-incidents plan that follows this one.

## 3. What this plan is not

**Not a uniform flattening.** Real F1 has a tight front and a distant tail: four or five teams can
win while genuine backmarkers never do (real F1 median: 3 distinct winners). Uniformly compressing
the field would make every race a lottery and destroy the point of car upgrades. The measured
`corr(pace rank, mean finish)` gate exists to catch exactly that failure — if the best car wins 45%
of races but finishes 8th as often as 2nd, the target has been met by noise and the change is wrong.

**Not a reliability change.** The grid search proposed rescaling `reliability` as
`100 − (100 − shipped)/2`, which would have moved mechanical DNFs from 5–6% to 2.74%. That was
based on a web estimate of 1.5–3.5%. The computed archive figure is **9.8pp** (2014–22), so the
simulation is already *below* real F1 and the rescale would push it further the wrong way.
**Shipped `reliability` values are preserved exactly.** Raising DNFs toward 6–10% belongs to the
incidents plan.

**Not a driver change.** Compressing driver `pace` deficits by 0.4 was measured to reach 44.1% —
inside the target, data-only, tempting. It is excluded for two reasons. It flattens ten
distinct drivers into near-clones, discarding characterisation the game leans on. And it has a
measured side effect: at c=0.4 **Vortex wins 36%**, because flattening `pace` promotes
`tyreManagement` to the dominant facet and Park sits at 96. If driver compression is ever
revisited it must review every driver facet spread in the same pass.

## 4. The change

Each team's facet *deficit from 100* is scaled by a single per-team scalar. This preserves every
archetype's internal shape (Apex stays aero-led, Meridian stays power-led, Solstice keeps its
pit-crew strength) and preserves the ordinal ranking exactly. Only the competitive *spacing*
changes.

| team | power | aero | handling | reliability | pitCrew | pace (s/lap) | was | step |
|---|---|---|---|---|---|---|---|---|
| apex | 92 | 95 | 90 | **96** | 90 | 0.425 | 0.425 | — |
| meridian | 98 | 91 | 89 | **90** | 88 | 0.440 | 0.600 | +0.015 |
| vortex | 87 | 95 | 94 | **88** | 85 | 0.454 | 0.811 | +0.015 |
| solstice | 93 | 91 | 93 | **87** | 95 | 0.469 | 1.108 | +0.015 |
| kestrel | 96 | 89 | 92 | **85** | 82 | 0.484 | 1.117 | +0.015 |
| halcyon | 89 | 92 | 94 | **72** | 78 | 0.499 | 1.194 | +0.015 |
| delta | 92 | 90 | 93 | **89** | 80 | 0.514 | 1.200 | +0.015 |
| nimbus | 86 | 84 | 85 | **84** | 86 | 0.900 | 1.556 | **+0.386** |
| terra | 82 | 84 | 83 | **80** | 75 | 1.001 | 1.726 | +0.101 |
| zenith | 81 | 81 | 83 | **94** | 72 | 1.099 | 1.907 | +0.098 |

`reliability` and `pitCrew` are **shipped values, unchanged** — only `power`, `aero` and `handling`
move. Halcyon keeps its fragile 72 and Zenith its bulletproof 94, both of which are deliberate
character.

**Shape:** front seven at uniform 0.015 s/lap steps (0.090 s/lap across all seven), then a
deliberate **0.386 s/lap cliff** to the Nimbus/Terra/Zenith backmarker tier. Top-to-bottom narrows
from **1.482 to 0.674 s/lap**.

## 5. Measured outcome

**Measured 2026-08-21 on the landed change**, replacing the predicted figures this section
previously held. All figures use the real engine with every car AI-managed, fixed seeds.
Field-wide over **all 12 circuits**, n = 480 races per difficulty:

| team | share (pro) | share (rookie) |
|---|---|---|
| apex | **84.58%** ± 1.65 | **88.13%** ± 1.48 |
| meridian | 9.38% | 7.71% |
| vortex | 3.33% | 1.04% |
| halcyon | 1.04% | 1.67% |
| solstice | 0.63% | 0.21% |
| delta | 0.63% | 0.63% |
| kestrel | 0.42% | 0.63% |
| nimbus / terra / zenith | 0.00% | 0.00% |

**Distinct winners: 3 → 7–8** (7 at both difficulties over 12 circuits; 7–8 across six independent
n=240 four-circuit samples). Pooled over six seed bases on the four-circuit gate sample, apex
measures **83.68%** ± 0.97pp (n = 1440).

All three of this plan's gates are met:

| gate | threshold | measured |
|---|---|---|
| top-team win share | ≤ 0.90 | 0.846 pro / 0.881 rookie |
| distinct winners | ≥ 4 | 7–8 |
| `corr(pace rank, mean finish)` | ≥ 0.90 | **0.9636** pro / 0.9152–0.9273 rookie |

**Two metrics the plan did not gate moved into their `MODEL_SPEC.md` §3 target bands on their own**,
which §4 did not predict:

| metric | §3 band | measured pro | measured rookie |
|---|---|---|---|
| mean \|grid − finish\| | 2.5 – 4.0 | **2.859** ± 0.029 | 2.582 ± 0.030 |
| grid↔finish ρ | 0.60 – 0.80 | **0.753** ± 0.005 | 0.785 ± 0.005 |

**Mechanical DNF did not move**, as required — `reliability` is untouched. Pooled over 28,800
car-races: **4.67%** ± 0.12pp, still 11 SE below §3's 6–10% floor. That gap is the incidents plan's.

**Season points distribution, 40 simulated 12-race seasons at pro, old grid vs new** — the
compression spreads points measurably rather than by assumption:

| | old | new |
|---|---|---|
| top team's share of all points | 0.386 ± 0.003 | **0.318** ± 0.003 |
| Gini of team points | 0.638 ± 0.002 | **0.538** ± 0.004 |
| teams scoring at all | 7.55 ± 0.09 | **8.05** ± 0.12 |
| drivers scoring at all | 14.68 ± 0.14 | **15.55** ± 0.19 |
| top team's points | 467.3 ± 3.2 | **385.9** ± 4.2 |
| 10th team's points | 0.00 | 0.03 |

## 6. Effect on the Development Points progression — measured

Recomputed with the real `applyUpgrades` and an exhaustive 110-DP search on the new grid.

**The underdog arc amplified, as predicted.** Early season (no upgrades, no rival development) vs
late season (optimal 110-DP build, rivals developed), n = 48 races each:

| | early | late | arc |
|---|---|---|---|
| zenith mean finish | 17.69 ± 0.22 | **15.83** ± 0.30 | **+1.86** positions (was +1.16) |
| terra mean finish | 15.69 ± 0.26 | **12.75** ± 0.37 | **+2.94** positions (was +1.21) |

Isolating the two forces: a maxed underdog with rival development *switched off* reaches P12.42
(zenith) and P9.98 (terra), so upgrades alone are worth +5.27 and +5.71 positions; rival
development alone costs +0.46 and +1.00. Rival development is a real drag but a minority of the
effect, and the net arc more than doubled.

**Judgement call for the owner — `rivalDevelopment.poolPerRace` (0.36) does not need changing.** It
was sized against the old 1.482 s/lap spread and is now a larger *fraction* of the 0.674 s/lap
spread, which is the reason to check it. Measured, it is still correctly sized: after 11 accruals a
rival gains 0.235–0.329 s/lap against the player's best 110-DP build of 0.515–0.618 s/lap, and the
arc it is meant to threaten got better, not worse. Leaving it alone is the recommendation; changing
it is not this plan's call either way.

**But the front of the grid now wastes most of a max-out to the facet clamp — flagged, not fixed.**
Raising the front-runners' facets pushed them against `FACET_MAX = 100`. A full 3-tier max-out of
`power` + `aero` + `handling` is nominally 0.7752 s/lap for 165 DP; measured per team, the share of
those 42 facet points discarded by the clamp:

| team | waste, full max-out | was |
|---|---|---|
| kestrel | 50% | — |
| meridian | 48% | — |
| apex / solstice | 45% | 45% / 2% |
| vortex / delta | 43% | 14% / 0% |
| halcyon | 40% | — |
| nimbus | 10% | — |
| terra / zenith | 2% | 2% |

The clamp is correct and nothing breaks — the *optimal* 110-DP build routes around it, wasting only
0–15% (apex worst at 15.2%, six teams at 0%). But an unoptimised big spend on a front-running team
now returns roughly half of its nominal value, and no test covers this: `rivalDevelopmentMagnitude`
misses it because rival pools are small enough to still fit. This is a downstream design
consequence of a deliberate change, not a defect, and is recorded here for the owner rather than
silently absorbed.

## 7. Testing

- **Update `_regressionBands`** in `src/data/tuning.json` to the `MODEL_SPEC.md` §3 set, and
  replace `meanOvertakesPerRace`/`minOvertakesPerRace` with the position-change metrics. The
  overtake count stays as a logged diagnostic.
- **Fix the two known-broken assertions** in `tests/engine/monteCarlo.test.ts` (§11 of the oracle):
  the 20–70 overtake band and the "at least 2 overtakes" claim, which is false on shipped circuits.
- **Add Monte-Carlo assertions** for: top-team win share ≤ 0.90; distinct winners ≥ 4; mean
  `|grid − finish|`; grid↔finish ρ; and `corr(pace rank, mean finish)` ≥ 0.90.
- **Run over shipped circuits, not only `REFERENCE_CIRCUIT`.** The current suite's blind spot is
  that its fixture resembles no circuit on the calendar.
- **Report standard errors.** Win share at n=400 has an SE of ~2.5pp. Size samples to the
  distinction being asserted, and state the sample size in each test's failure message.
- **Determinism must hold** — same seed, byte-identical race (oracle §10).
- Assert the ordinal team ranking is unchanged from shipped, so a future edit cannot silently
  reorder the grid.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Target met by noise rather than competitiveness | `corr(pace rank, mean finish)` ≥ 0.90 gate |
| Existing engine tests tuned to the old spread break | Expected. Each break must be diagnosed as a real regression or a stale fixture assumption, and fixed rather than re-baselined. |
| Championship standings feel compressed / points spread narrows | Measure the season points distribution before and after; report it rather than assuming |
| A narrower grid makes upgrades feel less impactful | The opposite is measured: 0.526 s/lap now closes 78% of Zenith's car gap rather than 35% |
| `pitCrew` and `reliability` left unscaled look inconsistent beside scaled facets | Intentional and documented — those two feed DNFs and pit time, which the incidents plan owns |

## 9. Follow-on plans, in order

1. **Race incidents** — safety cars, first-lap incidents, dry-weather driver errors, and mechanical
   DNFs raised toward the real 6–10%. `tuning.incidents.dnfPerLap` and `driverErrorPerLap` exist,
   are `0.0`, and have no consumer. This is what closes 0.90 → 0.35–0.55.
2. **Overtaking converts to race time** — make `resolveOvertakes` affect `raceTime`, gated per
   circuit by `overtakingFactor`, so being stuck is real but escapable. Target: a car 0.3–0.5 s/lap
   faster needs 3–8 laps to clear, failing entirely 15–25% of the time and 60–75% on the hardest
   circuit.
3. **Wire the dead circuit fields** — `carSensitivity`, `driverSensitivity`, `pitLaneTimeLoss`, so
   the 12 circuits stop being interchangeable.
