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

const DEFAULT_ALLOC = { S: 2, M: 1, H: 0, I: 4, W: 3 }

function raceState(weatherTimeline: WeatherState[] = [], tyreAllocation: Record<string, number> = DEFAULT_ALLOC): RaceState {
  return {
    safetyCar: null, incidents: [], lap: 10, weatherTimeline, weatherState: weatherTimeline[10] ?? 'DRY',
    cars: [{ driverId: player.id, isPlayer: true, compound: 'M', tyreAllocation }],
  } as unknown as RaceState
}

function open(projectionResult: ProjectionResult | null = null, alloc: Record<string, number> = DEFAULT_ALLOC) {
  act(() => {
    useRaceStore.setState({ pitPanelOpen: true, config, projectionResult, raceState: raceState([], alloc) })
  })
}

const PROJ: ProjectionResult = {
  rejoinPosition: 5, rejoinGap: 3.4, rejoinGapBehind: 1.2,
  driverAheadId: null, driverBehindId: null,
  lapsProjected: 4, netEstimatePosition: 5, netEstimateLap: 14,
}

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true, hapticsEnabled: true })
  useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null, updateProjection: () => {} })
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

  it('opening the sheet projects the default compound without a tap', () => {
    const updateProjection = vi.fn()
    useRaceStore.setState({ updateProjection })
    render(<PitPanel />)
    open()
    expect(updateProjection).toHaveBeenCalledWith('M')
  })

  it('a 0-set compound is aria-disabled and cannot be picked', () => {
    const updateProjection = vi.fn()
    useRaceStore.setState({ updateProjection })
    render(<PitPanel />)
    open(PROJ)
    const hard = screen.getByRole('radio', { name: /HARD/ })
    expect(hard.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(hard)
    expect(hard.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /MEDIUM/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('ghost-row').textContent).toMatch(/fresh MEDIUM/)
    expect(updateProjection).not.toHaveBeenCalled()
  })

  it('the default pick skips a Medium with no sets left', () => {
    render(<PitPanel />)
    open(null, { S: 2, M: 0, H: 1, I: 4, W: 3 })
    expect(screen.getByRole('radio', { name: /MEDIUM/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /SOFT/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('with no dry sets left at all, BOX NOW is disabled and says why', () => {
    const pitNow = vi.fn()
    useRaceStore.setState({ pitNow })
    render(<PitPanel />)
    open(null, { S: 0, M: 0, H: 0, I: 4, W: 3 })
    const box = screen.getByRole('button', { name: /BOX NOW/ }) as HTMLButtonElement
    expect(box.disabled).toBe(true)
    expect(screen.getByText(/No sets left/)).toBeTruthy()
    fireEvent.click(box)
    expect(pitNow).not.toHaveBeenCalled()
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

  function chipText(tl: WeatherState[]): string {
    act(() => { useRaceStore.setState({ config, raceState: raceState(tl) }) })
    const { unmount } = render(<WeatherChip />)
    const t = screen.getByRole('button').textContent ?? ''
    unmount()
    return t
  }
  // lap is 10, so index 10 is NOW and 11..14 are +1..+4.
  // tuning.json forecastConfidence: [1.0, 1.0, 0.85, 0.65, 0.45]
  function tl(now: WeatherState, later: Partial<Record<1 | 2 | 3 | 4, WeatherState>>): WeatherState[] {
    const t: WeatherState[] = Array(20).fill(now)
    for (const [k, v] of Object.entries(later)) {
      for (let i = Number(k); i <= 4; i++) t[10 + i] = v as WeatherState
    }
    return t
  }

  it('all dry reads dry ahead', () => {
    expect(chipText(tl('DRY', {}))).toMatch(/DRY · dry ahead/)
  })
  it('DRY to DAMP within confident range reads rain likely', () => {
    expect(chipText(tl('DRY', { 2: 'DAMP' }))).toMatch(/DRY · rain likely in 2L/)
  })
  it('DRY to DAMP at low confidence reads rain possible, and never prints a percentage', () => {
    const t = chipText(tl('DRY', { 3: 'DAMP' }))
    expect(t).toMatch(/DRY · rain possible in 3L/)
    expect(t).not.toMatch(/%/)
  })
  it('DAMP to WET names the arriving state', () => {
    expect(chipText(tl('DAMP', { 2: 'WET' }))).toMatch(/DAMP · WET likely in 2L/)
  })
  it('WET to DAMP reads drying, not rain', () => {
    const t = chipText(tl('WET', { 1: 'DAMP' }))
    expect(t).toMatch(/WET · drying likely in 1L/)
    expect(t).not.toMatch(/rain/)
  })
  it('WET to DRY names DRY', () => {
    expect(chipText(tl('WET', { 4: 'DRY' }))).toMatch(/WET · DRY possible in 4L/)
  })
  it('DAMP holding DAMP reads steady', () => {
    const t = chipText(tl('DAMP', {}))
    expect(t).toMatch(/DAMP · steady/)
    expect(t).not.toMatch(/rain/)
  })
})
