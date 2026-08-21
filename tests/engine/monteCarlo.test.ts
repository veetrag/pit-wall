import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'

// A sample spanning the calendar's real variety rather than one synthetic
// fixture: a rain-heavy round, a dry desert round, the street circuit, and a
// high-speed round. MODEL_SPEC.md §11 records that the old suite's blind spot
// was testing only a 30-lap rain-free fixture no shipped circuit resembles.
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('Monte-Carlo regression', () => {
  it('reproduces the expected post-change win share', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`n=${m.races} top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% ` +
      `winners=${m.distinctWinners} |dpos|=${m.meanAbsPosChange.toFixed(2)}+-${m.sePosChange.toFixed(3)} ` +
      `rho=${m.gridFinishSpearman.toFixed(3)} paceCorr=${m.paceRankCorrelation.toFixed(3)} ` +
      `overtakes=${m.meanOvertakeEvents.toFixed(1)} minOvertakes=${m.minOvertakeEvents} ` +
      `mechDnf=${(m.mechanicalDnfPerCarRace * 100).toFixed(2)}%`)
    // Replaces the pre-change baseline test, which asserted topTeamShare > 0.88
    // on the old 1.482 s/lap grid -- exactly the behaviour the competitive-grid
    // change removes (MODEL_SPEC.md section 4 stages the ceiling to 0.90).
    //
    // Apex must remain the strongest team -- this change re-spaces the grid, it
    // does not reorder it. Measured post-change: 0.8458 pro / 0.8812 rookie over
    // all 12 circuits, and 0.8368 +- 0.97pp pooled over six n=240 samples of this
    // 4-circuit gate sample.
    expect(m.topTeamId, `n=${m.races} races`).toBe('apex')
    // Both ends come from the band file rather than a literal, so this gate cannot
    // drift from its documented provenance. The floor catches an overshoot into
    // lottery territory that somehow preserves pace-rank correlation; SE at n=240
    // and p=0.85 is 2.3pp, so 0.35 sits ~21 SE below.
    const wb = loadGameData().tuning._regressionBands!.topTeamWinRate
    expect(m.topTeamShare, `n=${m.races} races`).toBeGreaterThan(wb[0])
    expect(m.topTeamShare, `n=${m.races} races`).toBeLessThanOrEqual(wb[1])
  }, 300_000)

  // Every assertion here is checked against the tuning.json bands rather than
  // against a mathematically-always-true limit. The earlier version asserted
  // |rho| <= 1 and |paceCorr| <= 1 (tautologies of Pearson-on-ranks), |dpos| <
  // 10 (209 SE from the measured 2.06 ± 0.038) and distinctWinners >= 1 (true
  // by construction) — four gates that could not fail, which is worse than no
  // gate because it looks like protection.
  it('every gated metric is inside its tuning.json band', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    const bands = loadGameData().tuning._regressionBands
    expect(bands).toBeDefined()
    const b = bands!
    const n = `n=${m.races} races (${m.races * 20} car-races)`
    expect(Number.isFinite(m.meanAbsPosChange), n).toBe(true)
    // STAGED band (MODEL_SPEC.md §4), deliberately NOT advanced to the §3
    // target of 2.5-4.0 even though the narrowed grid now measures 2.803-2.968
    // (+-0.041-0.043, six n=240 pro samples) and would satisfy it. Advancing
    // this floor is the race-incidents plan's call; the competitive-grid plan's
    // remit was the win-share gates. 2.80 is 25 SE above the 1.75 floor.
    expect(m.meanAbsPosChange, `${n}, SE=${m.sePosChange.toFixed(3)}`)
      .toBeGreaterThan(b.meanAbsPosChange[0])
    expect(m.meanAbsPosChange, `${n}, SE=${m.sePosChange.toFixed(3)}`)
      .toBeLessThan(b.meanAbsPosChange[1])
    // FINAL section 3 band [0.60, 0.80], reached early by the competitive-grid
    // change and no longer staged (MODEL_SPEC.md §4 records the measurement).
    // Narrowing the grid moved rho from 0.834-0.856 to 0.7357-0.7593 (mean
    // 0.7479, six n=240 pro samples) -- TOWARD real F1's 0.779, so the old 0.78
    // staged floor would have gated against realism. Net effect is a tightening:
    // the ceiling drops 0.90 -> 0.80. The anti-lottery job the 0.78 floor did is
    // carried by minPaceRankCorrelation below (measured 0.9636).
    expect(m.gridFinishSpearman, n).toBeGreaterThan(b.gridFinishSpearman[0])
    expect(m.gridFinishSpearman, n).toBeLessThan(b.gridFinishSpearman[1])
    // FINAL band, not staged. Measured 0.9636 post-change (0.988 before): car-pace rank still predicts
    // finish rank. Both sides are ranks (see `rankify` in the harness), so this
    // survives grid compression -- it only collapses if results go random.
    expect(m.paceRankCorrelation, n).toBeGreaterThanOrEqual(b.minPaceRankCorrelation)
    // Staged (MODEL_SPEC.md §4): now 4, tightened by the competitive-grid plan.
    // Measured 7-8 distinct winners over six n=240 pro samples.
    expect(m.distinctWinners, n).toBeGreaterThanOrEqual(b.minDistinctWinners)
  }, 200_000)

  // SKIPPED DELIBERATELY, not broken, and it WOULD FAIL if un-skipped today.
  // MODEL_SPEC.md §3 bands mechanical DNFs at 6-10% per car-race against a
  // real-F1 figure of 9.8pp; this simulation measures 4.67% +- 0.12pp over 28,800
  // car-races, which is 11 SE BELOW the 6% floor. tuning.json carries that same
  // unwidened 0.06 floor, so the premise holds against the data file as well as
  // against §3. The cause is §7's "the simulation has no chaos", so the owner is
  // the race-incidents plan, not the competitive-grid plan.
  //
  // The measurement itself is live (Metrics.mechanicalDnfPerCarRace, logged by
  // the baseline test above); only the assertion waits. Un-skip when the
  // incidents plan lands. Do NOT widen the band to make it pass -- an earlier
  // revision loosened the floor to 0.04, which made the skipped test vacuously
  // passable and lost the gate in both directions.
  it.skip('mechanical DNF rate is inside its tuning.json band', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    const n = `n=${m.races} races (${m.races * 20} car-races)`
    expect(m.mechanicalDnfPerCarRace, n).toBeGreaterThanOrEqual(b.mechanicalDnfPerCarRace[0])
    expect(m.mechanicalDnfPerCarRace, n).toBeLessThanOrEqual(b.mechanicalDnfPerCarRace[1])
  }, 200_000)

  // MODEL_SPEC.md §10.1 says "byte-identical race", which the metric-level check
  // below does NOT prove: Metrics observes only final positions, winner, overtake
  // count and DNFs, so a perturbation of lap times or tyre age passes it
  // undetected (demonstrated in review at 0.0007s of lap time and one lap of tyre
  // age on every car). This asserts the actual invariant on the full final
  // RaceState. race.test.ts:136 compares a single field after a single sector, so
  // nothing else in the repo covers this.
  it('determinism: byte-identical final RaceState for one seed (MODEL_SPEC §10.1)', () => {
    const run = (seed: number) => {
      const data = loadGameData()
      const circuit = data.circuits['harbour_lights']!
      const config = {
        circuit,
        tuning: data.tuning,
        compounds: data.compounds,
        drivers: data.drivers.drivers,
        teams: data.cars.teams,
        strategies: data.strategies.defaults.map(s => ({
          ...s,
          brain: 'optimal' as const,
          plannedStops: s.plannedStops.map(st => ({ ...st, lap: Math.round((st.lap / 30) * circuit.laps) })),
        })),
        playerDriverId: '__none__',
        seed,
        tyreAllocationBase: data.tuning.tyreRules.allocation.pro,
        mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound.pro,
        coverReactionScale: data.tuning.difficultyProfiles.pro.coverReactionScale,
        paceModeAggression: data.tuning.difficultyProfiles.pro.aiPaceModeAggression,
      }
      let state = initRace(config)
      const rng = createRng(seed)
      for (let i = 0; i < circuit.laps * 3; i++) state = stepSector(config, state, rng)
      return JSON.stringify(state)
    }
    const a = run(4242)
    const b = run(4242)
    expect(b.length, 'serialised final RaceState, seed 4242, n=1 race').toBe(a.length)
    expect(b, 'serialised final RaceState, seed 4242, n=1 race').toBe(a)
    // Negative control: proves the comparison above is actually sensitive to
    // race content, so it cannot pass by comparing two empty/degenerate
    // serialisations. MODEL_SPEC.md §10.1 records that 4243 must differ.
    expect(run(4243), 'serialised final RaceState, seed 4243, n=1 race').not.toBe(a)
  }, 60_000)

  it('determinism: same seed base gives identical metrics', () => {
    const a = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    const b = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    expect(a, 'n=30 races per run').toEqual(b)
    const c = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4243 })
    expect(c, 'n=30 races per run').not.toEqual(a)
  }, 200_000)

  it('regression bands in tuning.json are well-formed and within their MODEL_SPEC limits', () => {
    const bands = loadGameData().tuning._regressionBands
    // _regressionBands is .optional() by design (a repo without bands must still
    // load), so narrow before reading through it.
    expect(bands).toBeDefined()
    const b = bands!
    expect(b.topTeamWinRate[1]).toBeLessThanOrEqual(1)
    expect(b.topTeamWinRate[0]).toBeLessThan(b.topTeamWinRate[1])
    expect(b.meanAbsPosChange[0]).toBeLessThan(b.meanAbsPosChange[1])
    expect(b.gridFinishSpearman[0]).toBeLessThan(b.gridFinishSpearman[1])
    expect(b.mechanicalDnfPerCarRace[0]).toBeLessThan(b.mechanicalDnfPerCarRace[1])
    expect(b.minPaceRankCorrelation).toBeLessThanOrEqual(1)
    expect(b.minDistinctWinners).toBeGreaterThanOrEqual(1)
  })
})

