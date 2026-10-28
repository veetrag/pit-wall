import { describe, it, expect, beforeAll } from 'vitest'
import { runRaces, type Metrics } from './monteCarloHarness'
import { measureClearing } from './overtakeClearing'

/*
 * Per-circuit calibration gates for circuits authored by docs/CIRCUIT-AUTHORING.md
 * (spec 2026-10-24 §1.6). The envelope is wider than the field-wide bands because
 * a single circuit pools less disruption (MODEL_SPEC §4). Identity targets prove
 * the circuit is what its brief says. If one fails, edit THE CIRCUIT'S DATA,
 * never a global tuning value and never these numbers.
 *
 * Simulations run lazily inside the tests (never at describe-collection time),
 * memoised so each (circuit set, difficulty) is measured once per file run, and
 * the SAMPLE reference is measured once and shared by every circuit's gates.
 */
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']
const N = 120

type Difficulty = 'pro' | 'rookie'
const cache = new Map<string, Metrics>()
function measure(circuitIds: readonly string[], difficulty: Difficulty): Metrics {
  const key = `${circuitIds.join(',')}|${difficulty}`
  let m = cache.get(key)
  if (!m) {
    m = runRaces({ races: N, circuitIds: [...circuitIds], difficulty })
    cache.set(key, m)
  }
  return m
}
const sample = () => measure(SAMPLE, 'pro')

function envelope(id: string, m: Metrics, label: string) {
  const at = `${id} ${label} n=${m.races}`
  expect(m.meanAbsPosChange, at).toBeGreaterThanOrEqual(2.3)
  expect(m.meanAbsPosChange, at).toBeLessThanOrEqual(4.6)
  expect(m.gridFinishSpearman, at).toBeGreaterThanOrEqual(0.50)
  expect(m.gridFinishSpearman, at).toBeLessThanOrEqual(0.85)
  expect(m.paceRankCorrelation, at).toBeGreaterThanOrEqual(0.85)
  expect(m.distinctWinners, at).toBeGreaterThanOrEqual(3)
  expect(m.mechanicalDnfPerCarRace, at).toBeGreaterThanOrEqual(0.04)
  expect(m.mechanicalDnfPerCarRace, at).toBeLessThanOrEqual(0.12)
}

describe('lantern_quay (night street circuit)', () => {
  const ID = 'lantern_quay'
  beforeAll(() => {
    const pro = measure([ID], 'pro')
    // eslint-disable-next-line no-console
    console.log(`MEASURE lantern_quay pro sc=${pro.safetyCarsPerRace} crash=${pro.crashesPerCarRace} dpos=${pro.meanAbsPosChange} rho=${pro.gridFinishSpearman} pace=${pro.paceRankCorrelation} | SAMPLE sc=${sample().safetyCarsPerRace}`)
  })

  it('stays inside the per-circuit envelope at both difficulties', () => {
    envelope(ID, measure([ID], 'pro'), 'pro')
    envelope(ID, measure([ID], 'rookie'), 'rookie')
  })
  it('IS A SAFETY-CAR CIRCUIT: >= 0.85 per race and >= 1.4x the SAMPLE rate', () => {
    const pro = measure([ID], 'pro')
    expect(pro.safetyCarsPerRace).toBeGreaterThanOrEqual(0.85)
    expect(pro.safetyCarsPerRace).toBeGreaterThanOrEqual(1.4 * sample().safetyCarsPerRace)
  })
  it('walls bite, but it is not a demolition derby', () => {
    expect(measure([ID], 'pro').crashesPerCarRace).toBeLessThanOrEqual(0.14)
  })
  it('IS HARD TO PASS ON: a 0.4 s/lap faster car fails to clear in >= 20% of trials', () => {
    const seeds = Array.from({ length: 120 }, (_, i) => 500 + 13 * i)
    expect(measureClearing({ circuitId: ID, seeds, advantage: 0.4 }).failureRate).toBeGreaterThanOrEqual(0.20)
  })
})
