import { describe, it, expect } from 'vitest'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import type { RaceConfig, RaceState, CarState, TuningConstants } from '@engine/types'

function makeCar(overrides: Partial<CarState> & { driverId: string; teamId: string }): CarState {
  return {
    position: 1, raceTime: 0, lap: 5, sector: 0, compound: 'M', tyreAge: 5,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: overrides.teamId, startCompound: 'M', plannedStops: [] },
    isPlayer: false,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 },
    compoundsUsed: ['M'], lapsInDirtyAir: 0, retired: false, retiredLap: null,
    ...overrides,
  }
}

function makeConfig(drivers: { id: string; code: string }[]): RaceConfig {
  return {
    circuit: { name: 'Test', laps: 30, sectorBase: [28, 34, 28], carSensitivity: [0.3, 0.45, 0.25], driverSensitivity: [0.3, 0.4, 0.3], overtakingFactor: [1, 0.25, 0.55], pitLaneTimeLoss: 22 },
    tuning: {} as TuningConstants, // commentaryMapper never reads tuning
    compounds: {},
    drivers: drivers.map(d => ({ id: d.id, name: d.id, code: d.code, teamId: d.id, facets: { pace: 80, racecraft: 80, tyreManagement: 80, consistency: 80, wetWeather: 80, experience: 80 } })),
    teams: [],
    strategies: [],
    playerDriverId: 'none',
    seed: 1,
  }
}

function makeState(cars: CarState[], overrides: Partial<RaceState> = {}): RaceState {
  return {
    lap: 5, sector: 0, totalLaps: 30, cars, sectorResults: [], overtakeEvents: [],
    trackEvolutionLaps: 5, rngState: 1,
    weatherTimeline: Array(30).fill('DRY'), weatherState: 'DRY',
    ...overrides,
  }
}

describe('commentaryMapper', () => {
  it('reports an overtake inside the top 10', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }, { id: 'b', code: 'BBB' }])
    const state = makeState([
      makeCar({ driverId: 'a', teamId: 'a', position: 3 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
    ], { overtakeEvents: [{ lap: 5, sector: 0, overtakerId: 'a', overtakenId: 'b' }] })

    const { lines } = processCommentaryTick(state, config, makeCommentaryState())
    expect(lines.some(l => l.includes('AAA') && l.includes('BBB'))).toBe(true)
  })

  it('does not report an overtake outside the top 10', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }, { id: 'b', code: 'BBB' }])
    const state = makeState([
      makeCar({ driverId: 'a', teamId: 'a', position: 15 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 16 }),
    ], { overtakeEvents: [{ lap: 5, sector: 0, overtakerId: 'a', overtakenId: 'b' }] })

    const { lines } = processCommentaryTick(state, config, makeCommentaryState())
    expect(lines.some(l => l.includes('AAA'))).toBe(false)
  })

  it('reports a pit stop for a car inside the top 10', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }])
    const prevTick = processCommentaryTick(makeState([makeCar({ driverId: 'a', teamId: 'a', pitsDone: 0 })]), config, makeCommentaryState())
    const { lines } = processCommentaryTick(makeState([makeCar({ driverId: 'a', teamId: 'a', pitsDone: 1 })]), config, prevTick.next)
    expect(lines.some(l => l.includes('AAA') && l.includes('pits'))).toBe(true)
  })

  it('reports a retirement exactly once, on the transition', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }])
    const before = makeState([makeCar({ driverId: 'a', teamId: 'a', retired: false })])
    const after = makeState([makeCar({ driverId: 'a', teamId: 'a', retired: true, retiredLap: 5 })])

    const first = processCommentaryTick(before, config, makeCommentaryState())
    expect(first.lines.some(l => l.includes('retires'))).toBe(false)

    const second = processCommentaryTick(after, config, first.next)
    expect(second.lines.some(l => l.includes('AAA') && l.includes('retires'))).toBe(true)

    const third = processCommentaryTick(after, config, second.next)
    expect(third.lines.some(l => l.includes('retires'))).toBe(false)
  })

  it('reports a weather transition', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }])
    const dry = makeState([makeCar({ driverId: 'a', teamId: 'a' })], { weatherState: 'DRY' })
    const wet = makeState([makeCar({ driverId: 'a', teamId: 'a' })], { weatherState: 'WET' })

    const first = processCommentaryTick(dry, config, makeCommentaryState())
    const second = processCommentaryTick(wet, config, first.next)
    expect(second.lines.some(l => l.toLowerCase().includes('wet'))).toBe(true)
  })

  it('reports the race start exactly once', () => {
    const config = makeConfig([{ id: 'a', code: 'AAA' }])
    const state = makeState([makeCar({ driverId: 'a', teamId: 'a' })])
    const first = processCommentaryTick(state, config, makeCommentaryState())
    expect(first.lines.some(l => l.toLowerCase().includes('lights out'))).toBe(true)
    const second = processCommentaryTick(state, config, first.next)
    expect(second.lines.some(l => l.toLowerCase().includes('lights out'))).toBe(false)
  })
})
