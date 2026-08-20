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

- `meanOvertakesPerRace: [12, 22]` is stale by a factor of 2–4. The simulation measures **46.3**.
- `tests/engine/monteCarlo.test.ts` asserts a *different* band, **20–70**, contradicting the data
  file it lives beside.
- `minOvertakesPerRace: 2` is **false on shipped circuits** — a Silverpark race recorded 0, and
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

| Metric | Real F1 | Sim at 2026-08-20 | Band | Gated? |
|---|---|---|---|---|
| Mean \|grid − finish\| | **2.97** ± 0.04 classified (2011–25); 3.70 with DNFs | **1.88** | **2.5 – 4.0** | **Yes — primary** |
| Top-team win share | median **58.6%**; min 35.0% (2012); max 95.5% (2023) | **95.1%** ± 0.22 | **0.35 – 0.55** target; staged (§4) | **Yes** |
| Distinct winners / season | median **3**, range 2–6 | **3** (2 with rain off) | **≥ 4** | **Yes** |
| Grid↔finish Spearman ρ | **0.779** ± 0.009 classified; 0.628 with DNFs | **0.857** | **0.60 – 0.80** | **Yes** |
| Mechanical DNF / car-race | **9.8pp** of an 18.4% total DNF rate (2014–22) | 5 – 6% | **6 – 10%** | **Yes** |
| Per-circuit \|Δpos\| ratio | **1.47× – 2.67×** | **1.00×** (circuits are identical) | **1.5 – 2.5×** | **Yes** |
| Pit lane time loss | 19.7 – 23.8s (2,106 green-flag stops) | 22.0s | 19.5 – 24.0s | Yes |
| Recorded overtake events | not computable — see §5 | 46.3 | — | **No — diagnostic only** |

**Two deliberate omissions.**

*Pole-position win rate.* Real F1 is **51.5%** ± 2.2pp (2000–2025), rising to 55.4% since 2022.
It is not a band here because **this game has no qualifying** — the starting grid is the fixed
order in `drivers.json`. The metric is meaningless until qualifying exists, and its absence is
itself a design gap worth recording.

*Overtakes per race.* See §5. The metric is not gateable.

## 4. Staged win-share gate

The target of 0.35–0.55 is **not reachable by data alone**, so gating on it today would ship a
specification whose own tests fail. The grid sensitivity search established why (§7). The gate
therefore tightens as the work lands:

| After | Gate on top-team win share | Gate on distinct winners |
|---|---|---|
| Today | ≤ 0.97 (current behaviour) | ≥ 2 |
| The competitive-grid plan | **≤ 0.90** | **≥ 4** |
| The race-incidents plan | **0.35 – 0.55** | ≥ 4 |

Each step must be met before the next begins. Do not weaken a gate that has already been met.

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

## 8. Dead data — fields with no consumer in `src/`

Nine fields are validated, authored with plausible per-circuit values, and read by nothing. They
are documented here because their presence strongly implies a circuit variety that does not exist.

| Field | Where the behaviour actually comes from |
|---|---|
| `circuit.carSensitivity` | global `tuning.carPerformance.sectorSplit` |
| `circuit.driverSensitivity` | global `tuning.driverPerformance.sectorSplit` |
| `circuit.overtakingFactor` | global `tuning.overtaking.sectorFactor` |
| `circuit.pitLaneTimeLoss` | global `tuning.pit.laneTimeLoss` |
| path `sectorBoundaries`, `pitEntry`, `pitExit` | unread; `TrackCanvas` uses `points` alone, so pit entry and exit are never drawn |
| `tuning.incidents.dnfPerLap`, `driverErrorPerLap` | unread; no consumer exists |
| `team.developmentRate` | now read by the progression system only, not by the engine |

**`circuit.sectorBase` is a tenth, subtler case.** It *is* read (`lapModel.ts:20`), but as a
common additive offset applied to every car it cannot affect any gap, position or overtake — only
absolute clock time. Verified: swapping `sectorBase` between circuits produces byte-identical
order, gaps and overtake counts.

**Consequence, proven three ways.** Scrambling all four dead circuit fields yields byte-identical
races. Swapping `sectorBase` yields identical results. And **Aurora and Kaido — same 50 laps,
different `sectorBase`, `overtakingFactor` and `pitLaneTimeLoss` — produce bit-identical results
on every metric across 400 seeds.** The only per-circuit inputs that change racing today are
`laps` and `rainProbability`/`weatherBias`.

## 9. Overtaking is decorative — the precise statement

`resolveOvertakes` (`src/engine/race.ts:279-327`) selects the single most eligible pair per sector
boundary, rolls a probability shaped by `racecraft` and `tuning.overtaking`, then swaps two slots
in a **local array copy** and pushes an `OvertakeEvent`. **It never modifies `raceTime`.** Every
downstream consumer re-sorts by `raceTime`: the traffic penalty (`:157`), dirty air (`:184`),
final classification (`:249`), and `resolveOvertakes` itself on its next call (`:282`). The
swapped order is never read. Only the event survives, feeding commentary and the UI.

Position is therefore determined entirely by cumulative `raceTime`. Consequences:

- `driver.facets.racecraft` is worth **exactly zero**, on both attack and defence.
- The entire `tuning.overtaking` block affects nothing but the commentary feed.
- **A faster car always eventually gets past.** The traffic penalty is capped at
  `paceAdv * trafficCap` (0.7), so it can never fully cancel a pace advantage — at least 30% nets
  through every sector. You can never be genuinely stuck behind a car you are faster than, which
  is the defining strategic reality of a street circuit.

Two refinements to that, both measured. **The cap makes blocking cheap, not short**: 10+ lap
held-up runs are common (P(run ≥ 10 sectors) = 0.15; 2.4% run 30+ sectors; the worst observed was
an entire race), because the longest-stuck pairs are the ones with the *smallest* advantage. And
**traffic penalties do not cascade** — every gap in the traffic pass is computed from the
unpenalised ordering, so a car's penalty never widens the gap seen by the car behind it in the
same sector.

Measured cost of all this blocking: **0.58s per car per entire race** (worst ever 5.9s), against
roughly 24.4s for a pit stop. Blocking is effectively free.

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

Fix these when the relevant plan lands; do not treat their current passing as evidence.

- `tests/engine/monteCarlo.test.ts` asserts mean overtakes **20–70**, contradicting
  `_regressionBands`' 12–22. It fails high on dry Harbour Lights (76.6).
- Its "every race has at least 2 overtakes" assertion is **false on real circuits**.
- Both pass only because they run `REFERENCE_CIRCUIT`, a 30-lap rain-free fixture no shipped
  circuit resembles (measured on that fixture: 48.04 ± 0.30).
- `_regressionBands` in `tuning.json` should be replaced by the §3 bands.

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
