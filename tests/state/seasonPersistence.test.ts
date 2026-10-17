import { describe, it, expect, beforeEach, vi } from 'vitest'

/*
 * A STATEFUL Preferences fake, not the suite's usual always-null stub.
 *
 * The whole point of these tests is the ROUND TRIP -- save, then load, then
 * check the season came back. A stub whose get() always returns null can only
 * ever prove a write was attempted, and "a write was attempted" is exactly what
 * the previous, entirely dead, implementation of this feature also proved.
 */
const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSeasonStore } from '@state/seasonStore'
import {
  SAVE_KEY, SAVE_VERSION, snapshotFrom, saveSnapshot, loadSnapshot,
  clearSnapshot, startSeasonAutosave, type SeasonSnapshot,
} from '@state/seasonPersistence'

const PRISTINE = useSeasonStore.getState()

function reset() {
  mem.clear()
  useSeasonStore.setState({
    phase: 'menu', playerDriverId: null, selectedTeamId: null, selectedCircuitId: null,
    raceIndex: 0, standings: [], lastRaceResults: null, lastRaceEvents: null,
    playerStrategy: null, attemptNonce: 0, devPoints: 0, purchasedTiers: {}, rivalDevelopment: {},
  })
}

/** Drives the real store to a mid-season state, the way the UI does. */
function playOneRace() {
  const s = useSeasonStore.getState()
  s.startNewSeason()
  s.selectTeam('apex')
  s.confirmTeam()
  s.selectDriver('d_voss')
  s.confirmDriver()          // -> phase 'development'
  useSeasonStore.getState().recordRaceResult(
    [{ driverId: 'd_voss', position: 1 }, { driverId: 'd_rossi', position: 2 }],
    { overtakesGained: 3, pitsDone: 1, hadRain: false },
  )                          // -> phase 'result', result pending
  useSeasonStore.getState().keepResult()  // a race counts when it is kept
}

beforeEach(reset)

describe('snapshotFrom', () => {
  it('is null when no season is in progress', () => {
    expect(snapshotFrom(useSeasonStore.getState())).toBeNull()
  })

  it('is null on transient screens, so a save is never clobbered by a menu', () => {
    /*
     * FAILS IF the RESUME_PHASE map gives menu/settings/grid a resume target.
     * A player opening Settings mid-season would then overwrite their save with
     * a snapshot saying they are sitting in Settings -- and on resume they would
     * land there with no season behind them.
     */
    for (const phase of ['menu', 'grid', 'team_select', 'driver_select', 'how_to_play', 'settings', 'scenario_select', 'scenario_racing', 'scenario_result'] as const) {
      useSeasonStore.setState({ playerDriverId: 'd_voss', phase })
      expect(snapshotFrom(useSeasonStore.getState()), phase).toBeNull()
    }
  })

  it('resumes a race in progress to race_setup, not to racing', () => {
    // Mid-race state lives in raceStore and is not persisted; the honest offer
    // is to restart the round with standings and development intact.
    useSeasonStore.setState({ playerDriverId: 'd_voss', phase: 'racing', raceIndex: 4 })
    const snap = snapshotFrom(useSeasonStore.getState())
    expect(snap?.resumePhase).toBe('race_setup')
    expect(snap?.raceIndex, 'the round itself is kept').toBe(4)
  })

  it('carries every field a season needs', () => {
    useSeasonStore.setState({
      playerDriverId: 'd_voss', phase: 'development', raceIndex: 3,
      standings: [{ driverId: 'd_voss', points: 25 }], devPoints: 40,
      purchasedTiers: { power: 2 }, rivalDevelopment: { meridian: 1.5 },
      selectedTeamId: 'apex', selectedCircuitId: 'veloce', attemptNonce: 2,
    })
    const snap = snapshotFrom(useSeasonStore.getState())!
    expect(snap).toMatchObject({
      v: SAVE_VERSION, resumePhase: 'development', playerDriverId: 'd_voss',
      raceIndex: 3, devPoints: 40, purchasedTiers: { power: 2 },
      rivalDevelopment: { meridian: 1.5 }, selectedTeamId: 'apex',
      selectedCircuitId: 'veloce', attemptNonce: 2,
    })
    expect(snap.standings).toEqual([{ driverId: 'd_voss', points: 25 }])
  })
})

