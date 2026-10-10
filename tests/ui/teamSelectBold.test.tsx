import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamSelect } from '@ui/TeamSelect'
import { DriverSelect } from '@ui/DriverSelect'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import cars from '@data/cars.json'

vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) } }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

const ink = [18, 14, 43]
const lum = (rgb: number[]) => { const c = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]! }
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  useSeasonStore.setState({ phase: 'team_select', selectedTeamId: 'solstice', playerDriverId: null })
})

describe('team select in Race Day Bold', () => {
  it('shows the hero, four stats, the full description and a team strip', () => {
    render(<TeamSelect />)
    expect(screen.getByRole('heading', { level: 1, name: /pick your team/i })).toBeTruthy()
    expect(screen.getByText(/FRONT-RUNNER/)).toBeTruthy()
    for (const k of ['POWER', 'AERO', 'HANDLING', 'PIT CREW']) expect(screen.getByText(k)).toBeTruthy()
    const desc = screen.getByText(/fastest pit crew on the grid/)
    expect(desc.style.whiteSpace).not.toBe('nowrap')
    expect(desc.style.textOverflow).not.toBe('ellipsis')
    const strip = screen.getByRole('radiogroup', { name: 'Teams' })
    expect(strip.querySelectorAll('[role="radio"]').length).toBe((cars as { teams: unknown[] }).teams.length)
    expect(screen.getByRole('button', { name: /DRIVE FOR SOLSTICE/ })).toBeTruthy()
  })
  it('picking a team from the strip selects it', () => {
    render(<TeamSelect />)
    fireEvent.click(screen.getByRole('radio', { name: /^Apex Racing, rating/ }))
    expect(useSeasonStore.getState().selectedTeamId).toBe('apex')
  })
  it('every team colour carries ink text at AA', () => {
    for (const t of (cars as { teams: { colorPrimary: string }[] }).teams) {
      const [a, b] = [lum(hex(t.colorPrimary)), lum(ink)].sort((x, y) => y - x)
      expect((a! + 0.05) / (b! + 0.05), t.colorPrimary).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('driver select offers both drivers as radios with four stats each', () => {
    useSeasonStore.setState({ phase: 'driver_select', selectedTeamId: 'apex' })
    render(<DriverSelect />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getAllByText('TYRE MGMT')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 1, name: /pick your driver/i })).toBeTruthy()
  })
})
