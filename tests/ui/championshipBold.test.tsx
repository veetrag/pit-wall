import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Championship } from '@ui/Championship'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

describe('Championship in Race Day Bold', () => {
  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: true })
    useCareerStore.getState().beginCareer()
    useCareerStore.setState({ seasonNumber: 3, justEarned: [] })
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11,
      standings: [{ driverId: 'd_rossi', points: 320 }, { driverId: 'd_voss', points: 300 }, { driverId: 'd_chen', points: 120 }],
      purchasedTiers: { power: 3, aero: 3, handling: 3, reliability: 3, pace: 3 },
      rivalDevelopment: {}, devPoints: 0, attemptNonce: 0, lastSeasonBonus: 0,
      lastLadder: [
        { teamId: 'apex', deserved: 5, finished: 2, before: 0, after: 1 },
        { teamId: 'meridian', deserved: 1, finished: 1, before: 0, after: 0 },
      ],
    })
  })

  it('names the real season, leads with the verdict band, and keeps the standings in tabs', () => {
    render(<Championship />)
    expect(screen.getByText(/SEASON 3 · FINAL/)).toBeTruthy()
    expect(screen.queryByText(/2025/)).toBeNull()
    expect(screen.getByText('▲ STEP UP')).toBeTruthy()
    expect(screen.getByText('POWER')).toBeTruthy()
    expect(screen.getAllByText('+3').length).toBe(3) // one tier × step 3, per facet
    expect(screen.getByRole('tablist', { name: 'Standings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /next season/i })).toBeTruthy()
  })

  it('explains the verdict in one sentence', () => {
    render(<Championship />)
    expect(screen.getByText(/You finished P2 in the constructors' — 3 places above where the car deserved\./)).toBeTruthy()
  })

  it('shows the player their finish when someone else is champion', () => {
    render(<Championship />)
    expect(screen.getByText('CHAMPION')).toBeTruthy()
    expect(screen.getByText('YOU FINISHED').parentElement?.textContent).toContain('P2')
  })

  it('switches to the teams table with the player team marked', () => {
    render(<Championship />)
    fireEvent.click(screen.getByRole('tab', { name: 'TEAMS' }))
    const mine = screen.getAllByRole('listitem').find(li => li.getAttribute('aria-current') === 'true')
    expect(mine?.textContent).toMatch(/420/)
  })
})
