import { describe, it, expect, vi } from 'vitest'
import {
  syncAtStartup, pushSave, progressOf, CAREER_SNAPSHOT,
  serialiseCloud, CLOUD_SAVE_VERSION, type CloudSnapshot, type PlayGamesClient,
} from '@sync/index'

function snap(o: { seasonNumber?: number; racesStarted?: number; titles?: number; savedAt?: number } = {}): CloudSnapshot {
  return {
    v: CLOUD_SAVE_VERSION,
    career: {
      v: 1, seasonNumber: o.seasonNumber ?? 1, titles: o.titles ?? 0, wins: 0,
      seasonWins: 0, podiums: 0, poles: 0, racesStarted: o.racesStarted ?? 0,
      bestFinish: null, seasonHistory: [], raceLog: [], teamTiers: {}, wingByCircuit: {},
    },
    season: null,
    savedAt: o.savedAt ?? 1000,
  }
}

/** A client that records what it was asked to do. */
function fakeClient(over: Partial<PlayGamesClient> & { signedIn?: boolean; remote?: string | null } = {}) {
  const saved: { name: string; data: string; description: string; progress: number }[] = []
  const signedIn = over.signedIn ?? true
  const status = { available: signedIn, signedIn, playerId: signedIn ? 'p1' : null }
  const client: PlayGamesClient = {
    status: async () => status,
    signIn: async () => status,
    loadSnapshot: async () => over.remote ?? null,
    saveSnapshot: async (opts) => { saved.push(opts) },
    unlockAchievement: async () => {},
    ...over,
  }
  return { client, saved }
}

describe('syncAtStartup', () => {
  it('DOES NOTHING WHEN PLAY GAMES IS UNAVAILABLE', async () => {
    // The offline path, which is most players most of the time. It must not
    // touch the local save and must not be an error.
    const { client, saved } = fakeClient({ signedIn: false })
    const applyRemote = vi.fn()
    const out = await syncAtStartup({ client, readLocal: () => snap(), applyRemote })
    expect(out).toBe('unavailable')
    expect(applyRemote).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('UPLOADS A LOCAL CAREER THE CLOUD HAS NEVER SEEN', async () => {
    const local = snap({ seasonNumber: 3, racesStarted: 27, titles: 1 })
    const { client, saved } = fakeClient({ remote: null })
    const out = await syncAtStartup({ client, readLocal: () => local, applyRemote: vi.fn() })
    expect(out).toBe('uploaded')
    expect(saved[0]?.name).toBe(CAREER_SNAPSHOT)
    expect(saved[0]?.progress).toBe(27)
    expect(saved[0]?.description).toBe('Season 3 — 1 title')
  })

  it('DOWNLOADS ONTO A FRESH INSTALL', async () => {
    const remote = snap({ seasonNumber: 5, racesStarted: 54 })
    const { client } = fakeClient({ remote: serialiseCloud(remote) })
    const applyRemote = vi.fn()
    const out = await syncAtStartup({ client, readLocal: () => null, applyRemote })
    expect(out).toBe('downloaded')
    expect(applyRemote).toHaveBeenCalledWith(remote)
  })

  it('NEVER OVERWRITES A LONGER LOCAL CAREER WITH A RECENT SHORT ONE', async () => {
    /*
     * The end-to-end version of the case the whole design exists to prevent.
     * reconcile is tested directly too, but this asserts the wiring: that
     * syncAtStartup actually consults it, and that a 'download' cannot reach
     * applyRemote here.
     */
    const local = snap({ seasonNumber: 7, racesStarted: 80, savedAt: 1 })
    const remote = snap({ seasonNumber: 2, racesStarted: 12, savedAt: 9_999_999 })
    const { client, saved } = fakeClient({ remote: serialiseCloud(remote) })
    const applyRemote = vi.fn()
    const out = await syncAtStartup({ client, readLocal: () => local, applyRemote })
    expect(out).toBe('uploaded')
    expect(applyRemote, 'the long career was overwritten').not.toHaveBeenCalled()
    expect(saved[0]?.progress).toBe(80)
  })

  it('DOES NOT WRITE WHEN BOTH SIDES ALREADY AGREE', async () => {
    // Every launch on a single device hits this. An upload here would write
    // an identical payload forever.
    const both = snap({ seasonNumber: 2, racesStarted: 14 })
    const { client, saved } = fakeClient({ remote: serialiseCloud(both) })
    const out = await syncAtStartup({ client, readLocal: () => both, applyRemote: vi.fn() })
    expect(out).toBe('in-step')
    expect(saved).toEqual([])
  })

  it('TREATS AN UNREADABLE CLOUD PAYLOAD AS NO CLOUD SAVE', async () => {
    // A corrupt snapshot must not discard the local career, and must not
    // throw: this runs before first paint.
    const local = snap({ seasonNumber: 4, racesStarted: 40 })
    const { client } = fakeClient({ remote: 'not json' })
    const applyRemote = vi.fn()
    const out = await syncAtStartup({ client, readLocal: () => local, applyRemote })
    expect(out).toBe('uploaded')
    expect(applyRemote).not.toHaveBeenCalled()
  })

  it('SURVIVES A PLUGIN THAT THROWS', async () => {
    const { client } = fakeClient({ loadSnapshot: async () => { throw new Error('bridge died') } })
    const out = await syncAtStartup({ client, readLocal: () => snap(), applyRemote: vi.fn() })
    expect(out).toBe('failed')
  })
})

describe('pushSave', () => {
  it('WRITES THE LOCAL STATE WITHOUT RE-READING THE CLOUD', async () => {
    /*
     * At a save point the device holds the newest state by definition.
     * Reconciling here could pull a stale career back over the race that was
     * just finished, so pushSave must not call loadSnapshot at all.
     */
    const loadSnapshot = vi.fn(async () => null)
    const { client, saved } = fakeClient({ loadSnapshot })
    const out = await pushSave({
      client, readLocal: () => snap({ seasonNumber: 2, racesStarted: 18 }), applyRemote: vi.fn(),
    })
    expect(out).toBe('uploaded')
    expect(loadSnapshot).not.toHaveBeenCalled()
    expect(saved[0]?.progress).toBe(18)
  })

  it('NEVER CLEARS THE CLOUD WHEN THERE IS NO LOCAL CAREER', async () => {
    // Ending a career locally must not delete the cloud copy as a side
    // effect -- that would turn "start a new career" into "lose the old one
    // everywhere".
    const { client, saved } = fakeClient()
    const out = await pushSave({ client, readLocal: () => null, applyRemote: vi.fn() })
    expect(out).toBe('in-step')
    expect(saved).toEqual([])
  })

  it('IS A NO-OP WHEN SIGNED OUT', async () => {
    const { client, saved } = fakeClient({ signedIn: false })
    const out = await pushSave({ client, readLocal: () => snap(), applyRemote: vi.fn() })
    expect(out).toBe('unavailable')
    expect(saved).toEqual([])
  })
})

describe('progressOf', () => {
  it('ORDERS CAREERS THE SAME WAY pickFurther DOES', () => {
    // This number is what Play Games uses for its own conflict resolution, so
    // it has to agree with ours or the server will quietly disagree with the
    // client.
    expect(progressOf(snap({ seasonNumber: 5, racesStarted: 50 })))
      .toBeGreaterThan(progressOf(snap({ seasonNumber: 2, racesStarted: 20 })))
  })
})
