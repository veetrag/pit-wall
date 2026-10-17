import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { useSeasonStore, seedFor, type FinishPosition } from '@state/seasonStore'
import { useCareerStore, sprintWins } from '@state/careerStore'
import { earnedBadges } from '@state/badges'

const s = () => useSeasonStore.getState()
const PLAN = { startCompound: 'M' as const, plannedStops: [{ lap: 18, compound: 'H' as const }], wing: 3 as const }
const EVENTS = { overtakesGained: 1, pitsDone: 0, hadRain: false }

/** A season on round `raceIndex` + 1, at race setup. */
function atRound(raceIndex: number) {
  s().startNewSeason()
  s().selectTeam('apex'); s().confirmTeam()
  s().selectDriver('d_voss'); s().confirmDriver()
  useSeasonStore.setState({ raceIndex, selectedCircuitId: null })
  s().toRaceSetup()
}
function qualify() {
  s().confirmRaceSetup(undefined, PLAN)
  s().runQualifyingSession({ compound: 'M', attack: 'balanced' }, 'rookie')
  s().startRaceFromQualifying()
}
/** d_voss at `pos`, the rest of the field behind. */
function finish(pos: number, retired = false): FinishPosition[] {
  const others = s().qualifyingResult!.order.filter(id => id !== 'd_voss')
  others.splice(pos - 1, 0, 'd_voss')
  return others.map((driverId, i) => ({ driverId, position: i + 1, retired: driverId === 'd_voss' ? retired : false, retiredCause: null }))
}
const points = (id: string) => s().standings.find(x => x.driverId === id)?.points ?? 0

beforeEach(() => { useCareerStore.getState().beginCareer() })

describe('round flow', () => {
  it('a sprint round goes qualifying -> sprint_setup -> sprint_racing -> sprint_result -> racing', () => {
    atRound(3)
    qualify()
    expect(s().phase).toBe('sprint_setup')
    s().confirmSprintSetup({ startCompound: 'S', paceMode: 'push' })
    expect(s().phase).toBe('sprint_racing')
    expect(s().sprintStrategy).toEqual({ startCompound: 'S', paceMode: 'push' })
    s().recordSprintResult(finish(1), EVENTS)
    expect(s().phase).toBe('sprint_result')
    expect(s().sprintPending).toBe(true)
    expect(points('d_voss'), 'shown, not yet counted').toBe(0)
    s().toGrandPrix()
    expect(s().phase).toBe('racing')
    expect(points('d_voss')).toBe(8)
  })

  it('a normal round goes straight from qualifying to the race', () => {
    atRound(2)
    qualify()
    expect(s().phase).toBe('racing')
  })

  it('ONE QUALIFYING SETS BOTH GRIDS: the Grand Prix uses the grid the sprint used', () => {
    atRound(7)
    qualify()
    const grid = s().qualifyingResult!.order
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(20), EVENTS)
    s().toGrandPrix()
    expect(s().qualifyingResult!.order).toEqual(grid)
  })
})

