import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { CareerSnapshotSchema } from '@state/careerPersistence'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const WIN = [{ driverId: 'd_voss', position: 1 }, { driverId: 'd_rossi', position: 2 }]
const EVENTS = { overtakesGained: 0, pitsDone: 1, hadRain: false }

beforeEach(() => {
  useCareerStore.getState().beginCareer()
  useSeasonStore.getState().startNewSeason()
  useSeasonStore.setState({ playerDriverId: 'd_voss', selectedTeamId: 'apex', phase: 'racing',
    selectedCircuitId: 'veloce', playerStrategy: { startCompound: 'M', plannedStops: [], wing: 2 } })
})

describe('wing memory', () => {
  it('is recorded when the race is kept', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    expect(useCareerStore.getState().wingByCircuit['veloce']).toBeUndefined()
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().wingByCircuit['veloce']).toBe(2)
  })
  it('is not recorded by a retried attempt', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().retryRace()
    expect(useCareerStore.getState().wingByCircuit['veloce']).toBeUndefined()
  })
  it('defaults to {} on a career save written before it', () => {
    const legacy = {
      v: 1, seasonNumber: 3, titles: 1, wins: 6, seasonWins: 0, podiums: 14, poles: 4,
      racesStarted: 24, bestFinish: 1, seasonHistory: [], raceLog: [],
    }
    const parsed = CareerSnapshotSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.wingByCircuit).toEqual({})
  })
})
