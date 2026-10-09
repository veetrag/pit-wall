import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { RaceResult } from '@ui/RaceResult'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/** A pending P2 from grid 14 (seeded as raceResultPending.test.tsx seeds a win). */
function seedP2FromGrid14() {
  useCareerStore.getState().beginCareer()
  useSeasonStore.getState().startNewSeason()
  useSeasonStore.setState({
    playerDriverId: 'd_voss', selectedTeamId: 'apex', phase: 'racing',
    raceIndex: 0, standings: [{ driverId: 'd_voss', points: 40 }, { driverId: 'd_rossi', points: 50 }],
  })
  useSeasonStore.getState().recordRaceResult(
    [{ driverId: 'd_rossi', position: 1 }, { driverId: 'd_voss', position: 2 }],
    { overtakesGained: 3, pitsDone: 1, hadRain: false },
  )
  const pending = useSeasonStore.getState().pendingRace
  if (!pending) throw new Error('expected a pending race')
  useSeasonStore.setState({ pendingRace: { ...pending, grid: 14 } })
}

/** A pending result for the player with the given finish (no grid). */
function seedPlayerFinish(position: number, retired = false) {
  useCareerStore.getState().beginCareer()
  useSeasonStore.getState().startNewSeason()
  useSeasonStore.setState({
    playerDriverId: 'd_voss', selectedTeamId: 'apex', phase: 'racing',
    raceIndex: 0, standings: [{ driverId: 'd_voss', points: 0 }, { driverId: 'd_rossi', points: 0 }],
  })
  useSeasonStore.getState().recordRaceResult(
    [{ driverId: 'd_rossi', position: 1 }, { driverId: 'd_voss', position, retired, retiredCause: retired ? 'mechanical' : null }],
    { overtakesGained: 0, pitsDone: 1, hadRain: false },
  )
}

describe('race result in Race Day Bold (hero 3)', () => {
  beforeEach(() => {
    cleanup()
    useSettingsStore.setState({ reducedMotion: true })
    seedP2FromGrid14()
  })

  it('leads with the position and points, shows places gained, and hides the full classification', () => {
    render(<RaceResult />)
    expect(screen.getByText('P2')).toBeTruthy()
    expect(screen.getByText(/PTS/)).toBeTruthy()
    expect(screen.getByText(/From P14 on the grid ▲12/)).toBeTruthy()
    const toggle = screen.getByRole('button', { name: /FULL RESULTS/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /^menu$/i })).toBeTruthy()
  })

  it('expands the classification inline from the FULL RESULTS toggle', () => {
    render(<RaceResult />)
    const toggle = screen.getByRole('button', { name: /FULL RESULTS/ })
    expect(screen.queryByRole('region', { name: /classification/i })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('region', { name: /classification/i })).toBeTruthy()
  })

  it('shows the championship after this race with its delta, and what was earned', () => {
    render(<RaceResult />)
    // 40 + 18 = 58 vs rossi 50 + 25 = 75: P2 before, P2 after.
    expect(screen.getByText(/CHAMPIONSHIP/)).toBeTruthy()
    expect(screen.getAllByText(/^58/).length).toBeGreaterThan(0)
    expect(screen.getByText(/= Held P2/)).toBeTruthy()
    expect(screen.getByText(/\+10 DP/)).toBeTruthy()
  })

  it('omits the places-gained line when the grid is unknown', () => {
    useSeasonStore.setState({ resultPending: false, pendingRace: null })
    render(<RaceResult />)
    expect(screen.queryByText(/on the grid/)).toBeNull()
  })

  it('says NO POINTS instead of +0 PTS when the finish scores nothing', () => {
    cleanup()
    seedPlayerFinish(11)
    render(<RaceResult />)
    expect(screen.getByText('P11')).toBeTruthy()
    expect(screen.getByText('NO POINTS')).toBeTruthy()
    expect(screen.queryByText(/\+0/)).toBeNull()
  })

  it('a retirement puts DNF on a grape hero band with white text, not volt', () => {
    cleanup()
    seedPlayerFinish(2, true)
    render(<RaceResult />)
    expect(screen.getByText('DNF')).toBeTruthy()
    expect(screen.getByText('NO POINTS')).toBeTruthy()
    const band = document.querySelector('.hero-band') as HTMLElement
    expect(band.style.backgroundColor).toContain('--grape')
    expect(band.style.backgroundColor).not.toContain('--volt')
    const hero = screen.getByText('DNF').closest('[data-hero-text]') as HTMLElement
    expect(hero.style.color).toContain('--white')
  })
})