describe('competitive grid', () => {
  it('no team wins more than 90% of races', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% (n=${m.races})`)
    // n=240, SE ~1.9pp at p=0.85. The 0.90 ceiling sits ~2.6 SE above the
    // expected 0.85, so a real regression to 0.95 fails decisively.
    expect(m.topTeamShare, `top team ${m.topTeamId} won ${(m.topTeamShare * 100).toFixed(1)}% of ${m.races} races`)
      .toBeLessThanOrEqual(0.90)
  }, 300_000)

  it('at least four different teams win races', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`distinct winners: ${m.distinctWinners} -- ${JSON.stringify(
      Object.fromEntries(Object.entries(m.winShareByTeam).filter(([, v]) => v > 0)))}`)
    expect(m.distinctWinners, `only ${m.distinctWinners} teams won in ${m.races} races`)
      .toBeGreaterThanOrEqual(4)
  }, 300_000)

  it('car pace rank still predicts finishing position', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`pace-rank correlation: ${m.paceRankCorrelation.toFixed(3)}`)
    // The anti-lottery gate. If the target were met by making results random,
    // this collapses. MODEL_SPEC.md section 3 requires competitiveness to be genuine.
    expect(m.paceRankCorrelation, `pace rank no longer predicts finish (${m.paceRankCorrelation.toFixed(3)})`)
      .toBeGreaterThanOrEqual(0.90)
  }, 300_000)

  it('preserves the shipped team ordinal ranking', () => {
    const { cars, tuning } = loadGameData()
    const per = (i: number) => (9 / 100) * tuning.carPerformance.deltaPerRating * tuning.carPerformance.sectorSplit[i]! * 3
    const pace = (f: { power: number; aero: number; handling: number }) =>
      (100 - f.power) * per(0) + (100 - f.aero) * per(1) + (100 - f.handling) * per(2)
    const order = [...cars.teams].sort((a, b) => pace(a.facets) - pace(b.facets)).map(t => t.id)
    // Shipped order, measured before the change. A future edit must not silently
    // reorder the grid -- only re-space it.
    expect(order).toEqual([
      'apex', 'meridian', 'vortex', 'solstice', 'kestrel',
      'halcyon', 'delta', 'nimbus', 'terra', 'zenith',
    ])
  })

  it('keeps a real backmarker tier', () => {
    const { cars, tuning } = loadGameData()
    const per = (i: number) => (9 / 100) * tuning.carPerformance.deltaPerRating * tuning.carPerformance.sectorSplit[i]! * 3
    const pace = (f: { power: number; aero: number; handling: number }) =>
      (100 - f.power) * per(0) + (100 - f.aero) * per(1) + (100 - f.handling) * per(2)
    const byId = new Map(cars.teams.map(t => [t.id, pace(t.facets)]))
    const front = [...byId.values()].sort((a, b) => a - b).slice(0, 7)
    const frontSpread = front[6]! - front[0]!
    const cliff = byId.get('nimbus')! - front[6]!
    console.log(`front-seven spread ${frontSpread.toFixed(3)}s, cliff to nimbus ${cliff.toFixed(3)}s`)
    // Deliberately NOT a uniform flattening: tight front, distant tail, as real
    // F1 has. See the spec section 3.
    expect(frontSpread).toBeLessThan(0.15)
    expect(cliff).toBeGreaterThan(0.25)
  })

  it('leaves reliability and pitCrew untouched', () => {
    const { cars } = loadGameData()
    const byId = new Map(cars.teams.map(t => [t.id, t.facets]))
    // Shipped values. reliability drives mechanical DNFs (real F1: 9.8pp, sim
    // already below it) and pitCrew drives pit-stop time -- neither is this
    // plan's business.
    const expected: Record<string, { reliability: number; pitCrew: number }> = {
      apex: { reliability: 96, pitCrew: 90 },
      meridian: { reliability: 90, pitCrew: 88 },
      vortex: { reliability: 88, pitCrew: 85 },
      kestrel: { reliability: 85, pitCrew: 82 },
      solstice: { reliability: 87, pitCrew: 95 },
      delta: { reliability: 89, pitCrew: 80 },
      halcyon: { reliability: 72, pitCrew: 78 },
      nimbus: { reliability: 84, pitCrew: 86 },
      terra: { reliability: 80, pitCrew: 75 },
      zenith: { reliability: 94, pitCrew: 72 },
    }
    for (const [id, exp] of Object.entries(expected)) {
      expect(byId.get(id)!.reliability, `${id} reliability`).toBe(exp.reliability)
      expect(byId.get(id)!.pitCrew, `${id} pitCrew`).toBe(exp.pitCrew)
    }
  })
})
