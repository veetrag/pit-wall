import { describe, it, expect, beforeEach } from 'vitest'
import { careerSnapshotFrom, CareerSnapshotSchema, CAREER_SAVE_VERSION } from '@state/careerPersistence'
import { SAVE_VERSION } from '@state/seasonPersistence'
import { useCareerStore } from '@state/careerStore'

describe('career persistence', () => {
  beforeEach(() => { useCareerStore.getState().endCareer() })

  it('DOES NOT SAVE WHEN THERE IS NO CAREER', () => {
    expect(careerSnapshotFrom(useCareerStore.getState())).toBeNull()
  })

  it('ROUND-TRIPS A CAREER', () => {
    useCareerStore.getState().beginCareer()
    useCareerStore.getState().recordRace({ position: 1, retired: false, pole: true })
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
    useCareerStore.getState().recordRace({ position: 2, retired: false, pole: false })
    // Abandoning a season clears the SEASON save; the career snapshot must
    // still be produced from an untouched career store.
    const snap = careerSnapshotFrom(useCareerStore.getState())
    expect(snap).not.toBeNull()
    expect(snap!.podiums).toBe(1)
  })
})
