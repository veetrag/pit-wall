import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
import { ScenarioSelect } from '@ui/ScenarioSelect'

describe('Challenges hub', () => {
  it('opens on SCENARIOS with the seven core scenarios, titled CHALLENGES', () => {
    render(<ScenarioSelect />)
    expect(screen.getByText('CHALLENGES')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'SCENARIOS' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Recovery Drive')).toBeTruthy()
    expect(screen.queryByText('Lantern Gamble')).toBeNull()
  })
  it('CLASSICS lists the historic pack with its inspired-by line', () => {
    render(<ScenarioSelect />)
    fireEvent.click(screen.getByRole('tab', { name: 'CLASSICS' }))
    expect(screen.getByText('Lantern Gamble')).toBeTruthy()
    expect(screen.getByText(/early stop met a perfectly timed safety car/)).toBeTruthy()
  })
  it('DAILY shows the daily card', () => {
    render(<ScenarioSelect />)
    fireEvent.click(screen.getByRole('tab', { name: 'DAILY' }))
    expect(screen.getByRole('region', { name: /Daily challenge for/ })).toBeTruthy()
  })
})
