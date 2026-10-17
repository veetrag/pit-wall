import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { RedFlagCard } from '@ui/RedFlagCard'
import { PitButton } from '@ui/PitPanel'
import { replay } from '@engine/debrief'
import { defaultRestartCompound } from '@engine/redFlag'
import { useAndroidBackButton } from '@hooks/useAndroidBackButton'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { driveToFlag } from '../fixtures/driveStore'

const { listeners } = vi.hoisted(() => ({ listeners: [] as Array<() => void> }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((_e: string, fn: () => void) => { listeners.push(fn); return Promise.resolve({ remove: () => {} }) }),
    minimizeApp: vi.fn(async () => {}),
  },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

const MAX_STEPS = 400
const r = () => useRaceStore.getState()
const me = () => r().raceState!.cars.find(c => c.isPlayer)!
const BOX: ActiveRadioRequest = { id: 9, kind: 'box', lap: 0, aheadId: null, compound: 'H', line: 'Box?' }

/** A season race where one car crashes on the first sector and the red flag is certain. */
function startRed(playerCrashes = false) {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 30, compound: 'H' }] }, null, undefined, false)
  const c = r().config!
  const crasher = playerCrashes ? 'd_voss' : c.drivers.find(d => d.id !== 'd_voss')!.id
  const tuning = makeDeterministicTuning({
    incidents: {
      driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
      redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
    },
    tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
  })
  useRaceStore.setState({
    phase: 'racing',
    config: { ...c, tuning, drivers: c.drivers.map(d => ({ ...d, facets: { ...d.facets, consistency: d.id === crasher ? 0 : 100 } })) },
  })
}
function stepToCard() {
  for (let n = 0; n < 12 && r().phase === 'racing'; n++) {
    useRaceStore.setState({ pitPanelOpen: true, radioRequest: BOX })
    r().step()
  }
}

describe('the stoppage', () => {
  beforeEach(() => { listeners.length = 0 })

  it('RED FLAG WITH THE PIT PANEL OPEN AND A REQUEST PENDING: the card takes over, both are cleared', () => {
    startRed()
    stepToCard()
    expect(r().phase).toBe('red_flag')
    expect(r().pitPanelOpen).toBe(false)
    expect(r().projectionResult).toBeNull()
    expect(r().radioRequest).toBeNull()
  })

  it('RESTART logs the call, runs the lights, and the next step fits the tyre; the race replays exactly', () => {
    startRed()
    stepToCard()
    const step = r().stepCount
    r().confirmRedFlagRestart('S')
    expect(r().phase).toBe('starting')
    expect(r().playerCalls[r().playerCalls.length - 1]).toEqual({ step, kind: 'restart_tyre', compound: 'S' })
    r().confirmRaceStart()
    r().step()
    expect(me().compound).toBe('S')
    expect(me().tyreAge).toBe(0)
    expect(r().playerInPit).toBe(false)              // a restart is not a stop (preflight S1)
    expect(r().hudAlerts.some(a => /box box/i.test(a.message))).toBe(false)
    driveToFlag(MAX_STEPS)
    expect(r().phase).toBe('finished')
    expect(replay(r().config!, r().config!.seed, r().playerCalls).state).toEqual(r().raceState)
  })

  it('A RETIRED PLAYER GETS NO CARD: the race carries on through the restart', () => {
    startRed(true)
    for (let n = 0; n < 6; n++) { r().step(); expect(r().phase).toBe('racing') }
    expect(r().raceState!.incidents.some(i => i.kind === 'red_flag_restart')).toBe(true)
  })

  it('the hardware back button is inert on the card (pin: passes before this change, preflight E11)', () => {
    useSeasonStore.setState({ phase: 'racing' })
    renderHook(() => useAndroidBackButton())
    startRed()
    stepToCard()
    act(() => { for (const l of listeners) l() })
    expect(useSeasonStore.getState().phase).toBe('racing')
    expect(r().phase).toBe('red_flag')
  })

  it('pitNow under a red flag says to choose the restart tyre, never "No tyres left"', () => {
    startRed()
    stepToCard()
    useRaceStore.setState({ phase: 'racing' })
    const before = r().raceState
    r().pitNow('H')
    expect(r().raceState).toBe(before)
    const msgs = r().hudAlerts.map(a => a.message)
    expect(msgs.some(m => /no tyres left/i.test(m))).toBe(false)
    expect(msgs[msgs.length - 1]).toBe('Red flag — choose your restart tyre.')
  })
})

describe('the PIT button under a red flag', () => {
  it('is disabled, with a label saying why', () => {
    startRed()
    stepToCard()
    useRaceStore.setState({ phase: 'racing' })   // the sectors between the crash and the card
    render(<PitButton />)
    const btn = screen.getByRole('button', { name: /pit lane closed: red flag/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

describe('the RED FLAG card', () => {
  it('shows the frozen order, a free tyre change defaulting to the AI rule, and a volt RESTART', () => {
    startRed()
    stepToCard()
    render(<RedFlagCard />)
    const dialog = screen.getByRole('dialog', { name: /red flag/i })
    expect(dialog).toBeTruthy()
    expect(screen.getByText(/free tyre change/i)).toBeTruthy()
    const rows = screen.getAllByTestId('red-flag-row')
    expect(rows.length).toBeLessThanOrEqual(7)
    expect(rows.some(row => row.getAttribute('data-mine') === 'true')).toBe(true)
    const def = defaultRestartCompound(r().config!, r().raceState!)
    expect(screen.getByRole('radio', { checked: true }).getAttribute('data-compound')).toBe(def)
    const lap = r().raceState!.lap
    const tl = r().raceState!.weatherTimeline
    const wet = (tl[lap + 1] ?? r().raceState!.weatherState) !== 'DRY' || r().raceState!.weatherState !== 'DRY'
    expect(screen.queryAllByRole('radio').some(b => b.getAttribute('data-compound') === 'W')).toBe(wet)
    const soft = screen.getAllByRole('radio').find(b => b.getAttribute('data-compound') === 'S')!
    fireEvent.click(soft)
    fireEvent.click(screen.getByRole('button', { name: /restart/i }))
    expect(r().phase).toBe('starting')
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'restart_tyre', compound: 'S' })
  })

  it('renders nothing outside the red_flag phase', () => {
    r().resetRace()
    const { container } = render(<RedFlagCard />)
    expect(container.textContent).toBe('')
  })
})
