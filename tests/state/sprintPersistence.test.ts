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

import { useSeasonStore, type FinishPosition } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { SAVE_KEY, snapshotFrom, loadSnapshot, SeasonSnapshotSchema } from '@state/seasonPersistence'
import { CAREER_SAVE_KEY, loadCareer, careerSnapshotFrom } from '@state/careerPersistence'

const SEASON_14 = readFileSync('tests/fixtures/season-save-1.4.json', 'utf8').trim()
const CAREER_14 = readFileSync('tests/fixtures/career-save-1.4.json', 'utf8').trim()
const s = () => useSeasonStore.getState()
const EVENTS = { overtakesGained: 0, pitsDone: 0, hadRain: false }

function wipe() {
  mem.clear()
  s().endCareer()
}
function sprintRoundQualified() {
  s().startNewSeason()
  s().selectTeam('apex'); s().confirmTeam()
  s().selectDriver('d_voss'); s().confirmDriver()
  useSeasonStore.setState({ raceIndex: 3, selectedCircuitId: null })
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
/** Save, "kill the app", load, resume. */
function killAndResume() {
  const raw = JSON.stringify(snapshotFrom(s()))
  wipe()
  const snap = SeasonSnapshotSchema.parse(JSON.parse(raw))
  s().resumeSeason(snap)
  return snap
}
const points = () => s().standings.find(x => x.driverId === 'd_voss')?.points ?? 0

beforeEach(wipe)

describe('resume from every new phase', () => {
  it('APP KILLED MID-SPRINT (Review Focus 1): sprint_racing resumes to sprint_setup on the same grid, nothing banked', () => {
    sprintRoundQualified()
    s().confirmSprintSetup({ startCompound: 'S', paceMode: 'push' })
    const grid = s().qualifyingResult!.order
    const snap = killAndResume()
    expect(snap.resumePhase).toBe('sprint_setup')
    expect(s().phase).toBe('sprint_setup')
    expect(s().qualifyingResult!.order).toEqual(grid)
    expect(s().sprintStrategy).toEqual({ startCompound: 'S', paceMode: 'push' })
    expect(points()).toBe(0)
    // The resumed sprint banks exactly once.
    s().confirmSprintSetup({ startCompound: 'S', paceMode: 'push' })
    s().recordSprintResult(voss(1), EVENTS)
    s().toGrandPrix(); s().keepSprint()
    expect(points()).toBe(8)
  })

  it('sprint_setup resumes to sprint_setup', () => {
    sprintRoundQualified()
    expect(killAndResume().resumePhase).toBe('sprint_setup')
    expect(s().qualifyingResult).not.toBeNull()
  })

  it('sprint_result resumes with the pending result intact, and banks it once', () => {
    sprintRoundQualified()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(voss(2), EVENTS)
    killAndResume()
    expect(s().phase).toBe('sprint_result')
    expect(s().sprintPending).toBe(true)
    expect(s().lastSprintResults!.find(r => r.driverId === 'd_voss')!.points).toBe(7)
    s().toGrandPrix(); s().toGrandPrix()
    expect(points()).toBe(7)
    expect(useCareerStore.getState().raceLog.filter(f => f.kind === 'sprint')).toHaveLength(1)
  })

  it('the Grand Prix on a sprint round resumes to race setup with the grid and the sprint banked', () => {
    sprintRoundQualified()
    s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
    s().recordSprintResult(voss(1), EVENTS)
    s().toGrandPrix()
    const grid = s().qualifyingResult!.order
    expect(killAndResume().resumePhase).toBe('race_setup')
    expect(s().sprintBanked).toBe(true)
    expect(points()).toBe(8)
    s().confirmRaceSetup(undefined, s().playerStrategy)
    expect(s().phase, 'no second qualifying').toBe('racing')
    expect(s().qualifyingResult!.order).toEqual(grid)
  })

  it('qualifying is persisted on sprint rounds only', () => {
    sprintRoundQualified()
    expect(snapshotFrom(s())!.qualifyingResult).not.toBeNull()
    useSeasonStore.setState({ raceIndex: 2, phase: 'race_setup' })
    expect(snapshotFrom(s())!.qualifyingResult).toBeNull()
  })
})

describe('saves written by 1.4', () => {
  it('a real 1.4 season save loads, every new field at its default', async () => {
    mem.set(SAVE_KEY, SEASON_14)
    const snap = await loadSnapshot()
    expect(snap).not.toBeNull()
    expect(snap).toEqual({
      ...JSON.parse(SEASON_14),
      qualifyingResult: null, sprintAttemptNonce: 0, sprintStrategy: null,
      lastSprintResults: null, lastSprintEvents: null, sprintPending: false, pendingSprint: null, sprintBanked: false,
    })
  })

  it('A REAL 1.4 SAVE ON WHAT IS NOW A SPRINT ROUND (Review Focus 5): NEXT keeps the GP result once and offers no sprint', async () => {
    mem.set(SAVE_KEY, JSON.stringify({ ...JSON.parse(SEASON_14), raceIndex: 3 }))
    const snap = await loadSnapshot()
    expect(snap).not.toBeNull()
    useCareerStore.getState().beginCareer()
    s().resumeSeason(snap!)
    expect(s().phase).toBe('result')
    expect(s().lastSprintResults, 'no S+N to show').toBeNull()
    s().nextRace()
    expect(s().raceIndex).toBe(4)
    expect(s().phase).toBe('development')
    expect(points()).toBe(1)   // d_voss finished P10 in the saved race
    s().keepResult()
    expect(points(), 'kept exactly once').toBe(1)
  })

  it('A REAL 1.4 SAVE ON WHAT IS NOW A SPRINT ROUND, RETRIED (ruling P5): the fresh attempt may offer the sprint, the saved GP is never counted', async () => {
    mem.set(SAVE_KEY, JSON.stringify({ ...JSON.parse(SEASON_14), raceIndex: 3 }))
    const snap = await loadSnapshot()
    expect(snap).not.toBeNull()
    useCareerStore.getState().beginCareer()
    s().resumeSeason(snap!)
    s().retryRace()
    expect(s().phase).toBe('race_setup')
    expect(s().resultPending).toBe(false)
    expect(s().qualifyingResult, 'no sprint banked, so the round qualifies again').toBeNull()
    s().confirmRaceSetup(undefined, s().playerStrategy)
    s().runQualifyingSession({ compound: 'M', attack: 'balanced' }, 'rookie')
    s().startRaceFromQualifying()
    expect(s().phase, 'a fresh attempt on a sprint round runs the sprint first').toBe('sprint_setup')
    s().keepResult()
    expect(points(), 'the discarded 1.4 race is never counted').toBe(0)
    expect(useCareerStore.getState().raceLog).toHaveLength(0)
  })

  it('a real 1.4 career save loads; its facts carry no kind and serialise unchanged', async () => {
    mem.set(CAREER_SAVE_KEY, CAREER_14)
    const snap = await loadCareer()
    expect(snap).not.toBeNull()
    expect(JSON.stringify(snap)).toBe(CAREER_14)
  })

  it('a sprint fact round-trips with its kind', async () => {
    mem.set(CAREER_SAVE_KEY, CAREER_14)
    useCareerStore.getState().resumeCareer((await loadCareer())!)
    useCareerStore.getState().recordSprint({ position: 1, retired: false, round: 3, grid: 4, stops: 0, overtakes: 3, wet: false })
    const raw = JSON.stringify(careerSnapshotFrom(useCareerStore.getState()))
    mem.set(CAREER_SAVE_KEY, raw)
    const back = await loadCareer()
    expect(back!.raceLog.map(f => f.kind)).toEqual([undefined, 'sprint'])
  })
})
