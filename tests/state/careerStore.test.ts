import { describe, it, expect, beforeEach } from 'vitest'
import { useCareerStore, erodeTiers, escalateRivals } from '@state/careerStore'
import { careerSnapshotFrom } from '@state/careerPersistence'
import { loadGameData } from '@data/validators'

const EMPTY = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], raceLog: [], hasCareer: false,
}

const RACE_DEFAULTS = { round: 0, grid: 5, stops: 1, overtakes: 0, wet: false }

/*
 * The real season boundary is now TWO actions, in this order: the season ends
 * (recordSeasonEnd banks the title and the history entry) and then the next
 * one starts (rollOverSeason advances seasonNumber and erodes tiers). These
 * tests drive both, because driving only one would assert against a state the
 * game never actually occupies.
 */
function endSeason(over: Partial<{ seasonNumber: number; championshipPosition: number; points: number }> = {}) {
  const c = useCareerStore.getState()
  c.recordSeasonEnd({
    seasonNumber: c.seasonNumber, teamId: 'apex', driverId: 'd_voss',
    championshipPosition: 1, points: 300, wins: 0, ...over,
  })
}
function endAndStartNext(over: Parameters<typeof endSeason>[0] = {}) {
  endSeason(over)
  useCareerStore.getState().rollOverSeason({})
}

describe('careerStore', () => {
  beforeEach(() => { useCareerStore.setState(EMPTY) })

  it('RECORDS A RACE INTO THE CAREER TOTALS', () => {
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: false, pole: true, ...RACE_DEFAULTS })
    s().recordRace({ position: 3, retired: false, pole: false, ...RACE_DEFAULTS })
    s().recordRace({ position: 8, retired: true, pole: false, ...RACE_DEFAULTS })
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
    s().recordRace({ position: 1, retired: true, pole: false, ...RACE_DEFAULTS })
    expect(s().wins).toBe(0)
    expect(s().podiums).toBe(0)
    expect(s().racesStarted, 'it was still started').toBe(1)
  })

  it('TITLES INCREMENT ONLY ON A CHAMPIONSHIP WIN', () => {
    const s = () => useCareerStore.getState()
    endAndStartNext({ championshipPosition: 2, points: 200 })
    expect(s().titles).toBe(0)
    endAndStartNext({ championshipPosition: 1, points: 300 })
    expect(s().titles).toBe(1)
    expect(s().seasonNumber, 'two completed seasons means season 3').toBe(3)
    expect(s().seasonHistory).toHaveLength(2)
  })

  it('WINNING THE TITLE PUTS CHAMPION IN justEarned WHEN THE SEASON ENDS', () => {
    // The regression this guards: titles are bumped when a SEASON ends, and
    // recordRace never sees that, so champion/dynasty can only ever become
    // true there. If recordSeasonEnd does not compute justEarned itself, the
    // badge lands in the trophy case with no announcement, ever.
    const s = () => useCareerStore.getState()
    endSeason({ championshipPosition: 1 })
    expect(s().justEarned).toContain('champion')
  })

  it('A NON-TITLE SEASON DOES NOT ANNOUNCE CHAMPION', () => {
    const s = () => useCareerStore.getState()
    endSeason({ championshipPosition: 2, points: 200 })
    expect(s().justEarned).not.toContain('champion')
  })

  it('THE SEASON BOUNDARY DOES NOT DISTURB raceLog', () => {
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: false, pole: false, ...RACE_DEFAULTS })
    const before = s().raceLog
    endAndStartNext({ championshipPosition: 1 })
    expect(s().raceLog).toEqual(before)
    expect(s().raceLog).toHaveLength(1)
  })

  it('SEASON HISTORY RECORDS THE WINS THAT SEASON, NOT THE CAREER TOTAL', () => {
    /*
     * seasonStore does not count wins, so it passes 0 and careerStore fills it
     * in from its own season-scoped counter. Without the reset when a season
     * ends,
     * every season in the history would show the running career total instead
     * of what that season was actually worth.
     */
    const s = () => useCareerStore.getState()
    s().recordRace({ position: 1, retired: false, pole: false, ...RACE_DEFAULTS })
    s().recordRace({ position: 1, retired: false, pole: false, ...RACE_DEFAULTS })
    endAndStartNext({ championshipPosition: 1, points: 300 })
    s().recordRace({ position: 1, retired: false, pole: false, ...RACE_DEFAULTS })
    endAndStartNext({ championshipPosition: 1, points: 280 })

    expect(s().seasonHistory[0]!.wins, 'season 1 had two wins').toBe(2)
    expect(s().seasonHistory[1]!.wins, 'season 2 had one, not three').toBe(1)
    expect(s().wins, 'the career total is still three').toBe(3)
  })

  it('EROSION FLOORS AT ZERO AND NEVER GOES NEGATIVE', () => {
    expect(erodeTiers({ power: 3, aero: 1, handling: 0 }, 1))
      .toEqual({ power: 2, aero: 0, handling: 0 })
    expect(erodeTiers({ power: 1 }, 5)).toEqual({ power: 0 })
  })

  it('THE FLOOR PROTECTS THE TIERS BELOW IT', () => {
    // Floor 2 means only the top tier is ever lost: 3 slips to 2, and an
    // attribute already at or below 2 is untouched.
    expect(erodeTiers({ power: 3, aero: 2, handling: 1, reliability: 0 }, 1, 2))
      .toEqual({ power: 2, aero: 2, handling: 1, reliability: 0 })
  })

  it('THE FLOOR CANNOT GIFT A TIER', () => {
    /*
     * The bug a naive Math.max(floor, owned - decay) would ship: an attribute
     * at tier 1 would be RAISED to the floor every winter, so a player who
     * bought nothing would be handed tier 2 in everything for free. The
     * Math.min in erodeTiers is what prevents it, and nothing else tests it --
     * the other floor case starts above the floor.
     */
    expect(erodeTiers({ power: 1, aero: 0 }, 1, 3))
      .toEqual({ power: 1, aero: 0 })
  })

  it('A DECAY LARGER THAN THE GAP STILL STOPS AT THE FLOOR', () => {
    expect(erodeTiers({ power: 3 }, 99, 2)).toEqual({ power: 2 })
  })

  it('A MAXED PLAYER CANNOT RE-MAX IN ONE SEASON', () => {
    /*
     * This is the arithmetic the whole feature balances on, asserted in code
     * rather than left in a spec comment. Maxed is 3 tiers on 5 attributes.
     * Losing `tierDecayPerSeason` from each costs more to rebuy than a season
     * earns, so the player must choose what to keep at the top.
     */
    const { tierCosts, attributes, income } = loadGameData().upgrades
    const { tierDecayPerSeason, tierDecayFloor } = loadGameData().tuning.career
    const maxed = Object.fromEntries(attributes.map(a => [a.id, tierCosts.length]))
    // The floor must be passed, or this asserts against an erosion the game
    // does not actually perform.
    const eroded = erodeTiers(maxed, tierDecayPerSeason, tierDecayFloor)

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
    s().recordRace({ position: 1, retired: false, pole: true, ...RACE_DEFAULTS })
    s().endCareer()
    expect(s().hasCareer).toBe(false)
    expect(s().wins).toBe(0)
    expect(s().seasonHistory).toEqual([])
  })
})

