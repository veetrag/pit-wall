import { describe, it, expect } from 'vitest'
import { erodeTiers, escalateRivals } from '@state/careerStore'
import { loadGameData } from '@data/validators'

describe('an endless career does not flatten out', () => {
  it('A MAXED PLAYER CANNOT HOLD THE MAXIMUM FOREVER', () => {
    /*
     * The purpose of erosion. If a player who buys optimally every season can
     * sit at full tiers indefinitely, then "stats carry over" has turned the
     * back half of an endless career into a victory lap, and the Development
     * screen stops being a decision.
     */
    const { attributes, tierCosts, income } = loadGameData().upgrades
    const { tierDecayPerSeason } = loadGameData().tuning.career
    const maxTotal = attributes.length * tierCosts.length
    let tiers = Object.fromEntries(attributes.map(a => [a.id, tierCosts.length]))

    let everBelowMax = false
    for (let season = 0; season < 10; season++) {
      tiers = erodeTiers(tiers, tierDecayPerSeason)
      let budget = income.perRace * 12
      for (;;) {
        const pick = attributes
          .map(a => ({ id: a.id, owned: tiers[a.id] ?? 0 }))
          .filter(x => x.owned < tierCosts.length)
          .map(x => ({ ...x, cost: tierCosts[x.owned]! }))
          .filter(x => x.cost <= budget)
          .sort((a, b) => a.cost - b.cost)[0]
        if (!pick) break
        budget -= pick.cost
        tiers[pick.id] = pick.owned + 1
      }
      if (Object.values(tiers).reduce((a, b) => a + b, 0) < maxTotal) everBelowMax = true
    }
    expect(everBelowMax, 'erosion never bites -- the career flattens').toBe(true)
  })

  it('RIVAL DEVELOPMENT COMPOUNDS ACROSS SEASONS', () => {
    // playAgain discarded rivalDevelopment entirely. If this ever returns to
    // zero between seasons, "rivals get stronger every season" is gone.
    let rivals: Record<string, number> = {}
    const totals: number[] = []
    for (let s = 0; s < 5; s++) {
      rivals = escalateRivals(rivals, true)
      totals.push(Object.values(rivals).reduce((a, b) => a + b, 0))
    }
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!)
    }
  })
})
