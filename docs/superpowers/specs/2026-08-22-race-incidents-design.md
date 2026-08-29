# Race Incidents — design

**Date:** 2026-08-22. **Amended 2026-08-24** — see the amendment note below.
**Oracle:** `MODEL_SPEC.md` — read §3, §4 and §7 before starting
**Predecessor:** `docs/superpowers/specs/2026-08-20-competitive-grid-design.md` (landed, `dba84e8`),
then `2026-08-22-circuits-that-matter-design.md` (both its plans landed, `9f7e7a9`)

> ## Amendment, 2026-08-24 — read this before §1
>
> This spec was written against an **84.6%** top-team win share. Two plans have landed since
> (overtaking-race-time and circuit-sensitivity), and the measured figure is now **56.7 / 59.2%
> pro**. Every baseline number below has been re-derived; §1, §2, §2.1, §7.1, §8.2, §10 and §11
> carry the corrections inline.
>
> **Two things changed materially, and one number was simply wrong.**
>
> 1. **This plan no longer owns a 30pp gap — it owns about 2–4pp.** §2's claim that it "owns the
>    whole remaining distance" was true when written and is now false.
> 2. **The risk has flipped from undershoot to overshoot.** §2.1 was written to stop an implementer
>    cranking magnitudes *upward* to reach the band. The live risk is now the opposite: real-F1
>    incident rates may push win share *below* the 0.35 floor. §2.1 is restated symmetrically.
> 3. **§7.1's `driverErrorPerLap` was wrong by 1.75×.** Every *consequence* it states (~0.35 errors
>    per car-race, ~7 field-wide, ~1.4 crashes, 7.0pp) is correct and mutually consistent — and
>    §7.3's safety-car rate was correctly derived from them. Only the per-lap value itself did not
>    produce them: it omitted the consistency relief and assumed ~55 laps against a calendar mean of
>    46.67. Corrected to **0.0105**. §7.3 re-derives unchanged at 0.62/race.
**Scope:** `src/engine/` gains a new module and new rolls; `src/data/tuning.json` gains an
incidents block; `src/ui/` gains five surfaces. Split into **two plans** — engine first, UI second.

## 1. The problem

`MODEL_SPEC.md` §7 states it in one line: **the simulation has no chaos.**
`tuning.incidents.dnfPerLap` and `driverErrorPerLap` exist, are `0.0`, and **have no consumer in
`src/engine/`**. There is no safety car, no red flag, no first-lap incident and no dry-weather
driver error. The only stochastic disruption is the wet-weather spin in `lapModel.ts:62-86`.

The consequence is measured, not asserted. Every pace edge is multi-sigma: Voss's 0.06 s/lap edge
over Rossi is 3.45σ over a race distance before any car advantage exists. So results are
near-deterministic, and the competitive-grid plan proved the limit of fixing that with car data —
it narrowed the spread from 1.482 to 0.674 s/lap and reached **84.6%** top-team win share against
§7's predicted 81.5% floor for any `cars.json`-only change.

Current state — **re-measured 2026-08-24** over all 12 circuits, n = 720 per difficulty, two
independent seed bases (the post-grid figures this spec originally quoted are struck through):

- Apex ~~84.58% pro / 88.13% rookie~~ → **56.67 / 59.17% pro**, **64.17 / 60.00% rookie**, against
  §3's 0.35–0.55 target. The overtaking and circuit-sensitivity plans closed most of this gap.
- Mechanical DNF ~~4.67%~~ → **4.51 / 4.86% pro, 5.06 / 4.72% rookie**, against §3's 6–10%. The
  assertion for this band is **committed skipped**; this plan un-skips it.
- Crashes: **zero**, against real F1's 7.0pp of accidents per car-race. *Unchanged — no plan since
  has added a crash mechanic.*
- Safety cars: **zero**. *Unchanged.*

The two structural claims in the paragraph above this list still hold: pace edges are still
multi-sigma, and §7's plateau argument against further `cars.json` edits is untouched by either
landed plan.

## 2. Goal

Per the owner's decision, carried from the competitive-grid brainstorm: top-team win share
**0.35–0.55** with **at least four** distinct winners.

