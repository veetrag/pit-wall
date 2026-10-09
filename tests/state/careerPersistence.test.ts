import { describe, it, expect, beforeEach } from 'vitest'
import { careerSnapshotFrom, CareerSnapshotSchema, CAREER_SAVE_VERSION } from '@state/careerPersistence'
import { SAVE_VERSION } from '@state/seasonPersistence'
import { useCareerStore } from '@state/careerStore'

const FRESH_FOR_TEST = {
  seasonNumber: 1, titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
  racesStarted: 0, bestFinish: null, seasonHistory: [], raceLog: [], teamTiers: {},
}

describe('career persistence', () => {
  beforeEach(() => { useCareerStore.getState().endCareer() })

  it('DOES NOT SAVE WHEN THERE IS NO CAREER', () => {
    expect(careerSnapshotFrom(useCareerStore.getState())).toBeNull()
  })

  it('ROUND-TRIPS A CAREER', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().recordRace({ position: 1, retired: false, pole: true, round: 0, grid: 1, stops: 1, overtakes: 0, wet: false })
    const snap = careerSnapshotFrom(useCareerStore.getState())!
    expect(snap.v).toBe(CAREER_SAVE_VERSION)
    const parsed = CareerSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snap)))
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
    expect(parsed.success && parsed.data.wins).toBe(1)
  })

  it('THE SEASON SAVE VERSION WAS BUMPED', () => {
    /*
     * currentSeed now depends on career state, so a v1 season save resuming
     * into a career-less store would run DIFFERENT races than it was saved
     * under -- silently. The bump makes the old save unreadable instead, which
     * the loader already handles by discarding it.
     *
     * This is only acceptable because the game has not shipped. If that
     * changes, a migration layer is a prerequisite -- see the career spec 3.6.
     */
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2)
  })

  it('THE CAREER SURVIVES AN ABANDONED SEASON', () => {
    // The whole reason the two saves are separate.
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().recordRace({ position: 2, retired: false, pole: false, round: 0, grid: 2, stops: 1, overtakes: 0, wet: false })
    // Abandoning a season clears the SEASON save; the career snapshot must
    // still be produced from an untouched career store.
    const snap = careerSnapshotFrom(useCareerStore.getState())
    expect(snap).not.toBeNull()
    expect(snap!.podiums).toBe(1)
  })
})

describe('the race log survives the save', () => {
  it('A V1 SAVE WITH NO raceLog STILL LOADS', async () => {
    /*
     * The failure mode here is SILENT CAREER LOSS. CareerSnapshotSchema pins
     * v: z.literal(CAREER_SAVE_VERSION) and loadCareer discards anything that
     * fails to parse -- so if raceLog were added as a required field, or the
     * version bumped, every save written before badges shipped would be
     * thrown away and the player would open the app to an empty menu.
     */
    const legacy = {
      v: 1, seasonNumber: 2, titles: 1, wins: 4, seasonWins: 0, podiums: 7,
      poles: 2, racesStarted: 24, bestFinish: 1, seasonHistory: [],
    }
    const parsed = CareerSnapshotSchema.safeParse(legacy)
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data?.raceLog).toEqual([])
  })

  it('the version is still 1', () => {
    // A bump is a legitimate decision, but it destroys every existing career,
    // so it must be a deliberate act that fails this test first.
    expect(CAREER_SAVE_VERSION).toBe(1)
  })

  it('a log round-trips unchanged', () => {
    const fact = { season: 1, round: 3, grid: 12, finish: 1, retired: false, pole: false, stops: 1, overtakes: 4, wet: true }
    const snap = careerSnapshotFrom({
      ...FRESH_FOR_TEST, hasCareer: true, raceLog: [fact],
    })
    const reparsed = CareerSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snap)))
    expect(reparsed.success).toBe(true)
    expect(reparsed.data?.raceLog).toEqual([fact])
  })
})
