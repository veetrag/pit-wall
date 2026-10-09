import { describe, it, expect } from 'vitest'
import { judgeCalls, pickBetter, futureSeed, replay, simulate } from '@engine/debrief'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig } from '@engine/types'

const o = (positions: number[]) => ({ positions, meanPosition: positions.reduce((a, b) => a + b, 0) / positions.length })

describe('pickBetter', () => {
  const actual = o([6, 6, 6, 6, 6, 6])
  it('reports an alternative a full place better in at least two-thirds of futures', () => {
    const r = pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 5, 6, 4]) }], 1.0, 0.67)
    expect(r?.meanPosition).toBe(5)
    expect(r?.betterShare).toBeCloseTo(5 / 6)
  })
  it('rejects one under minGain', () => {
    expect(pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 6, 6, 6]) }], 1.0, 0.67)).toBeNull()
  })
  it('rejects one better on average but in too few futures', () => {
    // mean 4.67 (gain 1.33) but better in only 2/6
    expect(pickBetter(actual, [{ alternative: { kind: 'pace-none' }, outcome: o([1, 1, 7, 7, 6, 6]) }], 1.0, 0.67)).toBeNull()
  })
  it('picks the best of several qualifying alternatives', () => {
    const r = pickBetter(actual, [
      { alternative: { kind: 'pace-none' }, outcome: o([5, 5, 5, 5, 5, 5]) },
      { alternative: { kind: 'pit', lap: 20, compound: 'M' }, outcome: o([3, 3, 3, 3, 3, 3]) },
    ], 1.0, 0.67)
    expect(r?.alternative).toEqual({ kind: 'pit', lap: 20, compound: 'M' })
  })
})

describe('futureSeed', () => {
  it('is deterministic and distinct across k', () => {
    expect(futureSeed(42, 30, 1)).toBe(futureSeed(42, 30, 1))
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(k => futureSeed(42, 30, k))).size).toBe(8)
  })
})

describe('judgeCalls', () => {
  const plan = { startCompound: 'M' as const, plannedStops: [{ lap: 24, compound: 'H' as const }] }
  const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', plan, null, undefined, true)

  it('judges the start, the plan stop and each logged call', () => {
    const calls = [{ step: 90, kind: 'pace' as const, mode: 'push' as const }]
    const r = judgeCalls(config, 4242, calls)
    const kinds = r.verdicts.map(v => v.call.kind).sort()
    expect(kinds).toEqual(['pace', 'plan', 'start'])
    expect(r.futures).toBe(config.tuning.debrief.futures)
    for (const v of r.verdicts) expect(v.actual.positions).toHaveLength(r.futures)
  })

  it('is deterministic', () => {
    expect(judgeCalls(config, 4242, [])).toEqual(judgeCalls(config, 4242, []))
  })

  it('reports progress up to its total', () => {
    const seen: [number, number][] = []
    judgeCalls(config, 4242, [], (d, t) => seen.push([d, t]))
    const last = seen[seen.length - 1]!
    expect(last[0]).toBe(last[1])
    expect(last[1]).toBeGreaterThan(0)
  })

  it('finds the earlier stop that avoids a certain tyre failure', () => {
    // Make failure certain once past the cliff threshold, then find the
    // first planned-stop lap at which the player's Mediums fail. Stopping
    // three laps earlier must then avoid it -- and the debrief must say so.
    const certain = (c: RaceConfig): RaceConfig => ({
      ...c, circuit: { ...c.circuit, laps: 30 }, tuning: { ...c.tuning, tyreFailure: { ...c.tuning.tyreFailure, chancePerLapOverThreshold: 1e6, maxChancePerLap: 3 } },
    })
    let failing: RaceConfig | null = null
    let failLap = 0
    for (let lap = 8; lap < 50 && !failing; lap++) {
      const c = certain(buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
        { startCompound: 'S', plannedStops: [{ lap, compound: 'H' }] }, null, undefined, true))
      const p = replay(c, 4242, []).state.cars.find(x => x.isPlayer)!
      if (p.retired && p.retiredCause === 'tyre') { failing = c; failLap = lap }
    }
    expect(failing, 'some planned lap must fail').not.toBeNull()
    const r = judgeCalls(failing!, 4242, [])
    expect(r.retired?.cause).toBe('tyre')
    const planVerdict = r.verdicts.find(v => v.call.kind === 'plan')!
    expect(planVerdict.better).not.toBeNull()
    const alt = planVerdict.better!.alternative
    expect(alt.kind).toBe('plan')
    expect(alt.kind === 'plan' && alt.lap < failLap + 1).toBe(true)
  })
})

describe('replay to a branch', () => {
  it('replaying to step N then simulating the rest with the same rng equals a full replay', () => {
    const plan = { startCompound: 'M' as const, plannedStops: [{ lap: 24, compound: 'H' as const }] }
    const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie', plan, null, undefined, true)
    const calls = [
      { step: 45, kind: 'pace' as const, mode: 'push' as const },
      { step: 60, kind: 'pace' as const, mode: 'neutral' as const },
    ]
    const full = replay(config, 4242, calls)
    for (const n of [0, 45, 50, 60]) {
      const past = replay(config, 4242, calls, n)
      expect(past.step).toBe(n)
      const rest = simulate(config, { state: past.state, step: past.step }, past.rng, calls)
      expect(rest).toEqual({ state: full.state, step: full.step })
    }
  })
})