~~**This plan owns the whole remaining distance**~~ — **no longer true (amended 2026-08-24).** When
this was written the gap was 84.6% → 0.55, roughly 30pp, and §7's plateau argument meant no
`cars.json` edit could close it. The overtaking-race-time and circuit-sensitivity plans then closed
it by other means, to **56.7 / 59.2% pro**. What remains is **about 2–4pp**, and the distinct-winners
target (≥ 4) is **already met at 7**.

So this plan's job has changed from *closing the gap* to **crossing the last few points without
overshooting, while adding the chaos §7 asks for on its own merits.** The realism case for incidents
is undiminished — the sim still has zero crashes against real F1's 7.0pp, and zero safety cars — but
it is no longer load-bearing for the win-share band.

### 2.1 The stopping rule — this binds the implementer

The owner chose the **grounded** setting of every lever (§4).

**Amended 2026-08-24 — this rule now binds in both directions.** As written it guarded one failure
mode: cranking magnitudes upward to force the band green. From 56.7% that is no longer the likely
failure. The re-derived estimate is **0.40–0.50** — *inside* the band — and the live risk is
**overshooting below the 0.35 floor**, because the magnitudes in §7 are anchored to real F1
(7.0pp accidents, 6–10% mechanical DNF) rather than chosen to land the band.

Both directions are therefore forbidden as tuning moves:

- **Do not raise** compression, error rates or DNF rates to pull win share down into the band. A band
  bought that way fails `minPaceRankCorrelation ≥ 0.90` anyway — that gate exists precisely to catch
  a target met by noise rather than by competitiveness.
- **Do not lower** them to pull win share back up into the band either. §7's values are derived from
  real-F1 rates, and quietly shaving them to protect a win-share number would be fitting the physics
  to the scoreboard.

**If real-F1-accurate incident rates put win share outside 0.35–0.55, that is a genuine finding and
the two goals are in conflict — report it with the numbers and let the owner choose.** A well-argued
0.32 with honest accident rates is a better deliverable than a 0.45 bought by understating crashes.
The one exception: if `paceRankCorrelation` drops below 0.90, that is not a finding to report but a
defect to fix — it means results have stopped tracking pace, which no realism argument justifies.

The band is recorded as this plan's **target**, and `MODEL_SPEC.md` §4's staging table is updated
with the measured value and an argument, exactly as §3 requires of any missed band.

## 3. What this plan is not

**Not a noise increase.** §7 measured it: reaching the band via `noise.sigmaPerSector` needs 0.8, a
10× increase worth ±2.4 s/lap of unexplained swing. It destroys legibility and it is the wrong
mechanism — real F1's 0.2 s/lap edges are non-decisive because of *events*, not because lap times
are random.

**Not a car or driver data change.** `cars.json` was settled by the predecessor plan and
`drivers.json` is deliberately untouched by both. Neither file changes here.

**Not a lapping model.** The engine tracks `car.lap` but has no un-lapping concept. Gap compression
therefore applies uniformly, and a car two laps down is pulled closer than it should be. This is a
**documented simplification**, not an oversight: it does not affect any gated metric, and building a
lapping model is a larger change than the one this plan is making.

**Not a red flag / race suspension.** Out of scope. A red flag resets tyres and order in ways that
touch the pit and tyre-allocation rules, and it is rare enough (roughly one per season) to be
invisible in a 12-race sample. Recorded as possible later work.

**Not a new player control.** See §6.

## 4. The owner's four decisions

Each was made by explicit choice during brainstorming and is binding on implementation.

| Decision | Choice | The alternative that was rejected |
|---|---|---|
| Safety car gap compression | **Partial, ×0.35** | Full bunching to ~1s (bigger win-share effect, but a dominant leader loses through no fault of their own) |
| Player agency in v1 | **Engine + UI together** | Engine only, UI next plan |
| Driver error severity | **Mostly time loss, rarely terminal** | Time-loss-only; frequently-terminal |
| Safety car rate | **Real F1, ~0.6–0.7 per race** | Elevated ~1.0; emergent with no target |

## 5. Architecture

### 5.1 A new module

**`src/engine/incidents.ts`** — pure, no imports from `state/`, `ui/` or `canvas/`, all randomness
through the injected `Rng`. `race.ts` calls into it and applies the outcome; the module never
mutates state itself.

Rationale: `race.ts` is already 357 lines and holds the sector loop, traffic, overtaking, pits and
classification. Adding three risk models and a state machine to it would make it the file nobody
can hold in context. The incident model is also the part most worth testing in isolation — a roll
function can be exercised a million times without stepping a race.

