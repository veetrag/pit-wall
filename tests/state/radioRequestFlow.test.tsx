import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { makeRequestTracker } from '@state/radioRequests'
import { makeRadioState } from '@state/radioMapper'
import { RadioRequest } from '@ui/RadioRequest'
import radioPools from '@data/radio.json'
import { makeDeterministicTuning } from '../fixtures/tuning'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

const r = () => useRaceStore.getState()
const me = () => r().raceState!.cars.find(c => c.isPlayer)!
const BOX: ActiveRadioRequest = { id: 1, kind: 'box', lap: 6, aheadId: null, compound: 'H', line: 'Tyres are gone, can we box?' }
const PUSH: ActiveRadioRequest = { id: 2, kind: 'push', lap: 6, aheadId: 'd_rossi', compound: null, line: 'Let me push.' }

function start(plannedStops = [{ lap: 40, compound: 'H' as const }]) {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops }, null, undefined, false)
  // Tyre failures off too: the detection test runs a worn tyre that must not puncture.
  const tuning = makeDeterministicTuning({ tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 } })
  useRaceStore.setState({ phase: 'racing', config: { ...r().config!, tuning } })
  for (let i = 0; i < 6; i++) r().step()
}

describe('answering', () => {
  beforeEach(() => start())

  it('YES to a box request is the logged PIT call, on the offered compound', () => {
    useRaceStore.setState({ radioRequest: BOX })
    const pits = me().pitsDone
    r().answerRadioRequest(true)
    expect(me().pitsDone).toBe(pits + 1)
    expect(me().compound).toBe('H')
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'pit', compound: 'H' })
    expect(r().radioRequest).toBeNull()
  })

  it('YES to a push request is the logged PACE call; NO logs nothing', () => {
    useRaceStore.setState({ radioRequest: PUSH })
    r().answerRadioRequest(true)
    expect(me().paceMode).toBe('push')
    expect(r().playerCalls[r().playerCalls.length - 1]).toMatchObject({ kind: 'pace', mode: 'push' })
    const n = r().playerCalls.length
    useRaceStore.setState({ radioRequest: { ...PUSH, id: 3 } })
    r().answerRadioRequest(false)
    expect(r().playerCalls.length).toBe(n)
    expect(r().radioRequest).toBeNull()
  })
})

describe('stale requests (ruling R8)', () => {
  it('A STALE BOX REQUEST CANNOT CHARGE A SECOND STOP: the PIT button withdraws it', () => {
    start()
    useRaceStore.setState({ radioRequest: BOX })
    r().pitNow('M')
    expect(r().radioRequest).toBeNull()
    const pits = me().pitsDone
    r().answerRadioRequest(true)
    expect(me().pitsDone).toBe(pits)
  })

  it('a plan stop landing withdraws a box request', () => {
    start([{ lap: 3, compound: 'H' }])
    useRaceStore.setState({ radioRequest: BOX })
    for (let i = 0; i < 12 && me().pitsDone === 0; i++) r().step()
    expect(me().pitsDone).toBe(1)
    expect(r().radioRequest?.id).not.toBe(BOX.id)
  })

  it('opening the pit panel withdraws a box request; choosing PUSH withdraws a push request', () => {
    start()
    useRaceStore.setState({ radioRequest: BOX })
    r().openPitPanel()
    expect(r().radioRequest).toBeNull()
    r().closePitPanel()
    useRaceStore.setState({ radioRequest: PUSH })
    r().setPaceMode('push')
    expect(r().radioRequest).toBeNull()
  })
})

describe('detection is wired into step()', () => {
  it('a worn player is asked to box at a lap end, with a line from the pool', () => {
    start()
    useRaceStore.setState({ radioRequest: null, requestTracker: makeRequestTracker(), raceState: { ...r().raceState!, cars: r().raceState!.cars.map(c => c.isPlayer ? { ...c, tyreAge: 60 } : c) } })
    for (let i = 0; i < 6 && r().radioRequest === null; i++) r().step()
    const req = r().radioRequest
    expect(req?.kind).toBe('box')
    expect(radioPools.request_box).toContain(req!.line)
  })
})

describe('the request card', () => {
  beforeEach(() => { vi.useFakeTimers(); start(); useRaceStore.setState({ radioRequest: BOX }) })
  afterEach(() => { vi.useRealTimers() })

  it('shows the line, a labelled YES and NO, each at least 44px', () => {
    render(<RadioRequest />)
    expect(screen.getByText(BOX.line)).toBeTruthy()
    const yes = screen.getByRole('button', { name: /yes, box for hard/i })
    const no = screen.getByRole('button', { name: /^no/i })
    for (const b of [yes, no]) expect(parseInt(b.style.height || b.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(no)
    expect(r().radioRequest).toBeNull()
  })

  it('THE EXPIRY FREEZES WHILE PAUSED, then runs out as NO (ruling R7)', () => {
    const expiry = r().config!.tuning.radioRequests.expirySec * 1000
    act(() => { useClockStore.setState({ speed: 0, appVisible: true }) })
    render(<RadioRequest />)
    act(() => { vi.advanceTimersByTime(expiry * 3) })
    expect(r().radioRequest, 'paused: still waiting').not.toBeNull()
    act(() => { useClockStore.setState({ speed: 1 }) })
    act(() => { vi.advanceTimersByTime(expiry / 2) })
    expect(Number(screen.getByTestId('radio-request-bar').getAttribute('data-remaining'))).toBeLessThan(expiry)
    act(() => { vi.advanceTimersByTime(expiry) })
    expect(r().radioRequest, 'expired = NO').toBeNull()
    expect(r().playerCalls.some(c => c.kind === 'pit')).toBe(false)
  })
})
describe('a second race without resetRace', () => {
  it('begins with fresh radio and request state', () => {
    start()
    useRaceStore.setState({ radioRequest: BOX, radioState: { ...makeRadioState(), hasWon: true }, requestTracker: { ...makeRequestTracker(), asked: 3 } })
    r().startSeasonRace('d_voss', 7, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [] }, null, undefined, false)
    expect(r().radioRequest).toBeNull()
    expect(r().requestTracker).toEqual(makeRequestTracker())
    expect(r().radioState).toEqual(makeRadioState())
    useRaceStore.setState({ radioRequest: BOX, requestTracker: { ...makeRequestTracker(), asked: 3 } })
    r().startRace()
    expect(r().radioRequest).toBeNull()
    expect(r().requestTracker).toEqual(makeRequestTracker())
    useRaceStore.setState({ radioRequest: BOX })
    r().initForStartSequence()
    expect(r().radioRequest).toBeNull()
    expect(r().radioState).toEqual(makeRadioState())
  })
})
