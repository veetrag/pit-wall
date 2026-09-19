import { z } from 'zod'
import { Preferences } from '@capacitor/preferences'
import { useSeasonStore } from './seasonStore'
import type { SeasonPhase } from './seasonStore'

/**
 * Season save/resume.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A COUPLE OF CALLS IN seasonStore.
 * There was an earlier attempt at this. It wrote on every transition and was
 * completely dead: `startNewSeason` reset `raceIndex` to 0 on the way past, and
 * `loadSeason` never restored `phase`, so every write was discarded on load and
 * nothing ever resumed. No test noticed, because the tests asserted that the
 * write HAPPENED rather than that a season came BACK. It was deleted rather
 * than finished.
 *
 * Two rules follow from that, and both are load-bearing here:
 *
 * 1. THE SAVE IS DERIVED, NEVER REMEMBERED. `startSeasonAutosave` subscribes to
 *    the store and recomputes the whole snapshot on every change. There is no
 *    call site to forget, and no way for one action to update the season while
 *    quietly skipping the save.
 * 2. THE TEST IS A ROUND TRIP. Asserting a write occurred is what let the last
 *    version ship broken. tests/state/seasonPersistence.test.ts drives the real
 *    store through a real race and asserts the season comes back.
 */

export const SAVE_KEY = 'season.save'

/**
 * Bumped whenever the snapshot shape changes incompatibly. An older or newer
 * version loads as `null` -- the player loses a season, which is bad, but far
 * better than restoring a half-shaped object into the store and crashing on a
 * screen they cannot get out of.
 *
 * Bumped to 2 when career landed. currentSeed() now includes a season term, so
 * a v1 save resuming into a career-less store would run different races than it
 * was saved under -- silently. Failing the parse and discarding is the honest
 * outcome, and it is only acceptable because the game has not shipped. Once it
 * has, a migration layer is a prerequisite for any further bump.
 */
export const SAVE_VERSION = 2

/** The phases a season can resume INTO. Menus and detours are not among them. */
export type ResumePhase = 'development' | 'race_setup' | 'result' | 'championship'

/**
 * Where each phase resumes to, or null for "don't touch the save".
 *
 * `racing` maps to `race_setup`, deliberately. Mid-race state lives in
 * raceStore and is NOT persisted: a race is 56 laps x 3 sectors x 20 cars of
 * mutable state, and the engine is deterministic anyway, so the honest offer is
 * "restart this round", not a half-restored race. The player keeps their
 * standings, their development points and their place in the calendar.
 *
 * The menu/settings/grid/how-to-play detours map to null rather than to
 * anything, because a player opening Settings mid-season must not overwrite
 * their save with a snapshot that says they are sitting in a menu.
 */
const RESUME_PHASE: Record<SeasonPhase, ResumePhase | null> = {
  menu: null,
  grid: null,
  team_select: null,
  driver_select: null,
  how_to_play: null,
  settings: null,
  development: 'development',
  race_setup: 'race_setup',
  // 'race_setup', NOT null. A player in qualifying is genuinely mid-season, so
  // the save should be written -- unlike the menu/settings detours above, which
  // map to null precisely so they cannot overwrite a save with "sitting in a
  // menu". This matches `racing` directly below: a QualifyingResult's validity
  // depends on config that may have changed between launches, so the honest
  // offer on reload is "set up the round again", not a half-restored session.
  qualifying: 'race_setup',
  racing: 'race_setup',
  result: 'result',
  championship: 'championship',
  // A scenario is not a season. It has no standings, no development and no
  // round, so there is nothing to resume INTO -- and mapping any of these to a
  // real phase would let a scenario overwrite a championship in progress.
  scenario_select: null, scenario_racing: null, scenario_result: null,
}

const StandingSchema = z.object({ driverId: z.string(), points: z.number() })
const SeasonResultSchema = z.object({
  driverId: z.string(),
  position: z.number(),
  points: z.number(),
  retired: z.boolean(),
  retiredCause: z.enum(['tyre', 'mechanical', 'crash']).nullable(),
})
const RaceEventSummarySchema = z.object({
  overtakesGained: z.number(),
  pitsDone: z.number(),
  hadRain: z.boolean(),
})
const PlayerStrategySchema = z.object({
  startCompound: z.enum(['S', 'M', 'H', 'I', 'W']),
  plannedStops: z.array(z.object({ lap: z.number(), compound: z.enum(['S', 'M', 'H', 'I', 'W']) })),
})