### 5.2 Three independent risk sources

| Source | Where it rolls | Outcome |
|---|---|---|
| **Driver error** | per sector, relieved by driver `consistency` | usually time loss; `terminalFraction` of the time a crash that retires the car |
| **Mechanical DNF** | already exists at `race.ts:137-147` | terminal; rate raised to reach §3's 6–10% |
| **Crash → safety car** | on any terminal incident | field-wide neutralisation |

Driver error follows the **existing spin idiom** at `lapModel.ts:62-86` — roll per sector, relieve
with a driver facet, add the loss to sector time — with `consistency` in place of `wetWeather` and
a terminal branch the spin does not have.

Note for the implementer: `weather.wetIncident.dryTrackSpinChance` is **not** a dry-error mechanic
despite its name. It is the mirror case, wet-family tyres on a dry track (`lapModel.ts:75-86`). Dry
driver error genuinely does not exist in the engine today.

### 5.3 State lives on `RaceState`

`RaceState` gains two fields, mirroring the existing `overtakeEvents` pattern:

- `safetyCar: SafetyCarState | null` — `{ deployedLap, lapsRemaining, cause }`
- `incidents: IncidentEvent[]` — an append-only log the UI reads

**This placement is load-bearing, not stylistic.** `projection.ts` clones `RaceState` and
fast-forwards it. With `safetyCar` on `RaceState`, the projection engine **automatically** prices a
stop under yellow — "pit now, rejoin P4, +2.1s behind X" becomes correct under a safety car with
**no changes to `projection.ts` at all**. Putting the state in the Zustand store instead would
silently break the projection, which is the game's centrepiece interaction.

### 5.4 The safety car is a state machine on the existing sector tick

No new loop and no change to the "real time ≠ sim time" rule (CLAUDE.md §3). On each tick the
machine is in one of two states, and the transitions are:

- **Racing → Deployed.** A terminal incident rolls a deployment. On entry, and **once only**:
  compress gaps, set `lapsRemaining`.
- **Deployed → Racing.** `lapsRemaining` reaches zero.

**While deployed, four things change:**

1. **Gaps compress ×`gapCompression`, once, at deployment.** For every active car,
   `raceTime := leaderTime + (raceTime − leaderTime) × 0.35`. A 25s lead becomes 8.75s.
2. **All sector times ×`paceMultiplier`.** Applied equally to every car, so it changes no gaps. Its
   entire purpose is to make point 3 meaningful.
3. **Pit-lane loss `laneTimeLoss` → `laneTimeLossUnderSc`.** 22.0s → 10.0s. **This is the
   strategic payload of the whole feature** — a stop under yellow is worth ~12 free seconds.
4. **Overtaking is disabled.** Correct for real racing under yellow, and it also prevents the
   sector-boundary check from producing nonsense at freshly compressed gaps.

### 5.5 Where each roll is actually invoked — resolving the split

§5.2 says the rolls live in `incidents.ts`, and §5.4 says sector times are scaled while deployed.
Both touch sector time, which is computed in `lapModel.ts`, not `race.ts`. That could be read two
ways, so it is settled here explicitly:

- **`incidents.ts` owns the decisions** — pure predicates and magnitudes: does this car err this
  sector, is the error terminal, how much time does it cost, does this retirement deploy a safety
  car, how long for, what does compression do to a set of race times.
- **`race.ts` owns applying them** to `CarState` and `RaceState`, in the per-car map at
  `race.ts:97-149` where the tyre and mechanical rolls already live. Driver error is applied there,
  **not** inside `computeSectorTime` — the error's terminal branch retires a car, and `lapModel.ts`
  returns a `SectorResult` and has no vocabulary for retirement.
- **The safety car's `paceMultiplier` is the one exception** and is applied in `lapModel.ts`,
  because it scales the computed sector time rather than adding to it. It reads `safetyCar` from the
  state already passed to `computeSectorTime` (which today receives `state.weatherState`; it will
  need the safety car state too). It performs **no `rng()` call**, so it cannot perturb the stream.

Consequence for the error model: the time-loss branch adds to `raceTime` after `computeSectorTime`
returns, so it does **not** appear in `SectorResult.sectorTime`. If the UI needs to show it, it
reads the `IncidentEvent` log, not the sector result. An implementer who instead threads the error
into `computeSectorTime` will find they cannot retire the car from there and will be tempted to
return a sentinel — do not; the split above exists to prevent exactly that.

