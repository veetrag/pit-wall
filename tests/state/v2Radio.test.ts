import { describe, it, expect, vi, afterEach } from 'vitest'
import { V2_RADIO, makeRadioState, processRadioTick } from '@state/radioMapper'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'
import type { IncidentEvent, RaceState } from '@engine/types'

afterEach(() => { vi.restoreAllMocks() })

// tryPush rate-limits on Date.now(); a minute between ticks keeps the cooldown out of the test.
// t is module-level so the clock never runs backwards between tests (tryPush's cooldown is module state too).
let t = 1e12
function clock() { vi.spyOn(Date, 'now').mockImplementation(() => (t += 60_000)) }

describe('V2_RADIO and the player-incident cursor (spec 2026-10-24)', () => {
  it('has the double_stack row and no graining row', () => {
    expect(V2_RADIO.double_stack).toBe('double_stack')
    expect('graining' in V2_RADIO).toBe(false)
  })

  it('the cursor never double-fires a radio line', () => {
    clock()
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    let r = processRadioTick(s0, config, makeRadioState(), push)
    const ev: IncidentEvent = { lap: 3, sector: 2, kind: 'double_stack', driverId: 'd_voss', timeLoss: 1.4 }
    const s1: RaceState = { ...s0, incidents: [ev] }
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    expect(lines.filter(l => /busy|double stack/i.test(l))).toHaveLength(1)
    // A second incident fires once more, never the first again.
    const s2: RaceState = { ...s1, incidents: [ev, { ...ev, lap: 20 }] }
    r = processRadioTick(s2, config, r, push)
    processRadioTick(s2, config, r, push)
    expect(lines.filter(l => /busy|double stack/i.test(l))).toHaveLength(2)
    expect(lines.some(l => l.includes('{mate}'))).toBe(false)
  })

  it('a mid-race handover seeds the cursors: past incidents are never replayed, a new one fires once', () => {
    clock()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const me = s0.cars.find(c => c.isPlayer)!
    const mate = s0.cars.find(c => c.teamId === me.teamId && c.driverId !== me.driverId)!
    const handover: RaceState = { ...s0, lap: 10, incidents: [
      { lap: 2, sector: 1, kind: 'track_limits', driverId: me.driverId, timeLoss: null },
      { lap: 4, sector: 2, kind: 'penalty_issued', driverId: me.driverId, timeLoss: 5 },
      { lap: 6, sector: 0, kind: 'double_stack', driverId: me.driverId, timeLoss: 1.4 },
      { lap: 6, sector: 0, kind: 'double_stack', driverId: mate.driverId, timeLoss: 1.4 },
    ] }
    const seeded = makeRadioState(handover)
    expect(seeded.prevPlayerIncidents).toBe(3)
    expect(seeded.prevMateStacks).toBe(1)
    // First tick: exactly what a clean state at the same moment would say -- no incident replay.
    const withPast: string[] = []
    const clean: string[] = []
    const r1 = processRadioTick(handover, config, seeded, m => { withPast.push(m) })
    processRadioTick({ ...handover, incidents: [] }, config, makeRadioState(), m => { clean.push(m) })
    expect(withPast).toEqual(clean)
    // A new incident after the handover fires exactly once, on its tick only.
    const next: RaceState = { ...handover, incidents: [...handover.incidents, { lap: 11, sector: 0, kind: 'penalty_issued', driverId: me.driverId, timeLoss: 5 }] }
    const after: string[] = []
    const baseline: string[] = []
    const r2 = processRadioTick(next, config, r1, m => { after.push(m) })
    processRadioTick(handover, config, r1, m => { baseline.push(m) })
    expect(after.length - baseline.length).toBe(1)
    const again: string[] = []
    processRadioTick(next, config, r2, m => { again.push(m) })
    expect(again.length).toBe(baseline.length)
  })
})


describe('mid-race handover replays no earlier radio line (2.0 follow-up)', () => {
  it('a handover past a red flag, VSC, slow stop, spin and overtake fires none of their lines on the first tick', () => {
    clock()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const me = s0.cars.find(c => c.isPlayer)!
    const rival = s0.cars.find(c => !c.isPlayer)!
    const handover: RaceState = {
      ...s0,
      lap: 12,
      incidents: [
        { lap: 3, sector: 1, kind: 'red_flag', driverId: rival.driverId, timeLoss: null },
        { lap: 5, sector: 0, kind: 'vsc_deployed', driverId: rival.driverId, timeLoss: null },
        { lap: 7, sector: 2, kind: 'slow_stop', driverId: me.driverId, timeLoss: 2.1 },
      ],
      sectorResults: [{ driverId: me.driverId, sectorTime: 30, tyreContribution: 0, trafficPenalty: 0, noiseSample: 0, spinLoss: 3 }],
      overtakeEvents: [{ lap: 8, sector: 1, overtakerId: me.driverId, overtakenId: rival.driverId }],
    }
    const lines: string[] = []
    processRadioTick(handover, config, makeRadioState(handover), m => { lines.push(m) })
    expect(lines).toEqual([])
  })

  it('with a long pre-existing log, new lines fire exactly once and each tick scans only new incidents', () => {
    clock()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const me = s0.cars.find(c => c.isPlayer)!
    const rival = s0.cars.find(c => !c.isPlayer && c.teamId !== me.teamId)!
    const log: IncidentEvent[] = []
    for (let i = 0; i < 5000; i++) {
      log.push({ lap: 1 + (i % 40), sector: 0, kind: i % 2 ? 'track_limits' : 'slow_stop', driverId: i % 7 ? rival.driverId : me.driverId, timeLoss: 1 })
    }
    const long: RaceState = { ...s0, lap: 41, incidents: log }
    let r = makeRadioState(long)
    const lines: string[] = []
    r = processRadioTick(long, config, r, m => { lines.push(m) })
    expect(lines.filter(l => /stack|busy/i.test(l))).toHaveLength(0)
    expect(r.incidentScan!.index).toBe(5000)
    const ev: IncidentEvent = { lap: 42, sector: 1, kind: 'double_stack', driverId: me.driverId, timeLoss: 1.4 }
    const next: RaceState = { ...long, incidents: [...log, ev] }
    const after: string[] = []
    // Proof the old full-log filter is gone: a log that throws if read below the cursor.
    const guarded = new Proxy(next.incidents, {
      get(target, prop, recv) {
        if (typeof prop === 'string' && /^\d+$/.test(prop) && Number(prop) < 5000) throw new Error(`read old incident ${prop}`)
        if (prop === 'filter' || prop === 'reduce' || prop === 'slice') throw new Error(`full-log ${prop}`)
        return Reflect.get(target, prop, recv)
      },
    })
    r = processRadioTick({ ...next, incidents: guarded }, config, r, m => { after.push(m) })
    expect(after.filter(l => /stack|busy/i.test(l))).toHaveLength(1)
    const again: string[] = []
    processRadioTick({ ...next, incidents: guarded }, config, r, m => { again.push(m) })
    expect(again.filter(l => /stack|busy/i.test(l))).toHaveLength(0)
  })
})
