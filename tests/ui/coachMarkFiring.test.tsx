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

/*
 * A probe for useCoachingActive ALONE -- the gate, not the firing conditions.
 *
 * It deliberately does NOT mirror TelemetryZone / PitPanel: those request their
 * mark from a useEffect behind a real condition (the cliff being within five
 * laps; a projection having been computed), and this calls request() straight
 * from the render body. Reading it as a stand-in for them would be a mistake --
 * it was, once: while it was the only coverage, the cliff mark's actual
 * threshold could be widened, inverted, or stripped of its !pastCliff term
 * without a single test failing.
 *
 * Those conditions are covered against the real components in
 * tests/ui/cliffCoachMark.test.tsx and tests/ui/projectionCoachMark.test.tsx.
 * What is left here is the gate itself: seen-it flag, and season vs scenario.
 */
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

  it('coachMarksSeen becomes true only when EVERY mark is dismissed', () => {
    /*
     * Asserted one at a time, and the intermediate expectations are the point:
     * they are what catches a new mark being added to the union without being
     * added to useRetireCoachTutorial. That mistake retires the tutorial early
     * and the new mark is never seen by anyone.
     */
    render(<RetireTutorialProbe />)
    const ids = ['timing_tower', 'pace_modes', 'tyre_cliff', 'projection'] as const
    for (const [i, id] of ids.entries()) {
      expect(useSettingsStore.getState().coachMarksSeen, `before dismissing ${id}`).toBe(false)
      act(() => { useCoachStore.getState().request(id) })
      act(() => { useCoachStore.getState().dismiss(id) })
      if (i < ids.length - 1) {
        expect(useSettingsStore.getState().coachMarksSeen, `after ${id}, ${ids.length - 1 - i} left`).toBe(false)
      }
    }
    expect(useSettingsStore.getState().coachMarksSeen, 'all four dismissed').toBe(true)
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
