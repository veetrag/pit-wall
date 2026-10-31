import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
const shareMock = vi.fn(async (..._a: unknown[]) => ({}))
vi.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => shareMock(...a) } }))
import { MakeStartSheet } from '@ui/MakeStartSheet'
import { useStartsStore, MAX_STARTS } from '@state/startsStore'
import { decodeStart, encodeStart } from '@state/startCode'
import type { PlayerCall } from '@engine/playerCalls'
import { useDebriefStore } from '@state/debriefStore'
import { loadGameData } from '@data/validators'
import { makeCustomStart } from '@state/customStart'
import type { RaceRecipe } from '@state/raceRecipe'

const RECIPE: RaceRecipe = {
  seed: 9042, playerDriverId: 'd_park', circuitId: 'costa_verde', difficulty: 'rookie',
  strategy: { startCompound: 'M', plannedStops: [{ lap: 21, compound: 'H' }], wing: 3 },
  overlay: null, gridOrder: null, dryStart: false, sprint: false, allDry: false, lapsPercent: 100, weather: 'circuit',
}
// Dry, Voss from pole: the AI holds P1 from lap 20, so the lap is refused as par_one.
const ALL = ['d_voss','d_chen','d_rossi','d_haas','d_silva','d_park','d_berg','d_almeida','d_novak','d_ito','d_dubois','d_mwangi','d_olsen','d_reyes','d_fischer','d_kovac','d_santos','d_tan','d_petrov','d_kane']
const POLE: RaceRecipe = { ...RECIPE, playerDriverId: 'd_voss', gridOrder: ALL, dryStart: true, allDry: true, weather: 'dry' }
const PAR_ONE_LAP = 20
const GOOD = [10, 15, 20, 25, 30].find(l => makeCustomStart(RECIPE, [], l).ok)!

describe('MakeStartSheet', () => {
  beforeEach(() => { useStartsStore.setState({ starts: [] }); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

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
    const r = makeCustomStart(POLE, [], PAR_ONE_LAP)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toBe('par_one')
    render(<MakeStartSheet recipe={POLE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(PAR_ONE_LAP) } })
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    expect(screen.getByText('THE AI ALREADY WINS FROM HERE')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'SAVE' })).toBeNull()
  })
  it('refuses a lap with too many calls before it, in words', () => {
    const many: PlayerCall[] = Array.from({ length: 256 }, (_, i) => ({ step: Math.floor(i / 10), kind: 'pace', mode: i % 2 ? 'push' : 'neutral' }))
    render(<MakeStartSheet recipe={RECIPE} calls={many} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    expect(screen.getByRole('alert').textContent).toBe('TOO MANY CALLS BEFORE THIS LAP — PICK AN EARLIER LAP')
  })
  it('a name edited after SET START lands in SAVE', () => {
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(GOOD) } })
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Start name' }), { target: { value: 'LATE NAME' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    const code = useStartsStore.getState().starts[0]!.code
    expect((decodeStart(code) as { ok: true; payload: { name: string } }).payload.name).toBe('LATE NAME')
  })
  it('says when MY STARTS was full', () => {
    const m = makeCustomStart(RECIPE, [], GOOD)
    if (!m.ok) throw new Error('premise')
    const other = encodeStart({ ...m.payload, recipe: { ...m.payload.recipe, seed: 5 } })
    useStartsStore.setState({ starts: Array.from({ length: MAX_STARTS }, (_, i) => ({ id: `x${i}`, code: other, savedAt: i, best: null })) })
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(GOOD) } })
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(screen.getByText('MY STARTS IS FULL — OLDEST REMOVED')).toBeTruthy()
  })
  it('shows the code as selectable text when sharing fails', async () => {
    shareMock.mockRejectedValueOnce(new Error('no share'))
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: String(GOOD) } })
    fireEvent.click(screen.getByRole('button', { name: 'SET START' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'SHARE CODE' })) })
    expect(screen.getByTestId('share-code-text').textContent).toMatch(/^PW1-/)
  })
  it('charts the race under the slider with the chosen lap marked (M1)', async () => {
    const DRIVERS = loadGameData().drivers.drivers
    useDebriefStore.setState({ history: {
      totalLaps: 46, lapsRun: 46, neutralisations: [],
      cars: DRIVERS.map((d, i) => ({ driverId: d.id, teamId: d.teamId, isPlayer: d.id === 'd_park', positions: Array.from({ length: 47 }, () => i + 1), pitLaps: [], retiredLap: null, finish: i + 1 })),
    } })
    const { container } = render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Start lap' }), { target: { value: '12' } })
    expect(container.querySelector('[data-mark-lap="12"]')).toBeTruthy()
    useDebriefStore.setState({ history: null })
  })
  it('closes when the scrim behind the sheet is tapped', () => {
    const onClose = vi.fn()
    render(<MakeStartSheet recipe={RECIPE} calls={[]} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('make-start-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
