import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import { Haptics } from '@capacitor/haptics'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { PitPanel } from '@ui/PitPanel'
import { WeatherChip } from '@ui/WeatherStrip'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, WeatherState } from '@engine/types'
import type { ProjectionResult } from '@engine/projection'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

const DATA = loadGameData()
const circuit = DATA.circuits['veloce']!
const tuning = makeTuning({})
const drivers = DATA.drivers.drivers
const player = drivers[0]!

const config = {
  circuit, tuning, compounds: DATA.compounds,
  drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: player.id, seed: 1,
} as RaceConfig

function raceState(weatherTimeline: WeatherState[] = []): RaceState {
  return {
    safetyCar: null, incidents: [], lap: 10, weatherTimeline, weatherState: 'DRY',
    cars: [{ driverId: player.id, isPlayer: true, compound: 'M', tyreAllocation: { S: 2, M: 1, H: 0, I: 4, W: 3 } }],
  } as unknown as RaceState
}

function open(projectionResult: ProjectionResult | null = null) {
  act(() => {
    useRaceStore.setState({ pitPanelOpen: true, config, projectionResult, raceState: raceState() })
  })
}

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true, hapticsEnabled: true })
  useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null })
  vi.mocked(Haptics.impact).mockClear()
})

describe('pit sheet (hero 2b)', () => {
  it('pit sheet asks to box, keeps the pit-loss copy and offers compounds as radios with sets left', () => {
    render(<PitPanel />)
    open()
    expect(screen.getByText(/BOX THIS LAP\?/)).toBeTruthy()
    expect(screen.getByText(/PIT LOSS/)).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByText(/set/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: /BOX NOW/ })).toBeTruthy()
  })

  it('sets left come from the player tyreAllocation, and the default pick is checked', () => {
    render(<PitPanel />)
    open()
    const soft = screen.getByRole('radio', { name: /SOFT/ })
    const medium = screen.getByRole('radio', { name: /MEDIUM/ })
    const hard = screen.getByRole('radio', { name: /HARD/ })
    expect(soft.textContent).toMatch(/2 sets/)
    expect(medium.textContent).toMatch(/1 set\b/)
    expect(hard.textContent).toMatch(/0 sets/)
    expect(medium.getAttribute('aria-checked')).toBe('true')
    expect(soft.getAttribute('aria-checked')).toBe('false')
  })

  it('the projection is a mini tower with a ghost row for the player', () => {
    const ahead = drivers[1]!, behind = drivers[2]!
    render(<PitPanel />)
    open({
      rejoinPosition: 5, rejoinGap: 3.4, rejoinGapBehind: 1.2,
      driverAheadId: ahead.id, driverBehindId: behind.id,
      lapsProjected: 4, netEstimatePosition: 4, netEstimateLap: 14,
    })
    const ghost = screen.getByTestId('ghost-row')
    expect(ghost.textContent).toMatch(new RegExp(`P5 · ${player.code} · \\+3\\.4`))
    expect(ghost.textContent).toMatch(/fresh MEDIUM/i)
    expect(screen.getByText(new RegExp(ahead.code))).toBeTruthy()
    expect(screen.getByText(new RegExp(behind.code))).toBeTruthy()
    expect(screen.getByText(/recovers to ~P4 by lap 14/)).toBeTruthy()
  })

  it('BOX NOW fires one Heavy haptic, not the kit Medium on top', () => {
    const pitNow = vi.fn()
    useRaceStore.setState({ pitNow })
    render(<PitPanel />)
    open()
    fireEvent.click(screen.getByRole('button', { name: /BOX NOW/ }))
    expect(pitNow).toHaveBeenCalledWith('M')
    const styles = vi.mocked(Haptics.impact).mock.calls.map(c => (c[0] as { style: string }).style)
    expect(styles).toEqual(['HEAVY'])
  })
})

describe('weather chip', () => {
  it('the weather chip expands the full forecast', () => {
    act(() => { useRaceStore.setState({ config, raceState: raceState() }) })
    render(<WeatherChip />)
    const chip = screen.getByRole('button', { expanded: false })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
  })

  it('summarises the forecast: rain chance and laps until it, or dry ahead', () => {
    const tl: WeatherState[] = Array(20).fill('DRY')
    tl[12] = 'DAMP'
    act(() => { useRaceStore.setState({ config, raceState: { ...raceState(tl) } }) })
    const { unmount } = render(<WeatherChip />)
    const pct = Math.round(tuning.weather.forecastConfidence[2]! * 100)
    expect(screen.getByRole('button').textContent).toMatch(new RegExp(`DRY · rain ${pct}% in 2L`))
    unmount()
    act(() => { useRaceStore.setState({ raceState: raceState(Array(20).fill('DRY')) }) })
    render(<WeatherChip />)
    expect(screen.getByRole('button').textContent).toMatch(/dry ahead/)
  })
})
