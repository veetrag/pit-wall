import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { RaceResult } from '@ui/RaceResult'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import driversData from '@data/drivers.json'

// Regression guard for a dead-end found by reading the phase graph: nextRace()
// is the ONLY thing that sets phase 'championship', and its only caller — the
// primary button on the race-result screen — used to be `disabled` precisely
// when isSeasonEnd. So finishing all 8 races could never reach the champion
// reveal; the Championship screen was unreachable in normal play.

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const drivers = driversData.drivers as { id: string; teamId: string }[]

function seedFinishedFinalRace() {
  useSeasonStore.setState({
    phase: 'result',
    raceIndex: TOTAL_RACES - 1, // the last round has just been scored
    playerDriverId: 'd_voss',
    standings: drivers.map((d, i) => ({ driverId: d.id, points: 200 - i * 9 })),
    lastRaceResults: drivers.map((d, i) => ({
      driverId: d.id, teamId: d.teamId, position: i + 1, retired: false,
      points: Math.max(0, 25 - i * 3),
    })),
    lastRaceEvents: { overtakes: 2, pitStops: 1, positionsGained: 1 },
  } as never)
}

describe('race result — end of season', () => {
  beforeEach(() => { cleanup() })

  it('offers an enabled button through to the standings on the final round', () => {
    seedFinishedFinalRace()
    render(<RaceResult />)

    const button = screen.getByText(/FINAL STANDINGS/i).closest('button')!
    expect(button).toBeTruthy()
    // The bug was specifically that this button was disabled here.
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('reaches the championship screen when that button is pressed', () => {
    seedFinishedFinalRace()
    render(<RaceResult />)

    expect(useSeasonStore.getState().phase).toBe('result')
    const button = screen.getByText(/FINAL STANDINGS/i).closest('button')!
    act(() => { button.click() })

    expect(useSeasonStore.getState().phase).toBe('championship')
  })

  it('still advances to the next race mid-season', () => {
    seedFinishedFinalRace()
    // Roll back to a mid-season round: the same button must behave differently.
    useSeasonStore.setState({ raceIndex: 0 } as never)
    render(<RaceResult />)

    const button = screen.getByText(/NEXT RACE/i).closest('button')!
    act(() => { button.click() })

    const s = useSeasonStore.getState()
    // NEXT RACE now lands on the development screen (the between-races spend
    // step), which is where RaceSetup is reached from. Still not 'championship',
    // which is the dead-end this test guards.
    expect(s.phase).toBe('development')
    expect(s.raceIndex).toBe(1)
  })
})

describe('season boundary — twelve rounds', () => {
  beforeEach(() => { cleanup() })

  // Regression guard for the round count moving 9 -> 12: nextRace() must
  // still offer a round 11 -> 12 transition (not end the season early) and
  // must transition to 'championship' at exactly round 12, not before.
  //
  // Deliberately literal (11, 12), not derived from TOTAL_RACES: a test that
  // rederives its own expectation from the constant under test is vacuous —
  // it would pass unchanged if TOTAL_RACES were 11 or 13. Pinning to the
  // actual twelve-round spec is the point.
  it('still offers round 12 after round 11, and ends the season only after round 12', () => {
    useSeasonStore.setState({
      phase: 'result', raceIndex: 0, standings: [], playerDriverId: 'd_ver',
      lastRaceResults: null, lastRaceEvents: null,
    } as never)

    for (let call = 0; call < 11; call++) {
      useSeasonStore.getState().nextRace()
    }

    // 11 calls from raceIndex 0 land on raceIndex 11 (round 12, the final
    // round) — the season must NOT have ended yet.
    const midway = useSeasonStore.getState()
    expect(midway.phase).toBe('development')
    expect(midway.raceIndex).toBe(11)

    // The 12th call, from the final round, must end the season.
    useSeasonStore.setState({ phase: 'result' } as never)
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
  })
})
