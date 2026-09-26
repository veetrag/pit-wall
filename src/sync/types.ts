import type { CloudSnapshot } from './cloudSave'

/**
 * The boundary between this game and Google Play Games.
 *
 * Exactly one file in the codebase imports the Play Games plugin, and it is
 * the one that implements this interface. Everything else -- the sync brain,
 * the achievement mapping, the stores, the UI -- depends on these five methods
 * and nothing else.
 *
 * Two reasons, and the second is the one that matters:
 *
 * 1. Vitest cannot run a native Android plugin, so anything that imported it
 *    directly would be untestable. Behind an interface, every decision is
 *    tested against a fake and only the thin wrapper needs a device.
 *
 * 2. There is no official Play Games plugin for Capacitor. The one this
 *    project uses is pre-1.0 and has a single maintainer, which is an
 *    uncomfortable thing to put underneath the only feature that justifies the
 *    INTERNET permission. Behind an interface, replacing it -- or writing our
 *    own native plugin -- is a change to one file instead of a change to the
 *    game. See the design spec §2.
 */
export interface PlayGamesStatus {
  /** False on the web build, on devices with no Play Games, and after any
   *  failure. The game must be fully playable in this state. */
  available: boolean
  signedIn: boolean
  playerId: string | null
}

export interface PlayGamesClient {
  status(): Promise<PlayGamesStatus>
  signIn(): Promise<PlayGamesStatus>
  /** The raw payload, or null when there is no cloud save or it cannot be read. */
  loadSnapshot(name: string): Promise<string | null>
  saveSnapshot(name: string, data: string, description: string): Promise<void>
  unlockAchievement(achievementId: string): Promise<void>
}

/**
 * The client the app uses until a real one proves itself, and the one it falls
 * back to on any failure.
 *
 * This exists so that "the game works with no network, no Play Games and no
 * account" is the DEFAULT rather than a path somebody has to remember to
 * handle. Every method succeeds and does nothing; nothing here can throw, so
 * no caller needs a try/catch to stay alive.
 */
export const offlineClient: PlayGamesClient = {
  async status() { return { available: false, signedIn: false, playerId: null } },
  async signIn() { return { available: false, signedIn: false, playerId: null } },
  async loadSnapshot() { return null },
  async saveSnapshot() { /* nothing to save to */ },
  async unlockAchievement() { /* nothing to unlock */ },
}

/** What sign-in should do, given what is on the device and what is in the cloud. */
export type Reconciliation =
  | { action: 'upload'; snapshot: CloudSnapshot }
  | { action: 'download'; snapshot: CloudSnapshot }
  | { action: 'none' }