**Ordering within the tick is fixed and load-bearing:** tyre failure, then mechanical failure, then
driver error, then (for any car that retired this tick) the safety car deployment roll. Deployment
is rolled once per tick at most, even if two cars retire in the same tick, and never while a safety
car is already active or `maxPerRace` is reached.

### 5.5 RNG-stream discipline — the constraint that lets this land

Adding `rng()` calls to the hot path shifts the draw sequence, which would move every measured
number in the repository and invalidate the determinism fixtures.

**Every new roll must therefore be guarded so that a `0.0` tuning value performs no `rng()` call at
all.** This is the same short-circuit that already guards `mechanicalFailure` at `race.ts:144`
(`perLap > 0 && rng() < perLap / 3`), and the comment there explains why the ordering of that `&&`
is load-bearing. Follow it exactly.

This is what makes the existing 263-test suite survive: existing fixtures get a zeroed incidents
config and stay byte-identical, while new behaviour is measured in new tests.

## 6. Player-facing design

**No new player control.** Under a safety car the correct action is to pit, and the pit lever
already exists. What is missing is *information*, not agency. Adding no button keeps the surface
small and makes it impossible to ship the feature half-wired.

Five surfaces:

1. **Safety car banner** — full width, above the timing tower, with a laps-remaining countdown.
   Needs a **new `--caution` design token**. `--tyre-medium` (`#F2C94C`) is the closest existing
   yellow but is semantically a compound colour; reusing it would violate CLAUDE.md §6.3's
   theming-via-tokens rule. Slow pulse while active, in the "living gauge" language of §6.2 rather
   than a static bar.
2. **`PitPanel` states the discount explicitly** — `PIT LOSS 10.0s` with `−12.0s UNDER SAFETY CAR`
   beneath. The feature is worthless if exploiting it requires knowing the mechanic.
3. **`CommentaryTicker` incident lines** — error, crash, deployment, release. Cheapest win
   available: the component exists, and this is where the race acquires a narrative.
4. **Timing tower compression flash** — a ×0.35 collapse is the most dramatic reorder in the game.
   `TimingTower.tsx` already animates reordering via FLIP layout; this adds a one-shot flash on
   affected rows and nothing else.
5. **Track canvas** — cars visibly slow, plus a subtle yellow wash. Deliberately modest: the
   banner is the signal, the canvas is atmosphere.

**Quality floor, from CLAUDE.md §6.3, all non-negotiable:**

- The banner carries the words **"SAFETY CAR"**. Colour is never the only signal.
- `--caution` must pass **AA contrast** against `--bg-panel` for any text drawn on it.
- `prefers-reduced-motion` replaces the pulse with a static state; the banner must not break.
- **Haptic on deployment** via Capacitor Haptics — this is the single biggest moment in a race.
- Screen-reader label on the banner announcing deployment and laps remaining.

## 7. Tuning values

All values live in `src/data/tuning.json`; none may be hardcoded (CLAUDE.md §4). These are
**starting values, derived to be self-consistent**, and §8's tuning pass may move them within the
constraint of §2.1.

### 7.1 Driver error

| Key | Value | Consequence |
|---|---|---|
| `incidents.driverErrorPerLap` | **0.0105** (was 0.006 — see below) | ~0.35 errors per car-race; ~7 per race field-wide |
| `incidents.terminalFraction` | **0.20** | ~5.6 time-loss errors and ~1.4 crashes per race |
| `incidents.errorTimeLossMean` | **3.5** | seconds |
| `incidents.errorTimeLossSigma` | **1.5** | seconds |
| `incidents.consistencyReliefMax` | **0.35** | a `consistency` 100 driver errs 35% less often |

The error chance is `driverErrorPerLap * (1 - (consistency/100) * consistencyReliefMax) / 3` per
sector, mirroring the wet spin's `wetSkillReliefMax` shape at `lapModel.ts:69-71`. Relief reduces
the chance of erring; it does **not** change `terminalFraction` — a mistake, once made, is no less
likely to end the race for a consistent driver. If that reads wrong on the phone it is a one-line
tuning change, not a design change.

**Why 0.0105 and 0.20 specifically.** These were solved *backwards* from the oracle, not guessed:
1.4 crashes per race over 20 cars is **7.0pp per car-race**, which is exactly §3's computed real-F1
accident share (2014–22). Any implementer changing one of these two numbers must recheck that
identity.

