import { describe, it, expect } from 'vitest'
import { whatIf, playerStops, whatIfLapRange, addStopLapRange } from '@engine/debrief'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig } from '@engine/types'

/** A 20-lap, incident-free race so every test is quick and the player always finishes. */
function shortRace(plannedStops: { lap: number; compound: 'S' | 'M' | 'H' }[], seed = 4243): RaceConfig {
  const base = buildRaceConfig(seed, 'd_voss', 'bengaluru', 'rookie', { startCompound: 'M', plannedStops }, null, undefined, true)
  return { ...base, tuning: makeDeterministicTuning(), lapsOverride: 20 }
}
const FUTURES = makeDeterministicTuning().debrief.futures

describe('playerStops', () => {
  it('lists a plan stop at its planned lap with the fitted compound', () => {
    const cfg = shortRace([{ lap: 10, compound: 'H' }])
    expect(playerStops(cfg, cfg.seed, [])).toEqual([{ lap: 10, compound: 'H', source: { kind: 'plan', index: 0 }, step: 30 }])
  })
  it('lists a pit call at state.lap + 1 (the judge convention)', () => {
    const cfg = shortRace([])
    const stops = playerStops(cfg, cfg.seed, [{ step: 24, kind: 'pit', compound: 'S' }])
    expect(stops).toEqual([{ lap: 9, compound: 'S', source: { kind: 'call', index: 0 }, step: 24 }])
  })
})

describe('whatIf (spec 1.6 §5)', () => {
  const cfg = shortRace([{ lap: 10, compound: 'H' }])

  it('returns one finish per future for both plans', () => {
    const r = whatIf(cfg, cfg.seed, [], { kind: 'stop', stop: 0, lap: 7, compound: 'H' })
    expect(r.mine).toHaveLength(FUTURES)
    expect(r.theirs).toHaveLength(FUTURES)
    for (const p of [...r.mine, ...r.theirs]) expect(p).toBeGreaterThanOrEqual(1)
  })

  it('COMMON RANDOM NUMBERS: an unchanged plan reproduces mine exactly', () => {
    const same = whatIf(cfg, cfg.seed, [], { kind: 'stop', stop: 0, lap: 10, compound: 'H' })
    expect(same.theirs).toEqual(same.mine)
  })

  it('is deterministic', () => {
    const e = { kind: 'stop', stop: 0, lap: 13, compound: 'S' } as const
    expect(whatIf(cfg, cfg.seed, [], e)).toEqual(whatIf(cfg, cfg.seed, [], e))
  })

  it('clamps a lap beyond the range to its edge', () => {
    const far = whatIf(cfg, cfg.seed, [], { kind: 'stop', stop: 0, lap: 99, compound: 'H' })
    const edge = whatIf(cfg, cfg.seed, [], { kind: 'stop', stop: 0, lap: 19, compound: 'H' })
    expect(far).toEqual(edge)
  })

  it('a moved pit call is a moved call', () => {
    const noPlan = shortRace([])
    const calls = [{ step: 24, kind: 'pit' as const, compound: 'H' as const }]
    const same = whatIf(noPlan, noPlan.seed, calls, { kind: 'stop', stop: 0, lap: 9, compound: 'H' })
    expect(same.theirs).toEqual(same.mine)
    expect(whatIf(noPlan, noPlan.seed, calls, { kind: 'stop', stop: 0, lap: 5, compound: 'S' }).theirs).toHaveLength(FUTURES)
  })

  it('adds a stop only to a race without one', () => {
    const noStop = shortRace([])
    expect(whatIf(noStop, noStop.seed, [], { kind: 'add', lap: 10, compound: 'H' }).theirs).toHaveLength(FUTURES)
    expect(() => whatIf(cfg, cfg.seed, [], { kind: 'add', lap: 10, compound: 'H' })).toThrow(RangeError)
    expect(() => whatIf(cfg, cfg.seed, [], { kind: 'stop', stop: 3, lap: 10, compound: 'H' })).toThrow(RangeError)
  })
})

describe('lap ranges', () => {
  const stops = [
    { lap: 12, compound: 'M' as const, source: { kind: 'plan' as const, index: 0 }, step: 36 },
    { lap: 30, compound: 'H' as const, source: { kind: 'plan' as const, index: 1 }, step: 90 },
  ]
  it('±10 laps, never across a neighbouring stop, never off the race', () => {
    expect(whatIfLapRange(stops, 0, 56, 10)).toEqual([2, 22])
    expect(whatIfLapRange(stops, 1, 56, 10)).toEqual([20, 40])
    expect(whatIfLapRange([{ ...stops[0]!, lap: 5 }], 0, 12, 10)).toEqual([1, 11])
    expect(whatIfLapRange([stops[0]!, { ...stops[1]!, lap: 14 }], 0, 56, 10)).toEqual([2, 13])
  })
  it('add-a-stop spans the race', () => { expect(addStopLapRange(56)).toEqual([2, 55]) })
})

describe('whatIf with calls of every kind', () => {
  it('replays pace and no-op restart_tyre calls; an unchanged edit still reproduces mine', () => {
    const cfg = shortRace([{ lap: 10, compound: 'H' }])
    const calls = [
      { step: 3, kind: 'pace' as const, mode: 'push' as const },
      { step: 6, kind: 'restart_tyre' as const, compound: 'S' as const },
      { step: 15, kind: 'pit' as const, compound: 'S' as const },
    ]
    const stops = playerStops(cfg, cfg.seed, calls)
    expect(stops.map(s => s.source.kind)).toEqual(['call']) // an early pit call consumes the planned stop
    const same = whatIf(cfg, cfg.seed, calls, { kind: 'stop', stop: 0, lap: stops[0]!.lap, compound: stops[0]!.compound })
    expect(same.theirs).toEqual(same.mine)
  })
})
