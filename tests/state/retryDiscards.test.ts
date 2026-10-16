import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore, addResultsToStandings, TOTAL_RACES } from '@state/seasonStore'
import { useCareerStore, previewRaceBadges } from '@state/careerStore'
import { snapshotFrom, SeasonSnapshotSchema } from '@state/seasonPersistence'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/*
 * Found on device, 2026-10-09: "Retry this round" kept everything the
 * abandoned attempt earned. A rival reached 65 points in a ONE-race season
 * (25 + 25 + 15 across three attempts), because recordRaceResult committed
 * points, development, rival development and the career record at the flag
 * -- before the player chose to retry -- and retryRace undid none of it.
 *
 * Fix: a race counts when it is KEPT. The flag only records a pending result;
 * nextRace (NEXT RACE / FINAL STANDINGS) commits it; retryRace discards it.
 */

const EVENTS = { overtakesGained: 2, pitsDone: 1, hadRain: false }
const WIN = [{ driverId: 'd_voss', position: 1 }, { driverId: 'd_rossi', position: 2 }]
const P8 = [{ driverId: 'd_rossi', position: 1 }, { driverId: 'd_voss', position: 8 }]

function freshCareer() {
  useCareerStore.getState().beginCareer()
  useSeasonStore.getState().startNewSeason()
  useSeasonStore.setState({ playerDriverId: 'd_voss', selectedTeamId: 'apex', phase: 'racing' })
}

function snapshotOfEverythingARaceTouches() {
  const s = useSeasonStore.getState()
  const c = useCareerStore.getState()
  return {
    standings: JSON.parse(JSON.stringify(s.standings)),
    devPoints: s.devPoints,
    rivalDevelopment: { ...s.rivalDevelopment },
    racesStarted: c.racesStarted, wins: c.wins, podiums: c.podiums,
    raceLog: c.raceLog.length,
  }
}

beforeEach(freshCareer)

describe('a race counts when it is kept', () => {
  it('the flag records a pending result and commits NOTHING', () => {
    const before = snapshotOfEverythingARaceTouches()
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    const s = useSeasonStore.getState()
    expect(s.phase).toBe('result')
    expect(s.resultPending).toBe(true)
    expect(s.lastRaceResults).not.toBeNull()
    expect(snapshotOfEverythingARaceTouches()).toEqual(before)
  })

  it('continuing commits it: points, development, rivals and the career', () => {
    const before = snapshotOfEverythingARaceTouches()
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    const after = snapshotOfEverythingARaceTouches()
    const income = loadGameData().upgrades.income.perRace
    expect(after.standings.find((x: { driverId: string }) => x.driverId === 'd_voss').points).toBe(25)
    expect(after.devPoints).toBe(before.devPoints + income)
    expect(after.rivalDevelopment).not.toEqual(before.rivalDevelopment)
    expect(after.racesStarted).toBe(before.racesStarted + 1)
    expect(after.wins).toBe(before.wins + 1)
    expect(after.raceLog).toBe(before.raceLog + 1)
    expect(useSeasonStore.getState().resultPending).toBe(false)
  })

  it('race, RETRY, race leaves exactly what one kept race leaves', () => {
    // Retried path: a discarded P8, then a kept win.
    useSeasonStore.getState().recordRaceResult(P8, EVENTS)
    useSeasonStore.getState().retryRace()
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    const retried = snapshotOfEverythingARaceTouches()

    // Straight path: just the kept win.
    freshCareer()
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    const straight = snapshotOfEverythingARaceTouches()

    expect(retried).toEqual(straight)
  })

  it('retry discards the pending result', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().retryRace()
    const s = useSeasonStore.getState()
    expect(s.resultPending).toBe(false)
    expect(s.lastRaceResults).toBeNull()
    // Back to race setup for the same round (tests/state/retryReopensSetup.test.ts).
    expect(s.phase).toBe('race_setup')
  })

  it('a retry never awards a badge from the discarded attempt', () => {
    // A win would earn the Winner badge. Discard it and keep a P8 instead.
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().retryRace()
    useSeasonStore.getState().recordRaceResult(P8, EVENTS)
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().justEarned).not.toContain('winner')
    expect(useCareerStore.getState().wins).toBe(0)
  })

  it('the final round counts towards the championship it ends', () => {
    useSeasonStore.setState({ raceIndex: TOTAL_RACES - 1 })
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    const s = useSeasonStore.getState()
    expect(s.phase).toBe('championship')
    expect(s.standings[0]).toEqual({ driverId: 'd_voss', points: 25 })
  })

  it('does not commit when nothing is pending -- a save from before this fix', () => {
    // A save written on the result screen by the old build had ALREADY
    // committed its race. Its resultPending defaults to false, so
    // continuing must not count the race a second time.
    useSeasonStore.setState({
      phase: 'result', resultPending: false,
      standings: [{ driverId: 'd_voss', points: 25 }],
      lastRaceResults: [{ driverId: 'd_voss', position: 1, points: 25, retired: false, retiredCause: null }],
      lastRaceEvents: EVENTS,
    })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().standings).toEqual([{ driverId: 'd_voss', points: 25 }])
  })
})

describe('what the result screen shows before anything is kept', () => {
  it('previews exactly the badges continuing will award', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    const preview = useSeasonStore.getState().pendingBadges()
    expect(preview).toContain('winner')
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().justEarned).toEqual(preview)
  })

  it('previewRaceBadges is pure: it does not touch the career', () => {
    const before = JSON.stringify(useCareerStore.getState())
    previewRaceBadges(useCareerStore.getState(), {
      position: 1, retired: false, pole: false, round: 0, grid: 3, stops: 1, overtakes: 2, wet: false,
    })
    expect(JSON.stringify(useCareerStore.getState())).toBe(before)
  })

  it('addResultsToStandings adds points without mutating its input', () => {
    const standings = [{ driverId: 'a', points: 10 }, { driverId: 'b', points: 12 }]
    const frozen = JSON.stringify(standings)
    const out = addResultsToStandings(standings, [
      { driverId: 'a', position: 1, points: 25, retired: false, retiredCause: null },
      { driverId: 'c', position: 2, points: 18, retired: false, retiredCause: null },
    ])
    expect(out).toEqual([{ driverId: 'a', points: 35 }, { driverId: 'c', points: 18 }, { driverId: 'b', points: 12 }])
    expect(JSON.stringify(standings)).toBe(frozen)
  })
})

describe('a pending result survives the app being closed', () => {
  it('is saved, and a save without the field reads as not pending', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    const snap = snapshotFrom(useSeasonStore.getState())!
    expect(snap.resultPending).toBe(true)
    const { resultPending: _drop, ...legacy } = snap
    expect(SeasonSnapshotSchema.parse(legacy).resultPending).toBe(false)
  })
})
