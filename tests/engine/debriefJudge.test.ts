import { describe, it, expect } from 'vitest'
import { judgeCalls, pickBetter, futureSeed, replay, simulate } from '@engine/debrief'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig } from '@engine/types'
import { WINGS, expectedLapDelta, wingOf, type Wing } from '@engine/setup'

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
    // Seed 4243: the player finishes. (4242 crashes on lap 10, before the
    // planned stop, and a stop never reached after a crash is not judged.)
    const finishing = buildRaceConfig(4243, 'd_voss', 'bengaluru', 'rookie', plan, null, undefined, true)
    const calls = [{ step: 90, kind: 'pace' as const, mode: 'push' as const }]
    const r = judgeCalls(finishing, 4243, calls)
    const kinds = r.verdicts.map(v => v.call.kind).sort()
    expect(kinds).toEqual(['pace', 'plan', 'start'])
    expect(r.futures).toBe(finishing.tuning.debrief.futures)
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
  it('reports the real finishing position', () => {
    const st = replay(config, 4242, []).state
    const real = st.cars.find(x => x.isPlayer)!
    expect(judgeCalls(config, 4242, []).finish).toBe(real.retired ? st.cars.length + 1 : real.position)
  })

  it('does not judge a planned stop the car never reached because it crashed', () => {
    // A crash is certain on the first error roll; find a seed where it
    // happens before the planned lap-24 stop.
    for (let seed = 1; seed < 200; seed++) {
      const c = buildRaceConfig(seed, 'd_voss', 'bengaluru', 'rookie', plan, null, undefined, true)
      const crashy: RaceConfig = { ...c, tuning: { ...c.tuning,
        incidents: { ...c.tuning.incidents, driverErrorPerLap: 0.2, terminalFraction: 1 } } }
      const st = replay(crashy, seed, []).state
      const p = st.cars.find(x => x.isPlayer)!
      if (!(p.retired && p.retiredCause === 'crash' && p.pitsDone === 0)) continue
      const r = judgeCalls(crashy, seed, [])
      expect(r.retired?.cause).toBe('crash')
      expect(r.finish).toBe(st.cars.length + 1)
      expect(r.verdicts.map(v => v.call.kind)).toEqual(['start'])
      return
    }
    throw new Error('no seed crashed before the planned stop')
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

const SCALE = 10
describe('judging the wing', () => {
  const plan = { startCompound: 'M' as const, plannedStops: [{ lap: 12, compound: 'H' as const }] }
  const short = (c: RaceConfig): RaceConfig => ({ ...c, circuit: { ...c.circuit, laps: 30 } })
  const withWing = (seed: number, wing?: Wing) =>
    short(buildRaceConfig(seed, 'd_voss', 'bengaluru', 'rookie', { ...plan, ...(wing ? { wing } : {}) }, null, undefined, true))

  it('judges the wing when the player set one, and not otherwise', () => {
    const r = judgeCalls(withWing(4243, 3), 4243, [])
    expect(r.verdicts.map(v => v.call.kind)).toContain('wing')
    expect(r.verdicts.find(v => v.call.kind === 'wing')!.call).toEqual({ kind: 'wing', wing: 3 })
    const none = judgeCalls(withWing(4243), 4243, [])
    expect(none.verdicts.map(v => v.call.kind)).not.toContain('wing')
  })

  it('branches at lap 0 on the same futures as the start', () => {
    const r = judgeCalls(withWing(4243, 3), 4243, [])
    const w = r.verdicts.find(v => v.call.kind === 'wing')!
    const s = r.verdicts.find(v => v.call.kind === 'start')!
    expect(w.actual.positions).toEqual(s.actual.positions)
  })

  it('says a decisively wrong wing cost places', () => {
    const base = withWing(4243, 3)
    // Gains scaled so the wrong wing is decisive (see report for the factor).
    const k = SCALE
    const t = base.tuning
    const tuning = { ...t, setup: { ...t.setup, speedGain: t.setup.speedGain * k, gripGain: t.setup.gripGain * k, balanceCost: t.setup.balanceCost * k } }
    const worst = WINGS.reduce((b, w) =>
      expectedLapDelta(base.circuit, tuning, w, 0) > expectedLapDelta(base.circuit, tuning, b, 0) ? w : b)
    const config: RaceConfig = { ...base, tuning, setups: { ...base.setups, [base.playerDriverId]: worst } }
    expect(wingOf(config, config.playerDriverId)).toBe(worst)
    const v = judgeCalls(config, 4243, []).verdicts.find(x => x.call.kind === 'wing')!
    expect(v.better).not.toBeNull()
    expect(v.better!.alternative.kind).toBe('wing')
    expect(v.better!.alternative.kind === 'wing' && v.better!.alternative.wing).not.toBe(worst)
  })

  it('times a 56-lap judge with plan and wing (log only)', () => {
    const c = buildRaceConfig(4243, 'd_voss', 'bengaluru', 'rookie', { ...plan, wing: 3 }, null, undefined, true)
    const t0 = performance.now()
    judgeCalls(c, 4243, [])
    console.log(`judgeCalls ${c.circuit.laps} laps: ${(performance.now() - t0).toFixed(0)} ms`)
  })
})
