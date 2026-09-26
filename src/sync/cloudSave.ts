import { z } from 'zod'
import { migrateSave, type MigrationRegistry } from '@state/saveMigration'
import { CareerSnapshotSchema } from '@state/careerPersistence'
import { SeasonSnapshotSchema } from '@state/seasonPersistence'

/**
 * The cloud save payload and the conflict rule.
 *
 * Deliberately pure: no plugin import, no store, no Preferences. Play Games
 * cannot run under vitest, and conflict resolution is the one piece of this
 * whole feature that is irreversible for the player -- when two devices have
 * written independently, whatever this file decides, one of those careers
 * stops existing. So the decision is a total function over plain data, and
 * every branch of it is asserted in tests/sync/cloudSave.test.ts.
 *
 * See docs/superpowers/specs/2026-09-26-cloud-and-play-services-design.md §4.
 */

/** Bumped when the cloud envelope changes shape. Independent of the two save
 *  versions it carries: those keep their own, and their own migrations. */
export const CLOUD_SAVE_VERSION = 1

export const CloudSnapshotSchema = z.object({
  v: z.literal(CLOUD_SAVE_VERSION),
  /*
   * The two existing snapshot schemas, reused rather than redescribed. A
   * second description of the save format is a second thing to keep in step
   * with careerStore, and it would drift the first time either changed.
   */
  career: CareerSnapshotSchema,
  /** Null for a career between seasons -- there is no season to carry. */
  season: SeasonSnapshotSchema.nullable(),
  /**
   * Epoch ms. A tiebreak of last resort and a display value; explicitly NOT
   * how a conflict is decided. See pickFurther.
   */
  savedAt: z.number(),
})

export type CloudSnapshot = z.infer<typeof CloudSnapshotSchema>

/** Empty, like the other two registries: the envelope has only ever had one
 *  shape. It exists so the first bump has somewhere to go. */
export const CLOUD_MIGRATIONS: MigrationRegistry = {}

/**
 * Of two snapshots, the one representing the further career.
 *
 * Ordering, first difference wins: seasons, then races started, then the
 * clock. An exact tie returns `a`, so the function is deterministic -- two
 * devices resolving the same conflict independently must reach the same
 * answer, or they will fight forever.
 *
 * The clock is last on purpose, and that is the whole design. Resolving by
 * "most recently written" lets a second device that syncs late destroy a
 * six-season career with a two-season one, silently, at the exact moment the
 * player is least able to understand what happened. Resolving by progress
 * cannot: the worst it can do is keep the bigger investment, which is the
 * mistake worth making.
 *
 * The cost, accepted knowingly: a player who deliberately starts a fresh short
 * career on a second device will see it beaten by their long career from the
 * first.
 */
export function pickFurther(a: CloudSnapshot, b: CloudSnapshot): CloudSnapshot {
  if (a.career.seasonNumber !== b.career.seasonNumber) {
    return a.career.seasonNumber > b.career.seasonNumber ? a : b
  }
  if (a.career.racesStarted !== b.career.racesStarted) {
    return a.career.racesStarted > b.career.racesStarted ? a : b
  }
  if (a.savedAt !== b.savedAt) return a.savedAt > b.savedAt ? a : b
  return a
}

export function serialiseCloud(snap: CloudSnapshot): string {
  return JSON.stringify(snap)
}

/**
 * Reads a cloud payload, returning null for anything it cannot fully trust.
 *
 * Same contract as loadCareer: every failure is null and the caller falls back
 * to the local save. This runs at sign-in, before first paint, so a throw here
 * is a black screen on a game that works perfectly well offline.
 *
 * Migration runs BEFORE validation, exactly as the local loads do. It matters
 * more here: a cloud save outlives the device that wrote it, so cloud is the
 * likelier source of an old format, not the rarer one.
 */
export function parseCloud(raw: string): CloudSnapshot | null {
  try {
    const migrated = migrateSave(JSON.parse(raw), CLOUD_SAVE_VERSION, CLOUD_MIGRATIONS)
    if (!migrated.data) {
      console.warn('[cloud] discarding snapshot —', migrated.reason)
      return null
    }
    const parsed = CloudSnapshotSchema.safeParse(migrated.data)
    if (!parsed.success) {
      console.warn('[cloud] discarding unreadable snapshot', parsed.error.issues[0]?.message)
      return null
    }
    return parsed.data
  } catch (err: unknown) {
    console.warn('[cloud] snapshot could not be read — keeping the local save', err)
    return null
  }
}
