import { describe, it, expect } from 'vitest'
import { expectedBestWing, expectedLapDelta, WINGS, type Wing } from '@engine/setup'
import { loadGameData } from '@data/validators'
import { runRaces } from './monteCarloHarness'

// Pins the car-setup balance measured by scripts/calibrate-setup.ts against
// the spec's section 5 targets (docs/superpowers/specs/2026-10-09-car-setup-design.md).
// The race-level best-vs-worst place deltas are recorded in MODEL_SPEC.md
// (Car setup), not asserted here.

const data = loadGameData()
const circuits = Object.values(data.circuits)

describe('setup balance (spec section 5)', () => {
  it('best levels cover at least 4 of the 5', () => {
    expect(new Set(circuits.map(c => expectedBestWing(c, data.tuning, c.rainProbability ?? 0))).size).toBeGreaterThanOrEqual(4)
  })
  // The 0.08 floor is knife-edge: costa_verde sits at 0.085 and kaido at 0.087.
  // See MODEL_SPEC.md section 13 before touching it or the setup tuning.
  it('one step off the dry best costs 0.08-0.30 s/lap', () => {
    for (const c of circuits) {
      const best = expectedBestWing(c, data.tuning, 0)
      const f = (w: Wing) => expectedLapDelta(c, data.tuning, w, 0)
      const steps = WINGS.filter(w => Math.abs(w - best) === 1).map(w => f(w) - f(best))
      const loss = Math.min(...steps)
      expect(loss, c.name).toBeGreaterThanOrEqual(0.08)
      expect(loss, c.name).toBeLessThanOrEqual(0.30)
    }
  })
})

// Copied from tests/engine/monteCarlo.test.ts (not imported: importing a test
// file would re-register its tests here).
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('Monte-Carlo with AI setups on', () => {
  // ONE n=240 sample carries every band assertion of monteCarlo.test.ts's
  // 'reproduces the expected post-change win share', 'every gated metric is
  // inside its tuning.json band', 'mechanical DNF rate', 'crash and
  // safety-car rates' and the competitive-grid gates, with withSetups: true.
  // Determinism, full-calendar and cars.json-structure tests are not repeated.
  it('stays inside every band', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE, withSetups: true })
    const b = loadGameData().tuning._regressionBands!
    const n = `n=${m.races} races (${m.races * 20} car-races), setups on`
    // eslint-disable-next-line no-console
    console.log(`setups on: top=${m.topTeamId} share=${(m.topTeamShare * 100).toFixed(1)}% ` +
      `winners=${m.distinctWinners} |dpos|=${m.meanAbsPosChange.toFixed(2)} ` +
      `rho=${m.gridFinishSpearman.toFixed(3)} paceCorr=${m.paceRankCorrelation.toFixed(3)} ` +
      `mechDnf=${(m.mechanicalDnfPerCarRace * 100).toFixed(2)}% crashes=${(m.crashesPerCarRace * 100).toFixed(2)}pp ` +
      `sc=${m.safetyCarsPerRace.toFixed(3)}/race`)

    // 'reproduces the expected post-change win share'
    expect(m.topTeamShare, n).toBeGreaterThan(b.topTeamWinRate[0])
    expect(m.topTeamShare, n).toBeLessThanOrEqual(b.topTeamWinRate[1])

    // 'every gated metric is inside its tuning.json band'
    expect(Number.isFinite(m.meanAbsPosChange), n).toBe(true)
    expect(m.meanAbsPosChange, n).toBeGreaterThan(b.meanAbsPosChange[0])
    expect(m.meanAbsPosChange, n).toBeLessThan(b.meanAbsPosChange[1])
    expect(m.gridFinishSpearman, n).toBeGreaterThan(b.gridFinishSpearman[0])
    expect(m.gridFinishSpearman, n).toBeLessThan(b.gridFinishSpearman[1])
    expect(m.paceRankCorrelation, n).toBeGreaterThanOrEqual(b.minPaceRankCorrelation)
    expect(m.distinctWinners, n).toBeGreaterThanOrEqual(b.minDistinctWinners)

    // 'mechanical DNF rate is inside its tuning.json band'
    expect(m.mechanicalDnfPerCarRace, n).toBeGreaterThanOrEqual(b.mechanicalDnfPerCarRace[0])
    expect(m.mechanicalDnfPerCarRace, n).toBeLessThanOrEqual(b.mechanicalDnfPerCarRace[1])

    // 'crash and safety-car rates are inside their tuning.json bands'
    expect(m.crashesPerCarRace, n).toBeGreaterThanOrEqual(b.crashesPerCarRace[0])
    expect(m.crashesPerCarRace, n).toBeLessThanOrEqual(b.crashesPerCarRace[1])
    expect(m.safetyCarsPerRace, n).toBeGreaterThanOrEqual(b.safetyCarsPerRace[0])
    expect(m.safetyCarsPerRace, n).toBeLessThanOrEqual(b.safetyCarsPerRace[1])

    // competitive grid: 'no team wins more than 90%', 'at least four
    // different teams win', 'car pace rank still predicts finishing position'
    expect(m.topTeamShare, n).toBeLessThanOrEqual(0.90)
    expect(m.distinctWinners, n).toBeGreaterThanOrEqual(4)
    expect(m.paceRankCorrelation, n).toBeGreaterThanOrEqual(0.90)
  }, 300_000)
})
