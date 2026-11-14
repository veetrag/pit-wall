import { describe, it, expect, vi, afterEach } from 'vitest'
import { V2_RADIO, makeRadioState, processRadioTick } from '@state/radioMapper'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'
import { makeDeterministicTuning } from '../fixtures/tuning'
import radioPools from '@data/radio.json'
import type { CarState, IncidentEvent, RaceConfig, RaceState, ThermalState } from '@engine/types'

afterEach(() => { vi.restoreAllMocks() })

// tryPush rate-limits on Date.now(); a minute between ticks keeps the cooldown out of the test.
// t is module-level so the clock never runs backwards between tests (tryPush's cooldown is module state too).
let t = 1e12
function clock() { vi.spyOn(Date, 'now').mockImplementation(() => (t += 60_000)) }

describe('V2_RADIO and the player-incident cursor (spec 2026-10-24)', () => {
  it('has the double_stack and graining rows', () => {
    expect(V2_RADIO.double_stack).toBe('double_stack')
    expect(V2_RADIO.graining).toBe('graining')
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
    expect(makeRadioState(handover).incidentScan?.index).toBe(handover.incidents.length)
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

describe('tyre temperature on the radio (2.1, spec §5.4)', () => {
  it('the player graining is radioed once', () => {
    clock()
    const config = { ...makeConfig({}, 2), playerDriverId: 'd_voss' }
    const s0 = initRace(config)
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    let r = processRadioTick(s0, config, makeRadioState(), push)
    const s1: RaceState = { ...s0, incidents: [{ lap: 3, sector: 2, kind: 'graining', driverId: 'd_voss', timeLoss: null }] }
    r = processRadioTick(s1, config, r, push)
    r = processRadioTick(s1, config, r, push)
    expect(lines.filter(l => radioPools.graining.includes(l))).toHaveLength(1)
  })

  const th = (temp: number): ThermalState => ({ temp, coldLaps: 0, grainLaps: 0, heatWear: 0 })
  function hot(on = true): { config: RaceConfig; at: (p: Partial<CarState>) => RaceState } {
    const base = makeConfig({}, 2, 'sol_desert')
    const config: RaceConfig = { ...base, allDry: true, playerDriverId: 'd_voss',
      tuning: makeDeterministicTuning(on ? { tyreTemp: { enabled: true } } : {}) }
    const s0 = initRace(config)
    const at = (p: Partial<CarState>): RaceState =>
      ({ ...s0, lap: 10, weatherState: 'DRY', cars: s0.cars.map(c => c.isPlayer ? { ...c, ...p } : c) })
    return { config, at }
  }

  it('TYRES_HOT: once per stint, only well past the window, again after a stop', () => {
    clock()
    const { config, at } = hot()                       // soft window [75, 100]
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    const isHot = (l: string) => radioPools.tyres_hot.includes(l)
    let r = makeRadioState()
    r = processRadioTick(at({ compound: 'S', tyreAge: 5, thermal: th(105) }), config, r, push)
    expect(lines.filter(isHot), '5 over is a brush, not news').toHaveLength(0)
    r = processRadioTick(at({ compound: 'S', tyreAge: 6, thermal: th(108) }), config, r, push)
    r = processRadioTick(at({ compound: 'S', tyreAge: 7, thermal: th(110) }), config, r, push)
    expect(lines.filter(isHot)).toHaveLength(1)
    r = processRadioTick(at({ compound: 'S', tyreAge: 0, pitsDone: 1, thermal: th(70) }), config, r, push)
    expect(r.hotWarned, 'reset at pit exit').toBe(false)
    processRadioTick(at({ compound: 'S', tyreAge: 4, pitsDone: 1, thermal: th(110) }), config, r, push)
    expect(lines.filter(isHot)).toHaveLength(2)
  })

  it('TYRES_IN: once per out-lap, when a set that read cold comes into its window', () => {
    clock()
    const { config, at } = hot()                       // hard window [92, 115]
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    const isIn = (l: string) => radioPools.tyres_in.includes(l)
    let r = makeRadioState()
    r = processRadioTick(at({ compound: 'M', tyreAge: 15, thermal: th(95) }), config, r, push)
    r = processRadioTick(at({ compound: 'H', tyreAge: 0, pitsDone: 1, thermal: th(70) }), config, r, push)
    expect(r.outLapCold).toBe(true)
    r = processRadioTick(at({ compound: 'H', tyreAge: 0, pitsDone: 1, thermal: th(93) }), config, r, push)
    r = processRadioTick(at({ compound: 'H', tyreAge: 0, pitsDone: 1, thermal: th(95) }), config, r, push)
    expect(lines.filter(isIn)).toHaveLength(1)
    // The race start is not an out-lap, and a set that never read cold earns nothing.
    const start: string[] = []
    let r2 = processRadioTick(at({ compound: 'H', tyreAge: 0, pitsDone: 0, thermal: th(85) }), config, makeRadioState(), m => { start.push(m) })
    r2 = processRadioTick(at({ compound: 'H', tyreAge: 0, pitsDone: 0, thermal: th(95) }), config, r2, m => { start.push(m) })
    expect(start.filter(isIn)).toHaveLength(0)
  })

  it('NO TEMPERATURE LINES WHERE THERMAL PACE DOES NOT APPLY (H3): inters on a dry track are never "cooked"', () => {
    clock()
    const { config, at } = hot()
    const lines: string[] = []
    const push = (m: string) => { lines.push(m) }
    let r = makeRadioState()
    r = processRadioTick(at({ compound: 'I', tyreAge: 5, thermal: th(140) }), config, r, push)
    r = processRadioTick(at({ compound: 'I', tyreAge: 6, thermal: th(145) }), config, r, push)
    expect(lines.filter(l => radioPools.tyres_hot.includes(l))).toHaveLength(0)
    expect(r.hotWarned).toBe(false)
    expect(makeRadioState(at({ compound: 'I', tyreAge: 5, thermal: th(140) }), config).hotWarned).toBe(false)
    // A slick out-lap in the damp never reads cold, so it never earns "tyres are in".
    const damp = (p: Partial<CarState>): RaceState => ({ ...at(p), weatherState: 'DAMP' })
    r = processRadioTick(damp({ compound: 'H', tyreAge: 0, pitsDone: 1, thermal: th(40) }), config, makeRadioState(), push)
    expect(r.outLapCold).toBe(false)
    processRadioTick(damp({ compound: 'H', tyreAge: 0, pitsDone: 1, thermal: th(95) }), config, r, push)
    expect(lines.filter(l => radioPools.tyres_in.includes(l))).toHaveLength(0)
  })

  it('GRAINING UNDER A NEUTRALISATION WAITS FOR GREEN, and is dropped if it has cleared', () => {
    clock()
    const { config, at } = hot()
    const isGrain = (l: string) => radioPools.graining.includes(l)
    const ev: IncidentEvent = { lap: 9, sector: 2, kind: 'graining', driverId: 'd_voss', timeLoss: null }
    const sc = { deployedLap: 8, lapsRemaining: 2, cause: 'crash' as const }
    const run = (clearsBy: number) => {
      const lines: string[] = []
      const push = (m: string) => { lines.push(m) }
      let r = makeRadioState()
      r = processRadioTick({ ...at({ compound: 'M', thermal: th(60) }), safetyCar: sc }, config, r, push)
      const grained = (laps: number) => ({ ...at({ compound: 'M', thermal: { ...th(60), grainLaps: laps } }), incidents: [ev] })
      r = processRadioTick({ ...grained(4), safetyCar: sc }, config, r, push)
      r = processRadioTick({ ...grained(4), safetyCar: sc }, config, r, push)
      const behind = lines.filter(isGrain).length
      r = processRadioTick({ ...grained(clearsBy), safetyCar: null }, config, r, push)
      processRadioTick({ ...grained(clearsBy), safetyCar: null }, config, r, push)
      return { behind, green: lines.filter(isGrain).length }
    }
    expect(run(3)).toEqual({ behind: 0, green: 1 })   // still graining at green: said once
    expect(run(0)).toEqual({ behind: 0, green: 0 })   // cleared behind the SC: never said
  })

  it('a handover on an already-overheating tyre does not announce it; off, the flags never move', () => {
    clock()
    const { config, at } = hot()
    const handover = at({ compound: 'S', tyreAge: 8, thermal: th(112) })
    const seeded = makeRadioState(handover, config)
    expect(seeded.hotWarned).toBe(true)
    const lines: string[] = []
    processRadioTick(handover, config, seeded, m => { lines.push(m) })
    expect(lines.filter(l => radioPools.tyres_hot.includes(l))).toHaveLength(0)

    const off = hot(false)
    const s = off.at({ compound: 'S', tyreAge: 0, pitsDone: 1 })
    expect(makeRadioState(s, off.config).hotWarned).toBe(false)
    const r = processRadioTick(s, off.config, makeRadioState(), () => {})
    expect(r.hotWarned).toBe(false)
    expect(r.outLapCold).toBe(false)
  })
})
