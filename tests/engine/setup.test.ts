import { describe, it, expect } from 'vitest'
import { wingD, wingSectorDelta, wingOvertakeFactor, expectedLapDelta, expectedBestWing, type Wing } from '@engine/setup'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { replay } from '@engine/debrief'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const base = buildRaceConfig(11, 'd_voss', 'veloce', 'rookie', null, null)
const withWing = (w: Wing, def: Wing = 3): RaceConfig =>
  ({ ...base, setups: { d_voss: w, d_rossi: def } })

describe('wing model', () => {
  it('maps levels to d', () => {
    expect([1, 2, 3, 4, 5].map(w => wingD(w as Wing))).toEqual([-1, -0.5, 0, 0.5, 1])
  })
  it('level 3 and absent setups are exactly zero', () => {
    for (const s of [0, 1, 2] as const) {
      expect(wingSectorDelta(base, 'd_voss', s, 'WET')).toBe(0)
      expect(wingSectorDelta(withWing(3), 'd_voss', s, 'WET')).toBe(0)
    }
    expect(wingOvertakeFactor(base, 'd_voss', 'd_rossi', 0)).toBe(1)
  })
  it('low wing is faster in S1 and slower in S2/S3 (dry, before the balance cost)', () => {
    const t = base.tuning.setup
    const bal = t.balanceCost * 1 / 3
    expect(wingSectorDelta(withWing(1), 'd_voss', 0, 'DRY') - bal).toBeLessThan(0)
    expect(wingSectorDelta(withWing(1), 'd_voss', 1, 'DRY') - bal).toBeGreaterThan(0)
    expect(wingSectorDelta(withWing(5), 'd_voss', 2, 'DRY') - bal).toBeLessThan(0)
  })
  it('high wing loses less than low wing in the wet', () => {
    const lap = (w: Wing) => [0, 1, 2].reduce((a, s) => a + wingSectorDelta(withWing(w), 'd_voss', s as 0 | 1 | 2, 'WET'), 0)
      - [0, 1, 2].reduce((a, s) => a + wingSectorDelta(withWing(w), 'd_voss', s as 0 | 1 | 2, 'DRY'), 0)
    expect(lap(5)).toBeLessThan(lap(1))
  })
  it('a lower-winged attacker gets a bigger overtake factor', () => {
    expect(wingOvertakeFactor(withWing(1, 5), 'd_voss', 'd_rossi', 0)).toBeGreaterThan(1)
    expect(wingOvertakeFactor(withWing(5, 1), 'd_voss', 'd_rossi', 0)).toBeLessThan(1)
    expect(wingOvertakeFactor(withWing(5, 1), 'd_voss', 'd_rossi', 0)).toBeGreaterThanOrEqual(0)
  })
  it('expectedBestWing is the brute-force minimum of expectedLapDelta', () => {
    const data = loadGameData()
    for (const c of Object.values(data.circuits)) {
      const rain = c.rainProbability ?? 0
      const levels: Wing[] = [1, 2, 3, 4, 5]
      const brute = levels.reduce((b, w) =>
        expectedLapDelta(c, data.tuning, w, rain) < expectedLapDelta(c, data.tuning, b, rain) ? w : b, 3 as Wing)
      expect(expectedBestWing(c, data.tuning, rain)).toBe(brute)
    }
  })
  it('the quadratic gives at least one circuit an interior best level', () => {
    const data = loadGameData()
    const best = Object.values(data.circuits).map(c => expectedBestWing(c, data.tuning, 0))
    expect(best.some(w => w > 1 && w < 5)).toBe(true)
  })
})

describe('gating', () => {
  it('setups of all-3 race identically to no setups', () => {
    const all3 = { ...base, setups: Object.fromEntries(base.drivers.map(d => [d.id, 3 as Wing])) }
    expect(JSON.stringify(replay(all3, 11, []).state)).toBe(JSON.stringify(replay(base, 11, []).state))
  })
  it('a non-neutral wing changes the race', () => {
    expect(JSON.stringify(replay(withWing(1), 11, []).state)).not.toBe(JSON.stringify(replay(base, 11, []).state))
  })
})
