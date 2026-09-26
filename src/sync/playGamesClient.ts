import { Capacitor } from '@capacitor/core'
import { PlayGames } from '@modbender/capacitor-play-games'
import type { PlayGamesClient, PlayGamesStatus } from './types'

/**
 * The ONLY file in this codebase that imports the Play Games plugin.
 *
 * Everything else depends on the PlayGamesClient interface, for the reasons
 * in types.ts. Keep this file thin: it translates, it does not decide. Any
 * logic that lands here is logic no test can reach, because vitest cannot run
 * a native Android plugin.
 *
 * Every method swallows its failures and degrades to the offline answer. A
 * game that is fully playable without Play Games must not be able to crash
 * because Play Games misbehaved.
 */

const SIGNED_OUT: PlayGamesStatus = { available: false, signedIn: false, playerId: null }

/**
 * Play Games resolves conflicts itself and does not expose manual resolution
 * (the plugin README is explicit about this). Its default is
 * "mostRecentlyModified", which is precisely the rule cloudSave.pickFurther
 * exists to avoid -- a second device syncing late would overwrite a longer
 * career with a shorter one.
 *
 * "highestProgress" plus the progress number we pass on every save makes the
 * automatic resolution agree with ours.
 */
const CONFLICT_POLICY = 'highestProgress' as const

export const playGamesClient: PlayGamesClient = {
  async status() {
    if (!Capacitor.isNativePlatform()) return SIGNED_OUT
    try {
      const { signedIn } = await PlayGames.isSignedIn()
      return { available: true, signedIn, playerId: null }
    } catch {
      return SIGNED_OUT
    }
  },

  async signIn() {
    if (!Capacitor.isNativePlatform()) return SIGNED_OUT
    try {
      // silent: the PGS v2 contract is that sign-in happens without a prompt
      // for players who have used Play Games before. An interactive flow here
      // would put a Google dialog in front of a player who opened a
      // single-player game, which is exactly the thing v2 removed.
      const res = await PlayGames.signIn({ silent: true })
      return {
        available: true,
        signedIn: res.signedIn,
        playerId: res.player?.playerId ?? null,
      }
    } catch {
      return SIGNED_OUT
    }
  },

  async loadSnapshot(name) {
    if (!Capacitor.isNativePlatform()) return null
    try {
      const { snapshot } = await PlayGames.loadSnapshot({ name, conflictPolicy: CONFLICT_POLICY })
      return snapshot?.data ?? null
    } catch {
      return null
    }
  },

  async saveSnapshot({ name, data, description, progress }) {
    if (!Capacitor.isNativePlatform()) return
    try {
      await PlayGames.saveSnapshot({
        name, data, description,
        progressValue: progress,
        conflictPolicy: CONFLICT_POLICY,
      })
    } catch {
      // Deliberately silent. A failed cloud write must never surface as an
      // error the player has to dismiss: the local save is the source of
      // truth and the next save point writes again.
    }
  },

  async unlockAchievement(achievementId) {
    if (!Capacitor.isNativePlatform()) return
    try {
      await PlayGames.unlockAchievement({ id: achievementId })
    } catch { /* an unearned-looking badge is not worth a crash */ }
  },
}
