import { describe, it, expect } from 'vitest'
import { createRng, gaussianPair } from '@engine/rng'

describe('createRng (mulberry32)', () => {
  it('returns values in [0, 1)', () => {
    const rng = createRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('same seed produces identical sequence', () => {
    const a = createRng(99)
    const b = createRng(99)
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b())
    }
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const va = Array.from({ length: 10 }, () => a())
    const vb = Array.from({ length: 10 }, () => b())
    expect(va).not.toEqual(vb)
  })
})

describe('gaussianPair', () => {
  it('returns two numbers', () => {
    const rng = createRng(1)
    const [a, b] = gaussianPair(rng)
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('number')
  })

  it('approximate N(0,1) over 2000 samples (mean ≈ 0, std ≈ 1)', () => {
    const rng = createRng(7)
    const samples: number[] = []
    for (let i = 0; i < 1000; i++) {
      const [a, b] = gaussianPair(rng)
      samples.push(a, b)
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length
    expect(Math.abs(mean)).toBeLessThan(0.1)
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.1)
  })
})
