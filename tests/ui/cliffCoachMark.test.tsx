import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { TelemetryZone } from '@ui/TelemetryZone'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, CarState } from '@engine/types'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

const DATA = loadGameData()
const DRIVER = DATA.drivers.drivers[0]!

const config = {
  circuit: DATA.circuits['veloce']!, tuning: DATA.tuning, compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DRIVER.id, seed: 1,
} as RaceConfig

/** A player car on softs (cliff 10) at the given tyre age. */
function show(tyreAge: number, over: Partial<CarState> = {}) {
  const player = {
    driverId: DRIVER.id, teamId: DRIVER.teamId, isPlayer: true, position: 5,
    compound: 'S', tyreAge, raceTime: 100, pitsDone: 0, retired: false,
    // effectiveTyreAge reads lapsInDirtyAir; omitting it yields NaN through the
    // whole cliff computation and the mark silently never fires.
    lapsInDirtyAir: 0,
    retiredCause: null, retiredLap: null, paceMode: 'neutral',
    strategy: { plannedStops: [] }, compoundsUsed: ['S'], tyreAllocation: {},
    ...over,
  } as unknown as CarState
  act(() => {
    useRaceStore.setState({
      config,
      raceState: {
        cars: [player], lap: 12, totalLaps: 34, sector: 0, weatherState: 'DRY',
        safetyCar: null, incidents: [], weatherTimeline: [], overtakeEvents: [],
      } as unknown as RaceState,
    })
  })
}

beforeEach(() => {
  useRaceStore.setState({ raceState: null, config: null })
  useCoachStore.setState({ active: null, done: {} })
  useSettingsStore.setState({ coachMarksSeen: false })
  useSeasonStore.setState({ phase: 'racing' })
})

describe('the tyre-cliff coach mark', () => {
  it('DOES NOT FIRE ON A FRESH TYRE', () => {
    // The control. Without it, an `approaching` that is simply always true --
    // the natural way to break this -- would look identical to a working mark.
    render(<TelemetryZone />)
    show(0)
    expect(useCoachStore.getState().active,
      'a brand new set is not "the cliff is coming"').toBeNull()
  })

  it('FIRES AS THE CLIFF APPROACHES, AND NOT ONE LAP EARLIER', () => {
    /*
     * The real firing condition, driven through the real component, pinned at
     * its exact boundary.
     *
     * The existing coachMarkFiring suite exercises a hand-written probe that
     * calls request() unconditionally, so the actual gate in TelemetryZone --
     * cliffIn <= 5 and not already past it -- was completely uncovered:
     * inverting the comparison, widening the threshold or dropping the
     * !pastCliff term all survived the suite.
     *
     * On softs (cliff 10) with this driver, effective wear is 0.78 laps per
     * lap, so tyreAge 7 sits at cliffIn 6 and tyreAge 8 at cliffIn 5. Asserting
     * both sides means a threshold that drifts in EITHER direction fails.
     */
    render(<TelemetryZone />)
    show(7)   // cliffIn 6 -- outside the gate
    expect(useCoachStore.getState().active, 'cliffIn 6 is too early').toBeNull()

    show(8)   // cliffIn 5 -- on the gate
    expect(useCoachStore.getState().active, 'cliffIn 5 must fire').toBe('tyre_cliff')
  })

  it('does not fire once the tyre is already over the cliff', () => {
    // Past the cliff the warning is too late to act on, and the gauge is
    // already screaming; a tutorial card there teaches nothing.
    render(<TelemetryZone />)
    show(30)
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('does not coach a returning player', () => {
    useSettingsStore.setState({ coachMarksSeen: true })
    render(<TelemetryZone />)
    show(9)
    expect(useCoachStore.getState().active).toBeNull()
  })

  it('does not coach during a scenario', () => {
    useSeasonStore.setState({ phase: 'scenario_racing' })
    render(<TelemetryZone />)
    show(9)
    expect(useCoachStore.getState().active).toBeNull()
  })
})
