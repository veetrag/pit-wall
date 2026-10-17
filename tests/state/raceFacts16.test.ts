import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { longestStint } from '@state/careerStats'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore, type FinishPosition } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { summarise } from '@ui/RaceWatcher'
import { CAREER_SAVE_KEY, loadCareer, careerSnapshotFrom } from '@state/careerPersistence'
import { SeasonSnapshotSchema, snapshotFrom } from '@state/seasonPersistence'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { CarState, RaceState } from '@engine/types'

const CAREER_14 = readFileSync('tests/fixtures/career-save-1.4.json', 'utf8').trim()
const SEASON_14 = readFileSync('tests/fixtures/season-save-1.4.json', 'utf8').trim()
const s = () => useSeasonStore.getState()
const r = () => useRaceStore.getState()
const EVENTS = { overtakesGained: 1, pitsDone: 1, hadRain: false }

function seasonAtRound(raceIndex: number) {
  s().startNewSeason()
  s().selectTeam('apex'); s().confirmTeam()
  s().selectDriver('d_voss'); s().confirmDriver()
  useSeasonStore.setState({ raceIndex, selectedCircuitId: null })
  s().toRaceSetup()
  s().confirmRaceSetup(undefined, { startCompound: 'M', plannedStops: [{ lap: 18, compound: 'H' }], wing: 3 })
  s().runQualifyingSession({ compound: 'M', attack: 'balanced' }, 'rookie')
  s().startRaceFromQualifying()
}
function voss(pos: number): FinishPosition[] {
  const order = s().qualifyingResult!.order.filter(id => id !== 'd_voss')
  order.splice(pos - 1, 0, 'd_voss')
  return order.map((driverId, i) => ({ driverId, position: i + 1 }))
}

beforeEach(() => { mem.clear(); s().endCareer(); useRaceStore.getState().resetRace() })

describe('longestStint', () => {
  it('splits the race at each tyre change', () => {
    expect(longestStint([], 50)).toBe(50)
    expect(longestStint([18], 50)).toBe(32)
    expect(longestStint([10, 35], 50)).toBe(25)
  })
  it('a retirement ends the last stint at the last completed lap', () => {
    expect(longestStint([30], 33)).toBe(30)
  })
  it('never negative, never NaN, for a lap-1 DNF', () => {
    expect(longestStint([], 0)).toBe(0)
  })
})

describe('raceStore tracks the player tyre changes', () => {
  it('records the completed lap of a manual stop, and resets on a new race', () => {
    useRaceStore.getState().startSeasonRace('d_voss', 4243, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [] }, null, undefined, true)
    const cfg = useRaceStore.getState().config!
    useRaceStore.setState({ config: { ...cfg, tuning: makeDeterministicTuning() } })
    useRaceStore.getState().confirmRaceStart()
    for (let i = 0; i < 15; i++) useRaceStore.getState().step()   // five laps, bounded
    useRaceStore.getState().pitNow('H')
    expect(useRaceStore.getState().playerTyreChanges).toEqual([5])
    useRaceStore.getState().resetRace()
    expect(useRaceStore.getState().playerTyreChanges).toEqual([])
  })

  it('records a plan stop at the lap it is taken', () => {
    useRaceStore.getState().startSeasonRace('d_voss', 4243, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 4, compound: 'H' }] }, null, undefined, true)
    const cfg = useRaceStore.getState().config!
    useRaceStore.setState({ config: { ...cfg, tuning: makeDeterministicTuning() } })
    useRaceStore.getState().confirmRaceStart()
    for (let i = 0; i < 18; i++) useRaceStore.getState().step()
    expect(useRaceStore.getState().playerTyreChanges).toEqual([4])
  })
  it('a red-flag free change is recorded exactly once, at the restart lap (preflight F1)', () => {
    r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 30, compound: 'H' }] }, null, undefined, false)
    const c = r().config!
    const crasher = c.drivers.find(d => d.id !== 'd_voss')!.id
    const tuning = makeDeterministicTuning({
      incidents: {
        driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
        redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
      },
      tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
    })
    useRaceStore.setState({
      phase: 'racing',
      config: { ...c, tuning, drivers: c.drivers.map(d => ({ ...d, facets: { ...d.facets, consistency: d.id === crasher ? 0 : 100 } })) },
    })
    for (let n = 0; n < 12 && r().phase === 'racing'; n++) r().step()
    expect(r().phase).toBe('red_flag')
    expect(r().playerTyreChanges).toEqual([])
    r().confirmRedFlagRestart('S')
    r().confirmRaceStart()
    r().step()
    const me = r().raceState!.cars.find(x => x.isPlayer)!
    expect(me.compoundsUsed.length).toBe(2)
    expect(r().playerTyreChanges).toEqual([r().raceState!.lap])
  })
})

