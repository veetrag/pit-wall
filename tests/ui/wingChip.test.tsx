import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { TelemetryZone } from '@ui/TelemetryZone'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, CarState } from '@engine/types'
import type { Wing } from '@engine/setup'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

const DATA = loadGameData()
const DRIVER = DATA.drivers.drivers[0]!

function show(setups?: Record<string, Wing>) {
  const config = {
    circuit: DATA.circuits['veloce']!, tuning: DATA.tuning, compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: DRIVER.id, seed: 1,
    ...(setups ? { setups } : {}),
  } as RaceConfig
  const player = {
    driverId: DRIVER.id, teamId: DRIVER.teamId, isPlayer: true, position: 5,
    compound: 'M', tyreAge: 2, raceTime: 100, pitsDone: 0, retired: false,
    lapsInDirtyAir: 0, retiredCause: null, retiredLap: null, paceMode: 'neutral',
    strategy: { plannedStops: [] }, compoundsUsed: ['M'], tyreAllocation: {},
  } as unknown as CarState
  act(() => {
    useRaceStore.setState({
      config,
      raceState: {
        cars: [player], lap: 3, totalLaps: 34, sector: 0, weatherState: 'DRY',
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

describe('the wing chip in telemetry', () => {
  it('shows the player wing when setups exist', () => {
    show({ [DRIVER.id]: 2 })
    render(<TelemetryZone />)
    const chip = screen.getByText('W2')
    expect(chip).toBeTruthy()
    expect(chip.getAttribute('aria-label')).toBe('Wing level 2')
  })

  it('is absent when the player chose no wing', () => {
    show()
    render(<TelemetryZone />)
    expect(screen.queryByText(/^W\d$/)).toBeNull()
  })
})
