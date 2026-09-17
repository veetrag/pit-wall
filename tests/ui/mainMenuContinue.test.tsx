import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

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
  selectedTeamId: 'apex', selectedCircuitId: 'veloce', raceIndex: 4,
  standings: [{ driverId: 'd_voss', points: 43 }], playerStrategy: null,
  attemptNonce: 0, devPoints: 60, purchasedTiers: {}, rivalDevelopment: {},
  lastRaceResults: null, lastRaceEvents: null,
}

function withSave() { mem.set(SAVE_KEY, JSON.stringify(SAVED)) }

beforeEach(() => {
  mem.clear()
  useSeasonStore.setState({ phase: 'menu', playerDriverId: null, raceIndex: 0, standings: [] })
})

describe('MainMenu — resuming a season', () => {
  it('offers only NEW SEASON when there is no save', async () => {
    render(<MainMenu />)
    await waitFor(() => expect(screen.getByText('NEW SEASON')).toBeTruthy())
    expect(screen.queryByText('CONTINUE SEASON')).toBeNull()
  })

  it('offers CONTINUE with the round the player was on', async () => {
    withSave()
    render(<MainMenu />)
    await waitFor(() => expect(screen.getByText('CONTINUE SEASON')).toBeTruthy())
    // raceIndex 4 is the fifth round; the label must be 1-indexed for a human.
    expect(screen.getByText(/Round 5 of 12/)).toBeTruthy()
  })

  it('CONTINUE restores the season and leaves the menu', async () => {
    /*
     * FAILS IF resumeSeason stops setting `phase` -- the exact defect that made
     * the previous save/load implementation dead code. The player would tap
     * Continue, the season would load invisibly behind them, and they would
     * still be looking at the main menu.
     */
    withSave()
    render(<MainMenu />)
    await waitFor(() => expect(screen.getByText('CONTINUE SEASON')).toBeTruthy())
    act(() => { screen.getByText('CONTINUE SEASON').closest('button')!.click() })

    const s = useSeasonStore.getState()
    expect(s.phase, 'must actually navigate away from the menu').toBe('development')
    expect(s.playerDriverId).toBe('d_voss')
    expect(s.raceIndex).toBe(4)
    expect(s.standings).toEqual([{ driverId: 'd_voss', points: 43 }])
    expect(s.devPoints).toBe(60)
  })

  it('asks before discarding a saved season', async () => {
    /*
     * Starting a new season nulls playerDriverId, which is the autosave's
     * signal to DELETE the save. So a single mis-tap on NEW SEASON would
     * destroy a championship in progress. One tap arms, a second confirms.
     */
    withSave()
    render(<MainMenu />)
    await waitFor(() => expect(screen.getByText('CONTINUE SEASON')).toBeTruthy())

    act(() => { screen.getByText('NEW SEASON').closest('button')!.click() })
    expect(useSeasonStore.getState().phase,
      'the first tap must NOT start a new season').toBe('menu')
    expect(screen.getByText('DISCARD AND START OVER?')).toBeTruthy()

    act(() => { screen.getByText('DISCARD AND START OVER?').closest('button')!.click() })
    expect(useSeasonStore.getState().phase, 'the second tap starts it').toBe('team_select')
  })

  it('starts immediately when there is nothing to lose', async () => {
    // No save means no confirmation step -- the guard must not become a tax on
    // every new player's first tap.
    render(<MainMenu />)
    await waitFor(() => expect(screen.getByText('NEW SEASON')).toBeTruthy())
    act(() => { screen.getByText('NEW SEASON').closest('button')!.click() })
    expect(useSeasonStore.getState().phase).toBe('team_select')
  })
})