> **Correction, 2026-08-24.** The identity above is right and the consequences column is right; the
> per-lap value was not. **0.006 produces 3.99pp, not 7.0pp** — off by 1.75×. Two compounding
> mistakes: it omitted the `consistencyReliefMax` factor (mean relief over the 20 shipped drivers is
> **0.7121**, since mean `consistency` is 82.25), and it assumed ~55 laps against a calendar mean of
> **46.67**. Solving forwards with both:
>
> ```
> errors per car-race = driverErrorPerLap x meanRelief x meanLaps
>                     = 0.0105 x 0.7121 x 46.67  = 0.349      (spec's stated ~0.35)
> field-wide per race = 0.349 x 20              = 6.98       (spec's stated ~7)
> crashes per race    = 6.98 x 0.20             = 1.396      (spec's stated ~1.4)
> per car-race        = 1.396 / 20              = 6.98pp     (spec's stated 7.0pp)
> ```
>
> So **`driverErrorPerLap` = 0.0105**, and every other figure in this section stands as written.
> §7.3's safety-car rate was derived from 1.4 crashes/race — the *correct* consequence — so it also
> stands; see the re-derivation there. This is exactly the recheck the paragraph above demands, and
> it is why that instruction is in the spec.

### 7.2 Mechanical DNF

`mechanicalFailure.baseChancePerLap`: **0.008 → 0.014** — ~~superseded~~, shipped at **0.012**; see the note below.

No new mechanism — the existing roll at `race.ts:137-147` is correct and stays as it is. 0.014
takes the measured 4.67% to approximately **8%**, the middle of §3's 6–10% band.

> **Verified 2026-08-24.** Solving `1 - exp(-baseChancePerLap x (1 - reliability/100) x meanLaps)`
> over the 10 shipped teams at the 46.67-lap calendar mean: **0.008 → 4.89%** (matching the measured
> 4.51–5.06%, which validates the model) and **0.014 → 8.36%**, i.e. 1.67 mechanical retirements per
> race field-wide. Mid-band as claimed.
>
> **SUPERSEDED 2026-08-29 — the value shipped is 0.012, not 0.014.** 0.014 meets the field-wide band
> but breaks the *reliability* spec's per-team targets: Halcyon (reliability 72) retires from ~19.5%
> of races against a 10–15% target. The conflict turned out to be partly an artifact of measurement:
> `mechanicalFailure.test.ts` measured its per-team bands on a **56-lap** circuit while §3's band is
> calendar-wide (46.67 mean), overstating the per-team figures by ~20%. Measured on a representative
> **47 laps**, 0.012 satisfies all three at once — Halcyon 14.5%, Zenith 3.3%, field-wide 7.04–7.42%
> (measured, all 12 circuits, n=720, both difficulties). Owner's call, taken 2026-08-29. Combined with
~7pp of crashes that gives ~15% total DNF against real F1's 18.4%, with tyre failures accounting
for part of the remainder.

**Do not rescale the `reliability` facet to achieve this.** The predecessor spec's §3 rejected that
explicitly, and `cars.json` does not change in this plan.

### 7.3 Safety car

| Key | Value | Notes |
|---|---|---|
| `incidents.safetyCar.crashDeployChance` | **0.30** | a crash blocks the track |
| `incidents.safetyCar.mechanicalDeployChance` | **0.12** | a stranded car often does not |
| `incidents.safetyCar.gapCompression` | **0.35** | the owner's partial-compression decision |
| `incidents.safetyCar.paceMultiplier` | **1.45** | applied to all cars equally |
| `incidents.safetyCar.laneTimeLossUnderSc` | **10.0** | against `pit.laneTimeLoss` 22.0 |
| `incidents.safetyCar.durationLapsMin` | **3** | |
| `incidents.safetyCar.durationLapsMax` | **5** | |
| `incidents.safetyCar.maxPerRace` | **2** | and never while one is active |

**Expected rate:** 1.4 crashes × 0.30 + 1.6 mechanical retirements × 0.12 = **0.61 per race**,
inside the owner's ~0.6–0.7 choice. An implementer changing any of the four inputs must recompute
this and confirm the measured rate still lands in 0.5–0.8.

