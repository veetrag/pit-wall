import { Preferences } from '@capacitor/preferences'
import {
  noCrashReporter, noReviewPrompter, noUpdateChecker, noIntegrityChecker,
  type CrashReporter, type ReviewPrompter, type UpdateChecker, type IntegrityChecker,
} from './platformTypes'
import { shouldAskForReview } from './reviewPolicy'

/**
 * The join between the Play/Firebase surfaces and the game.
 *
 * Injected, not imported, for the reason set out in storeBridge: UI calls
 * these and UI renders in tests. Starting from the no-op set means those
 * tests exercise the real path and it does nothing -- which is also what
 * happens on the web build.
 */

let crash: CrashReporter = noCrashReporter
let review: ReviewPrompter = noReviewPrompter
let updates: UpdateChecker = noUpdateChecker
let integrity: IntegrityChecker = noIntegrityChecker

export function setPlatformClients(c: {
  crash?: CrashReporter; review?: ReviewPrompter
  updates?: UpdateChecker; integrity?: IntegrityChecker
}): void {
  if (c.crash) crash = c.crash
  if (c.review) review = c.review
  if (c.updates) updates = c.updates
  if (c.integrity) integrity = c.integrity
}

/** Test seam: back to the no-ops. */
export function resetPlatformClients(): void {
  crash = noCrashReporter; review = noReviewPrompter
  updates = noUpdateChecker; integrity = noIntegrityChecker
}

// --- crash reporting -------------------------------------------------------

export async function startCrashReporting(): Promise<void> {
  await crash.setEnabled(true)
  await crash.log(`Pit Wall ${__APP_VERSION__} started`)
}

// --- in-app review ---------------------------------------------------------

const REVIEW_ASKED_KEY = 'review.asked'

async function hasAsked(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: REVIEW_ASKED_KEY })
    return value === 'true'
  } catch {
    // Unreadable preferences must read as "already asked". Failing the other
    // way would re-prompt on every championship, which is the behaviour most
    // likely to earn the one-star review the prompt is meant to avoid.
    return true
  }
}

/**
 * Ask for a review if this is the right moment. Returns whether it asked, for
 * tests -- Google gives no way to find out whether the sheet appeared.
 */
export async function maybeAskForReview(championshipPosition: number): Promise<boolean> {
  const alreadyAsked = await hasAsked()
  if (!shouldAskForReview({ championshipPosition, alreadyAsked })) return false
  // Recorded BEFORE the request, deliberately. If the plugin throws we still
  // must not ask again; an unshown prompt costs nothing, a repeated one does.
  try { await Preferences.set({ key: REVIEW_ASKED_KEY, value: 'true' }) } catch { /* best effort */ }
  await review.request()
  return true
}

// --- in-app updates --------------------------------------------------------

/**
 * A non-blocking update check at startup.
 *
 * Flexible only. An immediate (forced) update is for games with a server
 * contract that a stale client can break; this one has none, so blocking a
 * player out of a game they already have would be pure cost.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!await updates.updateAvailable()) return false
  await updates.startFlexible()
  return true
}

// --- play integrity --------------------------------------------------------

/**
 * Plumbing. Nothing is gated on the result and nothing calls this yet: there
 * are no leaderboards and no purchases to protect. It exists so that a later
 * leaderboard does not have to retrofit it, and a null answer must always
 * remain playable.
 */
export async function integrityToken(nonce: string): Promise<string | null> {
  return integrity.token(nonce)
}
