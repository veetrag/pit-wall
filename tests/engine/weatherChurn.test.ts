import { describe, it, expect } from 'vitest'
import { aiDecision } from '@engine/strategy'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type {
  RaceConfig, CarState, RaceState, TuningConstants, CircuitSpec, CompoundSpec, StrategyBrain, WeatherState, Compound,
} from '@engine/types'

const SHIPPED_AI = { weatherConfirmLaps: 2, weatherMinLapsLeft: 3 }
const tuningWith = (ai: Partial<TuningConstants['ai']>) => makeDeterministicTuning({ ai })

const COMPOUNDS: Record<Compound, CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10,  colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07,  colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
  I: { name: 'Inter',  type: 'wet', offset:  0.0, lin: 0.018, cliff: 30, pen: 0.015, colorToken: '--tyre-inter', optimalState: 'DAMP' },
  W: { name: 'Wet',    type: 'wet', offset:  1.0, lin: 0.012, cliff: 40, pen: 0.010, colorToken: '--tyre-wet', optimalState: 'WET' },
}
const CIRCUIT: CircuitSpec = {
  name: 'Strat', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

function makeConfig(tuning: TuningConstants, brain: StrategyBrain = 'smart', plannedStops = [{ lap: 25, compound: 'M' as Compound }]): RaceConfig {
  return {
    circuit: CIRCUIT, tuning, compounds: COMPOUNDS,
    drivers: [{ id: 'd1', name: 'D1', code: 'DRV', teamId: 't1', facets: { pace: 70, racecraft: 85, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
    teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 77.8, aero: 77.8, handling: 77.8, reliability: 99, pitCrew: 80 } }],
    strategies: [{ teamId: 't1', startCompound: 'H', plannedStops, brain }],
    playerDriverId: 'other', seed: 1,
  }
}

function car(compound: Compound, lap: number): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 900, lap, sector: 0, compound, tyreAge: 2,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: 't1', startCompound: 'H', plannedStops: [{ lap: 25, compound: 'M' }], brain: 'smart' },
    isPlayer: false, tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: [compound], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null,
  }
}

/**
 * The AI's view at the boundary that starts lap `lap`: `weatherState` is the
 * lap just completed (lap - 1); `past` fills timeline[lap-1-past.length ..
 * lap-2]; `future` fills timeline[lap ..] and must never matter.
 */
function view(c: CarState, lap: number, justCompleted: WeatherState, past: WeatherState[], future: WeatherState = 'DRY'): RaceState {
  const tl: WeatherState[] = Array(30).fill('DRY')
  past.forEach((w, i) => { tl[lap - 1 - past.length + i] = w })
  tl[lap - 1] = justCompleted
  for (let i = lap; i < 30; i++) tl[i] = future
  return {
    lap, sector: 0, totalLaps: 30, cars: [c], sectorResults: [], overtakeEvents: [],
    safetyCar: null, incidents: [], trackEvolutionLaps: lap, rngState: 1,
    weatherTimeline: tl, weatherState: justCompleted,
  }
}

const decide = (tuning: TuningConstants, c: CarState, s: RaceState) => aiDecision(makeConfig(tuning), c, s, createRng(1))

