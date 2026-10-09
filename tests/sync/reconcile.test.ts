import { describe, it, expect } from 'vitest'
import { reconcile, offlineClient, CLOUD_SAVE_VERSION, type CloudSnapshot } from '@sync/index'

function snap(o: { seasonNumber?: number; racesStarted?: number; savedAt?: number } = {}): CloudSnapshot {
  return {
    v: CLOUD_SAVE_VERSION,
    career: {
      v: 1, seasonNumber: o.seasonNumber ?? 1, titles: 0, wins: 0, seasonWins: 0,
      podiums: 0, poles: 0, racesStarted: o.racesStarted ?? 0,
      bestFinish: null, seasonHistory: [], raceLog: [], teamTiers: {},
    },
    season: null,
    savedAt: o.savedAt ?? 1000,
  }
}

describe('reconcile', () => {
  it('DOES NOTHING WHEN THERE IS NOTHING ANYWHERE', () => {
    expect(reconcile(null, null)).toEqual({ action: 'none' })
  })

  it('UPLOADS A CAREER THE CLOUD HAS NEVER SEEN', () => {
    const local = snap({ seasonNumber: 3 })
    expect(reconcile(local, null)).toEqual({ action: 'upload', snapshot: local })
  })

  it('DOWNLOADS ONTO A FRESH INSTALL', () => {
    // The whole point of the feature: a new phone, no local save, a career in
    // the cloud.
    const remote = snap({ seasonNumber: 5, racesStarted: 54 })
    expect(reconcile(null, remote)).toEqual({ action: 'download', snapshot: remote })
  })

  it('DOES NOT CHURN A WRITE WHEN BOTH SIDES ALREADY AGREE', () => {
    // A single device reopening the app hits this on every launch. Returning
    // 'upload' here would write an identical payload forever.
    expect(reconcile(snap({ seasonNumber: 2 }), snap({ seasonNumber: 2 }))).toEqual({ action: 'none' })
  })

  it('UPLOADS WHEN THE DEVICE IS AHEAD', () => {
    const local = snap({ seasonNumber: 4 })
    const remote = snap({ seasonNumber: 2 })
    expect(reconcile(local, remote)).toEqual({ action: 'upload', snapshot: local })
  })

  it('DOWNLOADS WHEN THE CLOUD IS AHEAD', () => {
    const local = snap({ seasonNumber: 1 })
    const remote = snap({ seasonNumber: 6 })
    expect(reconcile(local, remote)).toEqual({ action: 'download', snapshot: remote })
  })

  it('NEVER DOWNLOADS OVER A LONGER LOCAL CAREER, HOWEVER RECENT THE CLOUD', () => {
    /*
     * The failure this whole design exists to prevent: a second device that
     * syncs late overwriting a long career with a short one. If this ever
     * returns 'download', a player loses seasons of progress silently.
     */
    const local = snap({ seasonNumber: 7, racesStarted: 80, savedAt: 1 })
    const remote = snap({ seasonNumber: 2, racesStarted: 12, savedAt: 9_999_999 })
    expect(reconcile(local, remote).action).toBe('upload')
  })
})

describe('the offline client', () => {
  /*
   * The game must be fully playable with no Play Games, no account and no
   * network. That is a product requirement, so it gets a test rather than a
   * comment: this is the client the app starts with and falls back to.
   */
  it('REPORTS UNAVAILABLE RATHER THAN FAILING', async () => {
    expect(await offlineClient.status()).toEqual({ available: false, signedIn: false, playerId: null })
    expect(await offlineClient.signIn()).toEqual({ available: false, signedIn: false, playerId: null })
  })

  it('SWALLOWS EVERY OPERATION WITHOUT THROWING', async () => {
    // No caller should need a try/catch to stay alive on the offline path.
    await expect(offlineClient.loadSnapshot('career')).resolves.toBeNull()
    await expect(offlineClient.saveSnapshot({
      name: 'career', data: '{}', description: 'x', progress: 0,
    })).resolves.toBeUndefined()
    await expect(offlineClient.unlockAchievement('anything')).resolves.toBeUndefined()
  })
})
