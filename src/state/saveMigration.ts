/**
 * Save migrations.
 *
 * Both save files pin their version with `z.literal(...)`, so today anything
 * that is not the current version is DISCARDED -- the player silently loses
 * their season or their career. That was an acceptable trade while the game
 * was unreleased and the only saves in existence were on this machine. It
 * stops being acceptable the moment someone else has a save on their phone,
 * because from then on every schema change is a choice between "never change
 * the shape again" and "delete a stranger's career".
 *
 * This module is the third option: name the old shape, describe how to reach
 * the new one, and keep the save.
 *
 * DESIGN NOTES
 *
 * - A migration takes the raw parsed JSON at version N and returns the raw
 *   shape at version N+1. It is deliberately typed `unknown -> unknown`: the
 *   input is an OLD shape that no longer exists in the type system, and
 *   pretending otherwise by typing it as the current interface is how
 *   migrations silently rot. The zod schema at the end is the arbiter.
 * - Migrations run in a chain: v1 -> v2 -> v3. Writing each step against only
 *   its immediate successor is what keeps them writable years later; a
 *   migration that jumps two versions has to be re-verified every time a new
 *   one is added.
 * - A GAP in the chain is fatal, not skippable. If v2 is missing, a v1 save is
 *   discarded rather than handed to the v3 migration, because the v3
 *   migration was never written to accept it.
 * - A save from the FUTURE (a downgrade) is always discarded. We cannot know
 *   what a later version added, and guessing risks restoring a half-shaped
 *   object into the store.
 */

/** Transforms the raw save at version N into the raw save at version N+1. */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version the migration reads FROM. */
export type MigrationRegistry = Record<number, Migration>

export interface MigrationOutcome {
  /** The migrated raw object, or null if the save must be discarded. */
  data: Record<string, unknown> | null
  /**
   * Why, in words, for the console. Callers log it; tests assert on it, which
   * is the only way to tell "migrated cleanly" from "silently discarded".
   */
  reason: string
}

function versionOf(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = (raw as Record<string, unknown>)['v']
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

/**
 * Brings a raw save up to `currentVersion`, or refuses.
 *
 * Pure: no Preferences, no store, no logging. That is what makes every branch
 * below testable without a device.
 */
export function migrateSave(
  raw: unknown,
  currentVersion: number,
  migrations: MigrationRegistry,
): MigrationOutcome {
  const from = versionOf(raw)
  if (from === null) return { data: null, reason: 'no readable version field' }
  if (from === currentVersion) return { data: raw as Record<string, unknown>, reason: 'already current' }
  if (from > currentVersion) {
    return { data: null, reason: `save is from a newer version (v${from} > v${currentVersion})` }
  }

  let current = raw as Record<string, unknown>
  for (let v = from; v < currentVersion; v++) {
    const step = migrations[v]
    if (!step) {
      return { data: null, reason: `no migration from v${v}; a v${from} save cannot be read` }
    }
    try {
      current = { ...step(current), v: v + 1 }
    } catch (err: unknown) {
      // A throwing migration must not take the app down on the loading screen.
      return { data: null, reason: `migration v${v} -> v${v + 1} failed: ${String(err)}` }
    }
  }
  return { data: current, reason: `migrated v${from} -> v${currentVersion}` }
}

/*
 * ----------------------------------------------------------------------------
 * THE REGISTRIES
 *
 * Both are empty, and that is correct today: the season save is at v2 and the
 * career save at v1, and there is no older shape still in the wild that we
 * have undertaken to keep.
 *
 * Specifically, season v1 is NOT migrated and must not be. A v1 save predates
 * the career, and currentSeed() now includes a season term -- resuming a v1
 * save would run DIFFERENT RACES than the ones it recorded. Discarding it is
 * the honest outcome, and seasonPersistence.ts:36 has said so since career
 * landed.
 *
 * WHEN YOU NEXT CHANGE A SAVE SHAPE:
 *   1. Bump the version constant.
 *   2. Add a migration keyed by the OLD version here.
 *   3. Add a test with a REAL old save object, not a hand-tidied one.
 * If the change is purely additive, prefer a zod `.default()` and no bump at
 * all -- that is what raceLog did, and it cost nothing.
 * ----------------------------------------------------------------------------
 */

export const SEASON_MIGRATIONS: MigrationRegistry = {}
export const CAREER_MIGRATIONS: MigrationRegistry = {}
