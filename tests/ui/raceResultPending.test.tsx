import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RaceResult } from '@ui/RaceResult'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/*
 * A race now counts when it is kept (tests/state/retryDiscards.test.ts). The
 * result screen sits BETWEEN the flag and that decision, so it must show what
 * keeping the race would mean -- provisional championship points and the
 * badges it would award -- without having recorded any of it.
 */
describe('the result screen before the race is kept', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.setState({
      playerDriverId: 'd_voss', selectedTeamId: 'apex', phase: 'racing',
      raceIndex: 0, standings: [{ driverId: 'd_voss', points: 40 }, { driverId: 'd_rossi', points: 50 }],
    })
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 1 }, { driverId: 'd_rossi', position: 2 }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  })

  it('shows the championship as it will be once the race is kept', () => {
    render(<RaceResult />)
    // 40 + 25 = 65 provisional, while the store still holds 40.
    expect(screen.getAllByText(/^65/).length).toBeGreaterThan(0)
    expect(useSeasonStore.getState().standings.find(s => s.driverId === 'd_voss')?.points).toBe(40)
  })

  it('announces the badges keeping it would award', () => {
    render(<RaceResult />)
    expect(screen.getByText('Winner')).toBeTruthy()
    // ...without having awarded them.
    expect(useCareerStore.getState().wins).toBe(0)
  })
})
