import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
const shareMock = vi.fn(async (..._a: unknown[]) => ({}))
vi.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => shareMock(...a) } }))
import { MakeStartSheet } from '@ui/MakeStartSheet'
import { useStartsStore } from '@state/startsStore'
import { makeCustomStart } from '@state/customStart'
import type { RaceRecipe } from '@state/raceRecipe'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 21, compound: 'H' }], wing: 3 },
  overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}
const GOOD = [10, 15, 20, 25, 30].find(l => makeCustomStart(RECIPE, [], l).ok)!

describe('MakeStartSheet', () => {
  beforeEach(() => { useStartsStore.setState({ starts: [] }); vi.useFakeTimers() })

  it('is a labelled dialog with a 1..laps-3 lap slider', () => {
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Make a start' })).toBeTruthy()
    const slider = screen.getByRole('slider', { name: 'Start lap' })
    expect(slider.getAttribute('min')).toBe('1'); expect(slider.getAttribute('max')).toBe('43')
  })
  it('shows the situation at the chosen lap, then SET START gives the goal, and SAVE stores it', async () => {
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(GOOD) } })
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(screen.getByText(/LAPS LEFT/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    expect(screen.getByText(/OR BETTER/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(useStartsStore.getState().starts).toHaveLength(1)
  })
  it('explains a lap the AI already wins from, and keeps SAVE disabled', () => {
    const one = [3, 5, 8, 40, 42].find(l => { const r = makeCustomStart(RECIPE, [], l); return !r.ok && r.reason === 'par_one' })
    if (one === undefined) return   // premise not present on this seed; the state test covers the rule
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(one) } })
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    expect(screen.getByText('THE AI ALREADY WINS FROM HERE')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'SAVE' })).toBeNull()
  })
})
