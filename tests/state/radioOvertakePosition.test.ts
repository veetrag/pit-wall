// Device bug (2.1): the radio banner said "P14" while the tower showed P12.
// A newer overtake line must replace the shown one, and every overtake in a
// tick counts, not just the last event.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processRadioTick, makeRadioState, type RadioState } from '@state/radioMapper'
import { upsertAlert } from '@state/raceStore'
import type { AlertMessage } from '../../src/ui/HudAlert'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, CarState, OvertakeEvent } from '@engine/types'

function car(id: string, position: number, isPlayer = false): CarState {
  return {
    driverId: id, teamId: 't1', position, raceTime: position * 2, lap: 2,
    sector: 0, compound: 'M', tyreAge: 3, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null,
  }
}

function state(playerPos: number, overtakeEvents: OvertakeEvent[]): RaceState {
  const others = ['a', 'b', 'c', 'd'].map((id, i) => car(id, i + 1 >= playerPos ? i + 2 : i + 1))
  return {
    lap: 2, sector: 0, totalLaps: 30, cars: [car('me', playerPos, true), ...others],
    sectorResults: [], overtakeEvents, safetyCar: null, incidents: [],
    trackEvolutionLaps: 2, rngState: 1,
    weatherTimeline: Array(30).fill('DRY'), weatherState: 'DRY',
  } as unknown as RaceState
}

const CONFIG = {
  playerDriverId: 'me', drivers: [], teams: [], strategies: [],
  compounds: { M: { name: 'Medium', type: 'dry', offset: 0, lin: 0.04, cliff: 16, pen: 0.07, colorToken: '--tyre-medium' } },
  circuit: { laps: 30 }, tuning: makeDeterministicTuning(),
} as unknown as RaceConfig

const ev = (overtakerId: string, overtakenId: string): OvertakeEvent => ({ lap: 2, sector: 0, overtakerId, overtakenId })

let clock = 0
beforeEach(() => { vi.useFakeTimers(); clock += 1_000_000; vi.setSystemTime(clock) })
afterEach(() => { vi.useRealTimers() })

function run(radio: RadioState, s: RaceState, alerts: AlertMessage[]): { radio: RadioState; alerts: AlertMessage[] } {
  let out = alerts
  let n = alerts.length
  const next = processRadioTick(s, CONFIG, radio, (msg, severity, replaceKey) => {
    out = upsertAlert(out, { id: `t${++n}`, severity, category: 'RADIO', message: msg, icon: '', ...(replaceKey ? { replaceKey } : {}) })
  })
  return { radio: next, alerts: out }
}

describe('radio overtake lines state the current position', () => {
  it('two player overtakes inside the cooldown: the visible line states the final position', () => {
    let radio = { ...makeRadioState(), prevPlayerPos: 5, prevGap: 99 }
    const e1 = [ev('me', 'd')]
    let r = run(radio, state(4, e1), [])
    radio = r.radio
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]!.message).toContain('P4')

    vi.setSystemTime(clock + 500) // well inside RADIO_COOLDOWN_MS
    r = run(radio, state(3, [...e1, ev('me', 'c')]), r.alerts)
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]!.message).toContain('P3')
    expect(r.alerts[0]!.message).not.toContain('P4')
  })

  it('a player overtake earlier in a multi-event tick is not missed', () => {
    const radio = { ...makeRadioState(), prevPlayerPos: 5, prevGap: 99 }
    // The player passes, then two rivals swap behind: the last event is not the player's.
    const r = run(radio, state(4, [ev('me', 'd'), ev('a', 'b')]), [])
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]!.message).toContain('P4')
  })

  it('unrelated alerts are not replaced', () => {
    const other: AlertMessage = { id: 'x', severity: 'info', category: 'RADIO', message: 'Box box', icon: '' }
    const pos: AlertMessage = { id: 'y', severity: 'caution', category: 'RADIO', message: 'P3', icon: '', replaceKey: 'position' }
    const out = upsertAlert(upsertAlert([other], { ...pos, id: 'p1', message: 'P4' }), pos)
    expect(out.map(a => a.message)).toEqual(['Box box', 'P3'])
  })
})
