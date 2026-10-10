import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { Development } from '@ui/Development'
import { useCareerStore } from '@state/careerStore'
import { useSeasonStore } from '@state/seasonStore'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const UPGRADES = loadGameData().upgrades
const TIER1 = UPGRADES.tierCosts[0]!

describe('Development bold', () => {
  beforeEach(() => {
    cleanup()
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.setState({ phase: 'development', playerDriverId: 'd_voss', selectedTeamId: 'apex' })
  })

  it('is the factory: title, volt DP badge, hot arms race, slanted upgrade cards', () => {
    render(<Development />)
    expect(screen.getByRole('heading', { level: 1, name: /the factory/i })).toBeTruthy()
    const dp = screen.getByTestId('dp-balance')
    expect(dp.style.background).toContain('--volt')
    expect(screen.getByText('DEV POINTS')).toBeTruthy()
    expect(screen.getByText('THE ARMS RACE').style.color).toContain('--hot')
    expect(screen.getAllByLabelText(/^Tier \d+ of \d+$/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('to-race').textContent).toMatch(/TO RACE SETUP/)
  })
})
