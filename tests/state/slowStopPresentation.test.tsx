import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRaceStore } from '@state/raceStore'
import { PitTimer } from '@ui/PitTimer'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import radioPools from '@data/radio.json'
import { expectedPitStopTime } from '@engine/pitStop'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

const r = () => useRaceStore.getState()
function start(pit: Partial<RaceConfig['tuning']['pit']>, plannedStops = [{ lap: 40, compound: 'H' as const }]) {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie', { startCompound: 'M', plannedStops }, null, undefined, false)
  const base = makeDeterministicTuning()
  useRaceStore.setState({ phase: 'racing', config: { ...r().config!, tuning: { ...base, pit: { ...base.pit, ...pit } } } })
  for (let i = 0; i < 6; i++) r().step()
}

describe('the pit timer shows the stop that happened', () => {
  beforeEach(() => r().resetRace())

  it('a PIT-button stop latches its exact time, and a fast stop is not slow', () => {
    start({ slowStopChance: 0 })
    const before = r().raceState!.cars.find(c => c.isPlayer)!.raceTime
    r().pitNow('H')
    const after = r().raceState!.cars.find(c => c.isPlayer)!.raceTime
    expect(r().lastStopTime).toBeCloseTo(after - before, 9)
    expect(r().lastStopSlow).toBe(0)
    render(<PitTimer />)
    expect(screen.getByText(`${r().lastStopTime.toFixed(1)}s`)).toBeTruthy()
    expect(screen.queryByText(/SLOW STOP/)).toBeNull()
  })

  it('A SLOW STOP TURNS THE TIMER HOT AND SAYS HOW SLOW', () => {
    start({ slowStopChance: 1, pitCrewSlowRelief: 0, slowStopMin: 2, slowStopMax: 6 })
    r().pitNow('H')
    expect(r().lastStopSlow).toBeGreaterThanOrEqual(2)
    render(<PitTimer />)
    expect(screen.getByText(`SLOW STOP +${r().lastStopSlow.toFixed(1)}s`)).toBeTruthy()
    expect(screen.getByTestId('pit-timer').getAttribute('data-slow')).toBe('true')
  })

  it('a plan stop latches the expected stop plus its exact slow seconds (ruling R5)', () => {
    start({ slowStopChance: 1, pitCrewSlowRelief: 0 }, [{ lap: 3, compound: 'H' }])
    for (let i = 0; i < 12 && r().raceState!.cars.find(c => c.isPlayer)!.pitsDone === 0; i++) r().step()
    const me = r().raceState!.cars.find(c => c.isPlayer)!
    expect(me.pitsDone).toBe(1)
    const ev = [...r().raceState!.incidents].reverse().find(i => i.kind === 'slow_stop' && i.driverId === me.driverId)!
    expect(r().lastStopSlow).toBe(ev.timeLoss)
    expect(r().lastStopTime).toBeCloseTo(expectedPitStopTime(r().config!, me.teamId, r().raceState!.safetyCar) + ev.timeLoss!, 9)
  })
})

describe('slow-stop radio', () => {
  // radioMapper's cooldown clock is module state stamped by earlier real-time
  // steps, so the fake clock must start after the real one.
  let clock = Date.now() + 1_000_000_000
  beforeEach(() => { vi.useFakeTimers(); clock += 1_000_000; vi.setSystemTime(clock) })
  afterEach(() => { vi.useRealTimers() })

  it('the engineer owns up to a slow stop, once', () => {
    start({ slowStopChance: 1, pitCrewSlowRelief: 0 })
    r().pitNow('H')
    const push = vi.fn()
    const next = processRadioTick(r().raceState!, r().config!, makeRadioState(), push)
    expect(push).toHaveBeenCalledTimes(1)
    const line = String(push.mock.calls[0]?.[0] ?? '')
    const loss = r().lastStopSlow.toFixed(1)
    expect(radioPools.slow_stop.map(l => l.replace('{loss}', loss))).toContain(line)
    expect(next.prevSlowStops).toBe(1)
    vi.setSystemTime(clock + 10_000)
    const again = vi.fn()
    processRadioTick(r().raceState!, r().config!, next, again)
    expect(again.mock.calls.flat().some(l => radioPools.slow_stop.some(p => String(l).startsWith(p.split('{')[0]!)))).toBe(false)
  })
})
