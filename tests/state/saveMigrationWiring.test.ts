import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Preferences } from '@capacitor/preferences'
import { loadCareer, CAREER_SAVE_KEY, CAREER_SAVE_VERSION } from '@state/careerPersistence'
import { loadSnapshot, SAVE_KEY, SAVE_VERSION } from '@state/seasonPersistence'

/*
 * Proves the migration runner is actually IN the load path, not merely
 * imported. The unit tests in saveMigration.test.ts exercise the runner
 * directly; without these, both load functions could ignore it entirely and
 * every one of those tests would still pass.
 *
 * The tell is the console warning: a save rejected by the MIGRATOR reports a
 * version reason, where one rejected by zod reports a field reason.
 */
describe('the migrator sits in front of both load paths', () => {
  beforeEach(async () => {
    await Preferences.clear()
    vi.restoreAllMocks()
  })

  it('A FUTURE CAREER SAVE IS REFUSED BY THE MIGRATOR', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await Preferences.set({
      key: CAREER_SAVE_KEY,
      value: JSON.stringify({ v: CAREER_SAVE_VERSION + 9, seasonNumber: 1 }),
    })
    expect(await loadCareer()).toBeNull()
    expect(warn.mock.calls.flat().join(' ')).toContain('newer version')
  })

  it('A FUTURE SEASON SAVE IS REFUSED BY THE MIGRATOR', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await Preferences.set({
      key: SAVE_KEY,
      value: JSON.stringify({ v: SAVE_VERSION + 9, phase: 'racing' }),
    })
    expect(await loadSnapshot()).toBeNull()
    expect(warn.mock.calls.flat().join(' ')).toContain('newer version')
  })

  it('a v1 season save reports the MISSING MIGRATION, not a field error', async () => {
    // The deliberate gap: v1 predates the career and its seeds no longer mean
    // what they meant. It must be discarded for THAT reason, visibly.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await Preferences.set({ key: SAVE_KEY, value: JSON.stringify({ v: 1, phase: 'racing' }) })
    expect(await loadSnapshot()).toBeNull()
    expect(warn.mock.calls.flat().join(' ')).toContain('no migration from v1')
  })

  it('a CURRENT save still loads normally', async () => {
    // The migrator must not have broken the happy path.
    await Preferences.set({
      key: CAREER_SAVE_KEY,
      value: JSON.stringify({
        v: CAREER_SAVE_VERSION, seasonNumber: 2, titles: 1, wins: 4, seasonWins: 0,
        podiums: 7, poles: 2, racesStarted: 24, bestFinish: 1, seasonHistory: [],
      }),
    })
    const loaded = await loadCareer()
    expect(loaded).not.toBeNull()
    expect(loaded!.titles).toBe(1)
    expect(loaded!.raceLog, 'the zod default still applies after migration').toEqual([])
  })
})
