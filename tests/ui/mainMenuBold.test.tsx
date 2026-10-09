import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { MainMenu } from '@ui/MainMenu'
import { useSeasonStore } from '@state/seasonStore'
import { SAVE_KEY, SAVE_VERSION, type SeasonSnapshot } from '@state/seasonPersistence'

const SAVED: SeasonSnapshot = {
  v: SAVE_VERSION, resumePhase: 'development', playerDriverId: 'd_voss',
  selectedTeamId: 'apex', selectedCircuitId: 'veloce', raceIndex: 3,
  standings: [{ driverId: 'd_voss', points: 43 }], playerStrategy: null,
  attemptNonce: 0, devPoints: 60, purchasedTiers: {}, rivalDevelopment: {},
  lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null,
}

beforeEach(() => {
  mem.clear()
  useSeasonStore.setState({ phase: 'menu', playerDriverId: null, raceIndex: 0, standings: [] })
})

describe('MainMenu — Race Day Bold', () => {
  it('shows the next race card with circuit, round strip and standing when a save exists', async () => {
    mem.set(SAVE_KEY, JSON.stringify(SAVED))
    render(<MainMenu />)
    expect(await screen.findByText(/ROUND 4 OF 12/)).toBeTruthy()
    expect(screen.getByLabelText('3 of 12 rounds done')).toBeTruthy()
    expect(screen.getByText(/P1 · 43 pts/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Apex Racing car/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  it('shows NEW SEASON as the primary action and no race card without a save', async () => {
    render(<MainMenu />)
    expect(await screen.findByText('NEW SEASON')).toBeTruthy()
    expect(screen.queryByText(/OF 12$/)).toBeNull()
  })
})