> **Re-derived 2026-08-24, unchanged.** With §7.1 corrected to 0.0105 and §7.2 verified, the two
> inputs are **1.396 crashes** and **1.67 mechanical retirements** per race:
> `1.396 x 0.30 + 1.67 x 0.12 = 0.419 + 0.200 =` **0.619 per race**. Still inside the owner's
> ~0.6–0.7. Note this section was already consistent with the *intended* crash count, which is why
> correcting §7.1 fixed the spec's internal arithmetic rather than breaking it.

## 8. Testing

### 8.1 The three defences against the RNG-stream change

1. **Zero-config byte-identity — build this first.** A race run with every incidents value at `0.0`
   must be **byte-identical** to the pre-change engine, compared as `JSON.stringify` of the final
   `RaceState`. This single test is the regression net for the entire existing suite, and if it
   cannot be made to pass, §5.5 has been violated somewhere.
2. **Determinism with incidents live.** Same seed ⇒ byte-identical race, with a negative control on
   a different seed. Compare **serialised state, not summary metrics**: the repository's original
   determinism test passed while every car's lap times were perturbed by 0.0007s and tyre ages by a
   full lap, because it only compared summary figures.
3. **Bands come from `MODEL_SPEC.md` §3, never from what the sim measures.** A band written loose
   enough for today's value to pass, while citing §3 as provenance, is a defect this project has
   already committed once and corrected once.

### 8.2 Bands this plan is accountable for

**OUTCOME, measured 2026-08-29 (all 12 circuits, n=720, both difficulties, two seed bases).**
Seven of eight targets met. The eighth — top-team win share — was missed and **did not move at
all**, and per §2.1 the magnitudes were not adjusted in either direction to chase it.

| Metric | Before | After | Target | Verdict |
|---|---|---|---|---|
| Mechanical DNF / car-race | 4.51–5.06% | **7.04–7.42%** | 6–10% | **MET** — assertion un-skipped |
| Crashes / car-race | 0 | **6.32–6.54pp** | 6–8pp | **MET** |
| Safety cars / race | 0 | **0.518–0.553** | 0.5–0.8 | **MET** |
| Distinct winners | 7 | **7** | ≥ 4 | met, unmoved |
| Mean \|Δpos\| | 2.86 | **3.58–3.62** pro | in 2.5–4.0 | met, nearer the ceiling |
| Grid↔finish ρ | 0.75–0.79 | **0.63–0.65** | in 0.60–0.80 | met; ceiling worry resolved |
| `paceRankCorrelation` | 0.9636 | **0.9879** | ≥ 0.90 | met, and it rose |
| **Top-team win share** | 56.7–59.2% | **56.8–58.8%** | 0.35–0.55 | **MISSED** |
| Driver errors / race | 0 | **5.08–5.28** | — | diagnostic |