export const SeasonSnapshotSchema = z.object({
  v: z.literal(SAVE_VERSION),
  resumePhase: z.enum(['development', 'race_setup', 'result', 'championship']),
  playerDriverId: z.string(),
  selectedTeamId: z.string().nullable(),
  selectedCircuitId: z.string().nullable(),
  raceIndex: z.number(),
  standings: z.array(StandingSchema),
  playerStrategy: PlayerStrategySchema.nullable(),
  attemptNonce: z.number(),
  devPoints: z.number(),
  purchasedTiers: z.record(z.string(), z.number()),
  rivalDevelopment: z.record(z.string(), z.number()),
  lastRaceResults: z.array(SeasonResultSchema).nullable(),
  lastRaceEvents: RaceEventSummarySchema.nullable(),
})

export type SeasonSnapshot = z.infer<typeof SeasonSnapshotSchema>

type SeasonState = ReturnType<typeof useSeasonStore.getState>

/**
 * The snapshot for the current store state, or null when there is nothing worth
 * saving -- either no season is in progress, or the player is on a transient
 * screen and the existing save should be left alone.
 *
 * Pure, so the mapping can be tested without touching Preferences.
 */
export function snapshotFrom(s: SeasonState): SeasonSnapshot | null {
  // No driver chosen means no season: the menu, or a season just abandoned.
  // Both startNewSeason and playAgain null this, which is how a save gets
  // cleared without either of them having to remember to say so.
  if (!s.playerDriverId) return null
  const resumePhase = RESUME_PHASE[s.phase]
  if (!resumePhase) return null
  return {
    v: SAVE_VERSION,
    resumePhase,
    playerDriverId: s.playerDriverId,
    selectedTeamId: s.selectedTeamId,
    selectedCircuitId: s.selectedCircuitId,
    raceIndex: s.raceIndex,
    standings: s.standings,
    playerStrategy: s.playerStrategy,
    attemptNonce: s.attemptNonce,
    devPoints: s.devPoints,
    purchasedTiers: s.purchasedTiers,
    rivalDevelopment: s.rivalDevelopment,
    lastRaceResults: s.lastRaceResults,
    lastRaceEvents: s.lastRaceEvents,
  }
}

export async function saveSnapshot(snap: SeasonSnapshot): Promise<void> {
  await Preferences.set({ key: SAVE_KEY, value: JSON.stringify(snap) })
}

export async function clearSnapshot(): Promise<void> {
  await Preferences.remove({ key: SAVE_KEY })
}

/**
 * Reads the save, returning null for anything it cannot fully trust.
 *
 * Every failure path is the same: null, and the player gets a clean menu. A
 * save is not worth a crash on a screen with no way out, and this runs before
 * first paint.
 */
export async function loadSnapshot(): Promise<SeasonSnapshot | null> {
  try {
    const { value } = await Preferences.get({ key: SAVE_KEY })
    if (!value) return null
    const parsed = SeasonSnapshotSchema.safeParse(JSON.parse(value))
    if (!parsed.success) {
      console.warn('[season] discarding unreadable save', parsed.error.issues[0]?.message)
      return null
    }
    return parsed.data
  } catch (err: unknown) {
    console.warn('[season] save could not be read — starting fresh', err)
    return null
  }
}

/**
 * Subscribes to the store and keeps the save in step. Returns an unsubscribe.
 *
 * Writes are fire-and-forget on purpose: a failed write must never block a
 * state transition mid-race, and the next change writes again anyway.
 */
export function startSeasonAutosave(): () => void {
  let last: string | null = null
  return useSeasonStore.subscribe((state) => {
    const snap = snapshotFrom(state)
    if (!snap) {
      // Only clear when the season itself is gone, not when the player is
      // merely looking at Settings mid-season.
      if (!state.playerDriverId && last !== null) {
        last = null
        void clearSnapshot()
      }
      return
    }
    const serialised = JSON.stringify(snap)
    if (serialised === last) return   // no-op transitions must not churn writes
    last = serialised
    void saveSnapshot(snap)
  })
}
