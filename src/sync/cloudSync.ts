import { parseCloud, serialiseCloud, type CloudSnapshot } from './cloudSave'
import { reconcile } from './reconcile'
import type { PlayGamesClient } from './types'

/**
 * The cloud-save lifecycle: sign in, compare, act.
 *
 * Every dependency is injected rather than imported, so the whole thing runs
 * under vitest against a fake client. The alternative -- reaching for the
 * stores and the plugin directly -- would make the only untestable part of
 * the feature the part that decides whether a career survives.
 */

/** The snapshot name. One save slot; the game has one career. */
export const CAREER_SNAPSHOT = 'pitwall.career'

export interface SyncDeps {
  client: PlayGamesClient
  /** The current local state as a snapshot, or null when there is no career. */
  readLocal: () => CloudSnapshot | null
  /** Replace local state with a snapshot pulled from the cloud. */
  applyRemote: (snap: CloudSnapshot) => void
}

export type SyncOutcome =
  | 'unavailable'  // no Play Games, not signed in, or the device is offline
  | 'uploaded'
  | 'downloaded'
  | 'in-step'      // both sides already agree; nothing to do
  | 'failed'

/**
 * How far along a career is, as one number, for Play Games' own conflict
 * resolution.
 *
 * Races started rather than seasons, because it is strictly finer-grained and
 * orders careers the same way: seasonNumber only advances through
 * rollOverSeason, which happens after a full twelve-race season, so more
 * seasons always means more races. A single number is all the SDK accepts.
 */
export function progressOf(snap: CloudSnapshot): number {
  return snap.career.racesStarted
}

function describe(snap: CloudSnapshot): string {
  const { seasonNumber, titles } = snap.career
  const titlePart = titles === 1 ? '1 title' : `${titles} titles`
  return `Season ${seasonNumber} — ${titlePart}`
}

/**
 * Run once at startup, after sign-in.
 *
 * Never throws. Every failure path returns an outcome and leaves the local
 * save untouched, because the local save is the source of truth and the game
 * is fully playable with no network at all.
 */
export async function syncAtStartup(deps: SyncDeps): Promise<SyncOutcome> {
  const { client, readLocal, applyRemote } = deps
  try {
    const status = await client.signIn()
    if (!status.available || !status.signedIn) return 'unavailable'

    const raw = await client.loadSnapshot(CAREER_SNAPSHOT)
    const remote = raw === null ? null : parseCloud(raw)
    const local = readLocal()

    const decision = reconcile(local, remote)
    if (decision.action === 'none') return 'in-step'

    if (decision.action === 'download') {
      applyRemote(decision.snapshot)
      return 'downloaded'
    }

    await client.saveSnapshot({
      name: CAREER_SNAPSHOT,
      data: serialiseCloud(decision.snapshot),
      description: describe(decision.snapshot),
      progress: progressOf(decision.snapshot),
    })
    return 'uploaded'
  } catch {
    return 'failed'
  }
}

/**
 * Push the current local state, at a save point.
 *
 * Deliberately NOT a reconcile: by this point the player has made progress on
 * this device and it is the newest state that exists. Re-reading the cloud
 * here would reopen a decision that startup already settled, and could pull a
 * stale career back over a race that was just finished.
 */
export async function pushSave(deps: SyncDeps): Promise<SyncOutcome> {
  const { client, readLocal } = deps
  try {
    const status = await client.status()
    if (!status.available || !status.signedIn) return 'unavailable'

    const local = readLocal()
    if (!local) return 'in-step'   // nothing to push; never clear the cloud

    await client.saveSnapshot({
      name: CAREER_SNAPSHOT,
      data: serialiseCloud(local),
      description: describe(local),
      progress: progressOf(local),
    })
    return 'uploaded'
  } catch {
    return 'failed'
  }
}
