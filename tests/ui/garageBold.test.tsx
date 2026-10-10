import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GridStats } from '@ui/GridStats'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/preferences', () => ({ Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) } }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

beforeEach(() => {
  cleanup()
  useSettingsStore.setState({ reducedMotion: true })
})

describe('garage in Race Day Bold', () => {
  it('shows drivers as collectible cards and switches to cars and compare with tabs', () => {
    render(<GridStats />)
    expect(screen.getByRole('heading', { level: 1, name: /the grid/i })).toBeTruthy()
    const tabs = screen.getByRole('tablist', { name: 'Garage' })
    expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(3)
    const card = screen.getAllByRole('button', { name: /, rating \d+$/ })[0]!
    expect(card.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(card)
    expect(card.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'CARS' }))
    expect(screen.getAllByRole('img', { name: / car$/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'VS' }))
    expect(screen.getByText(/to compare/i)).toBeTruthy()
  })
})
