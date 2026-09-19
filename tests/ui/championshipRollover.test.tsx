import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Championship } from '@ui/Championship'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'

describe('Championship season boundary', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11, standings: [{ driverId: 'd_voss', points: 300 }],
      purchasedTiers: { power: 3, aero: 3, handling: 3, reliability: 3, pace: 3 },
      rivalDevelopment: {}, devPoints: 0, attemptNonce: 0,
    })
  })

  it('STATES WHAT IS CARRIED AND WHAT IS LOST BEFORE THE PLAYER COMMITS', () => {
    /*
     * Erosion must be visible BEFORE it is felt. A player who taps through and
     * later notices their upgrades are lower has been quietly taken from; a
     * player who was told "you keep 10 of 15 tiers" made a decision.
     */
    render(<Championship />)
    const next = screen.getByRole('button', { name: /next season/i })
    expect(next.textContent).toMatch(/\d+\s*of\s*\d+/i)
  })

  it('NEXT SEASON ROLLS OVER RATHER THAN RESETTING', () => {
    render(<Championship />)
    fireEvent.click(screen.getByRole('button', { name: /next season/i }))
    expect(useSeasonStore.getState().playerDriverId, 'the seat is kept').toBe('d_voss')
    expect(useCareerStore.getState().seasonNumber).toBe(2)
    expect(useSeasonStore.getState().phase).toBe('development')
  })

  it('END CAREER IS NOT ONE TAP', () => {
    // Destructive and irreversible: it deletes a career. It must be confirmed.
    render(<Championship />)
    fireEvent.click(screen.getByRole('button', { name: /end career/i }))
    expect(useCareerStore.getState().hasCareer, 'one tap must not destroy it').toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /confirm|yes, end/i }))
    expect(useCareerStore.getState().hasCareer).toBe(false)
    expect(useSeasonStore.getState().phase).toBe('menu')
  })
})

describe('the title is announced on the screen that celebrates it', () => {
  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11, standings: [{ driverId: 'd_voss', points: 300 }],
      purchasedTiers: {}, rivalDevelopment: {}, devPoints: 0, attemptNonce: 0,
    })
  })

  it('SHOWS THE CHAMPION BADGE ON THE CHAMPIONSHIP SCREEN', () => {
    /*
     * This is the entire reason recordSeasonEnd was split out of
     * rollOverSeason. Before that split, `titles` was incremented only when
     * the player tapped NEXT SEASON, so at the moment this screen rendered the
     * career record still held 0 titles and the badge could not be announced
     * here -- it surfaced a screen later, on the upgrades page.
     */
    useCareerStore.setState({ justEarned: ['champion'] })
    render(<Championship />)
    expect(screen.getByText('Champion')).toBeTruthy()
    expect(screen.getByText(/badge earned/i)).toBeTruthy()
  })

  it('shows nothing when no badge was earned', () => {
    useCareerStore.setState({ justEarned: [] })
    render(<Championship />)
    expect(screen.queryByText(/badge earned/i)).toBeNull()
  })
})
