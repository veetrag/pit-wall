import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { SafetyCarBanner } from '@ui/SafetyCarBanner'
import type { IncidentEvent, RaceState, SafetyCarState } from '@engine/types'

const warning = vi.fn()
vi.mock('@hooks/useHaptics', async (orig) => ({
  ...(await orig<typeof import('@hooks/useHaptics')>()),
  useHaptics: () => ({ impact: vi.fn(), success: vi.fn(), warning }),
}))

function deployed(): IncidentEvent {
  return { lap: 3, sector: 0, kind: 'safety_car_deployed', driverId: null, timeLoss: null }
}

function setRaceState(safetyCar: SafetyCarState | null, incidents: IncidentEvent[]) {
  act(() => {
    useRaceStore.setState({ raceState: { safetyCar, incidents } as unknown as RaceState })
  })
}

describe('SafetyCarBanner', () => {
  beforeEach(() => {
    warning.mockClear()
    useRaceStore.setState({ raceState: null })
    useSettingsStore.setState({ reducedMotion: false, hapticsEnabled: true })
  })

  it('renders nothing when no safety car is out', () => {
    const { container } = render(<SafetyCarBanner />)
    expect(container.textContent).toBe('')
    setRaceState(null, [])
    expect(container.textContent).toBe('')
  })

  it('carries the literal words SAFETY CAR -- colour is never the only signal', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 4, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/SAFETY CAR/)).toBeTruthy()
  })

  it('counts down the laps remaining', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 4, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/4 LAPS/)).toBeTruthy()
    setRaceState({ deployedLap: 12, lapsRemaining: 1, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/1 LAP\b/), 'singular at one lap').toBeTruthy()
  })

  it('exposes a live screen-reader announcement naming the state and the countdown', () => {
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 3, cause: 'crash' }, [deployed()])
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('assertive')
    expect(live.textContent).toMatch(/safety car/i)
    expect(live.textContent).toMatch(/3/)
  })

  it('fires exactly one haptic per deployment, and fires again on a second one', () => {
    /*
     * FAILS IF the one-shot guard is dropped and the haptic simply fires while
     * `safetyCar` is truthy -- which re-buzzes on every sim tick for the whole
     * period, roughly 15 times per deployment. Verified by mutation: removing
     * the `buzzedForRef` guard turns the first assertion into 4 calls, not 1.
     *
     * NOTE, because the obvious reading is wrong: swapping the effect's dep
     * array from [deployCount] to [safetyCar] does NOT fail this test, and an
     * earlier draft of it claimed otherwise. The ref guard is idempotent, so it
     * survives the extra invocations either way. The dep array is still the
     * honest expression of what the effect keys on, but this test does not
     * police it -- the guard is what it proves.
     */
    render(<SafetyCarBanner />)
    const sc: SafetyCarState = { deployedLap: 12, lapsRemaining: 4, cause: 'crash' }
    setRaceState(sc, [deployed()])
    expect(warning).toHaveBeenCalledTimes(1)

    // Three more ticks of the SAME deployment: countdown moves, no new buzz.
    setRaceState({ ...sc, lapsRemaining: 3 }, [deployed()])
    setRaceState({ ...sc, lapsRemaining: 2 }, [deployed()])
    setRaceState({ ...sc, lapsRemaining: 1 }, [deployed()])
    expect(warning, 'one buzz per deployment, not per tick').toHaveBeenCalledTimes(1)

    // Green flag, then a second safety car later in the race.
    setRaceState(null, [deployed()])
    expect(warning).toHaveBeenCalledTimes(1)
    setRaceState({ deployedLap: 40, lapsRemaining: 5, cause: 'mechanical' }, [deployed(), deployed()])
    expect(warning, 'a second deployment is a second buzz').toHaveBeenCalledTimes(2)
  })

  it('still shows the words and the countdown under reduced motion', () => {
    // The pulse goes; the information must not.
    useSettingsStore.setState({ reducedMotion: true })
    render(<SafetyCarBanner />)
    setRaceState({ deployedLap: 12, lapsRemaining: 2, cause: 'crash' }, [deployed()])
    expect(screen.getByText(/SAFETY CAR/)).toBeTruthy()
    expect(screen.getByText(/2 LAPS/)).toBeTruthy()
  })
})
