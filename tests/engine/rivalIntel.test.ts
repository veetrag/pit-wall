import { describe, it, expect } from 'vitest'
import { rivalIntel, intelOffset } from '@engine/rivalIntel'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, CarState, RaceState, CircuitSpec, CompoundSpec, StrategyBrain, WeatherState } from '@engine/types'

const TUNING = makeDeterministicTuning({ rivalIntel: { halfWidth: { naive: 2, smart: 3, optimal: 5 }, maxOffsetLaps: 1 } })
const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10,  colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07,  colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
}
const CIRCUIT: CircuitSpec = {
  name: 'Intel', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}
// tyreManagement 80 -> effective age = 0.8 x tyreAge on neutral pace in the dry.
const config: RaceConfig = {
  circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
  drivers: [{ id: 'd1', name: 'D1', code: 'DRV', teamId: 't1', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
  teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } }],
  strategies: [], playerDriverId: 'other', seed: 1,
}
function car(brain: StrategyBrain, o: Partial<CarState> = {}, stopLap = 20): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 4, raceTime: 0, lap: 10, sector: 0, compound: 'H', tyreAge: 10,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: 't1', startCompound: 'H', plannedStops: [{ lap: stopLap, compound: 'M' }], brain },
    isPlayer: false, tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['H'], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null, ...o,
  }
}
function state(c: CarState): RaceState {
  return {
    lap: c.lap, sector: 0, totalLaps: 30, cars: [c], sectorResults: [], overtakeEvents: [], safetyCar: null,
    incidents: [], trackEvolutionLaps: c.lap, rngState: 1,
    weatherTimeline: Array(30).fill('DRY') as WeatherState[], weatherState: 'DRY',
  }
}
const off = intelOffset('d1', 1)

describe('intelOffset', () => {
  it('is stable for an id, bounded, and not the same for every car', () => {
    const ids = loadGameData().drivers.drivers.map(d => d.id)
    for (const id of ids) {
      expect(intelOffset(id, 1)).toBe(intelOffset(id, 1))
      expect(Math.abs(intelOffset(id, 1))).toBeLessThanOrEqual(1)
    }
    expect(new Set(ids.map(id => intelOffset(id, 1))).size).toBeGreaterThan(1)
    expect(intelOffset('d1', 0)).toBe(0)
  })
})

describe('rivalIntel window', () => {
  it('centres on the planned stop when it comes before the cliff', () => {
    // H, age 10 at lap 10: eff 8, smart cliff threshold 0.90 x 24 = 21.6 -> 17 laps -> lap 27. Plan (20) is earlier.
    const i = rivalIntel(config, state(car('smart')), 'd1')
    expect(i).toEqual({ driverId: 'd1', compound: 'H', tyreAge: 10, stops: 0, status: 'window', from: 20 + off - 3, to: 20 + off + 3 })
  })

  it('centres on the projected cliff when it comes before the planned stop', () => {
    // S, age 4 at lap 10: eff 3.2, threshold 0.90 x 10 = 9 -> 7.25 -> 8 laps -> lap 18. Plan (25) is later.
    const i = rivalIntel(config, state(car('smart', { compound: 'S', tyreAge: 4 }, 25)), 'd1')
    expect(i?.status).toBe('window')
    if (i?.status !== 'window') return
    expect([i.from, i.to]).toEqual([18 + off - 3, 18 + off + 3])
  })

  it('half-width by brain: naive 2, smart 3, optimal 5 (the brain is never named, only the width differs)', () => {
    for (const [brain, hw] of [['naive', 2], ['smart', 3], ['optimal', 5]] as const) {
      const i = rivalIntel(config, state(car(brain, { lap: 5, tyreAge: 0 })), 'd1')
      expect(i?.status, brain).toBe('window')
      if (i?.status !== 'window') continue
      expect(i.to - i.from, brain).toBe(2 * hw)
    }
  })

  it('RUNNING TO THE FLAG once the plan is complete', () => {
    expect(rivalIntel(config, state(car('smart', { pitsDone: 1 })), 'd1')?.status).toBe('flag')
  })

  it('OUT for a retired car', () => {
    expect(rivalIntel(config, state(car('smart', { retired: true, retiredLap: 8, retiredCause: 'mechanical' })), 'd1')?.status).toBe('out')
  })

  it('clamps to the race: never before the current lap, never past the flag', () => {
    const late = rivalIntel(config, state(car('optimal', { lap: 27, tyreAge: 0 }, 30)), 'd1')
    expect(late?.status).toBe('window')
    if (late?.status === 'window') {
      expect(late.from).toBeGreaterThanOrEqual(28)
      expect(late.to).toBe(30)
      expect(late.from).toBeLessThanOrEqual(late.to)
    }
    const overdue = rivalIntel(config, state(car('naive', { lap: 15, tyreAge: 0 }, 5)), 'd1')
    expect(overdue?.status).toBe('window')
    if (overdue?.status === 'window') expect(overdue.from).toBe(16)
  })

  it('null for an unknown car', () => {
    expect(rivalIntel(config, state(car('smart')), 'nobody')).toBeNull()
  })
})

