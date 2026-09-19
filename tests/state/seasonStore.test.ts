import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'

describe('seasonStore', () => {
  beforeEach(() => {
    useSeasonStore.setState({
      phase: 'menu', playerDriverId: null, raceIndex: 0,
      standings: [], lastRaceResults: null,
    })
  })

  it('starts at menu phase', () => {
    expect(useSeasonStore.getState().phase).toBe('menu')
  })

  it('startNewSeason transitions to team_select', () => {
    useSeasonStore.getState().startNewSeason()
    expect(useSeasonStore.getState().phase).toBe('team_select')
  })

  it('selectDriver sets playerDriverId', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectTeam('apex')
    useSeasonStore.getState().confirmTeam()
    useSeasonStore.getState().selectDriver('d_voss')
    expect(useSeasonStore.getState().playerDriverId).toBe('d_voss')
  })

  it('confirmDriver transitions to development (the pre-race spend screen)', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectTeam('apex')
    useSeasonStore.getState().confirmTeam()
    useSeasonStore.getState().selectDriver('d_voss')
    useSeasonStore.getState().confirmDriver()
    expect(useSeasonStore.getState().phase).toBe('development')
  })

  it('confirmRaceSetup transitions to qualifying', () => {
    // Task 5: race_setup now confirms into 'qualifying', not straight to
    // 'racing' -- the player qualifies before the grid is set. See
    // tests/state/qualifyingFlow.test.ts for the full qualifying -> racing flow.
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectTeam('apex')
    useSeasonStore.getState().confirmTeam()
    useSeasonStore.getState().selectDriver('d_voss')
    useSeasonStore.getState().confirmDriver()
    useSeasonStore.getState().confirmRaceSetup()
    expect(useSeasonStore.getState().phase).toBe('qualifying')
  })

  it('currentSeed returns raceIndex * 1000 + 42', () => {
    useSeasonStore.setState({ raceIndex: 2 })
    expect(useSeasonStore.getState().currentSeed()).toBe(2042)
  })

  it('recordRaceResult accumulates points and transitions to result', () => {
    useSeasonStore.setState({ phase: 'racing', playerDriverId: 'd_ver', raceIndex: 0, standings: [], lastRaceResults: null })
    const positions = [
      { driverId: 'd_ver', position: 1 },
      { driverId: 'd_ham', position: 2 },
      { driverId: 'd_lec', position: 3 },
    ]
    useSeasonStore.getState().recordRaceResult(positions, { overtakesGained: 0, pitsDone: 1, hadRain: false })
    const s = useSeasonStore.getState()
    expect(s.phase).toBe('result')
    const verStanding = s.standings.find(st => st.driverId === 'd_ver')
    expect(verStanding?.points).toBe(25)
  })

  it('nextRace at last raceIndex transitions to championship', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: TOTAL_RACES - 1, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
  })

  it('nextRace before last race increments raceIndex and goes to development', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 2, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().raceIndex).toBe(3)
    expect(useSeasonStore.getState().phase).toBe('development')
  })

  it('endCareer resets to menu', () => {
    useSeasonStore.setState({ phase: 'championship', raceIndex: 7, standings: [{ driverId: 'd_ver', points: 100 }], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().endCareer()
    expect(useSeasonStore.getState().phase).toBe('menu')
    expect(useSeasonStore.getState().standings).toHaveLength(0)
  })
})
