import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore, seasonEndBonusFor, TOTAL_RACES } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { loadGameData } from '@data/validators'

/*
 * The season-end podium bonus.
 *
 * Race income is flat, so before this existed the champion and the backmarker
 * funded their winter identically -- while escalateRivals gave the champion a
 * bigger rival boost for having won. Winning the title strictly worsened the
 * next season. These tests pin the correction.
 */

function endSeasonWith(standings: { driverId: string; points: number }[]): void {
  useCareerStore.getState().beginCareer()
  useSeasonStore.setState({
    phase: 'result', playerDriverId: 'd_voss', selectedTeamId: 'apex',
    raceIndex: TOTAL_RACES - 1, standings,
    devPoints: 0, purchasedTiers: {}, rivalDevelopment: {}, attemptNonce: 0,
    lastSeasonBonus: 0,
  })
  useSeasonStore.getState().nextRace()
}

const CHAMPION = [{ driverId: 'd_voss', points: 300 }, { driverId: 'd_rask', points: 200 }]

describe('seasonEndBonusFor', () => {
  it('PAYS THE PODIUM AND NOBODY ELSE', () => {
    const [p1, p2, p3] = loadGameData().tuning.career.seasonEndBonus
    expect(seasonEndBonusFor(1)).toBe(p1)
    expect(seasonEndBonusFor(2)).toBe(p2)
    expect(seasonEndBonusFor(3)).toBe(p3)
    expect(seasonEndBonusFor(4)).toBe(0)
    expect(seasonEndBonusFor(20)).toBe(0)
  })

  it('THE CHAMPION IS PAID MORE THAN THE RUNNER-UP', () => {
    // The ordering is the whole point. A flat or inverted table would leave
    // the original defect in place while looking like it had been fixed.
    expect(seasonEndBonusFor(1)).toBeGreaterThan(seasonEndBonusFor(2))
    expect(seasonEndBonusFor(2)).toBeGreaterThan(seasonEndBonusFor(3))
    expect(seasonEndBonusFor(3)).toBeGreaterThan(seasonEndBonusFor(4))
  })
})

describe('the bonus is paid at the season boundary', () => {
  beforeEach(() => { useCareerStore.getState().endCareer() })

  it('A TITLE-WINNING SEASON BANKS THE CHAMPION BONUS', () => {
    endSeasonWith(CHAMPION)
    expect(useSeasonStore.getState().phase).toBe('championship')
    expect(useSeasonStore.getState().devPoints).toBe(seasonEndBonusFor(1))
    expect(useSeasonStore.getState().lastSeasonBonus).toBe(seasonEndBonusFor(1))
  })

  it('A MIDFIELD SEASON BANKS NOTHING', () => {
    endSeasonWith([
      { driverId: 'd_rask', points: 300 }, { driverId: 'd_okabe', points: 250 },
      { driverId: 'd_bruhn', points: 200 }, { driverId: 'd_voss', points: 10 },
    ])
    expect(useSeasonStore.getState().devPoints).toBe(0)
    expect(useSeasonStore.getState().lastSeasonBonus).toBe(0)
  })

  it('RE-ENTERING THE CHAMPIONSHIP PHASE DOES NOT PAY TWICE', () => {
    /*
     * nextRace() sets phase 'championship' whenever raceIndex passes the final
     * round, and careerStore guards the TITLE against a second award. Without
     * reading that guard's answer the bonus would have no such protection --
     * a restored save or a re-entry would mint points out of nothing.
     */
    endSeasonWith(CHAMPION)
    const afterFirst = useSeasonStore.getState().devPoints
    useSeasonStore.setState({ raceIndex: TOTAL_RACES - 1 })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().devPoints, 'the bonus was paid twice').toBe(afterFirst)
    expect(useSeasonStore.getState().lastSeasonBonus).toBe(0)
  })

  it('THE BONUS IS NOT RESET BY STARTING THE NEXT SEASON', () => {
    // It is income, not a season-scoped counter: it must survive into the
    // winter it was paid to fund.
    endSeasonWith(CHAMPION)
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().devPoints).toBe(seasonEndBonusFor(1))
    expect(useSeasonStore.getState().lastSeasonBonus, 'the announcement is spent').toBe(0)
  })
})
