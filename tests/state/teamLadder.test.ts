import { describe, it, expect } from 'vitest'
import {
  constructorsTable, deservedOrder, settleTeamTiers, meanFacet,
  type TeamTierTuning,
} from '@state/teamLadder'
import { loadGameData } from '@data/validators'
import { createRng, gaussianPair } from '@engine/rng'

const T: TeamTierTuning = { step: 3, min: -3, max: 3, threshold: 2, facets: ['power', 'aero', 'handling'] }
const ids = ['a', 'b', 'c', 'd', 'e']

describe('tuning', () => {
  it('ships the approved values', () => {
    expect(loadGameData().tuning.career.teamTiers).toEqual(T)
  })
  it('every ladder facet exists on every team', () => {
    for (const team of loadGameData().cars.teams) {
      for (const f of T.facets) expect(team.facets, `${team.id}.${f}`).toHaveProperty(f)
    }
  })
})

describe('constructorsTable', () => {
  const driverTeam = new Map([['d1', 'a'], ['d2', 'a'], ['d3', 'b'], ['d4', 'b'], ['d5', 'c'], ['d6', 'c']])

  it('sums both drivers and orders by points', () => {
    const rows = constructorsTable(
      [{ driverId: 'd3', points: 50 }, { driverId: 'd1', points: 30 }, { driverId: 'd2', points: 25 },
       { driverId: 'd5', points: 10 }, { driverId: 'd4', points: 2 }, { driverId: 'd6', points: 0 }],
      driverTeam,
    )
    expect(rows.map(r => [r.teamId, r.points])).toEqual([['a', 55], ['b', 52], ['c', 10]])
  })

  it('breaks a points tie by the best-placed driver', () => {
    const rows = constructorsTable(
      [{ driverId: 'd3', points: 20 }, { driverId: 'd1', points: 15 }, { driverId: 'd2', points: 10 },
       { driverId: 'd4', points: 5 }, { driverId: 'd5', points: 0 }, { driverId: 'd6', points: 0 }],
      driverTeam,
    )
    // a and b both 25; b's driver is P1.
    expect(rows.map(r => r.teamId).slice(0, 2)).toEqual(['b', 'a'])
  })

  it('lists a team with no classified drivers last rather than dropping it', () => {
    const rows = constructorsTable([{ driverId: 'd1', points: 5 }], driverTeam)
    expect(rows.map(r => r.teamId)).toEqual(['a', 'b', 'c'])
  })
})

describe('deservedOrder', () => {
  it('orders by rating, then base rating, then id', () => {
    expect(deservedOrder({ a: 90, b: 92, c: 90, d: 90 }, { a: 85, b: 80, c: 88, d: 85 }))
      .toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('settleTeamTiers', () => {
  const move = (finished: string[], deserved: string[], tiers: Record<string, number> = {}) =>
    settleTeamTiers(finished, deserved, tiers, T)

  it('steps up exactly at the threshold, holds just below it', () => {
    const r = move(['a', 'b', 'e', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'])
    expect(r.tiers.e).toBe(1)   // deserved 5, finished 3: delta +2
    expect(r.tiers.c).toBe(0)   // deserved 3, finished 4: delta -1
    expect(r.tiers.d).toBe(0)   // deserved 4, finished 5: delta -1
  })

  it('steps down exactly at the threshold', () => {
    const r = move(['b', 'c', 'a', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'])
    expect(r.tiers.a).toBe(-1)  // deserved 1, finished 3: delta -2
    expect(r.tiers.b).toBe(0)   // deserved 2, finished 1: delta +1
  })

  it('clamps at max and min', () => {
    const r = move(['e', 'b', 'c', 'd', 'a'], ['a', 'b', 'c', 'd', 'e'], { e: 3, a: -3 })
    expect(r.tiers.e).toBe(3)
    expect(r.tiers.a).toBe(-3)
  })

  it('treats a missing offset as 0 and records every team', () => {
    const r = move(ids, ids)
    expect(r.tiers).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0 })
    expect(r.moves).toHaveLength(5)
  })

  it('reports before, after, deserved and finished per team', () => {
    const r = move(['a', 'b', 'e', 'c', 'd'], ids, { e: 1 })
    expect(r.moves.find(m => m.teamId === 'e')).toEqual({ teamId: 'e', deserved: 5, finished: 3, before: 1, after: 2 })
  })

  it('applies ONE rule to every team -- there is no player in it', () => {
    // Rotate the same over-performance through every team: each one, in
    // turn, gets the same verdict. The function has no player parameter, and
    // this pins that no team id is special-cased inside it.
    for (let i = 0; i < ids.length; i++) {
      const deserved = [...ids.slice(i), ...ids.slice(0, i)]
      const winner = deserved[deserved.length - 1]!
      const finished = [winner, ...deserved.slice(0, -1)]
      expect(move(finished, deserved).tiers[winner], winner).toBe(1)
    }
  })

  it('is deterministic and does not mutate its inputs', () => {
    const tiers = { a: 1 }
    const finished = ['b', 'a', 'c', 'd', 'e']
    const a = move(finished, ids, tiers)
    const b = move(finished, ids, tiers)
    expect(a).toEqual(b)
    expect(tiers).toEqual({ a: 1 })
    expect(finished).toEqual(['b', 'a', 'c', 'd', 'e'])
  })
})

describe('the ladder over a long career', () => {
  /*
   * Spec §3 and §8. Simulated in Python before this plan was written: over
   * 200 ten-season careers the sum of offsets never strayed more than 7 from
   * zero, every career still had moves in seasons 6-10, and the rating spread
   * never fell below 5.6. The bounds below leave margin around those.
   */
  const teams = loadGameData().cars.teams
  const base = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))

  for (const seed of [1, 7, 42, 99, 1234]) {
    it(`stays conserved, spread and alive (seed ${seed})`, () => {
      const rng = createRng(seed)
      let tiers: Record<string, number> = {}
      let lateMoves = 0
      for (let season = 1; season <= 10; season++) {
        const rating = Object.fromEntries(teams.map(t =>
          [t.id, base[t.id]! + (tiers[t.id] ?? 0) * T.step * T.facets.length / 5]))
        const deserved = deservedOrder(rating, base)
        const noisy = Object.fromEntries(teams.map(t => [t.id, rating[t.id]! + gaussianPair(rng)[0] * 2]))
        const finished = [...teams.map(t => t.id)].sort((x, y) => noisy[y]! - noisy[x]!)
        const r = settleTeamTiers(finished, deserved, tiers, T)
        if (season > 5) lateMoves += r.moves.filter(m => m.after !== m.before).length
        tiers = r.tiers

        const sum = Object.values(tiers).reduce((s, n) => s + n, 0)
        expect(Math.abs(sum), `season ${season} offset sum`).toBeLessThanOrEqual(10)
        const eff = teams.map(t => base[t.id]! + (tiers[t.id] ?? 0) * T.step * T.facets.length / 5)
        expect(Math.max(...eff) - Math.min(...eff), `season ${season} spread`).toBeGreaterThanOrEqual(4)
      }
      expect(lateMoves, 'the ladder froze').toBeGreaterThan(0)
    })
  }
})
