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
    expect(career.tierDecayFloor).toBeGreaterThanOrEqual(0)
    expect(career.seasonEndBonus).toHaveLength(3)
  })

  it('THE DECAY FLOOR LEAVES SOMETHING TO ERODE', () => {
    /*
     * A floor at or above the top tier means erosion can never bite: every
     * attribute sits at or below the floor and the winter does nothing. The
     * career flattens into a victory lap, silently, with every test that
     * exercises erodeTiers directly still passing. zod cannot express a bound
     * that depends on another data file.
     */
    const { tierCosts } = loadGameData().upgrades
    const { tierDecayFloor } = loadGameData().tuning.career
    expect(tierDecayFloor).toBeLessThan(tierCosts.length)
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
