import { describe, it, expect, beforeEach } from 'vitest'
import { useCareerStore } from '@state/careerStore'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'

const EMPTY = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], raceLog: [],
  hasCareer: true, justEarned: [],
}

function summary(over: Partial<{ championshipPosition: number; points: number }> = {}) {
  return {
    seasonNumber: 1, teamId: 'apex', driverId: 'd_voss',
    championshipPosition: 1, points: 400, wins: 0, ...over,
  }
}

describe('a title is recorded when the SEASON ENDS, not when the player leaves the screen', () => {
  beforeEach(() => { useCareerStore.setState(EMPTY) })

  it('recordSeasonEnd BANKS THE TITLE AND ANNOUNCES IT', () => {
    /*
     * The whole point of the change. Previously `titles` was incremented
     * inside rollOverSeason, which runs only when the player taps NEXT
     * SEASON -- so on the championship screen, having just won the title,
     * the career record still said 0 titles and no badge could be shown
     * there without inventing one.
     */
    useCareerStore.getState().recordSeasonEnd(summary())
    expect(useCareerStore.getState().titles).toBe(1)
    expect(useCareerStore.getState().justEarned).toContain('champion')
    expect(useCareerStore.getState().seasonHistory).toHaveLength(1)
  })

  it('DOES NOT advance the season number', () => {
    /*
     * seasonNumber feeds seedFor(). Advancing it here instead of at the
     * rollover would shift every seed in the game and break byteIdentity and
     * the Monte-Carlo bands. The season ends; the NEXT season starts later.
     */
    useCareerStore.getState().recordSeasonEnd(summary())
    expect(useCareerStore.getState().seasonNumber).toBe(1)
  })

  it('takes wins from the career’s own season counter', () => {
    useCareerStore.setState({ ...EMPTY, seasonWins: 7 })
    useCareerStore.getState().recordSeasonEnd(summary({ championshipPosition: 2 }))
    expect(useCareerStore.getState().seasonHistory[0]?.wins).toBe(7)
    expect(useCareerStore.getState().seasonWins, 'reset for the new season').toBe(0)
    expect(useCareerStore.getState().titles, 'P2 is not a title').toBe(0)
  })

  it('IS IDEMPOTENT FOR A SEASON ALREADY RECORDED', () => {
    /*
     * nextRace() sets phase 'championship' whenever raceIndex passes the
     * last round. If that path is ever reached twice -- a re-entry, a
     * restored save, a future retry button -- a second call must not award a
     * second title for the same season. Titles are the rarest thing in the
     * game; double-counting one is worse than missing one.
     */
    useCareerStore.getState().recordSeasonEnd(summary())
    useCareerStore.getState().recordSeasonEnd(summary())
    expect(useCareerStore.getState().titles).toBe(1)
    expect(useCareerStore.getState().seasonHistory).toHaveLength(1)
  })

  it('rollOverSeason NO LONGER touches titles or history', () => {
    useCareerStore.getState().recordSeasonEnd(summary())
    const before = useCareerStore.getState()
    const { erodedTiers } = useCareerStore.getState().rollOverSeason({ power: 3, aero: 1 })
    const after = useCareerStore.getState()
    expect(after.titles, 'the title was already banked').toBe(before.titles)
    expect(after.seasonHistory).toHaveLength(1)
    expect(after.seasonNumber, 'THIS is where the season advances').toBe(2)
    expect(erodedTiers.power).toBeLessThan(3)
  })
})

describe('seasonStore records the season end on the transition', () => {
  beforeEach(() => {
    useCareerStore.setState(EMPTY)
    useSeasonStore.setState({
      phase: 'result', raceIndex: TOTAL_RACES - 1, playerDriverId: 'd_voss',
      selectedTeamId: 'apex',
      standings: [{ driverId: 'd_voss', points: 400 }, { driverId: 'd_ros', points: 300 }],
    })
  })

  it('REACHING THE CHAMPIONSHIP SCREEN BANKS THE TITLE', () => {
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
    expect(useCareerStore.getState().titles, 'the title is banked BEFORE the screen renders').toBe(1)
    expect(useCareerStore.getState().justEarned).toContain('champion')
  })

  it('finishing second banks the season but no title', () => {
    useSeasonStore.setState({
      standings: [{ driverId: 'd_ros', points: 400 }, { driverId: 'd_voss', points: 300 }],
    })
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().titles).toBe(0)
    expect(useCareerStore.getState().seasonHistory[0]?.championshipPosition).toBe(2)
    expect(useCareerStore.getState().justEarned).toEqual([])
  })

  it('a mid-season nextRace banks nothing', () => {
    useSeasonStore.setState({ raceIndex: 3 })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('development')
    expect(useCareerStore.getState().seasonHistory).toHaveLength(0)
  })
})
