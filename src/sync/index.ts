export {
  CLOUD_SAVE_VERSION, CLOUD_MIGRATIONS, CloudSnapshotSchema,
  pickFurther, serialiseCloud, parseCloud, type CloudSnapshot,
} from './cloudSave'
export { offlineClient, type PlayGamesClient, type PlayGamesStatus, type Reconciliation } from './types'
export { reconcile } from './reconcile'
export {
  syncAtStartup, pushSave, progressOf, CAREER_SNAPSHOT,
  type SyncDeps, type SyncOutcome,
} from './cloudSync'
/*
 * playGamesClient is deliberately NOT re-exported here.
 *
 * This barrel is what tests import, and re-exporting the plugin-backed client
 * drags @modbender/capacitor-play-games into the module graph of every one of
 * them -- which fails outright under vitest ("require is not defined in ES
 * module scope"), because a native Capacitor plugin is not something node can
 * load. That is the entire reason the PlayGamesClient interface exists, and a
 * convenience re-export quietly undoes it.
 *
 * The one place that needs the real client imports it by path:
 *   import { playGamesClient } from '@sync/playGamesClient'
 */
