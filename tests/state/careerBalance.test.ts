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
    const { tierDecayFloor } = loadGameData().tuning.career
    let tiers = Object.fromEntries(attributes.map(a => [a.id, tierCosts.length]))

    let everBelowMax = false
    for (let season = 0; season < 10; season++) {
      tiers = erodeTiers(tiers, tierDecayPerSeason, tierDecayFloor)
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

describe('the summit is rented, not owned', () => {
  /*
   * The shape the podium bonus buys, stated as arithmetic.
   *
   * Erosion exists so that a maxed car cannot be held on flat race income --
   * that is the test above. The bonus exists so that it CAN be held by a
   * player who keeps winning the championship. Those two together are the
   * intended endgame: the plateau is re-earned every season rather than
   * reached once and kept. If either half stops holding, the career either
   * flattens into a victory lap or punishes the champion, which are the two
   * failures this economy was tuned to avoid.
   */
  const { attributes, tierCosts, income } = loadGameData().upgrades
  const { tierDecayPerSeason, tierDecayFloor, seasonEndBonus } = loadGameData().tuning.career

  /** What it costs to put a maxed car back on top after one winter. */
  function rebuyFromMaxed(): number {
    const maxed = Object.fromEntries(attributes.map(a => [a.id, tierCosts.length]))
    const eroded = erodeTiers(maxed, tierDecayPerSeason, tierDecayFloor)
    let cost = 0
    for (const a of attributes) {
      for (let t = eroded[a.id]!; t < tierCosts.length; t++) cost += tierCosts[t]!
    }
    return cost
  }

  const raceIncome = income.perRace * 12

  it('THE CHAMPION CAN AFFORD TO STAY AT THE TOP', () => {
    const rebuy = rebuyFromMaxed()
    const championIncome = raceIncome + seasonEndBonus[0]!
    expect(championIncome, `champion earns ${championIncome}, rebuy costs ${rebuy}`)
      .toBeGreaterThanOrEqual(rebuy)
  })

  it('A DRIVER OFF THE PODIUM CANNOT', () => {
    // The same assertion as 'A MAXED PLAYER CANNOT HOLD THE MAXIMUM FOREVER',
    // narrowed to the specific claim that the bonus is what makes the
    // difference -- so a future rise in perRace income cannot quietly hand
    // everyone a permanent maximum while that test goes on passing.
    const rebuy = rebuyFromMaxed()
    expect(raceIncome, `flat income ${raceIncome} must not cover a rebuy of ${rebuy}`)
      .toBeLessThan(rebuy)
  })
})

describe('unspent development points survive a season boundary', () => {
  it('BANK RATHER THAN EXPIRE, ACROSS SEASONS AS WELL AS WITHIN ONE', async () => {
    /*
     * seasonStore states the principle at toRaceSetup: "unspent points bank
     * rather than expire, so it reads as a decision point and not a toll
     * booth." A season boundary is the one place that was not honouring it.
     *
     * It is not cosmetic. Simulated over 10 seasons of optimal buying,
     * discarding them plateaus the player at 11 of 15 tiers from season 3 and
     * then wastes 21 points every season forever -- erosion keeps eating tiers
     * they can never quite afford to replace, so Development stops being a
     * decision. Banking climbs 8 -> 10 -> 12 -> 13 and is still rising at
     * season 10, with erosion still preventing a max-out.
     */
    const { useSeasonStore } = await import('@state/seasonStore')
    const { useCareerStore } = await import('@state/careerStore')
    useCareerStore.getState().beginCareer()
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11, standings: [{ driverId: 'd_voss', points: 300 }],
      devPoints: 21, purchasedTiers: { power: 3 }, rivalDevelopment: {}, attemptNonce: 0,
    })
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().devPoints, 'unspent points must survive the winter').toBe(21)
  })
})