describe('summarise carries the stint facts', () => {
  it('start compound is the first compound used; longest stint from the changes', () => {
    useRaceStore.getState().startSeasonRace('d_voss', 4243, 'bengaluru', 'rookie',
      { startCompound: 'S', plannedStops: [] }, null, undefined, true)
    const rs = useRaceStore.getState().raceState!
    const used: CarState['compoundsUsed'] = ['S', 'H']
    const finished: RaceState = { ...rs, cars: rs.cars.map(c => c.isPlayer ? { ...c, lap: 56, compoundsUsed: used } : c) }
    const out = summarise(finished, [20])
    expect(out.stints).toEqual({ startCompound: 'S', longestStint: 36 })
  })
})

describe('facts land in the career (spec 1.6 §7)', () => {
  it('a Grand Prix fact gains circuitId, startCompound, longestStint and team, in that order', () => {
    seasonAtRound(0)
    s().recordRaceResult(voss(4), EVENTS, { startCompound: 'M', longestStint: 31 })
    s().nextRace()
    const log = useCareerStore.getState().raceLog
    const fact = log[log.length - 1]!
    expect(Object.keys(fact)).toEqual(['season', 'round', 'grid', 'finish', 'retired', 'pole', 'stops', 'overtakes', 'wet',
      'circuitId', 'startCompound', 'longestStint', 'team'])
    expect(fact).toMatchObject({ circuitId: 'bengaluru', startCompound: 'M', longestStint: 31, team: 'apex' })
  })

  it('a sprint fact keeps kind before the extras', () => {
    seasonAtRound(3)
    s().confirmSprintSetup({ startCompound: 'S', paceMode: 'push' })
    s().recordSprintResult(voss(2), EVENTS, { startCompound: 'S', longestStint: 18 })
    s().toGrandPrix()
    const log = useCareerStore.getState().raceLog
    const fact = log[log.length - 1]!
    expect(Object.keys(fact).slice(9)).toEqual(['kind', 'circuitId', 'startCompound', 'longestStint', 'team'])
  })

  it('a pending race keeps its facts through a save and reload', () => {
    seasonAtRound(0)
    s().recordRaceResult(voss(4), EVENTS, { startCompound: 'M', longestStint: 31 })
    const snap = SeasonSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshotFrom(s()))))
    expect(snap.pendingRace).toMatchObject({ circuitId: 'bengaluru', startCompound: 'M', longestStint: 31, team: 'apex' })
  })

  it('without stint facts (a race recorded by older code paths) nothing new is written', () => {
    seasonAtRound(0)
    s().recordRaceResult(voss(4), EVENTS)
    s().nextRace()
    const log = useCareerStore.getState().raceLog
    const fact = log[log.length - 1]!
    expect(fact.startCompound).toBeUndefined()
    expect(fact.longestStint).toBeUndefined()
  })
})

describe('old saves (Review Focus 1)', () => {
  it('A REAL 1.4 CAREER SERIALISES BYTE FOR BYTE', async () => {
    mem.set(CAREER_SAVE_KEY, CAREER_14)
    const loaded = await loadCareer()
    expect(loaded).not.toBeNull()
    useCareerStore.getState().resumeCareer(loaded!)
    expect(JSON.stringify(careerSnapshotFrom(useCareerStore.getState()))).toBe(CAREER_14)
  })

  it('a real 1.4 season still parses, its pendingRace with exactly the 1.4 keys', () => {
    const snap = SeasonSnapshotSchema.parse(JSON.parse(SEASON_14))
    expect(Object.keys(snap.pendingRace!)).toEqual(['position', 'retired', 'pole', 'round', 'grid', 'stops', 'overtakes', 'wet'])
  })
})
