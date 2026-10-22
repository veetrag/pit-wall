import { describe, it, expect } from 'vitest'
import { whatIf, whatIfInputs, playerStops, whatIfLapRange, addStopLapRange } from '@engine/debrief'
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

describe('whatIf executes the edit (fix round 1)', () => {
  /** The stops a replay of the edited inputs actually makes. */
  const ranStops = (cfg: RaceConfig, calls: Parameters<typeof whatIf>[2], edit: Parameters<typeof whatIf>[3]) => {
    const ed = whatIfInputs(cfg, cfg.seed, calls, edit)
    return playerStops(ed.config, cfg.seed, ed.calls)
  }

  it('a plan-stop edit pits on the edited lap with the edited compound', () => {
    const cfg = shortRace([{ lap: 10, compound: 'H' }])
    const [s] = ranStops(cfg, [], { kind: 'stop', stop: 0, lap: 7, compound: 'S' })
    expect(s).toMatchObject({ lap: 7, compound: 'S', step: 21, source: { kind: 'plan' } })
  })

  it('a pit-call edit pits on the edited lap with the edited compound', () => {
    const cfg = shortRace([])
    const calls = [{ step: 24, kind: 'pit' as const, compound: 'H' as const }]
    const [s] = ranStops(cfg, calls, { kind: 'stop', stop: 0, lap: 5, compound: 'S' })
    expect(s).toMatchObject({ lap: 5, compound: 'S', step: 12, source: { kind: 'call' } })
  })

  it('an early PIT call plus a later plan stop: editing the plan stop moves it', () => {
    const cfg = shortRace([{ lap: 6, compound: 'M' }, { lap: 14, compound: 'H' }])
    const calls = [{ step: 6, kind: 'pit' as const, compound: 'M' as const }]
    const real = playerStops(cfg, cfg.seed, calls)
    expect(real.map(s => [s.source.kind, s.lap])).toEqual([['call', 3], ['plan', 14]])
    const ran = ranStops(cfg, calls, { kind: 'stop', stop: 1, lap: 16, compound: 'S' })
    expect(ran.map(s => [s.source.kind, s.lap, s.compound])).toEqual([['call', 3, 'M'], ['plan', 16, 'S']])
    expect(whatIf(cfg, cfg.seed, calls, { kind: 'stop', stop: 1, lap: 16, compound: 'S' }).theirs).toHaveLength(FUTURES)
  })

  it('rejects a compound with no sets left at the branch', () => {
    const cfg = shortRace([{ lap: 10, compound: 'H' }])
    const noWets = { ...cfg, tyreAllocationBase: { S: 3, M: 3, H: 3, I: 2, W: 0 } }
    expect(() => whatIf(noWets, noWets.seed, [], { kind: 'stop', stop: 0, lap: 10, compound: 'W' })).toThrow(RangeError)
  })
})

describe('whatIfLapRange edges (fix round 1)', () => {
  const at = (lap: number, index: number) => ({ lap, compound: 'M' as const, source: { kind: 'plan' as const, index }, step: 3 * lap })
  it('a final-lap stop keeps its own lap in range', () => {
    expect(whatIfLapRange([at(20, 0)], 0, 20, 10)).toEqual([10, 20])
  })
  it('hemmed in by adjacent neighbours, the range is the stop itself', () => {
    expect(whatIfLapRange([at(5, 0), at(6, 1), at(7, 2)], 1, 20, 10)).toEqual([6, 6])
    // lo > hi: a neighbour on the same lap (a call and a plan stop) -- stay put, never invert
    expect(whatIfLapRange([at(5, 0), at(5, 1), at(6, 2)], 1, 20, 10)).toEqual([5, 5])
  })
})

describe('red-flag and sprint races (final review 1.6)', () => {
  it('a red-flag restart that consumes the plan is not listed as an editable stop', async () => {
    const { makeConfig } = await import('../fixtures/raceHarness')
    const CRASH = {
      incidents: {
        driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
        safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
        vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
        redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
      },
      mechanicalFailure: { baseChancePerLap: 0 },
      tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
    }
    const base = makeConfig(CRASH as Parameters<typeof makeConfig>[0], 9)
    const player = base.drivers[0]!
    const cfg: RaceConfig = {
      ...base, lapsOverride: 20, allDry: true,
      drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })),
      playerDriverId: player.id,
      playerStrategyOverride: { teamId: player.teamId, startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] },
    }
    const { replay } = await import('@engine/debrief')
    const final = replay(cfg, cfg.seed, []).state
    expect(final.incidents.some(e => e.kind === 'red_flag_restart'), 'premise: a restart').toBe(true)
    expect(final.cars.find(c => c.isPlayer)!.pitsDone, 'premise: the restart consumed the plan').toBe(1)
    const stops = playerStops(cfg, cfg.seed, [])
    expect(stops).toEqual([])
    // With no real stop, the what-if offers "add", and it runs.
    expect(whatIf(cfg, cfg.seed, [], { kind: 'add', lap: 15, compound: 'S' }).theirs).toHaveLength(FUTURES)
  })

  it('a sprint: a pit call is the only stop, and what-if moves it', () => {
    const base = buildRaceConfig(4243, 'd_voss', 'bengaluru', 'rookie', { startCompound: 'M', plannedStops: [] }, null, undefined, true, true)
    const cfg = { ...base, tuning: makeDeterministicTuning() }
    expect(cfg.lapsOverride).toBeDefined()
    const calls = [{ step: 9, kind: 'pit' as const, compound: 'S' as const }]
    expect(playerStops(cfg, cfg.seed, calls)).toEqual([{ lap: 4, compound: 'S', source: { kind: 'call', index: 0 }, step: 9 }])
    const same = whatIf(cfg, cfg.seed, calls, { kind: 'stop', stop: 0, lap: 4, compound: 'S' })
    expect(same.theirs).toEqual(same.mine)
    expect(whatIf(cfg, cfg.seed, calls, { kind: 'stop', stop: 0, lap: 6, compound: 'H' }).theirs).toHaveLength(FUTURES)
  })
})
