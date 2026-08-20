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

## 5. Expected outcome

Measured over 4,800 races (12 circuits × 2 difficulties, as-shipped weather) with the reliability
rescale included, so the win share here is **conservative** — dropping the rescale returns the
DNFs that were beating Voss and should reduce Apex's share by roughly 1.7 points:

| team | wins | share | ±SE | mean finish |
|---|---|---|---|---|
| apex | 4073 | **84.85%** | 0.52 | 3.69 |
| meridian | 507 | 10.56% | 0.44 | 5.46 |
| halcyon | — | 1.71% | — | — |
| vortex | 76 | 1.58% | 0.18 | 6.76 |
| solstice | 29 | 0.60% | 0.11 | 10.03 |
| delta | — | 0.48% | — | — |
| kestrel | — | 0.17% | — | — |
| nimbus | — | 0.04% | — | — |

**Distinct winners: 3 → 8.** `corr(pace rank, mean finish)` = **0.965**, so competitiveness is
genuine rather than noise. Stable across difficulty (83.1 vs 83.2) but **not** across weather —
dry-only cells rise to 89–91%, confirming rain is still carrying much of the variety. That is
expected and is the incidents plan's problem, not this one's.

## 6. Effect on the Development Points progression

Recomputed with the real `applyUpgrades` and an exhaustive 110-DP search. The optimal build is
power Mk3 + aero Mk1 + handling Mk2, worth **0.526 s/lap**.

A maxed Zenith goes from 1.099 to **0.573 s/lap**, i.e. 8th on car pace and **0.148 s/lap behind
Apex** — where before, a maxed Zenith remained roughly 0.96 s/lap adrift. Mean finish improves from
P18.54 to **P15.29**, still without a win.

Two honest caveats. Zenith's *drivers* are the grid's two worst (0.87 and 0.96 s/lap deficits), so
car upgrades close only about a third of its total gap — the rest is the driver, which this plan
deliberately does not touch. And P15 with no wins remains a thin fantasy; it improves materially
once the incidents plan lands, because a compressed field plus safety cars is what converts pace
into results.

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
