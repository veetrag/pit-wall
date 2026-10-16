import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Championship } from '@ui/Championship'
import { BadgeToast } from '@ui/BadgeToast'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'
import { SHORT_VIEWPORT_QUERY } from '@hooks/useShortViewport'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/*
 * Found on the 1.4 phone pass: on a short phone (360x640 CSS px) the
 * championship footer took ~260px -- bonus pill, NEXT SEASON with its
 * two-line consequence, END CAREER -- leaving the season's verdict and the
 * standings a letterbox to scroll through. And the BADGE EARNED tiles, which
 * never time out on this screen, sat on top of NEXT SEASON and hid its label.
 */
function stubViewport(short: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: short && query === SHORT_VIEWPORT_QUERY,
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('championship screen on a short phone', () => {
  const original = window.matchMedia

  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: true })
    useCareerStore.getState().beginCareer()
    useCareerStore.setState({ justEarned: [] })
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11, standings: [{ driverId: 'd_voss', points: 300 }, { driverId: 'd_rossi', points: 200 }],
      purchasedTiers: {}, rivalDevelopment: {}, devPoints: 0, attemptNonce: 0, lastSeasonBonus: 30, lastLadder: null,
    })
  })
  afterEach(() => { window.matchMedia = original })

  it('KEEPS ONLY THE FORWARD ACTION IN THE FOOTER', () => {
    // END CAREER is rare and destructive: it does not need to be pinned to a
    // short screen. It moves to the end of the scrolling content.
    stubViewport(true)
    render(<Championship />)
    const footer = screen.getByTestId('season-footer')
    expect(footer.contains(screen.getByRole('button', { name: /next season/i }))).toBe(true)
    expect(footer.contains(screen.getByRole('button', { name: /end career/i })),
      'END CAREER must not take footer height on a short phone').toBe(false)
  })

  it('still asks before ending the career from its new place', () => {
    stubViewport(true)
    render(<Championship />)
    fireEvent.click(screen.getByRole('button', { name: /end career/i }))
    expect(useCareerStore.getState().hasCareer).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(useCareerStore.getState().hasCareer).toBe(false)
  })

  it('leaves the tall-phone footer as it was', () => {
    stubViewport(false)
    render(<Championship />)
    const footer = screen.getByTestId('season-footer')
    expect(footer.contains(screen.getByRole('button', { name: /end career/i }))).toBe(true)
  })

  it('ANNOUNCES BADGES ABOVE THE FOOTER, NOT OVER NEXT SEASON', () => {
    stubViewport(true)
    useCareerStore.setState({ justEarned: ['champion'] })
    render(<Championship />)
    const tile = screen.getByText('Champion')
    expect(screen.getByTestId('season-footer').contains(tile)).toBe(false)
    expect(screen.getByTestId('season-content').contains(tile),
      'the toast must be anchored to the content area, which ends where the footer begins').toBe(true)
  })
})

describe('badge tiles', () => {
  beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })

  it('PAD THEIR TEXT CLEAR OF THE SLANT', () => {
    /*
     * slant-md cuts 6% of the tile's width at the top-left and bottom-right
     * corners. A tile can be 86% of a 360px screen, a ~19px cut, and the old
     * 22px padding left the first and last letters almost touching the edge.
     */
    render(<BadgeToast ids={['champion']} />)
    const tile = screen.getByText('Champion').parentElement!
    expect(tile.className).toContain('slant-md')
    const maxCut = 0.06 * 0.86 * 360
    expect(parseFloat(tile.style.paddingLeft)).toBeGreaterThanOrEqual(maxCut + 10)
    expect(parseFloat(tile.style.paddingRight)).toBeGreaterThanOrEqual(maxCut + 10)
  })
})
