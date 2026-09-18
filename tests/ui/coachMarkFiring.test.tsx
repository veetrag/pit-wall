import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useCoachStore } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { useCoachingActive } from '@hooks/useCoachingActive'
import { useRetireCoachTutorial } from '@ui/RaceHUD'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

// A trivial probe that mirrors what TelemetryZone / PitPanel actually do: read
// the gate, and request a mark when a "coached surface" condition is true.
// Mounting RaceHUD itself drags in PixiJS via TrackCanvas, which jsdom cannot
// render, so this probe exercises the same hook contract without the canvas.
function CoachedSurfaceProbe({ id }: { id: 'tyre_cliff' | 'projection' }) {
  const coaching = useCoachingActive()
  const request = useCoachStore(s => s.request)
  if (coaching) request(id)
  return null
}

function RetireTutorialProbe() {
  useRetireCoachTutorial()
  return null
}

beforeEach(() => {
  useCoachStore.setState({ active: null, done: {} })
  useSettingsStore.setState({ coachMarksSeen: false })
  useSeasonStore.setState({ phase: 'racing' })
})

describe('coach marks firing on the first race', () => {
  it('a returning player (coachMarksSeen true) is never coached', () => {
    useSettingsStore.setState({ coachMarksSeen: true })
    render(<CoachedSurfaceProbe id="tyre_cliff" />)
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('scenario mode never coaches, even on a fresh player', () => {
    useSeasonStore.setState({ phase: 'scenario_racing' })
    render(<CoachedSurfaceProbe id="tyre_cliff" />)
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('a fresh player on a season race is coached', () => {
    render(<CoachedSurfaceProbe id="tyre_cliff" />)
    expect(useCoachStore.getState().active).toBe('tyre_cliff')
  })

  it('once both marks are dismissed, coachMarksSeen becomes true', () => {
    render(<RetireTutorialProbe />)
    expect(useSettingsStore.getState().coachMarksSeen).toBe(false)

    act(() => { useCoachStore.getState().request('tyre_cliff') })
    act(() => { useCoachStore.getState().dismiss('tyre_cliff') })
    expect(useSettingsStore.getState().coachMarksSeen).toBe(false)

    act(() => { useCoachStore.getState().request('projection') })
    act(() => { useCoachStore.getState().dismiss('projection') })
    expect(useSettingsStore.getState().coachMarksSeen).toBe(true)
  })

  it('a mark dismissed in one race does not return in the next within the same session', () => {
    // First race: cliff mark fires and is dismissed.
    render(<CoachedSurfaceProbe id="tyre_cliff" />)
    expect(useCoachStore.getState().active).toBe('tyre_cliff')
    act(() => { useCoachStore.getState().dismiss('tyre_cliff') })
    expect(useCoachStore.getState().done.tyre_cliff).toBe(true)

    // Next race, still within the same session (coachStore is not reset, and
    // coachMarksSeen has not yet flipped because 'projection' is still owed).
    render(<CoachedSurfaceProbe id="tyre_cliff" />)
    expect(useCoachStore.getState().active).toBeNull()
  })
})
