import { describe, it, expect } from 'vitest'
import { tyreDelta, tyreCliffFraction } from '@engine/tyres'
import type { CompoundSpec } from '@engine/types'

const soft: CompoundSpec = { name: 'Soft', type: 'dry', offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' }
const medium: CompoundSpec = { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' }
const hard: CompoundSpec = { name: 'Hard', type: 'dry', offset: 0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' }

describe('tyreDelta', () => {
  it('fresh soft is faster than fresh medium (negative delta)', () => {
    expect(tyreDelta(soft, 0)).toBeLessThan(tyreDelta(medium, 0))
  })

  it('fresh hard is slower than fresh medium (positive delta)', () => {
    expect(tyreDelta(hard, 0)).toBeGreaterThan(tyreDelta(medium, 0))
  })

  it('increases linearly before cliff', () => {
    const d5 = tyreDelta(soft, 5)
    const d10 = tyreDelta(soft, 10)
    const gap = d10 - d5
    expect(gap).toBeCloseTo(5 * soft.lin, 3)
  })

  it('soft past cliff (age 20) is worse than at age 12', () => {
    expect(tyreDelta(soft, 20)).toBeGreaterThan(tyreDelta(soft, 12))
  })

  it('cliff penalty grows superlinearly after cliff (quadratic component)', () => {
    const atCliff = tyreDelta(soft, soft.cliff)
    const twoLapsOver = tyreDelta(soft, soft.cliff + 2)
    const fourLapsOver = tyreDelta(soft, soft.cliff + 4)
    const gap2 = twoLapsOver - atCliff
    const gap4 = fourLapsOver - atCliff
    // gap4/gap2 > 3 confirms superlinear (quadratic) growth past the cliff
    expect(gap4 / gap2).toBeGreaterThan(3)
  })
})

describe('tyreCliffFraction', () => {
  it('returns 0 for age 0', () => {
    expect(tyreCliffFraction(soft, 0)).toBe(0)
  })

  it('returns 1.0 at cliff lap', () => {
    expect(tyreCliffFraction(soft, soft.cliff)).toBeCloseTo(1.0, 5)
  })

  it('returns > 1 past cliff', () => {
    expect(tyreCliffFraction(soft, soft.cliff + 5)).toBeGreaterThan(1)
  })
})
