import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { TimingTower } from '@ui/TimingTower'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import { initRace } from '@engine/index'
import type { IncidentEvent, RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
const config = {
  circuit: DATA.circuits['veloce']!, tuning: makeTuning({}), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
} as RaceConfig

const base: RaceState = initRace(config)

function deployed(): IncidentEvent {
  return { lap: 3, sector: 0, kind: 'safety_car_deployed', driverId: null, timeLoss: null }
}

function setState(incidents: IncidentEvent[]) {
  act(() => {
    useRaceStore.setState({
      config,
      raceState: { ...base, incidents, safetyCar: incidents.length ? { deployedLap: 3, lapsRemaining: 4, cause: 'crash' } : null },
    })
  })
}

/**
 * Rows carry the caution tint as rgba(var(--caution-rgb), 0.22).
 *
 * The channel token rather than a literal rgba, so the tint cannot drift from
 * --caution; and rgba(var(...)) rather than color-mix() because minSdkVersion
 * is 24 and color-mix needs Chromium 111. See the rowBg site in
 * TimingTower.tsx and tests/ui/cautionToken.test.ts.
 *
 * Matched on the VAR REFERENCE, not the resolved colour: jsdom does not
 * resolve custom properties, and this test used to match the rgb triple --
 * which quietly made it an assertion about a hardcoded literal, so removing
 * that literal (the point of the change) failed it.
 */
function flashedRowCount(container: HTMLElement): number {
  return [...container.querySelectorAll<HTMLElement>('[data-tower-row]')]
    .filter(el => /var\(\s*--caution-rgb\s*\)/.test(el.style.background)).length
}

describe('TimingTower compression flash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSettingsStore.setState({ reducedMotion: false })
    useRaceStore.setState({ raceState: null, config: null, pitPanelOpen: false, projectionResult: null })
  })
  afterEach(() => { vi.useRealTimers() })

  it('does not tint rows under green flag', () => {
    const { container } = render(<TimingTower />)
    setState([])
    expect(flashedRowCount(container)).toBe(0)
  })

  it('tints rows on deployment and clears the tint afterwards', () => {
    /*
     * FAILS IF the flash never clears -- a permanent tint would make the whole
     * tower unreadable for the rest of the race, and is the likeliest bug in a
     * timeout-driven one-shot.
     */
    const { container } = render(<TimingTower />)
    setState([])
    setState([deployed()])
    expect(flashedRowCount(container), 'every visible row is compressed').toBeGreaterThan(0)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(flashedRowCount(container), 'the flash is a one-shot, not a mode').toBe(0)
  })

  it('clears a flash already in flight when reduced motion is switched on', () => {
    /*
     * REGRESSION. Found by review, not by the original tests, and reachable
     * only through the settings toggle mid-race.
     *
     * The effect re-runs when reducedMotion changes. Its cleanup cancels the
     * pending timer, so if the effect then early-returns without clearing the
     * state, `compressing` stays true FOREVER -- a permanent caution tint over
     * every row for the rest of the race. That is the same unreadable-tower
     * failure the timeout test guards against, reached by a different path.
     */
    const { container } = render(<TimingTower />)
    setState([])
    setState([deployed()])
    expect(flashedRowCount(container), 'flash is in flight').toBeGreaterThan(0)

    // Toggle reduced motion on BEFORE the 1200ms timeout would have fired.
    act(() => { useSettingsStore.setState({ reducedMotion: true }) })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(flashedRowCount(container), 'must not strand the tint').toBe(0)
  })

  it('does not tint under reduced motion', () => {
    // The banner already carries this information statically; a flash with no
    // motion budget is decoration, and CLAUDE.md 6.4 says cut decoration.
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<TimingTower />)
    setState([])
    setState([deployed()])
    expect(flashedRowCount(container)).toBe(0)
  })
})
