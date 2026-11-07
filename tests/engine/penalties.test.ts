import { describe, it, expect } from 'vitest'
import {
  initPenalty, trackLimitsChance, recordTrackLimits, unsafeReleaseChance, addPendingAtFlag, effectiveOrder, aiPenaltyCoverPace,
} from '@engine/penalties'
import { executeStop } from '@engine/pitStop'
import { computeSectorTime } from '@engine/lapModel'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, RaceConfig } from '@engine/types'

const ON = { penalties: { enabled: true } }
const cfg = (over = {}): RaceConfig =>
  ({ ...makeConfig({}, 7, 'veloce'), allDry: true, tuning: makeDeterministicTuning({ ...ON, ...over }) })
const withPen = (c: RaceConfig, pen = initPenalty(), patch: Partial<CarState> = {}): CarState =>
  ({ ...initRace(c).cars[0]!, penalty: pen, ...patch })

describe('track limits (spec §8.2)', () => {
  it('the chance follows pace mode, consistency and weather', () => {
    const c = cfg()
    const car = withPen(c)
    const cons = c.drivers.find(d => d.id === car.driverId)!.facets.consistency
    const base = 0.012 / 3 * (1 - cons / 100 * 0.5)
    expect(trackLimitsChance(c, { ...car, paceMode: 'neutral' }, 'DRY')).toBeCloseTo(base, 15)
    expect(trackLimitsChance(c, { ...car, paceMode: 'push' }, 'DRY')).toBeCloseTo(base * 1.8, 15)
    expect(trackLimitsChance(c, { ...car, paceMode: 'neutral' }, 'DAMP')).toBeCloseTo(base * 1.5, 15)
  })

  it('three warnings, then 5 s for every further offence', () => {
    const c = cfg()
    let car = withPen(c)
    const kinds: string[][] = []
    for (let i = 0; i < 5; i++) {
      const r = recordTrackLimits(c, car, 10 + i, 1)
      car = { ...car, penalty: r.penalty }
      kinds.push(r.events.map(e => e.kind))
    }
    expect(kinds).toEqual([['track_limits'], ['track_limits'], ['track_limits'], ['track_limits', 'penalty_issued'], ['track_limits', 'penalty_issued']])
    expect(car.penalty).toEqual({ warnings: 5, pendingSec: 10, servedSec: 0 })
  })

  it('lapModel marks an offence at about the configured rate, without an extra draw', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 0.9 } } })
    const car = withPen(c, initPenalty(), { paceMode: 'push' })
    const p = trackLimitsChance(c, car, 'DRY')
    let hits = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      let draws = 0
      const base = createRng(1000 + i)
      const counting = () => { draws++; return base() }
      if (computeSectorTime(c, car, 0, counting, 'DRY', null).trackLimits) hits++
      expect(draws).toBe(2)
    }
    expect(hits / N).toBeGreaterThan(p - 0.03)
    expect(hits / N).toBeLessThan(p + 0.03)
  })

  it('never under a neutralisation (N3), never without the feature', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 1 } } })
    const car = withPen(c, initPenalty(), { paceMode: 'push' })
    const sc = { deployedLap: 1, lapsRemaining: 2, cause: 'crash' as const, kind: 'sc' as const }
    for (let i = 0; i < 50; i++) expect(computeSectorTime(c, car, 0, createRng(i), 'DRY', sc).trackLimits).toBeUndefined()
    const off = cfg({ penalties: { enabled: false } })
    expect(Object.keys(computeSectorTime(off, initRace(off).cars[0]!, 0, createRng(1))).includes('trackLimits')).toBe(false)
  })
})

