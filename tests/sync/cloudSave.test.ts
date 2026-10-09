import { describe, it, expect } from 'vitest'
import {
  CLOUD_SAVE_VERSION, CloudSnapshotSchema, pickFurther, serialiseCloud, parseCloud,
  type CloudSnapshot,
} from '@sync/cloudSave'

/*
 * Conflict resolution is the whole reason this file is pure.
 *
 * Play Games hands us two snapshots when two devices wrote independently, and
 * whatever we do next is irreversible for the player: one of these careers
 * stops existing. None of that can be exercised on a device in CI, so the
 * decision itself is a total function over plain data and every branch is
 * asserted here.
 */

function snap(o: {
  seasonNumber?: number; racesStarted?: number; savedAt?: number
} = {}): CloudSnapshot {
  return {
    v: CLOUD_SAVE_VERSION,
    career: {
      v: 1,
      seasonNumber: o.seasonNumber ?? 1,
      titles: 0, wins: 0, seasonWins: 0, podiums: 0, poles: 0,
      racesStarted: o.racesStarted ?? 0,
      bestFinish: null, seasonHistory: [], raceLog: [], teamTiers: {}, wingByCircuit: {},
    },
    season: null,
    savedAt: o.savedAt ?? 1000,
  }
}

describe('pickFurther', () => {
  it('MORE SEASONS WINS', () => {
    const long = snap({ seasonNumber: 4 })
    const short = snap({ seasonNumber: 1 })
    expect(pickFurther(long, short)).toBe(long)
    expect(pickFurther(short, long)).toBe(long)
  })

  it('A NEWER BUT SHORTER CAREER LOSES', () => {
    /*
     * The documented cost of this policy, asserted so it cannot be softened
     * by accident. savedAt is deliberately NOT the primary key: a second
     * device that syncs late must not be able to destroy the longer career
     * merely by having written more recently.
     */
    const long = snap({ seasonNumber: 6, savedAt: 1 })
    const recentButShort = snap({ seasonNumber: 2, savedAt: 999_999 })
    expect(pickFurther(long, recentButShort)).toBe(long)
  })

  it('EQUAL SEASONS FALL THROUGH TO RACES STARTED', () => {
    const more = snap({ seasonNumber: 3, racesStarted: 30 })
    const fewer = snap({ seasonNumber: 3, racesStarted: 26 })
    expect(pickFurther(more, fewer)).toBe(more)
    expect(pickFurther(fewer, more)).toBe(more)
  })

  it('EQUAL PROGRESS FALLS THROUGH TO THE CLOCK', () => {
    const newer = snap({ seasonNumber: 2, racesStarted: 14, savedAt: 5000 })
    const older = snap({ seasonNumber: 2, racesStarted: 14, savedAt: 4000 })
    expect(pickFurther(newer, older)).toBe(newer)
    expect(pickFurther(older, newer)).toBe(newer)
  })

  it('AN EXACT TIE IS DETERMINISTIC, NOT A COIN FLIP', () => {
    // Identical on every key. It must still return the same side every time,
    // or two devices resolving the same conflict could disagree forever.
    const a = snap(), b = snap()
    expect(pickFurther(a, b)).toBe(a)
    expect(pickFurther(b, a)).toBe(b)
  })
})

describe('the cloud payload', () => {
  it('ROUND-TRIPS THROUGH THE SCHEMA', () => {
    const before = snap({ seasonNumber: 3, racesStarted: 27, savedAt: 42 })
    const after = parseCloud(serialiseCloud(before))
    expect(after).toEqual(before)
  })

  it('REFUSES A SNAPSHOT FROM A NEWER APP', () => {
    // The device that wrote it knows things this build does not. Discarding is
    // the only safe answer; migrating forwards is not possible.
    const future = JSON.stringify({ ...snap(), v: CLOUD_SAVE_VERSION + 1 })
    expect(parseCloud(future)).toBeNull()
  })

  it('REFUSES RUBBISH RATHER THAN THROWING', () => {
    // This runs at sign-in, before first paint. A throw here is a black screen.
    expect(parseCloud('not json at all')).toBeNull()
    expect(parseCloud('{}')).toBeNull()
    expect(parseCloud(JSON.stringify({ v: CLOUD_SAVE_VERSION }))).toBeNull()
  })

  it('CARRIES A SEASON IN PROGRESS WHEN THERE IS ONE', () => {
    // The season half is nullable because a career between seasons has no
    // season to save -- but when one exists it must survive the trip, or
    // restoring on a new phone silently restarts the current season.
    const withSeason = CloudSnapshotSchema.parse({
      ...snap({ seasonNumber: 2 }),
      season: {
        v: 2, resumePhase: 'development', playerDriverId: 'd_voss',
        selectedTeamId: 'apex', selectedCircuitId: 'bengaluru', raceIndex: 4,
        standings: [], playerStrategy: null, attemptNonce: 0, devPoints: 31,
        purchasedTiers: { power: 2 }, rivalDevelopment: {},
        lastRaceResults: null, lastRaceEvents: null,
      },
    })
    const after = parseCloud(serialiseCloud(withSeason))
    expect(after?.season?.devPoints).toBe(31)
    expect(after?.season?.purchasedTiers).toEqual({ power: 2 })
  })
})
