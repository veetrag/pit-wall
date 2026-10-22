import { describe, it, expect } from 'vitest'
import { careerStats } from '@state/careerStats'
import type { RaceFact } from '@state/badges'

const ORDER = ['bengaluru', 'veloce', 'silverpark']
const f = (o: Partial<RaceFact>): RaceFact => ({
  season: 1, round: 0, grid: 5, finish: 5, retired: false, pole: false, stops: 1, overtakes: 0, wet: false, ...o,
})

describe('careerStats (spec 1.6 §7)', () => {
  it('A CAREER WITH NOTHING TO COUNT: no NaN, no Infinity (Review Focus 5)', () => {
    for (const log of [[], [f({ kind: 'sprint', finish: 2 })], [f({ finish: 3 }), f({ finish: 9, retired: true })]]) {
      const s = careerStats(log, ORDER)
      const json = JSON.stringify(s)
      expect(json).not.toMatch(/NaN|Infinity/)
      for (const v of [s.dnfRate, s.longestStint]) if (v !== null) expect(Number.isFinite(v)).toBe(true)
      for (const r of s.averageBySeason) if (r.average !== null) expect(Number.isFinite(r.average)).toBe(true)
    }
    const empty = careerStats([], ORDER)
    expect(empty.dnfRate).toBeNull()
    expect(empty.longestStint).toBeNull()
    expect(empty.byStartCompound).toEqual([])
    expect(empty.bestByCircuit.map(c => c.best)).toEqual([null, null, null])
  })

  it('pre-1.6 facts mark the stat partial; all-new facts do not', () => {
    const old = careerStats([f({}), f({ circuitId: 'veloce', startCompound: 'M', longestStint: 20 })], ORDER)
    expect([old.circuitPartial, old.compoundPartial, old.stintPartial]).toEqual([true, true, true])
    const fresh = careerStats([f({ circuitId: 'veloce', startCompound: 'M', longestStint: 20 })], ORDER)
    expect([fresh.circuitPartial, fresh.compoundPartial, fresh.stintPartial]).toEqual([false, false, false])
  })

  it('best per circuit ignores DNFs and sprints', () => {
    const s = careerStats([
      f({ circuitId: 'veloce', finish: 4 }), f({ circuitId: 'veloce', finish: 1, retired: true }),
      f({ circuitId: 'veloce', finish: 2, kind: 'sprint' }), f({ circuitId: 'bengaluru', finish: 7 }),
    ], ORDER)
    expect(s.bestByCircuit).toEqual([
      { circuitId: 'bengaluru', best: 7, races: 1 }, { circuitId: 'veloce', best: 4, races: 2 }, { circuitId: 'silverpark', best: null, races: 0 },
    ])
  })

  it('win and podium rate by start compound', () => {
    const s = careerStats([
      f({ startCompound: 'S', finish: 1 }), f({ startCompound: 'S', finish: 3 }),
      f({ startCompound: 'S', finish: 8 }), f({ startCompound: 'S', finish: 2, retired: true }),
      f({ startCompound: 'H', finish: 6 }),
    ], ORDER)
    expect(s.byStartCompound).toEqual([
      { compound: 'S', races: 4, winRate: 0.25, podiumRate: 0.5 },
      { compound: 'H', races: 1, winRate: 0, podiumRate: 0 },
    ])
  })

  it('longest stint, biggest comeback, wet and sprint records, DNF rate, season averages', () => {
    const s = careerStats([
      f({ season: 1, round: 2, grid: 14, finish: 4, longestStint: 31, wet: true }),
      f({ season: 1, round: 3, grid: 3, finish: 9, retired: true }),
      f({ season: 2, round: 0, grid: 10, finish: 1, longestStint: 40 }),
      f({ season: 2, round: 1, grid: 5, finish: 3, kind: 'sprint', longestStint: 60 }),
    ], ORDER)
    expect(s.longestStint).toBe(60)
    expect(s.biggestComeback).toEqual({ gained: 10, season: 1, round: 2 })
    expect(s.wet).toEqual({ races: 1, wins: 0, podiums: 0, best: 4 })
    expect(s.sprint).toEqual({ races: 1, wins: 0, podiums: 1, best: 3 })
    expect(s.dnfRate).toBeCloseTo(1 / 3)
    expect(s.averageBySeason).toEqual([{ season: 1, races: 2, average: 4 }, { season: 2, races: 1, average: 1 }])
    expect(s.gpRaces).toBe(3)
  })
})

describe('DNF rate counts Grand Prix retirements only (1.6.2 item 4 pin)', () => {
  it('a mixed log: sprint DNFs, wet races and a low finish do not inflate it', () => {
    const s = careerStats([
      f({ finish: 18 }),                               // last but classified: not a DNF
      f({ finish: 20, wet: true }),                    // wet, classified
      f({ finish: 12, retired: true, wet: true }),     // wet DNF: counts once
      f({ finish: 4 }),
      f({ finish: 9, retired: true, kind: 'sprint' }), // sprint DNF: not a GP
      f({ finish: 7, kind: 'sprint' }),
    ], ORDER)
    expect(s.gpRaces).toBe(4)
    expect(s.dnfRate).toBeCloseTo(1 / 4)
  })
})
