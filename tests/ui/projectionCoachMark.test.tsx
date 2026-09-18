import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { PitPanel } from '@ui/PitPanel'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState } from '@engine/types'
import type { ProjectionResult } from '@engine/projection'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

const DATA = loadGameData()
const config = {
  circuit: DATA.circuits['veloce']!, tuning: makeTuning({}), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
} as RaceConfig

const PROJECTION = { rejoinPosition: 5, gapToCarAhead: 3.4 } as unknown as ProjectionResult

function openPanel(projectionResult: ProjectionResult | null) {
  act(() => {
    useRaceStore.setState({
      pitPanelOpen: true, config, projectionResult,
      raceState: { safetyCar: null, incidents: [], lap: 10, weatherTimeline: [], weatherState: 'DRY' } as unknown as RaceState,
    })
  })
}

beforeEach(() => {
  useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null })
  useCoachStore.setState({ active: null, done: {} })
  useSettingsStore.setState({ coachMarksSeen: false })
  useSeasonStore.setState({ phase: 'racing' })
})

describe('the projection coach mark', () => {
  it('FIRES WHEN THE PROJECTION FIRST APPEARS, not merely when the panel opens', () => {
    /*
     * The mark explains the projection overlay, so it has to wait for the
     * overlay. The panel opens with projectionResult still null -- the
     * projection is only computed once the player picks a compound -- so a mark
     * wired to `pitPanelOpen` would appear over an empty panel, pause the race,
     * and point at nothing.
     *
     * This was the one firing path that could not be confirmed by playing: the
     * race reached the flag before the panel could be driven to a projection.
     */
    render(<PitPanel />)
    openPanel(null)
    expect(useCoachStore.getState().active,
      'nothing to explain until the projection exists').toBeNull()

    openPanel(PROJECTION)
    expect(useCoachStore.getState().active).toBe('projection')
  })

  it('does not fire for a player who has already been coached', () => {
    useSettingsStore.setState({ coachMarksSeen: true })
    render(<PitPanel />)
    openPanel(PROJECTION)
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('does not fire during a scenario', () => {
    // A scenario drops the player into lap 40 of a race already half-run, which
    // is the worst possible moment to meet the tutorial.
    useSeasonStore.setState({ phase: 'scenario_racing' })
    render(<PitPanel />)
    openPanel(PROJECTION)
    expect(useCoachStore.getState().active).toBeNull()
  })
})
