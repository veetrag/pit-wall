import { describe, it, expect } from 'vitest'
import { generateDaily, dateKey } from '@state/daily'

describe('the daily over two years', () => {
  it('730 DAYS, ALL VALID, NONE LAST-RESORT', () => {
    const start = new Date(2026, 10, 1)
    let races = 0
    for (let i = 0; i < 730; i++) {
      const key = dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
      const d = generateDaily(key)
      races += d.racesRun
      expect(d.tier, `${key} reached the last resort`).toBeLessThan(2)
      expect(d.spec.expect.par, key).toBeGreaterThanOrEqual(2)
      expect(d.spec.goal.position, key).toBe(d.spec.expect.par - 1)
      expect(d.spec.expect.lapsRemaining, key).toBeGreaterThanOrEqual(8)
    }
    // eslint-disable-next-line no-console
    console.log(`MEASURE daily mean races per day ${(races / 730).toFixed(2)}`)
  }, 300_000)
})
