import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCareerStore } from '@state/careerStore'
import { CareerSnapshotSchema, careerSnapshotFrom } from '@state/careerPersistence'
import { parseCloud, CLOUD_SAVE_VERSION } from '@sync/cloudSave'
import { reconcile } from '@sync/reconcile'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

beforeEach(() => { useCareerStore.getState().endCareer() })

describe('teamTiers on the career', () => {
  it('starts empty and is reset by a new career', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().setTeamTiers({ terra: 2 })
    useCareerStore.getState().beginCareer()
    expect(useCareerStore.getState().teamTiers).toEqual({})
  })

  it('survives a race and a season end', () => {
    const c = useCareerStore.getState()
    c.beginCareer()
    c.setTeamTiers({ terra: 2 })
    c.recordRace({ position: 3, retired: false, pole: false, round: 1, grid: 5, stops: 1, overtakes: 2, wet: false })
    c.recordSeasonEnd({ seasonNumber: 1, teamId: 'terra', driverId: 'd_x', championshipPosition: 4, points: 90, wins: 0 })
    expect(useCareerStore.getState().teamTiers).toEqual({ terra: 2 })
  })

  it('is saved in the snapshot', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().setTeamTiers({ apex: -1 })
    const snap = careerSnapshotFrom(useCareerStore.getState())!
    expect(snap.teamTiers).toEqual({ apex: -1 })
    expect(CareerSnapshotSchema.parse(JSON.parse(JSON.stringify(snap))).teamTiers).toEqual({ apex: -1 })
  })
})

describe('saves written before the ladder', () => {
  const legacy = {
    v: 1, seasonNumber: 3, titles: 1, wins: 6, seasonWins: 0, podiums: 14, poles: 4,
    racesStarted: 24, bestFinish: 1, seasonHistory: [], raceLog: [],
  }

  it('load locally with every offset at 0, and are NOT discarded', () => {
    const parsed = CareerSnapshotSchema.safeParse(legacy)
    expect(parsed.success, 'a legacy save must still load').toBe(true)
    expect(parsed.success && parsed.data.teamTiers).toEqual({})
  })

  it('load from the cloud the same way', () => {
    const remote = parseCloud(JSON.stringify({
      v: CLOUD_SAVE_VERSION, savedAt: 1, career: legacy, season: null,
    }))
    expect(remote, 'cloud copy must parse').not.toBeNull()
    expect(remote!.career.teamTiers).toEqual({})
  })
})

describe('an old-format cloud save reconciles as in-step', () => {
  it('is NOT re-uploaded or downloaded when it matches the local career', () => {
    useCareerStore.getState().beginCareer()
    const local = careerSnapshotFrom(useCareerStore.getState())!
    // The same career as an OLD app wrote it: no teamTiers key at all.
    const oldCareer: Record<string, unknown> = { ...local }
    delete oldCareer.teamTiers
    const remote = parseCloud(JSON.stringify({
      v: CLOUD_SAVE_VERSION, savedAt: 1, career: oldCareer, season: null,
    }))
    expect(remote).not.toBeNull()
    // Key order matches storeBridge.readLocalSnapshot, which reconcile compares by JSON.
    const localCloud = { v: 1 as const, career: local, season: null, savedAt: 1 }
    expect(reconcile(localCloud, remote)).toEqual({ action: 'none' })
  })
})
