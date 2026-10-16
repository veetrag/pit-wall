import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { StartLights } from '@ui/StartLights'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

beforeEach(() => {
  useClockStore.setState({ speed: 0 })
  useRaceStore.setState({ phase: 'starting' })
  // The skip-start path runs lights-out synchronously on mount, which is what
  // makes this testable without fake timers. (It used to be reduced motion;
  // reduced motion now runs the full sequence -- the timed path is covered
  // with the sim speed in tests/ui/startLightsSequence.test.tsx.)
  useSettingsStore.setState({ skipStartSequence: true, simSpeed: 1 })
})

describe('the sim speed setting', () => {
  it('IS ACTUALLY APPLIED WHEN THE RACE STARTS', () => {
    /*
     * "Sim speed -- Default playback speed" was a setting that did nothing.
     *
     * It persisted across restarts and rendered its own control correctly, but
     * `simSpeed` was read by exactly one file -- SettingsPanel, to draw itself.
     * Both lights-out paths in StartLights hardcoded setSpeed(1), so every race
     * began at 1x no matter what the player had chosen.
     *
     * Found on device by setting 4x, confirming it survived a force-stop, and
     * then watching the race start at 1x anyway. Nothing in the suite covered
     * the link between the setting and the clock.
     */
    useSettingsStore.setState({ simSpeed: 4 })
    act(() => { render(<StartLights />) })
    expect(useClockStore.getState().speed,
      'the race must start at the speed the player chose').toBe(4)
  })

  it('still starts at 1x when that is what is chosen', () => {
    useSettingsStore.setState({ simSpeed: 1 })
    act(() => { render(<StartLights />) })
    expect(useClockStore.getState().speed).toBe(1)
  })

  it('honours 2x too, so this is not a 4x special case', () => {
    useSettingsStore.setState({ simSpeed: 2 })
    act(() => { render(<StartLights />) })
    expect(useClockStore.getState().speed).toBe(2)
  })
})
