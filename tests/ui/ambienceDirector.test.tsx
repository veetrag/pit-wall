import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { AmbienceDirector, CHEQUER_HOLD_MS } from '@ui/AmbienceDirector'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@audio/soundService', () => ({
  soundService: { play: vi.fn(), startAmbience: vi.fn(), stopAmbience: vi.fn(), setAmbienceMix: vi.fn(), isAmbienceActive: vi.fn(() => true) },
}))

describe('chequered-flag ambience', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useClockStore.setState({ speed: 1, appVisible: true })
    useRaceStore.setState({ phase: 'racing', raceState: null, radioRequest: null } as never)
    useSettingsStore.setState({ soundEnabled: true })
  })
  afterEach(() => { vi.useRealTimers() })

  it('swells at the finish, then fades and stops while results stay open', () => {
    render(<AmbienceDirector />)
    expect(soundService.startAmbience).toHaveBeenCalled()
    vi.mocked(soundService.stopAmbience).mockClear()
    act(() => { useRaceStore.setState({ phase: 'finished' } as never) })
    const last = vi.mocked(soundService.setAmbienceMix).mock.calls.slice(-1)[0]?.[0]
    expect(last?.master).toBeGreaterThan(0)
    expect(last?.crowdGain).toBeGreaterThan(0)
    act(() => { vi.advanceTimersByTime(CHEQUER_HOLD_MS - 100) })
    expect(soundService.stopAmbience).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(soundService.stopAmbience).toHaveBeenCalledTimes(1)
  })

  it('an early unmount fades it out at once', () => {
    const { unmount } = render(<AmbienceDirector />)
    act(() => { useRaceStore.setState({ phase: 'finished' } as never) })
    vi.mocked(soundService.stopAmbience).mockClear()
    unmount()
    expect(soundService.stopAmbience).toHaveBeenCalled()
  })
})