describe('sprint points', () => {
  it('bank EXACTLY ONCE, however often keep is called', () => {
    atRound(3); qualify()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(2), EVENTS)
    s().keepSprint(); s().keepSprint(); s().toGrandPrix(); s().keepSprint()
    expect(points('d_voss')).toBe(7)
  })

  it('a DNF scores nothing, and the sprint pays no development points or rival development', () => {
    atRound(3); qualify()
    const dp = s().devPoints
    const rivals = { ...s().rivalDevelopment }
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(1, true), EVENTS)
    expect(s().lastSprintResults!.find(r => r.driverId === 'd_voss')!.points).toBe(0)
    s().toGrandPrix()
    expect(s().devPoints).toBe(dp)
    expect(s().rivalDevelopment).toEqual(rivals)
  })

  it('RETRY SPRINT discards the attempt: no points, back to sprint setup, a new sprint seed, the same GP seed', () => {
    atRound(3); qualify()
    const gpSeed = s().currentSeed()
    const sprintSeed = s().currentSprintSeed()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(1), EVENTS)
    s().retrySprint()
    expect(s().phase).toBe('sprint_setup')
    expect(s().sprintPending).toBe(false)
    expect(s().lastSprintResults).toBeNull()
    expect(points('d_voss')).toBe(0)
    expect(s().currentSprintSeed()).not.toBe(sprintSeed)
    expect(s().currentSeed()).toBe(gpSeed)
    expect(s().qualifyingResult, 'the grid survives a sprint retry').not.toBeNull()
  })

  it('RETRY ROUND after the sprint keeps the grid and the sprint points, and skips qualifying', () => {
    atRound(3); qualify()
    const grid = s().qualifyingResult!.order
    const sprintSeed = s().currentSprintSeed()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(1), EVENTS)
    s().toGrandPrix()
    s().recordRaceResult(finish(3), EVENTS)
    s().retryRace()
    expect(s().phase).toBe('race_setup')
    expect(points('d_voss'), 'the sprint stays counted').toBe(8)
    expect(s().currentSprintSeed(), 'a GP retry does not re-roll the sprint').toBe(sprintSeed)
    s().confirmRaceSetup(undefined, PLAN)
    expect(s().phase, 'no second qualifying').toBe('racing')
    expect(s().qualifyingResult!.order).toEqual(grid)
  })

  it('the next round starts clean', () => {
    atRound(3); qualify()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(1), EVENTS)
    s().toGrandPrix()
    s().recordRaceResult(finish(1), EVENTS)
    s().nextRace()
    expect(s().raceIndex).toBe(4)
    expect(points('d_voss')).toBe(8 + 25)
    expect(s()).toMatchObject({
      sprintBanked: false, sprintPending: false, lastSprintResults: null, lastSprintEvents: null,
      pendingSprint: null, sprintStrategy: null, sprintAttemptNonce: 0, qualifyingResult: null,
    })
  })
})

describe('seeds', () => {
  it('the Grand Prix seed is unchanged from 1.4', () => {
    expect(seedFor(1, 3, 0)).toBe(3042)
    expect(seedFor(1, 3, 0, 'gp')).toBe(3042)
  })
  it('sprint seeds never collide with any Grand Prix seed', () => {
    const gp = new Set<number>()
    for (let season = 1; season <= 5; season++)
      for (let r = 0; r < 12; r++)
        for (let a = 0; a <= 200; a++) gp.add(seedFor(season, r, a))
    for (let season = 1; season <= 5; season++)
      for (let r = 0; r < 12; r++)
        for (let a = 0; a <= 200; a++) expect(gp.has(seedFor(season, r, a, 'sprint'))).toBe(false)
  })
})

describe('career', () => {
  it('a sprint is logged with kind sprint and counts only as a sprint win', () => {
    atRound(3); qualify()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(finish(1), EVENTS)
    s().toGrandPrix()
    const c = useCareerStore.getState()
    expect(c.raceLog).toHaveLength(1)
    expect(c.raceLog[0]).toMatchObject({ kind: 'sprint', finish: 1, round: 3, pole: false })
    expect(c.wins).toBe(0)
    expect(c.racesStarted).toBe(0)
    expect(c.podiums).toBe(0)
    expect(c.bestFinish).toBeNull()
    expect(sprintWins(c.raceLog)).toBe(1)
  })

  it('a sprint win earns no Grand Prix badge (achievements unchanged)', () => {
    const fact = { season: 1, round: 3, grid: 12, finish: 1, retired: false, pole: false, stops: 1, overtakes: 4, wet: true, kind: 'sprint' as const }
    const record = { titles: 0, wins: 0, podiums: 0, poles: 0, racesStarted: 0, bestFinish: null, raceLog: [fact] }
    expect(earnedBadges(record)).toEqual([])
  })
})
