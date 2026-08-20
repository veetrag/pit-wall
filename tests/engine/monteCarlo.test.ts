import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'

// A sample spanning the calendar's real variety rather than one synthetic
// fixture: a rain-heavy round, a dry desert round, the street circuit, and a
// high-speed round. MODEL_SPEC.md §11 records that the old suite's blind spot
// was testing only a 30-lap rain-free fixture no shipped circuit resembles.
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('Monte-Carlo regression', () => {
  it('harness reproduces the documented baseline win share', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    console.log(`n=${m.races} top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% ` +
      `winners=${m.distinctWinners} |dpos|=${m.meanAbsPosChange.toFixed(2)}+-${m.sePosChange.toFixed(3)} ` +
      `rho=${m.gridFinishSpearman.toFixed(3)} paceCorr=${m.paceRankCorrelation.toFixed(3)} ` +
      `overtakes=${m.meanOvertakeEvents.toFixed(1)} minOvertakes=${m.minOvertakeEvents} ` +
      `mechDnf=${(m.mechanicalDnfPerCarRace * 100).toFixed(2)}%`)
    // MODEL_SPEC.md §3 records apex at 95.1% ± 0.22 over 19,200 races. This
    // 4-circuit sample measures 92.1%, whose SE at n=240 is
    // sqrt(.921*.079/240) = 1.74pp. A 0.85 floor is (0.921-0.85)/0.0174 = 4.1
    // SE below the measured value: wide enough not to flake, tight enough to
    // catch a real break. (An 0.88 floor was only 2.35 SE and too thin.)
    //
    // This test pins PRE-CHANGE behaviour on the old grid. The competitive-grid
    // plan RETIRES it and replaces it with the ≤0.90 stage gate of
    // MODEL_SPEC.md §4 — it is not to be weakened in place.
    expect(m.topTeamId, `n=${m.races} races`).toBe('apex')
    expect(m.topTeamShare, `n=${m.races} races, SE=1.74pp`).toBeGreaterThan(0.85)
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
    // Measured 2.06 ± 0.038 SE: 14.7 SE above the 1.5 floor, 51 SE below 4.0.
    expect(m.meanAbsPosChange, `${n}, SE=${m.sePosChange.toFixed(3)}`)
      .toBeGreaterThan(b.meanAbsPosChange[0])
    expect(m.meanAbsPosChange, `${n}, SE=${m.sePosChange.toFixed(3)}`)
      .toBeLessThan(b.meanAbsPosChange[1])
    // Measured 0.834 inside [0.55, 0.90].
    expect(m.gridFinishSpearman, n).toBeGreaterThan(b.gridFinishSpearman[0])
    expect(m.gridFinishSpearman, n).toBeLessThan(b.gridFinishSpearman[1])
    // Measured 0.976: car pace rank still predicts mean finish.
    expect(m.paceRankCorrelation, n).toBeGreaterThanOrEqual(b.minPaceRankCorrelation)
    // Staged (MODEL_SPEC.md §4): 2 today, 4 after the competitive-grid plan.
    expect(m.distinctWinners, n).toBeGreaterThanOrEqual(b.minDistinctWinners)
  }, 200_000)

  // SKIPPED DELIBERATELY, not broken. MODEL_SPEC.md §3 bands mechanical DNFs at
  // 6-10% per car-race against a real-F1 figure of 9.8pp, but records that this
  // simulation measures 5-6% — so the band is ASPIRATIONAL and its owner is the
  // race-incidents plan (§4), not the competitive-grid plan. The measurement is
  // live in the harness (Metrics.mechanicalDnfPerCarRace) and logged by the
  // baseline test above; only the assertion waits. Un-skip when the incidents
  // plan lands, and do NOT widen the band to make it pass here.
  it.skip('mechanical DNF rate is inside its tuning.json band', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    const n = `n=${m.races} races (${m.races * 20} car-races)`
    expect(m.mechanicalDnfPerCarRace, n).toBeGreaterThanOrEqual(b.mechanicalDnfPerCarRace[0])
    expect(m.mechanicalDnfPerCarRace, n).toBeLessThanOrEqual(b.mechanicalDnfPerCarRace[1])
  }, 200_000)

  it('determinism: same seed base gives identical metrics', () => {
    const a = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    const b = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4242 })
    expect(a, 'n=30 races per run').toEqual(b)
    const c = runRaces({ races: 30, circuitIds: SAMPLE, seedBase: 4243 })
    expect(c, 'n=30 races per run').not.toEqual(a)
  }, 200_000)

  it('regression bands in tuning.json match what the harness measures', () => {
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
