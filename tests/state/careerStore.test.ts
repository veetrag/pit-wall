import { describe, it, expect, beforeEach } from 'vitest'
import { useCareerStore, erodeTiers, escalateRivals } from '@state/careerStore'
import { loadGameData } from '@data/validators'

const EMPTY = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], hasCareer: false,
}

describe('careerStore', () => {
  beforeEach(() => { useCareerStore.setState(EMPTY) })

  it('RECORDS A RACE INTO THE CAREER TOTALS', () => {
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: false, pole: true })
    s().recordRace({ position: 3, retired: false, pole: false })
    s().recordRace({ position: 8, retired: true, pole: false })
    expect(s().racesStarted).toBe(3)
    expect(s().wins).toBe(1)
    expect(s().podiums, 'a win is also a podium').toBe(2)
    expect(s().poles).toBe(1)
    expect(s().bestFinish).toBe(1)
  })

  it('A RETIREMENT IS NEVER A WIN OR A PODIUM', () => {
    /*
     * recordRaceResult already scores a DNF as 0 points regardless of
     * classified position, and the career must agree. A car classified P3
     * because seventeen others retired behind it did not stand on a podium.
     */
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: true, pole: false })
    expect(s().wins).toBe(0)
    expect(s().podiums).toBe(0)
    expect(s().racesStarted, 'it was still started').toBe(1)
  })

  it('TITLES INCREMENT ONLY ON A CHAMPIONSHIP WIN', () => {
    const s = () => useCareerStore.getState()
    s().rollOverSeason({ seasonNumber: 1, teamId: 'apex', driverId: 'd_voss', championshipPosition: 2, points: 200, wins: 5 }, {})
    expect(s().titles).toBe(0)
    s().rollOverSeason({ seasonNumber: 2, teamId: 'apex', driverId: 'd_voss', championshipPosition: 1, points: 300, wins: 9 }, {})
    expect(s().titles).toBe(1)
    expect(s().seasonNumber, 'two rollovers means season 3').toBe(3)
    expect(s().seasonHistory).toHaveLength(2)
  })

  it('SEASON HISTORY RECORDS THE WINS THAT SEASON, NOT THE CAREER TOTAL', () => {
    /*
     * seasonStore does not count wins, so it passes 0 and careerStore fills it
     * in from its own season-scoped counter. Without the reset at rollover,
     * every season in the history would show the running career total instead
     * of what that season was actually worth.
     */
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: false, pole: false })
    s().recordRace({ position: 1, retired: false, pole: false })
    s().rollOverSeason({ seasonNumber: 1, teamId: 'apex', driverId: 'd_voss', championshipPosition: 1, points: 300, wins: 0 }, {})
    s().recordRace({ position: 1, retired: false, pole: false })
    s().rollOverSeason({ seasonNumber: 2, teamId: 'apex', driverId: 'd_voss', championshipPosition: 1, points: 280, wins: 0 }, {})

    expect(s().seasonHistory[0]!.wins, 'season 1 had two wins').toBe(2)
    expect(s().seasonHistory[1]!.wins, 'season 2 had one, not three').toBe(1)
    expect(s().wins, 'the career total is still three').toBe(3)
  })

  it('EROSION FLOORS AT ZERO AND NEVER GOES NEGATIVE', () => {
    expect(erodeTiers({ power: 3, aero: 1, handling: 0 }, 1))
      .toEqual({ power: 2, aero: 0, handling: 0 })
    expect(erodeTiers({ power: 1 }, 5)).toEqual({ power: 0 })
  })

  it('A MAXED PLAYER CANNOT RE-MAX IN ONE SEASON', () => {
    /*
     * This is the arithmetic the whole feature balances on, asserted in code
     * rather than left in a spec comment. Maxed is 3 tiers on 5 attributes.
     * Losing `tierDecayPerSeason` from each costs more to rebuy than a season
     * earns, so the player must choose what to keep at the top.
     */
    const { tierCosts, attributes, income } = loadGameData().upgrades
    const { tierDecayPerSeason } = loadGameData().tuning.career
    const maxed = Object.fromEntries(attributes.map(a => [a.id, tierCosts.length]))
    const eroded = erodeTiers(maxed, tierDecayPerSeason)

    // Cost to buy back from the eroded level to the top, per attribute.
    let rebuy = 0
    for (const a of attributes) {
      for (let t = eroded[a.id]!; t < tierCosts.length; t++) rebuy += tierCosts[t]!
    }
    const seasonIncome = income.perRace * 12
    expect(rebuy, `rebuy ${rebuy} vs income ${seasonIncome}`).toBeGreaterThan(seasonIncome)
  })

  it('RIVALS DEVELOP MORE OVER THE WINTER AFTER THE PLAYER WINS A TITLE', () => {
    const before = { apex: 100, zenith: 100 }
    const midfield = escalateRivals(before, false)
    const champion = escalateRivals(before, true)
    for (const id of ['apex', 'zenith']) {
      expect(midfield[id]!).toBeGreaterThan(before[id as 'apex']!)
      expect(champion[id]!).toBeGreaterThan(midfield[id]!)
    }
  })

  it('endCareer CLEARS THE RECORD, beginCareer STARTS AT SEASON 1', () => {
    const s = () => useCareerStore.getState()
    s().beginCareer()
    expect(s().hasCareer).toBe(true)
    expect(s().seasonNumber).toBe(1)
    s().recordRace({ position: 1, retired: false, pole: true })
    s().endCareer()
    expect(s().hasCareer).toBe(false)
    expect(s().wins).toBe(0)
    expect(s().seasonHistory).toEqual([])
  })
})