**Why the miss, and why it is not a tuning failure.** §2 predicted 0.40–0.50 and was wrong, for a
reason neither this spec nor `MODEL_SPEC.md` §7 anticipated: **win-share concentration is a
DRIVER-pace effect, and incidents are driver-agnostic.** `d_voss` alone wins **55.0%** of races
(n=600, all 12 circuits) and two drivers take **86.2%** of all wins. `drivers.json` has a pace cliff
at the top — 96, 94, then 90, 86, 85 — and Voss pairs the highest pace with the best car. Removing
~15% of his races through DNFs does not change who is fastest in the other 85%. Two-car absorption
is minor by comparison (34 of Apex's 338 wins came after losing its other car).

So the remaining distance is reachable by neither `cars.json` (§7's plateau) nor incident rates
(measured). It lives in **`drivers.json`'s top-end pace spread or in driver-car pairing** — which
§3 of this spec explicitly placed out of scope, and which carries an owner decision: a flatter
driver spread makes the championship closer and an elite driver mean less.

`topTeamWinRate`'s ceiling was therefore left staged at **0.90** and NOT advanced to 0.55.

---

Original targets table (current column as of 2026-08-24):

| Metric | Current | Target | Source |
|---|---|---|---|
| Top-team win share | ~~0.846~~ **0.567 / 0.592** | **0.35–0.55** | §3; subject to §2.1's two-way stopping rule |
| Distinct winners | ~~7–8~~ **7** | ≥ 4 (already met — must not regress) | §3 |
| Mechanical DNF / car-race | ~~4.67%~~ **4.51 / 4.86%** | **6–10%** — this **un-skips** the committed-skipped test | §3 |
| Mean \|grid − finish\| | ~~2.859~~ **2.863 / 2.837** | band **already advanced** to 2.5–4.0 by the overtaking plan; stay inside it | §4 |
| Grid↔finish ρ | ~~0.753~~ **0.750 / 0.756** pro, **0.777 / 0.787** rookie | stay inside 0.60–0.80 — **rookie has only 0.0126 of ceiling headroom**, watch it | §3 |
| `paceRankCorrelation` | **0.9636** pro / 0.9152 rookie | **≥ 0.90** — the anti-lottery gate | §3 |
| Safety cars / race | 0 | **0.5–0.8** | §4's owner decision |
| Crashes / car-race | 0 | **6–8pp** | §3's 7.0pp accident share |

### 8.3 Measurement discipline

- **Measure field-wide over ≥ 4 circuits at a stated difficulty.** `MODEL_SPEC.md` §4 makes this
  part of the win-share band: the same cars measured 0.99 on a single-circuit fixture and 0.9417
  across four. `tests/engine/monteCarloHarness.ts` and its `HARNESS_SAMPLE` already do this.
- **The harness must keep `playerDriverId: '__none__'`.** A real id leaves one car on its start tyre
  in `neutral` all race and skews every field-wide statistic.
- **Report standard errors and state sample size in every failure message.** Win share at n=240 has
  an SE of ~2.5pp.
- **Every new assertion must be failable.** Mutate the data and confirm the test catches it. This
  project has shipped four tautologies (`|ρ| ≤ 1`, `|paceCorr| ≤ 1`, `|Δpos| < 10` at 209 SE,
  `distinctWinners ≥ 1`) and one unfailable floor (`≥ 0.0` on a proportion). Do not add a sixth.
- **Unit-test `incidents.ts` directly**, not only through a stepped race: roll-rate convergence
  against the configured probability, `consistency` relief monotonicity, terminal fraction, and
  compression arithmetic.

## 9. The two plans

**Plan A — engine and bands.** `incidents.ts`, the `RaceState` fields, the safety car state
machine, the `race.ts` integration, the `tuning.json` block and its zod validator, and the whole of
§8. All measurement risk lives here, and it must land and be verified before any component is
touched.

**Plan B — UI.** The five surfaces in §6, the `--caution` token, haptics, reduced-motion and
accessibility.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The RNG-stream change silently moves every measured number | §8.1's zero-config byte-identity test, built first |
| ~~Win share does not reach 0.35–0.55~~ **Win share overshoots *below* 0.35** (amended: from 56.7% the undershoot risk is largely gone) | §2.1's stopping rule, which now binds in **both** directions — report, do not crank *or* shave |
| The band is met by turning races into a lottery | `paceRankCorrelation ≥ 0.90`, which already caught this class of failure once |
| Compression makes a dominant leader's loss feel arbitrary | The owner chose ×0.35 partial specifically to soften this; the banner and commentary make the cause legible |
| A safety car makes the projection overlay wrong | §5.3 — `safetyCar` on `RaceState` means `projection.ts` gets it for free; a test asserts the projection prices a stop under yellow correctly |
| `incidents.ts` grows into a second god-file | It owns rolls and the state machine only; applying outcomes stays in `race.ts` |
| Lapped-car compression is unrealistic | Documented simplification (§3); affects no gated metric |

## 11. Follow-on work, in order

1. ~~**Overtaking converts to race time**~~ — **LANDED 2026-08-23.** Overtakes now durably swap
   `raceTime`, gated per circuit by `overtakingFactor`. The clearing targets were **not** met and are
   committed skipped and un-weakened; see `MODEL_SPEC.md` §9.
2. ~~**Wire the dead circuit fields**~~ — **LANDED 2026-08-23.** `carSensitivity`,
   `driverSensitivity` and `pitLaneTimeLoss` are all consumed. One negative result on the record: the
   per-circuit \|Δpos\| ratio *fell* from 1.52 to 1.35 against a 1.5–2.5 target, because the shipped
   sensitivities anti-correlate with position churn (`MODEL_SPEC.md` §4). **Still open, and not this
   plan's to fix.**
3. **Red flags**, deliberately excluded here (§3).
4. **Lapping / un-lapping**, so safety-car compression stops pulling a two-lap-down car unfairly
   close (§3's documented simplification).
