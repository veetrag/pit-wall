import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
const mode = vi.hoisted(() => ({ v: 'ok' as 'ok' | 'drift' | 'unplayable' }))
vi.mock('@state/customStart', async (orig) => {
  const real = await orig<typeof import('@state/customStart')>()
  return {
    ...real,
    rederive: (p: Parameters<typeof real.rederive>[0]) => {
      const r = real.rederive(p)
      if (!r) return r
      if (mode.v === 'unplayable') return { ...r, par: 1 }
      return { ...r, drift: mode.v === 'drift' }
    },
  }
})
import { MyStarts } from '@ui/MyStarts'
import { useStartsStore } from '@state/startsStore'
import { useSeasonStore } from '@state/seasonStore'
import { makeCustomStart } from '@state/customStart'
import { encodeStart } from '@state/startCode'
import type { RaceRecipe } from '@state/raceRecipe'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: null, overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}
const made = [10, 15, 20, 25, 30].map(l => makeCustomStart(RECIPE, [], l)).find(r => r.ok)!
const DRIFT = 'Made on another version of Pit Wall — this start now plays out differently'

describe('MY STARTS — playing a saved start', () => {
  let started: ReturnType<typeof vi.fn>
  beforeEach(() => {
    if (!made.ok) throw new Error('premise')
    useStartsStore.setState({ starts: [{ id: '00000001', code: encodeStart(made.payload), savedAt: 0, best: null }] })
    started = vi.fn()
    useSeasonStore.setState({ startScenarioPhase: started } as never)
  })
  it('asks before playing a drifted start; starts only on PLAY ANYWAY', () => {
    mode.v = 'drift'
    render(<MyStarts />)
    fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
    expect(screen.getByRole('status').textContent).toContain(DRIFT)
    expect(started).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    expect(screen.queryByText(new RegExp(DRIFT))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
    fireEvent.click(screen.getByRole('button', { name: 'PLAY ANYWAY' }))
    expect(started).toHaveBeenCalledTimes(1)
  }, 60_000)
  it('says why an unplayable start will not start', () => {
    mode.v = 'unplayable'
    render(<MyStarts />)
    fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
    expect(screen.getByRole('alert').textContent).toContain('That start no longer works on this version of Pit Wall')
    expect(started).not.toHaveBeenCalled()
  }, 60_000)
  it('the more menu reports its state', () => {
    mode.v = 'ok'
    render(<MyStarts />)
    const more = screen.getByRole('button', { name: /^More for/ })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
  }, 60_000)
})
