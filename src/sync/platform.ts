import { Capacitor } from '@capacitor/core'
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics'
import { InAppReview } from '@capacitor-community/in-app-review'
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'
import { PlayIntegrity } from '@capacitor-community/play-integrity'
import type {
  CrashReporter, ReviewPrompter, UpdateChecker, IntegrityChecker,
} from './platformTypes'

/**
 * The only file that imports the Crashlytics, review, update and integrity
 * plugins. Same contract as playGamesClient.ts: translate, never decide, and
 * never let a plugin failure reach the player.
 *
 * Nothing re-exports this module from index.ts. A barrel export of a
 * plugin-backed implementation is what broke every sync test the first time.
 */

const native = () => Capacitor.isNativePlatform()

/**
 * The Google Cloud / Play Games project number.
 *
 * This is the SECOND place it lives: the first is
 * android/app/src/main/res/values/strings.xml, which the Games SDK reads and
 * which TypeScript cannot see. Two copies of a magic number is a bug waiting
 * to happen, so tests/data/playGamesConfig.test.ts asserts they agree.
 */
export const CLOUD_PROJECT_NUMBER = 609398586580

export const crashReporter: CrashReporter = {
  async setEnabled(enabled) {
    if (!native()) return
    try { await FirebaseCrashlytics.setEnabled({ enabled }) } catch { /* reporting is not worth a crash */ }
  },
  async log(message) {
    if (!native()) return
    try { await FirebaseCrashlytics.log({ message }) } catch { /* ditto */ }
  },
}

export const reviewPrompter: ReviewPrompter = {
  async request() {
    if (!native()) return
    try { await InAppReview.requestReview() } catch { /* the sheet is optional by design */ }
  },
}

export const updateChecker: UpdateChecker = {
  async updateAvailable() {
    if (!native()) return false
    try {
      const info = await AppUpdate.getAppUpdateInfo()
      return info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE
    } catch { return false }
  },
  async startFlexible() {
    if (!native()) return
    try { await AppUpdate.startFlexibleUpdate() } catch { /* the player keeps the version they have */ }
  },
}

export const integrityChecker: IntegrityChecker = {
  async token(nonce) {
    if (!native()) return null
    try {
      const res = await PlayIntegrity.requestIntegrityToken({
        nonce, googleCloudProjectNumber: CLOUD_PROJECT_NUMBER,
      })
      return res.token ?? null
    } catch { return null }
  },
}
