/**
 * The remaining Play/Firebase surfaces, behind interfaces for the same reason
 * PlayGamesClient is: vitest cannot load a native Capacitor plugin, and a
 * single stray import drags one into the module graph of everything that
 * imports it. See the note in types.ts -- that failure happened for real.
 *
 * Each of these has exactly one implementation that touches a plugin, in
 * platform.ts, which nothing re-exports.
 */

/** Crash reporting only. Analytics collection is disabled in the manifest. */
export interface CrashReporter {
  setEnabled(enabled: boolean): Promise<void>
  log(message: string): Promise<void>
}

export interface ReviewPrompter {
  /** Ask Play for the in-app review sheet. Google throttles whether it shows. */
  request(): Promise<void>
}

export interface UpdateChecker {
  /** True when a newer version is on Play. */
  updateAvailable(): Promise<boolean>
  /** Non-blocking update. Never forces; see the design spec §7. */
  startFlexible(): Promise<void>
}

export interface IntegrityChecker {
  /** A token, or null. Nothing is gated on this -- see §7. */
  token(nonce: string): Promise<string | null>
}

/*
 * The no-op set. These are the defaults, so "no Play services" is the
 * starting state rather than a path someone has to remember to handle, and
 * they are what every component test runs through.
 */
export const noCrashReporter: CrashReporter = {
  async setEnabled() {}, async log() {},
}
export const noReviewPrompter: ReviewPrompter = { async request() {} }
export const noUpdateChecker: UpdateChecker = {
  async updateAvailable() { return false }, async startFlexible() {},
}
export const noIntegrityChecker: IntegrityChecker = { async token() { return null } }
