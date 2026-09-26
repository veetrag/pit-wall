import { useCareerStore } from '@state/careerStore'
import { useSeasonStore } from '@state/seasonStore'
import {
  careerSnapshotFrom, loadCareer, saveCareer,
} from '@state/careerPersistence'
import {
  snapshotFrom, loadSnapshot, saveSnapshot, clearSnapshot,
} from '@state/seasonPersistence'
import { CLOUD_SAVE_VERSION, type CloudSnapshot } from './cloudSave'
import { syncAtStartup, pushSave, type SyncDeps, type SyncOutcome } from './cloudSync'
import { offlineClient, type PlayGamesClient } from './types'
import { unlockFor } from './achievements'

/**
 * The join between cloud save and this game's stores.
 *
 * Everything Play-Games-shaped lives in cloudSync and is tested there against
 * a fake; everything store-shaped lives here. This file is the only one that
 * knows both, and it is deliberately dull: build a snapshot, or apply one.
 *
 * Direction of imports: sync/ -> state/, never the reverse. The stores must
 * not learn about the cloud, or every test that touches a store starts
 * dragging a native plugin behind it.
 */

/** The current local state as one snapshot, or null when there is no career. */
export function readLocalSnapshot(): CloudSnapshot | null {
  const career = careerSnapshotFrom(useCareerStore.getState())
  if (!career) return null
  return {
    v: CLOUD_SAVE_VERSION,
    career,
    // snapshotFrom returns null on transient screens, which is the right
    // answer here too: a cloud save taken mid-qualifying should carry the
    // career and let the season resume from its last real save point.
    season: snapshotFrom(useSeasonStore.getState()),
    savedAt: Date.now(),
  }
}

/**
 * Replace local state with a snapshot from the cloud.
 *
 * Writes to storage BEFORE touching the stores, deliberately. MainMenu also
 * hydrates from storage on mount, so if the stores were updated first, a
 * remount could read the old save back over the download. Writing first makes
 * the two orders agree.
 */
export async function applyRemoteSnapshot(snap: CloudSnapshot): Promise<void> {
  await saveCareer(snap.career)
  if (snap.season) await saveSnapshot(snap.season)
  else await clearSnapshot()

  useCareerStore.getState().resumeCareer(snap.career)
  if (snap.season) useSeasonStore.getState().resumeSeason(snap.season)
}

/**
 * The client every cloud call goes through, defaulting to the no-op.
 *
 * Injected rather than imported, and this is load-bearing. UI components call
 * pushCloudSave, and several of them are rendered in tests; an import of the
 * real client anywhere in that graph pulls a native Capacitor plugin into
 * vitest, which cannot load it. Starting from offlineClient means those tests
 * exercise the real call path and it simply does nothing -- which is also
 * exactly what should happen on the web build and on a device with no Play
 * Games.
 *
 * App.tsx, the one module outside every test graph, swaps in the real one.
 */
let activeClient: PlayGamesClient = offlineClient

export function setCloudClient(client: PlayGamesClient): void {
  activeClient = client
}

function deps(): SyncDeps {
  return {
    client: activeClient,
    readLocal: readLocalSnapshot,
    applyRemote: (snap) => { void applyRemoteSnapshot(snap) },
  }
}

/**
 * Run once at app start.
 *
 * Hydrates from local storage first and only then reconciles with the cloud,
 * because "what is on this device" has to be known before it can be compared
 * with anything. A cloud sync that ran against an empty store would look
 * exactly like a fresh install and download over a real career.
 */
export async function startCloudSync(): Promise<SyncOutcome> {
  const [career, season] = await Promise.all([loadCareer(), loadSnapshot()])
  if (career) useCareerStore.getState().resumeCareer(career)
  if (season) useSeasonStore.getState().resumeSeason(season)
  return syncAtStartup(deps())
}

/**
 * Mirror newly-earned badges to Play Games achievements.
 *
 * Subscribes to careerStore rather than being called from a screen, for the
 * same reason the save autosubscribes: the toast fires on two different
 * screens today and a third tomorrow, and an unlock that depends on which
 * screen you were looking at is an unlock that will eventually be missed.
 *
 * `justEarned` is the same signal BadgeToast reads, so the in-game surface
 * and the Play Games profile cannot disagree about what was earned.
 */
export function startAchievementSync(): () => void {
  let last: readonly string[] = []
  return useCareerStore.subscribe((state) => {
    const earned = state.justEarned
    if (earned === last || earned.length === 0) return
    last = earned
    void unlockFor(activeClient, earned)
  })
}

/** Push at a save point. Fire-and-forget; failures are never the player's problem. */
export function pushCloudSave(): void {
  void pushSave(deps())
}
