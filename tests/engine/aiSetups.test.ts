import { describe, it, expect } from 'vitest'
import { aiSetups, expectedBestWing } from '@engine/setup'
import { buildRaceConfig } from '@state/buildRaceConfig'

describe('aiSetups', () => {
  const cfg = (seed: number) => buildRaceConfig(seed, 'd_voss', 'kaido', 'rookie', null, null)
  it('is deterministic per seed and skips the player', () => {
    expect(aiSetups(cfg(5))).toEqual(aiSetups(cfg(5)))
    expect(aiSetups(cfg(5))['d_voss']).toBeUndefined()
    expect(Object.keys(aiSetups(cfg(5)))).toHaveLength(cfg(5).drivers.length - 1)
  })
  it('is off the expected best by exactly one level about aiNoise of the time, never more', () => {
    let off = 0, n = 0
    for (let seed = 1; seed <= 400; seed++) {
      const c = cfg(seed)
      const best = expectedBestWing(c.circuit, c.tuning, c.circuit.rainProbability ?? 0)
      for (const w of Object.values(aiSetups(c))) {
        expect(Math.abs(w - best)).toBeLessThanOrEqual(1)
        if (w !== best) off++
        n++
      }
    }
    // Clamping at 1/5 can only lower the rate.
    expect(off / n).toBeGreaterThan(cfg(1).tuning.setup.aiNoise * 0.5)
    expect(off / n).toBeLessThan(cfg(1).tuning.setup.aiNoise + 0.05)
  })
})
