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
  it('pace options preview both the time and the tyre-wear consequence', () => {
    render(<PaceModeToggle />)
    const push = screen.getByRole('radio', { name: /PUSH/ })
    expect(push.textContent).toMatch(/wear/)
    expect(push.textContent).toContain('−0.15s · +30% wear')
    expect(screen.getByRole('radio', { name: /SAVE/ }).textContent).toContain('+0.20s · −25% wear')
  })
  it('the player flash glyph is ink on the volt row', () => {
    render(<TimingTower />)
    const base = useRaceStore.getState().raceState!
    const me = base.cars.find(c => c.isPlayer)!
    // Swap places with a neighbour so the player row flashes gain or loss.
    const otherPos = me.position === 1 ? 2 : me.position - 1
    act(() => {
      useRaceStore.setState({
        raceState: {
          ...base,
          cars: base.cars.map(c =>
            c.isPlayer ? { ...c, position: otherPos }
            : c.position === otherPos ? { ...c, position: me.position } : c),
        },
      })
    })
    const mine = Array.from(document.querySelectorAll<HTMLElement>('[data-tower-row]'))
      .find(r => r.style.background.includes('--volt'))
    expect(mine, 'the player row is volt').toBeTruthy()
    const glyph = mine!.querySelector<HTMLElement>('[data-flash-glyph]')
    expect(glyph, 'the player row shows a gain/loss glyph').toBeTruthy()
    expect(glyph!.getAttribute('role')).toBe('img')
    expect(glyph!.style.color).toBe('var(--ink)')
  })
  it('a retired player row is not volt', () => {
    const base = useRaceStore.getState().raceState!
    act(() => {
      useRaceStore.setState({
        raceState: { ...base, cars: base.cars.map(c => c.isPlayer ? { ...c, retired: true } : c) },
      })
    })
    render(<TimingTower />)
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-tower-row]'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some(r => r.style.background.includes('--volt'))).toBe(false)
    expect(screen.getByText('DNF')).toBeTruthy()
  })
  it('the tower toggles have a 48px hit area', () => {
    render(<TimingTower />)
    for (const name of [/FULL FIELD/, /FULL NAME/]) {
      const btn = screen.getByRole('button', { name })
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(48)
    }
  })
})
