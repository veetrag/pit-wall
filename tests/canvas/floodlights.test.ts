import { describe, it, expect } from 'vitest'
import { floodlightPoints } from '@canvas/floodlights'

describe('floodlightPoints', () => {
  it('spaces pools evenly along the lap, deterministic, in [0, 1)', () => {
    const a = floodlightPoints(900, 8)
    expect(a).toHaveLength(8)
    expect(a).toEqual(floodlightPoints(900, 8))
    for (const f of a) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1) }
    expect(a[1]! - a[0]!).toBeCloseTo(1 / 8, 12)
  })
  it('clamps the count to 6-10 by length', () => {
    expect(floodlightPoints(100, 2)).toHaveLength(6)
    expect(floodlightPoints(5000, 40)).toHaveLength(10)
  })
})
