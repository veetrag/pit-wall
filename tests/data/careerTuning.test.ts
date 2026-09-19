import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('tuning.career', () => {
  it('LOADS AND VALIDATES', () => {
    const { career } = loadGameData().tuning
    expect(career).toBeDefined()
    expect(career.tierDecayPerSeason).toBeGreaterThanOrEqual(0)
    expect(career.seedStride).toBe(100000)
    expect(career.rivalCatchUp.base).toBeGreaterThanOrEqual(0)
    expect(career.rivalCatchUp.championBonus).toBeGreaterThanOrEqual(0)
  })

  it('EROSION CANNOT EXCEED THE TIER LADDER', () => {
    /*
     * A decay larger than the number of tiers would wipe every upgrade every
     * season, which is not "erosion" but "reset" -- and it would do it
     * silently, because the floor at 0 hides it. zod cannot express this.
     */
    const { tierCosts } = loadGameData().upgrades
    const { tierDecayPerSeason } = loadGameData().tuning.career
    expect(tierDecayPerSeason).toBeLessThan(tierCosts.length)
  })
})
