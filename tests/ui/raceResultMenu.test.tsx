import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RaceResult } from '@ui/RaceResult'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { snapshotFrom } from '@state/seasonPersistence'

describe('RaceResult MENU', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.setState({
      phase: 'result', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 3, standings: [{ driverId: 'd_voss', points: 75 }],
      devPoints: 30, purchasedTiers: { power: 2 }, rivalDevelopment: { apex: 5 },
      lastRaceResults: [{ driverId: 'd_voss', position: 2, points: 18, retired: false, retiredCause: null }],
      lastRaceEvents: null, attemptNonce: 0,
    })
  })

  it('NAVIGATES WITHOUT DESTROYING THE SEASON OR THE CAREER', () => {
    /*
     * This button called playAgain() before the career landed. playAgain nulled
     * playerDriverId, and startSeasonAutosave clears the save whenever that is
     * null -- so tapping MENU after a race silently destroyed the season the
     * player had just been racing. Career would have made it take every season
     * with it.
     *
     * The save is what was actually being lost, so assert the CLEAR CONDITION
     * is not met rather than that a snapshot exists. startSeasonAutosave only
     * removes the stored save when snapshotFrom returns null AND
     * playerDriverId is null. snapshotFrom legitimately returns null at phase
     * 'menu' -- that is the "this is a detour, do not overwrite the save"
     * signal that grid/settings/how-to-play already rely on. It is
     * playerDriverId surviving that keeps the save on disk.
     */
    render(<RaceResult />)
    fireEvent.click(screen.getByRole('button', { name: /^menu$/i }))

    const s = useSeasonStore.getState()
    expect(s.phase).toBe('menu')
    expect(s.playerDriverId, 'the season must survive').toBe('d_voss')
    expect(s.standings).toHaveLength(1)
    expect(s.purchasedTiers.power).toBe(2)
    expect(useCareerStore.getState().hasCareer, 'the career must survive').toBe(true)
    // The menu phase is a detour, so no new snapshot is written...
    expect(snapshotFrom(s), 'menu must not overwrite the save').toBeNull()
    // ...and because playerDriverId survives, the autosave does not CLEAR the
    // existing one either. Both halves matter: this is the exact pair of
    // conditions that decides whether the player can still hit Continue.
    expect(s.playerDriverId).not.toBeNull()
  })
})
