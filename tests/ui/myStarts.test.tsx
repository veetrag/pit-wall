import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
import { MyStarts } from '@ui/MyStarts'
import { useStartsStore } from '@state/startsStore'
import { makeCustomStart } from '@state/customStart'
import { encodeStart } from '@state/startCode'
import type { RaceRecipe } from '@state/raceRecipe'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: null, overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}
const made = [10, 15, 20, 25, 30].map(l => makeCustomStart(RECIPE, [], l)).find(r => r.ok)!

describe('MY STARTS', () => {
  beforeEach(() => { useStartsStore.setState({ starts: [] }) })
  it('shows an empty state with the import field', () => {
    render(<MyStarts />)
    expect(screen.getByText(/No starts yet/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Start code' })).toBeTruthy()
  })
  it('imports a pasted code and lists it', () => {
    if (!made.ok) throw new Error('premise')
    render(<MyStarts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Start code' }), { target: { value: encodeStart(made.payload) } })
    fireEvent.click(screen.getByRole('button', { name: 'IMPORT' }))
    expect(screen.getByText(made.payload.name)).toBeTruthy()
  }, 60_000)
  it('lists a stored start this build cannot play, explains it, and PLAY refuses (I1)', () => {
    if (!made.ok) throw new Error('premise')
    const stale = encodeStart({ ...made.payload, name: 'OLD ONE', recipe: { ...made.payload.recipe, gridOrder: ['d_voss'] } })
    useStartsStore.setState({ starts: [{ id: 'stale', code: stale, savedAt: 1, best: null }] })
    render(<MyStarts />)
    expect(screen.getByText('OLD ONE')).toBeTruthy()
    expect(screen.getByTestId('start-unplayable').textContent).toContain('no longer works on this version')
    fireEvent.click(screen.getByRole('button', { name: 'PLAY' }))
    expect(screen.getByRole('alert').textContent).toContain('no longer works on this version')
  })
  it('shows the re-derived situation and goal on a row (M2)', () => {
    if (!made.ok) throw new Error('premise')
    useStartsStore.setState({ starts: [{ id: 'good', code: encodeStart(made.payload), savedAt: 1, best: null }] })
    render(<MyStarts />)
    expect(screen.getByText(/LAPS LEFT/)).toBeTruthy()
    expect(screen.getByText(`FINISH P${made.payload.expect.par - 1} OR BETTER`)).toBeTruthy()
  }, 60_000)
  it('explains a bad paste in words', () => {
    render(<MyStarts />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Start code' }), { target: { value: 'PW2-AAAA' } })
    fireEvent.click(screen.getByRole('button', { name: 'IMPORT' }))
    expect(screen.getByRole('alert').textContent).toContain('Update Pit Wall to open this code')
  })
})
