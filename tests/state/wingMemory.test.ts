import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { CareerSnapshotSchema, careerSnapshotFrom } from '@state/careerPersistence'

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
  it('overwrites an earlier wing at the same circuit', () => {
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    useSeasonStore.setState({ phase: 'racing', selectedCircuitId: 'veloce', playerStrategy: { startCompound: 'M', plannedStops: [], wing: 4 } })
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().keepResult()
    expect(useCareerStore.getState().wingByCircuit['veloce']).toBe(4)
  })
  it('still remembers on a legacy save with no selected circuit', async () => {
    const { CIRCUIT_ORDER } = await import('@state/raceStore')
    useSeasonStore.setState({ selectedCircuitId: null })
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().keepResult()
    const slot = CIRCUIT_ORDER[useSeasonStore.getState().raceIndex % CIRCUIT_ORDER.length]!
    expect(useCareerStore.getState().wingByCircuit[slot]).toBe(2)
  })
  it('round-trips through the career snapshot', () => {
    useCareerStore.setState({ wingByCircuit: { veloce: 2, kaido: 4 } })
    const snap = careerSnapshotFrom({ ...useCareerStore.getState(), hasCareer: true })!
    const first = JSON.stringify(snap)
    expect(JSON.stringify(CareerSnapshotSchema.parse(JSON.parse(first)))).toBe(first)
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
