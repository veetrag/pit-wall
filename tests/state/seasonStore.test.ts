import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'

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

  it('startNewSeason transitions to driver_select', () => {
    useSeasonStore.getState().startNewSeason()
    expect(useSeasonStore.getState().phase).toBe('driver_select')
  })

  it('selectDriver sets playerDriverId', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectDriver('d_ham')
    expect(useSeasonStore.getState().playerDriverId).toBe('d_ham')
  })

  it('confirmDriver transitions to racing', () => {
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.getState().selectDriver('d_ham')
    useSeasonStore.getState().confirmDriver()
    expect(useSeasonStore.getState().phase).toBe('race_setup')
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
    useSeasonStore.getState().recordRaceResult(positions)
    const s = useSeasonStore.getState()
    expect(s.phase).toBe('result')
    const verStanding = s.standings.find(st => st.driverId === 'd_ver')
    expect(verStanding?.points).toBe(25)
  })

  it('nextRace at raceIndex 4 transitions to championship', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 4, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
  })

  it('nextRace before last race increments raceIndex and goes to racing', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 2, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().raceIndex).toBe(3)
    expect(useSeasonStore.getState().phase).toBe('racing')
  })

  it('playAgain resets to menu', () => {
    useSeasonStore.setState({ phase: 'championship', raceIndex: 4, standings: [{ driverId: 'd_ver', points: 100 }], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().playAgain()
    expect(useSeasonStore.getState().phase).toBe('menu')
    expect(useSeasonStore.getState().standings).toHaveLength(0)
  })
})
