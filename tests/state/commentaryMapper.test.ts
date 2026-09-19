import { describe, it, expect } from 'vitest'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import type { RaceConfig, RaceState, CarState, TuningConstants, IncidentEvent } from '@engine/types'

function makeCar(overrides: Partial<CarState> & { driverId: string; teamId: string }): CarState {
  return {
    position: 1, raceTime: 0, lap: 5, sector: 0, compound: 'M', tyreAge: 5,
    paceMode: 'neutral', pitted: false, pitsDone: 0,
    strategy: { teamId: overrides.teamId, startCompound: 'M', plannedStops: [] },
    isPlayer: false,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 },
    compoundsUsed: ['M'], lapsInDirtyAir: 0, retired: false, retiredLap: null, retiredCause: null,
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
    lap: 5, sector: 0, totalLaps: 30, cars, sectorResults: [], overtakeEvents: [], safetyCar: null, incidents: [],
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

describe('incident commentary', () => {
  function inc(kind: IncidentEvent['kind'], over: Partial<IncidentEvent> = {}): IncidentEvent {
    return { lap: 6, sector: 1, kind, driverId: null, timeLoss: null, ...over }
  }
  const CONFIG = makeConfig([{ id: 'a', code: 'AAA' }, { id: 'b', code: 'BBB' }])
  const CARS = [
    makeCar({ driverId: 'a', teamId: 'a', position: 3 }),
    makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
  ]

  it('reports only incidents new since the last tick', () => {
    /*
     * FAILS IF the mapper re-reads the whole log each tick. The log is
     * append-only and reaches ~100 entries in a race; a mapper that emitted
     * every entry every tick would flood the ticker and make it useless.
     * Mirrors how prevOvertakeCount already works.
     */
    let cs = makeCommentaryState()

    const first = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed')] }), CONFIG, cs)
    cs = first.next
    expect(first.lines.some(l => /safety car deployed/i.test(l))).toBe(true)

    // Same log, next tick: nothing new to say.
    const second = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed')] }), CONFIG, cs)
    cs = second.next
    expect(second.lines.some(l => /safety car deployed/i.test(l)), 'must not repeat').toBe(false)

    // One more entry appended: only THAT one is reported.
    const third = processCommentaryTick(
      makeState(CARS, { incidents: [inc('safety_car_deployed'), inc('safety_car_ended')] }), CONFIG, cs)
    expect(third.lines.some(l => /green flag/i.test(l))).toBe(true)
    expect(third.lines.some(l => /safety car deployed/i.test(l))).toBe(false)
  })

  it('names the driver and the time lost on an error', () => {
    const { lines } = processCommentaryTick(
      makeState(CARS, { incidents: [inc('driver_error', { driverId: 'a', timeLoss: 3.42 })] }),
      CONFIG, makeCommentaryState())
    const line = lines.find(l => /runs wide/i.test(l))
    expect(line, 'an error should produce a line').toBeTruthy()
    expect(line!).toContain('AAA')
    expect(line!, 'one decimal, not 3.42 and not the raw {loss} placeholder').toContain('3.4s')
    expect(line!).not.toContain('{')
  })

  it('does not also emit the generic retirement line for a crash', () => {
    // Both the crash incident and the retirement fire on the same tick; the
    // specific line must win rather than the ticker reporting it twice.
    const cars = [
      makeCar({ driverId: 'a', teamId: 'a', position: 3, retired: true, retiredCause: 'crash', retiredLap: 6 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
    ]
    const { lines } = processCommentaryTick(
      makeState(cars, { incidents: [inc('crash', { driverId: 'a' })] }),
      CONFIG, makeCommentaryState())
    expect(lines.filter(l => l.includes('AAA')), 'exactly one line about this car').toHaveLength(1)
  })

  it('still emits the generic retirement line for a non-crash retirement', () => {
    // The suppression must be narrow. A mechanical or tyre retirement has no
    // incident-log entry of its own, so suppressing it would lose the line.
    const cars = [
      makeCar({ driverId: 'a', teamId: 'a', position: 3, retired: true, retiredCause: 'mechanical', retiredLap: 6 }),
      makeCar({ driverId: 'b', teamId: 'b', position: 4 }),
    ]
    const { lines } = processCommentaryTick(
      makeState(cars, {}), CONFIG, makeCommentaryState())
    expect(lines.some(l => l.includes('AAA')), 'a mechanical DNF still gets its line').toBe(true)
  })
})

describe('joining a race already in progress', () => {
  it('DOES NOT ANNOUNCE THE START OF A RACE THAT STARTED WITHOUT YOU', () => {
    /*
     * A scenario hands the player a race at, say, lap 14. The commentary feed
     * opened with "Lights out and away we go" -- announcing a start that
     * happened fourteen laps earlier, as the very first thing the player reads.
     *
     * Caught by playing the scenario and looking at the screen; no assertion in
     * the suite covered the ticker's opening line.
     */
    const joined = makeState([makeCar({ driverId: 'd_voss', teamId: 'apex' })], { lap: 14 })
    expect(makeCommentaryState(joined).started, 'a mid-race join has already started').toBe(true)
  })

  it('still announces the start of a race that begins on lap 0', () => {
    const grid = makeState([makeCar({ driverId: 'd_voss', teamId: 'apex' })], { lap: 0 })
    expect(makeCommentaryState(grid).started).toBe(false)
    expect(makeCommentaryState().started, 'default must stay unchanged').toBe(false)
  })

  it('TREATS THE FAST-FORWARD AS HISTORY, NOT NEWS', () => {
    /*
     * The second half of the same bug, which the first fix missed.
     *
     * A scenario handover carries the whole run-up with it: overtakes,
     * incidents, pit stops and retirements that happened while the AI drove.
     * With the counters starting at zero the ticker treats every one of them as
     * having just occurred -- observed on device, the feed opening with
     * "L1 VOS passes CHN for P4" on the first tick after taking over at lap 14.
     */
    const cars = [
      makeCar({ driverId: 'd_voss', teamId: 'apex', pitsDone: 2 }),
      makeCar({ driverId: 'd_rossi', teamId: 'meridian', retired: true }),
    ]
    const joined = makeState(cars, {
      lap: 14,
      overtakeEvents: [{}, {}, {}] as never,
      incidents: [{}, {}] as never,
      weatherState: 'WET',
    })
    const s = makeCommentaryState(joined)
    expect(s.prevOvertakeCount, 'the run-up\'s overtakes are already history').toBe(3)
    expect(s.prevIncidentCount).toBe(2)
    expect(s.prevPitsDone['d_voss'], 'stops made before handover are not news').toBe(2)
    expect(s.prevRetired['d_rossi'], 'nor is a car that was already out').toBe(true)
    expect(s.prevWeatherState, 'nor a weather change that already happened').toBe('WET')
  })

  it('announces nothing on the very first tick after a handover', () => {
    // The end-to-end version: feed the joined state straight back in and the
    // mapper must have nothing to say about it.
    const cars = [makeCar({ driverId: 'd_voss', teamId: 'apex', pitsDone: 1 })]
    const joined = makeState(cars, { lap: 14, overtakeEvents: [{}, {}] as never })
    const config = makeConfig([{ id: 'd_voss', code: 'VOS' }])
    const { lines } = processCommentaryTick(joined, config, makeCommentaryState(joined))
    expect(lines, 'the handover state is the baseline, not a news feed').toEqual([])
  })
})