describe('serving and unsafe release (spec §8.2)', () => {
  it('a pending penalty is served at the stop: 5 s stationary, logged', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 0 } } })
    const car = withPen(c, { warnings: 4, pendingSec: 5, servedSec: 0 })
    const clean = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, withPen(c), 'H', createRng(3))
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, car, 'H', createRng(3))
    expect(out.car.raceTime - clean.car.raceTime).toBeCloseTo(5, 9)
    expect(out.served).toBe(5)
    expect(out.car.penalty).toEqual({ warnings: 4, pendingSec: 0, servedSec: 5 })
    expect(out.events.map(e => e.kind)).toContain('penalty_served')
  })

  it('A PENDING PENALTY IS SERVED IN THE PROJECTED STOP, and the projection never rolls an unsafe release', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 1 } } })
    const car = withPen(c, { warnings: 4, pendingSec: 5, servedSec: 0 })
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, car, 'H', createRng(3), { allowSlow: false })
    expect(out.served).toBe(5)
    expect(out.unsafe).toBe(false)
  })

  it('an unsafe release issues a new pending penalty after serving the old one; stacked is likelier', () => {
    const c = cfg({ penalties: { enabled: true, unsafeRelease: { chance: 1, pitCrewRelief: 0 } } })
    const out = executeStop(c, { safetyCar: null, lap: 9, sector: 2 }, withPen(c, { warnings: 0, pendingSec: 5, servedSec: 0 }), 'H', createRng(3))
    expect(out.unsafe).toBe(true)
    expect(out.car.penalty).toEqual({ warnings: 0, pendingSec: 5, servedSec: 5 })
    expect(out.events.map(e => e.kind)).toEqual(expect.arrayContaining(['penalty_served', 'unsafe_release', 'penalty_issued']))
    const d = cfg()
    expect(unsafeReleaseChance(d, 'apex', true)).toBeCloseTo(unsafeReleaseChance(d, 'apex', false) * 2.5, 15)
  })

  it('at the flag every pending penalty is added before the classification', () => {
    const c = cfg()
    const cars = initRace(c).cars.map((x, i) => ({ ...x, raceTime: i * 0.9, penalty: { warnings: 0, pendingSec: i === 0 ? 5 : 0, servedSec: 0 } }))
    const r = addPendingAtFlag(cars, 33, 2)
    expect(r.cars[0]!.raceTime).toBe(5)
    expect(r.cars[0]!.penalty).toEqual({ warnings: 0, pendingSec: 0, servedSec: 5 })
    expect(r.events).toEqual([{ lap: 33, sector: 2, kind: 'penalty_added', driverId: cars[0]!.driverId, timeLoss: 5 }])
    expect(effectiveOrder({ cars }).map(x => x.driverId).indexOf(cars[0]!.driverId)).toBe(5)
  })

  it('end to end: a race with a pending penalty classifies the car behind its road position', () => {
    const c = cfg({ penalties: { enabled: true, trackLimits: { chancePerLap: 0 } } })
    let s = initRace(c)
    // A naive car on hards with no planned stop never pits at veloce (34 laps), so the penalty reaches the flag.
    s = { ...s, cars: s.cars.map((x, i) => i === 0
      ? { ...x, compound: 'H' as const, strategy: { ...x.strategy, plannedStops: [], brain: 'naive' as const }, penalty: { warnings: 0, pendingSec: 30, servedSec: 0 } }
      : x) }
    const rng = createRng(7)
    const MAX_STEPS = c.circuit.laps * 3
    for (let i = 0; i < MAX_STEPS; i++) s = stepSector(c, s, rng)
    expect(s.incidents.some(e => e.kind === 'penalty_added' && e.driverId === initRace(c).cars[0]!.driverId)).toBe(true)
  })

  it('AI cover: no stop left and the car behind inside the penalty → push', () => {
    const c = cfg()
    const s = initRace(c)
    const me = { ...s.cars[0]!, raceTime: 100, pitsDone: 1, penalty: { warnings: 4, pendingSec: 5, servedSec: 0 }, strategy: { ...s.cars[0]!.strategy, brain: 'optimal' as const } }
    const st = { ...s, cars: [me, { ...s.cars[1]!, raceTime: 103 }, ...s.cars.slice(2).map((x, i) => ({ ...x, raceTime: 200 + i }))] }
    expect(aiPenaltyCoverPace(c, me, st, 0.3, 'neutral')).toBe('push')
    expect(aiPenaltyCoverPace(c, me, st, 0.8, 'neutral'), 'tyres too worn').toBe('neutral')
  })
})