describe('confirmed weather stops (spec 1.6 §0.1)', () => {
  const T = tuningWith(SHIPPED_AI)

  it('ONE DAMP LAP DOES NOT BOX A CAR ON SLICKS', () => {
    expect(decide(T, car('H', 10), view(car('H', 10), 10, 'DAMP', ['DRY'])).pit).toBe(false)
  })

  it('two consecutive non-dry laps do: inters on a damp track, wets on a wet one', () => {
    expect(decide(T, car('H', 10), view(car('H', 10), 10, 'DAMP', ['DAMP']))).toEqual({ pit: true, compound: 'I', paceMode: 'neutral' })
    expect(decide(T, car('H', 10), view(car('H', 10), 10, 'DAMP', ['WET']))).toEqual({ pit: true, compound: 'I', paceMode: 'neutral' })
  })

  it('a WET track boxes a car on slicks at once, unconfirmed', () => {
    expect(decide(T, car('H', 10), view(car('H', 10), 10, 'WET', ['DRY']))).toEqual({ pit: true, compound: 'W', paceMode: 'neutral' })
  })

  it('a wet-tyred car waits for two dry laps before fitting slicks', () => {
    expect(decide(T, car('I', 10), view(car('I', 10), 10, 'DRY', ['DAMP'])).pit).toBe(false)
    expect(decide(T, car('I', 10), view(car('I', 10), 10, 'DRY', ['DRY']))).toEqual({ pit: true, compound: 'M', paceMode: 'neutral' })
  })

  it('NEVER READS THE FUTURE: a soaking forecast does not confirm a single damp lap', () => {
    expect(decide(T, car('H', 10), view(car('H', 10), 10, 'DAMP', ['DRY'], 'WET')).pit).toBe(false)
  })

  it('no weather stop with weatherMinLapsLeft or fewer laps to go', () => {
    // lap 27 of 30: 3 laps remaining, so it stays out even though the rain is confirmed.
    // pitsDone 1: the planned lap-25 stop is already taken, so only the weather could box it.
    const late = (lap: number): CarState => ({ ...car('H', lap), pitsDone: 1 })
    expect(decide(T, late(27), view(late(27), 27, 'DAMP', ['DAMP'])).pit).toBe(false)
    expect(decide(T, late(26), view(late(26), 26, 'DAMP', ['DAMP']))).toEqual({ pit: true, compound: 'I', paceMode: 'neutral' })
  })

  it('weatherConfirmLaps 1 / weatherMinLapsLeft 0 is exactly the old rule', () => {
    const OLD = tuningWith({ weatherConfirmLaps: 1, weatherMinLapsLeft: 0 })
    expect(decide(OLD, car('H', 10), view(car('H', 10), 10, 'DAMP', ['DRY']))).toEqual({ pit: true, compound: 'I', paceMode: 'neutral' })
    expect(decide(OLD, car('I', 10), view(car('I', 10), 10, 'DRY', ['DAMP']))).toEqual({ pit: true, compound: 'M', paceMode: 'neutral' })
  })

  it('the run reaches timeline index 0: at lap 2 with confirm 2, damp laps 0 and 1 box a car on slicks', () => {
    const s = view(car('H', 2), 2, 'DAMP', ['DAMP'])
    expect(s.weatherTimeline[0], 'the run spans index 0').toBe('DAMP')
    expect(decide(T, car('H', 2), s)).toEqual({ pit: true, compound: 'I', paceMode: 'neutral' })
    expect(decide(T, car('H', 2), view(car('H', 2), 2, 'DAMP', ['DRY'])).pit, 'a dry index 0 breaks the run').toBe(false)
  })

  it('counts back no further than lap 0 (the first boundary of the race)', () => {
    expect(decide(T, car('H', 1), view(car('H', 1), 1, 'DAMP', [])).pit).toBe(false)
  })
})

describe('the final-lap guard (ruling R1)', () => {
  function atBoundary(lap: number, plannedLap: number, tuning: TuningConstants): RaceState {
    const config = makeConfig(tuning, 'naive', [{ lap: plannedLap, compound: 'M' }])
    const s = initRace(config)
    return { ...s, lap, sector: 2, cars: s.cars.map(c => ({ ...c, lap, compound: 'H' as const, paceMode: 'push' as const })) }
  }

  it('NO AI STOP ON THE BOUNDARY THAT COMPLETES THE RACE, but its pace mode still applies', () => {
    const T = tuningWith(SHIPPED_AI)
    const config = makeConfig(T, 'naive', [{ lap: 30, compound: 'M' }])
    const next = stepSector(config, atBoundary(29, 30, T), createRng(3))
    expect(next.lap).toBe(30)
    expect(next.cars[0]!.pitsDone, 'a due stop is dropped at the flag').toBe(0)
    expect(next.cars[0]!.compound).toBe('H')
    expect(next.cars[0]!.paceMode, 'the naive brain still sets neutral').toBe('neutral')
  })

  it('the boundary before it still stops', () => {
    const T = tuningWith(SHIPPED_AI)
    const config = makeConfig(T, 'naive', [{ lap: 29, compound: 'M' }])
    const next = stepSector(config, atBoundary(28, 29, T), createRng(3))
    expect(next.cars[0]!.pitsDone).toBe(1)
  })
})
