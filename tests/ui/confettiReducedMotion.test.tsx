import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { RaceResult } from '@ui/RaceResult'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import driversData from '@data/drivers.json'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const drivers = driversData.drivers as { id: string; teamId: string }[]

/** A podium finish, which is the condition the confetti renders under. */
function seedPodium() {
  useSeasonStore.setState({
    phase: 'result',
    raceIndex: TOTAL_RACES - 2,
    playerDriverId: 'd_voss',
    standings: drivers.map((d, i) => ({ driverId: d.id, points: 200 - i * 9 })),
    lastRaceResults: [
      { driverId: 'd_voss', teamId: 'apex', position: 1, retired: false, points: 25 },
      ...drivers.filter(d => d.id !== 'd_voss').map((d, i) => ({
        driverId: d.id, teamId: d.teamId, position: i + 2, retired: false, points: Math.max(0, 18 - i * 3),
      })),
    ],
    lastRaceEvents: { overtakes: 2, pitStops: 1, positionsGained: 1 },
  } as never)
}

/** The confetti is 24 absolutely-positioned 7px squares; nothing else matches. */
function confettiCount(container: HTMLElement): number {
  return [...container.querySelectorAll<HTMLElement>('div')]
    .filter(el => el.style.width === '7px' && el.style.height === '7px').length
}

beforeEach(() => {
  cleanup()
  useSettingsStore.setState({ reducedMotion: false })
})

describe('the podium confetti and reduced motion', () => {
  it('falls on a podium by default', () => {
    seedPodium()
    const { container } = render(<RaceResult />)
    expect(confettiCount(container), 'the control -- without this the test below is vacuous').toBeGreaterThan(0)
  })

  it('IS SUPPRESSED BY THE IN-APP TOGGLE', () => {
    /*
     * This did not work. Confetti read
     * window.matchMedia('(prefers-reduced-motion: reduce)') directly, so the
     * Settings toggle had no effect on it -- two dozen simultaneously
     * animating elements, the heaviest motion moment in the game, ignoring the
     * one control a player would reach for to stop it.
     *
     * The store now carries the OS preference as its default, so reading the
     * store is a superset of the old behaviour rather than a replacement.
     */
    useSettingsStore.setState({ reducedMotion: true })
    seedPodium()
    const { container } = render(<RaceResult />)
    expect(confettiCount(container)).toBe(0)
  })
})