// Final review fix 2: an empty plan is not a promise to run to the flag.
// strategy.ts still boxes smart/optimal brains at PIT_CLIFF_THRESHOLD with more
// than 3 laps left, and naive brains at the emergency threshold with no guard.
describe('rivalIntel with no planned stop left', () => {
  const noPlan = (brain: StrategyBrain, o: Partial<CarState>) =>
    car(brain, { ...o, strategy: { teamId: 't1', startCompound: 'H', plannedStops: [], brain } })

  it('a worn smart car shows a window around its projected cliff', () => {
    // S, age 10 at lap 10: eff 8, threshold 0.90 x 10 = 9 -> 1.25 -> 2 laps -> lap 12.
    const i = rivalIntel(config, state(noPlan('smart', { compound: 'S', tyreAge: 10 })), 'd1')
    expect(i?.status).toBe('window')
    if (i?.status !== 'window') return
    expect([i.from, i.to]).toEqual([Math.max(11, 12 + off - 3), 12 + off + 3])
  })

  it('fresh tyres late in the race: RUNNING TO THE FLAG', () => {
    // H, age 0 at lap 20: 21.6 / 0.8 = 27 laps -> lap 47, far past the flag.
    expect(rivalIntel(config, state(noPlan('smart', { lap: 20, tyreAge: 0 })), 'd1')?.status).toBe('flag')
  })

  it('the cliff must land before totalLaps - 3, as strategy.ts requires', () => {
    // S, age 0: threshold 9 / 0.8 = 11.25 -> 12 laps. Lap 14 -> 26 (boxes), lap 15 -> 27 (does not).
    expect(rivalIntel(config, state(noPlan('optimal', { compound: 'S', lap: 14, tyreAge: 0 })), 'd1')?.status).toBe('window')
    expect(rivalIntel(config, state(noPlan('optimal', { compound: 'S', lap: 15, tyreAge: 0 })), 'd1')?.status).toBe('flag')
  })

  it('a naive car boxes only at the emergency threshold, so its window sits there', () => {
    // S, age 10 at lap 10: eff 8, emergency 1.5 x 10 = 15 -> 8.75 -> 9 laps -> lap 19.
    const worn = rivalIntel(config, state(noPlan('naive', { compound: 'S', tyreAge: 10 })), 'd1')
    expect(worn?.status).toBe('window')
    if (worn?.status === 'window') expect([worn.from, worn.to]).toEqual([19 + off - 2, 19 + off + 2])
    // H, age 10 at lap 10: 1.5 x 24 = 36 -> 35 laps -> lap 45, past the flag.
    expect(rivalIntel(config, state(noPlan('naive', {})), 'd1')?.status).toBe('flag')
  })
})

describe('rivalIntel is stable within a lap', () => {
  it('the same answer at sectors 0, 1 and 2 of a lap, for every car', () => {
    const DATA = loadGameData()
    const real: RaceConfig = {
      circuit: DATA.circuits['bengaluru']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
      drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
      strategies: DATA.strategies.defaults.map(s => ({ ...s, brain: s.brain ?? 'naive' })),
      playerDriverId: '__none__', seed: 3,
    }
    let s = initRace(real)
    const rng = createRng(3)
    for (let k = 0; k < 30; k++) s = stepSector(real, s, rng)   // lap 10, sector 0
    const at = (st: RaceState) => st.cars.map(c => rivalIntel(real, st, c.driverId)).sort((x, y) => (x?.driverId ?? '').localeCompare(y?.driverId ?? ''))
    const s0 = at(s)
    const s1 = stepSector(real, s, rng)
    const s2 = stepSector(real, s1, rng)
    expect(at(s1)).toEqual(s0)
    expect(at(s2)).toEqual(s0)
  })
})