describe('loadSnapshot rejects anything it cannot trust', () => {
  const valid: SeasonSnapshot = {
    v: SAVE_VERSION, resumePhase: 'development', playerDriverId: 'd_voss',
    selectedTeamId: 'apex', selectedCircuitId: 'veloce', raceIndex: 2,
    standings: [{ driverId: 'd_voss', points: 18 }], playerStrategy: null,
    attemptNonce: 0, devPoints: 30, purchasedTiers: {}, rivalDevelopment: {},
    lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null,
    qualifyingResult: null, sprintAttemptNonce: 0, sprintStrategy: null,
    lastSprintResults: null, lastSprintEvents: null, sprintPending: false, pendingSprint: null, sprintBanked: false,
  }

  it('round-trips a valid save', async () => {
    await saveSnapshot(valid)
    expect(await loadSnapshot()).toEqual(valid)
  })

  it('returns null rather than throwing on corrupt JSON', async () => {
    mem.set(SAVE_KEY, '{ this is not json')
    expect(await loadSnapshot()).toBeNull()
  })

  it('returns null on a version it does not understand', async () => {
    // A future build's save must not be half-restored into an older store.
    mem.set(SAVE_KEY, JSON.stringify({ ...valid, v: SAVE_VERSION + 1 }))
    expect(await loadSnapshot()).toBeNull()
  })

  it('returns null when a field is the wrong shape', async () => {
    mem.set(SAVE_KEY, JSON.stringify({ ...valid, raceIndex: 'three' }))
    expect(await loadSnapshot()).toBeNull()
  })

  it('returns null when there is no save at all', async () => {
    expect(await loadSnapshot()).toBeNull()
  })

  it('clearSnapshot removes it', async () => {
    await saveSnapshot(valid)
    await clearSnapshot()
    expect(await loadSnapshot()).toBeNull()
  })
})

describe('autosave keeps the save in step with the store', () => {
  it('SURVIVES A REAL SEASON: race, close, resume', async () => {
    /*
     * THE TEST THE PREVIOUS IMPLEMENTATION DID NOT HAVE.
     *
     * It drives the real store through a real race, throws the store away as
     * though the app had been killed, and asserts the season comes BACK -- not
     * that a write occurred. The old version passed a write-occurred test while
     * being completely non-functional, because `loadSeason` never restored
     * `phase` and `startNewSeason` reset `raceIndex` on the way past.
     *
     * The phase assertion is the specific one that would have caught it.
     */
    const stop = startSeasonAutosave()
    playOneRace()
    await Promise.resolve()          // let the fire-and-forget write settle
    stop()

    const saved = await loadSnapshot()
    expect(saved, 'a season in progress must produce a save').not.toBeNull()
    expect(saved!.standings.find(s => s.driverId === 'd_voss')?.points,
      'the race that was just run must be in the save').toBe(25)
    expect(saved!.devPoints, 'development points earned must survive').toBeGreaterThan(0)

    // The app dies and restarts.
    reset()
    expect(useSeasonStore.getState().standings).toEqual([])

    useSeasonStore.getState().resumeSeason(saved!)
    const back = useSeasonStore.getState()
    expect(back.phase, 'resuming must leave the menu, not sit in it').toBe('result')
    expect(back.playerDriverId).toBe('d_voss')
    expect(back.standings.find(s => s.driverId === 'd_voss')?.points).toBe(25)
    expect(back.devPoints).toBe(saved!.devPoints)
  })

  it('clears the save when the player abandons the season', async () => {
    const stop = startSeasonAutosave()
    playOneRace()
    await Promise.resolve()
    expect(await loadSnapshot()).not.toBeNull()

    useSeasonStore.getState().endCareer()   // nulls playerDriverId
    await Promise.resolve()
    stop()
    expect(await loadSnapshot(), 'abandoning a season must not leave it resumable').toBeNull()
  })

  it('does not write on a no-op change', async () => {
    const stop = startSeasonAutosave()
    useSeasonStore.setState({ playerDriverId: 'd_voss', phase: 'development', raceIndex: 1 })
    await Promise.resolve()
    const { Preferences } = await import('@capacitor/preferences')
    const before = vi.mocked(Preferences.set).mock.calls.length
    // Same values again: the snapshot is unchanged, so nothing should be written.
    useSeasonStore.setState({ raceIndex: 1 })
    await Promise.resolve()
    stop()
    expect(vi.mocked(Preferences.set).mock.calls.length,
      'an unchanged snapshot must not churn a write on every tick').toBe(before)
  })

  it('unsubscribing stops the writes', async () => {
    const stop = startSeasonAutosave()
    stop()
    useSeasonStore.setState({ playerDriverId: 'd_voss', phase: 'development', raceIndex: 9 })
    await Promise.resolve()
    expect(await loadSnapshot()).toBeNull()
  })
})

describe('store hygiene', () => {
  it('the pristine store exposes resumeSeason', () => {
    expect(typeof PRISTINE.resumeSeason).toBe('function')
  })
})
