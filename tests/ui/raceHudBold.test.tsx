import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { TimingTower } from '@ui/TimingTower'
import { TelemetryZone } from '@ui/TelemetryZone'
import { PaceModeToggle } from '@ui/PaceModeToggle'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import { initRace } from '@engine/index'
import type { RaceConfig } from '@engine/types'

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

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: false, coachMarksSeen: true })
  useCoachStore.setState({ active: null, done: {} })
  useSeasonStore.setState({ phase: 'racing' })
  act(() => {
    useRaceStore.setState({ config, raceState: initRace(config), pitPanelOpen: false, projectionResult: null })
  })
})

describe('race HUD in Race Day Bold', () => {
  it('the player row is the volt row and the tower starts compact', () => {
    render(<TimingTower />)
    const rows = document.querySelectorAll('[data-tower-row]')
    expect(rows.length).toBeLessThanOrEqual(6)
    const mine = Array.from(rows).find(r => (r as HTMLElement).style.background.includes('--volt'))
    expect(mine).toBeTruthy()
    expect(screen.getByRole('button', { name: /FULL FIELD/ })).toBeTruthy()
  })
  it('telemetry shows the tyre meter and the plan line', () => {
    render(<TelemetryZone />)
    expect(screen.getByRole('meter', { name: /tyre wear/i })).toBeTruthy()
    expect(screen.getByText(/PLAN · PIT L|NO STOP PLANNED/)).toBeTruthy()
  })
  it('pace mode is a radiogroup', () => {
    render(<PaceModeToggle />)
    expect(screen.getByRole('radiogroup', { name: 'Pace mode' })).toBeTruthy()
  })
})