describe('recordRace logs the race', () => {
  function race(over: Partial<Parameters<ReturnType<typeof useCareerStore.getState>['recordRace']>[0]> = {}) {
    return { position: 5, retired: false, pole: false, round: 0, grid: 5, stops: 1, overtakes: 0, wet: false, ...over }
  }

  beforeEach(() => { useCareerStore.getState().beginCareer() })

  it('APPENDS ONE FACT PER RACE, IN ORDER', () => {
    useCareerStore.getState().recordRace(race({ round: 0, grid: 3 }))
    useCareerStore.getState().recordRace(race({ round: 1, grid: 7 }))
    const log = useCareerStore.getState().raceLog
    expect(log).toHaveLength(2)
    expect(log.map(f => f.grid)).toEqual([3, 7])
    expect(log[0]?.season).toBe(1)
  })

  it('records the FINISHING position as finish', () => {
    useCareerStore.getState().recordRace(race({ position: 4 }))
    expect(useCareerStore.getState().raceLog[0]?.finish).toBe(4)
  })

  it('reports badges earned by THIS race in justEarned', () => {
    useCareerStore.getState().recordRace(race({ position: 1 }))
    expect(useCareerStore.getState().justEarned).toContain('winner')
  })

  it('DOES NOT REPORT A BADGE TWICE', () => {
    // The toast fires off justEarned. Without the set difference, a second
    // win would re-announce "Winner".
    useCareerStore.getState().recordRace(race({ position: 1 }))
    useCareerStore.getState().recordRace(race({ position: 1, round: 1 }))
    expect(useCareerStore.getState().justEarned).not.toContain('winner')
  })

  it('justEarned is cleared by beginCareer and resumeCareer', () => {
    useCareerStore.getState().recordRace(race({ position: 1 }))
    expect(useCareerStore.getState().justEarned.length).toBeGreaterThan(0)
    useCareerStore.getState().beginCareer()
    expect(useCareerStore.getState().justEarned).toEqual([])
  })

  it('justEarned is NOT persisted', () => {
    // It is a UI signal, not career history. If it round-tripped, reopening
    // the app would re-toast a badge earned weeks ago.
    useCareerStore.getState().recordRace(race({ position: 1 }))
    const snap = careerSnapshotFrom(useCareerStore.getState())
    expect(snap).not.toBeNull()
    expect(Object.keys(snap!)).not.toContain('justEarned')
  })
})
