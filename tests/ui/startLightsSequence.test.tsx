import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { StartLights } from '@ui/StartLights'
import { useRaceStore } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

/*
 * Found on the 1.4 phone pass: the round-6 race "started without the
 * sequence" after qualifying -> TO THE GRID.
 *
 * The qualifying -> race path was checked and is not the cause: it reaches
 * the 'starting' phase and mounts StartLights like every other season start
 * (exercised in the browser too). The one code path that skipped the lights
 * was REDUCED MOTION: StartLights jumped straight to lights-out and GO, no
 * lamps at all. Reduced motion defaults from the OS (Remove animations) and
 * the in-app toggle sticks once set -- and DEVICE-CHECKLIST.md has the tester
 * turn both on.
 *
 * Reduced motion is about MOVEMENT (CLAUDE.md 6.3: replace large motion with
 * instant/opacity transitions). Five lamps lighting one by one is a state
 * sequence, not movement, and the race start is the game's hook (6.2). So the
 * lights now run under reduced motion, without the pulse; and the "Skip start
 * sequence" setting, which was persisted and shown but read by nothing, is
 * what skips them.
 */

const litCount = (c: HTMLElement) => c.querySelectorAll('[data-lit="true"]').length
const ticks = () => vi.mocked(soundService.play).mock.calls.filter(([s]) => s === 'tick').length

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(soundService.play).mockClear()
  useClockStore.setState({ speed: 0, appVisible: true })
  useRaceStore.setState({ phase: 'starting', config: null })
  useSettingsStore.setState({ reducedMotion: false, skipStartSequence: false, simSpeed: 2, hapticsEnabled: false })
})
afterEach(() => { vi.useRealTimers() })

describe('the start lights', () => {
  it('RUN UNDER REDUCED MOTION: five lamps, one by one, then lights out', () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<StartLights />)
    expect(useRaceStore.getState().phase, 'the race must not start on mount').toBe('starting')
    expect(litCount(container)).toBe(0)
    for (let n = 1; n <= 5; n++) {
      act(() => { vi.advanceTimersByTime(1000) })
      expect(litCount(container), `light ${n}`).toBe(n)
    }
    expect(ticks()).toBe(5)
    expect(useRaceStore.getState().phase).toBe('starting')
    act(() => { vi.advanceTimersByTime(600 + 800) })
    expect(useRaceStore.getState().phase).toBe('racing')
    expect(useClockStore.getState().speed, 'still the player’s chosen speed').toBe(2)
  })

  it('run the same sequence with full motion', () => {
    const { container } = render(<StartLights />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(litCount(container)).toBe(3)
    expect(useRaceStore.getState().phase).toBe('starting')
    act(() => { vi.advanceTimersByTime(2000 + 600 + 800) })
    expect(useRaceStore.getState().phase).toBe('racing')
    expect(useClockStore.getState().speed).toBe(2)
  })

  it('ARE SKIPPED BY THE "SKIP START SEQUENCE" SETTING, AND ONLY BY IT', () => {
    useSettingsStore.setState({ skipStartSequence: true })
    act(() => { render(<StartLights />) })
    expect(useRaceStore.getState().phase).toBe('racing')
    expect(useClockStore.getState().speed).toBe(2)
    expect(ticks()).toBe(0)
    expect(vi.mocked(soundService.play)).toHaveBeenCalledWith('lightsOut')
  })
})

describe('a red-flag standing restart', () => {
  it('says RACE RESUMING and shows the restart lap of the race laps (lapsOverride honoured)', () => {
    const config = { circuit: { name: 'Bengaluru', laps: 50 }, lapsOverride: 30 } as unknown as NonNullable<ReturnType<typeof useRaceStore.getState>['config']>
    const raceState = { lap: 20, totalLaps: 30, incidents: [{ kind: 'red_flag' }] } as unknown as NonNullable<ReturnType<typeof useRaceStore.getState>['raceState']>
    useRaceStore.setState({ phase: 'starting', config, raceState })
    const { container } = render(<StartLights />)
    expect(container.textContent).toContain('RACE RESUMING')
    expect(container.textContent).not.toContain('FORMATION LAP COMPLETE')
    expect(container.textContent).toContain('BENGALURU · LAP 21 OF 30')
    useRaceStore.setState({ raceState: null })
  })
})
