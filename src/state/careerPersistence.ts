import { Preferences } from '@capacitor/preferences'
import { z } from 'zod'
import { migrateSave, CAREER_MIGRATIONS } from './saveMigration'
import { useCareerStore, type CareerRecord } from './careerStore'

/**
 * Career save/resume.
 *
 * This is a SEPARATE key and a separate schema from the season save
 * (seasonPersistence.ts), deliberately. A career spans many seasons; a season
 * save is one attempt at the current one, and abandoning or restarting that
 * attempt must never cost the player their career. Merging the two into one
 * snapshot for convenience would mean any season-save bug (see the header on
 * seasonPersistence.ts for the story of the last one) also corrupts the
 * career. Keeping them apart means a broken season save degrades to "start
 * this season over," never to "lose your career."
 */

export const CAREER_SAVE_KEY = 'career.save'

/**
 * Bumped whenever the snapshot shape changes incompatibly. An older or newer
 * version loads as `null` -- the player loses their career, which is bad, but
 * far better than restoring a half-shaped object into the store and crashing
 * on a screen they cannot get out of.
 */
export const CAREER_SAVE_VERSION = 1

const RaceFactSchema = z.object({
  season: z.number(),
  round: z.number(),
  grid: z.number(),
  finish: z.number(),
  retired: z.boolean(),
  pole: z.boolean(),
  stops: z.number(),
  overtakes: z.number(),
  wet: z.boolean(),
})

const SeasonSummarySchema = z.object({
  seasonNumber: z.number(),
  teamId: z.string(),
  driverId: z.string(),
  championshipPosition: z.number(),
  points: z.number(),
  wins: z.number(),
})

export const CareerSnapshotSchema = z.object({
  v: z.literal(CAREER_SAVE_VERSION),
  seasonNumber: z.number(),
  titles: z.number(),
  wins: z.number(),
  // Saved because a career reloaded mid-season must still know what THIS
  // season is worth; without it the next rollover would record 0 wins.
  seasonWins: z.number(),
  podiums: z.number(),
  poles: z.number(),
  racesStarted: z.number(),
  bestFinish: z.number().nullable(),
  seasonHistory: z.array(SeasonSummarySchema),
  /*
   * .default([]) and NOT a version bump. A save written before badges shipped
   * has no raceLog key; with a default it parses and the career survives,
   * losing only the event badges whose facts were never recorded. Bumping
   * CAREER_SAVE_VERSION instead would make loadCareer discard every existing
   * save -- silent, total career loss. Asserted in careerPersistence.test.ts.
   */
  raceLog: z.array(RaceFactSchema).default([]),
})

export type CareerSnapshot = z.infer<typeof CareerSnapshotSchema>

/** Null when there is no career to save. Pure, so it is testable without Preferences. */
export function careerSnapshotFrom(
  r: CareerRecord & { hasCareer: boolean },
): CareerSnapshot | null {
  if (!r.hasCareer) return null
  return {
    v: CAREER_SAVE_VERSION,
    seasonNumber: r.seasonNumber,
    titles: r.titles,
    wins: r.wins,
    seasonWins: r.seasonWins,
    podiums: r.podiums,
    poles: r.poles,
    racesStarted: r.racesStarted,
    bestFinish: r.bestFinish,
    seasonHistory: r.seasonHistory,
    raceLog: r.raceLog,
  }
}

export async function saveCareer(snap: CareerSnapshot): Promise<void> {
  await Preferences.set({ key: CAREER_SAVE_KEY, value: JSON.stringify(snap) })
}

export async function clearCareer(): Promise<void> {
  await Preferences.remove({ key: CAREER_SAVE_KEY })
}

/**
 * Reads the save, returning null for anything it cannot fully trust.
 *
 * Every failure path is the same: null, and the player gets a clean menu. A
 * save is not worth a crash on a screen with no way out, and this runs before
 * first paint.
 */
export async function loadCareer(): Promise<CareerSnapshot | null> {
  try {
    const { value } = await Preferences.get({ key: CAREER_SAVE_KEY })
    if (!value) return null
    // Migrate BEFORE validating -- see the note in seasonPersistence.loadSnapshot.
    const migrated = migrateSave(JSON.parse(value), CAREER_SAVE_VERSION, CAREER_MIGRATIONS)
    if (!migrated.data) {
      console.warn('[career] discarding save —', migrated.reason)
      return null
    }
    const parsed = CareerSnapshotSchema.safeParse(migrated.data)
    if (!parsed.success) {
      console.warn('[career] discarding unreadable save', parsed.error.issues[0]?.message)
      return null
    }
    return parsed.data
  } catch (err: unknown) {
    console.warn('[career] save could not be read — starting fresh', err)
    return null
  }
}

/**
 * Subscribes to the store and keeps the save in step. Returns an unsubscribe.
 *
 * Writes are fire-and-forget on purpose: a failed write must never block a
 * state transition mid-race, and the next change writes again anyway.
 */
export function startCareerAutosave(): () => void {
  let last: string | null = null
  return useCareerStore.subscribe((state) => {
    const snap = careerSnapshotFrom(state)
    if (!snap) {
      // Only clear when the career itself is gone (ended), not on every
      // no-op re-render.
      if (last !== null) {
        last = null
        void clearCareer()
      }
      return
    }
    const serialised = JSON.stringify(snap)
    if (serialised === last) return   // no-op transitions must not churn writes
    last = serialised
    void saveCareer(snap)
  })
}
