import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { GameClock } from '@ui/GameClock'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@audio/soundService', () => ({
  soundService: { play: vi.fn(), startAmbience: vi.fn(), stopAmbience: vi.fn(), setWeather: vi.fn() },
}))

/*
 * Found on device, 2026-10-09: a race left running at 1x and sent to the home
 * screen for 40 seconds came back seven laps later (L8 -> L15), the same rate
 * as in the foreground. The sim is driven by a setInterval, and Capacitor's
 * WebView keeps JS timers running in the background -- the renderer is
 * throttled, the simulation is not. A phone call mid-race could carry the
 * player past their pit window and over the tyre cliff, unseen.
 */
describe('backgrounding the app mid-race', () => {
  let step: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    step = vi.fn()
    useClockStore.setState({ speed: 1, appVisible: true })
    useRaceStore.setState({ phase: 'racing', step } as never)
    useSettingsStore.setState({ soundEnabled: true })
    vi.mocked(soundService.startAmbience).mockClear()
    vi.mocked(soundService.stopAmbience).mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('PAUSES THE RACE when the app is hidden', () => {
    act(() => { useClockStore.getState().setAppVisible(false) })
    expect(useClockStore.getState().speed).toBe(0)
  })

  it('does not step the sim while hidden', () => {
    render(<GameClock />)
    act(() => { useClockStore.getState().setAppVisible(false) })
    step.mockClear()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(step).not.toHaveBeenCalled()
  })

  it('stays paused on return, so the player resumes it themselves', () => {
    act(() => { useClockStore.getState().setAppVisible(false) })
    act(() => { useClockStore.getState().setAppVisible(true) })
    expect(useClockStore.getState().speed).toBe(0)
  })

  it('does not step even if lights-out sets the speed while hidden', () => {
    /*
     * StartLights sets the speed on its own timer at lights-out. Hidden
     * during the start sequence, that GO lands while nobody can see it --
     * pausing once on hide is not enough; the clock itself must be gated.
     */
    render(<GameClock />)
    act(() => { useClockStore.getState().setAppVisible(false) })
    act(() => { useClockStore.getState().setSpeed(1) })
    step.mockClear()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(step).not.toHaveBeenCalled()
  })

  it('returns paused even when lights-out fired while hidden', () => {
    act(() => { useClockStore.getState().setAppVisible(false) })
    act(() => { useClockStore.getState().setSpeed(1) })
    act(() => { useClockStore.getState().setAppVisible(true) })
    expect(useClockStore.getState().speed).toBe(0)
  })

  it('a visible event while already visible changes nothing', () => {
    /*
     * The scenario path sets speed 1 itself (RaceWatcher) because nothing
     * else will; a spurious "visible" at launch must not freeze it again.
     */
    act(() => { useClockStore.getState().setAppVisible(true) })
    expect(useClockStore.getState().speed).toBe(1)
  })

  it('silences the ambience while hidden', () => {
    render(<GameClock />)
    vi.mocked(soundService.stopAmbience).mockClear()
    act(() => { useClockStore.getState().setAppVisible(false) })
    expect(soundService.stopAmbience).toHaveBeenCalled()
  })
})
