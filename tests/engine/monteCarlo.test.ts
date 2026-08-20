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
      `overtakes=${m.meanOvertakeEvents.toFixed(1)} minOvertakes=${m.minOvertakeEvents}`)
    // MODEL_SPEC.md §3 records apex at 95.1% ± 0.22 over 19,200 races. At n=240
    // the SE of a ~0.95 share is sqrt(.95*.05/240) = 1.4pp, so a 0.88 floor is
    // ~5 SE below the documented value: wide enough not to flake, tight enough
    // to catch a real break.
    expect(m.topTeamId, `n=${m.races} races`).toBe('apex')
    expect(m.topTeamShare, `n=${m.races} races, SE~1.4pp`).toBeGreaterThan(0.88)
  }, 300_000)

  it('every gated metric is finite and in a sane range', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    expect(Number.isFinite(m.meanAbsPosChange), `n=${m.races} races`).toBe(true)
    expect(m.meanAbsPosChange, `n=${m.races} races`).toBeGreaterThan(0)
    expect(m.meanAbsPosChange, `n=${m.races} races`).toBeLessThan(10)
    expect(Math.abs(m.gridFinishSpearman), `n=${m.races} races`).toBeLessThanOrEqual(1)
    expect(Math.abs(m.paceRankCorrelation), `n=${m.races} races`).toBeLessThanOrEqual(1)
    expect(m.distinctWinners, `n=${m.races} races`).toBeGreaterThanOrEqual(1)
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
