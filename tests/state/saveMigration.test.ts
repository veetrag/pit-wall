import { describe, it, expect } from 'vitest'
import { migrateSave, SEASON_MIGRATIONS, CAREER_MIGRATIONS, type MigrationRegistry } from '@state/saveMigration'
import { SAVE_VERSION } from '@state/seasonPersistence'
import { CAREER_SAVE_VERSION } from '@state/careerPersistence'

describe('migrateSave', () => {
  it('PASSES A CURRENT SAVE STRAIGHT THROUGH', () => {
    const save = { v: 3, keep: 'me' }
    const out = migrateSave(save, 3, {})
    expect(out.data).toEqual(save)
    expect(out.reason).toBe('already current')
  })

  it('RUNS A CHAIN, ONE STEP AT A TIME', () => {
    const migrations: MigrationRegistry = {
      1: old => ({ ...old, added: 'at2' }),
      2: old => ({ ...old, added2: 'at3' }),
    }
    const out = migrateSave({ v: 1, original: true }, 3, migrations)
    expect(out.data).toEqual({ v: 3, original: true, added: 'at2', added2: 'at3' })
    expect(out.reason).toBe('migrated v1 -> v3')
  })

  it('STAMPS THE NEW VERSION SO A MIGRATION CANNOT FORGET TO', () => {
    // A migration that returns the right SHAPE but the old `v` would be
    // rejected by the z.literal at the end, for a reason with nothing to do
    // with the migration. The runner owns the version field.
    const out = migrateSave({ v: 1 }, 2, { 1: old => ({ ...old }) })
    expect(out.data?.['v']).toBe(2)
  })

  it('REFUSES WHEN A STEP IS MISSING, rather than skipping it', () => {
    // The dangerous case: handing a v1 save to the v2->v3 migration, which was
    // never written to accept it. Discarding is the honest outcome.
    const out = migrateSave({ v: 1 }, 3, { 2: old => old })
    expect(out.data).toBeNull()
    expect(out.reason).toContain('no migration from v1')
  })

  it('REFUSES A SAVE FROM THE FUTURE', () => {
    // A downgrade. We cannot know what v5 added, and guessing risks restoring
    // a half-shaped object into the store.
    const out = migrateSave({ v: 5 }, 3, {})
    expect(out.data).toBeNull()
    expect(out.reason).toContain('newer version')
  })

  it('SURVIVES A THROWING MIGRATION', () => {
    // This runs before first paint. A migration that throws must not take the
    // app down on the loading screen.
    const out = migrateSave({ v: 1 }, 2, { 1: () => { throw new Error('boom') } })
    expect(out.data).toBeNull()
    expect(out.reason).toContain('failed')
  })

  it('rejects junk that has no version at all', () => {
    for (const junk of [null, undefined, 42, 'nope', [], {}, { v: '2' }, { v: 1.5 }]) {
      expect(migrateSave(junk, 2, {}).data, JSON.stringify(junk)).toBeNull()
    }
  })

  it('does not mutate the input', () => {
    const save = { v: 1, nested: { a: 1 } }
    migrateSave(save, 2, { 1: old => ({ ...old, extra: true }) })
    expect(save).toEqual({ v: 1, nested: { a: 1 } })
  })
})

describe('the shipped registries', () => {
  it('SEASON v1 IS DELIBERATELY NOT MIGRATED', () => {
    /*
     * A v1 season save predates the career, and currentSeed() now includes a
     * season term -- resuming one would run DIFFERENT RACES than the ones it
     * recorded. Discarding it is correct. If someone "helpfully" adds a
     * 1 -> 2 migration later, this test tells them why not.
     */
    expect(SEASON_MIGRATIONS[1]).toBeUndefined()
    expect(migrateSave({ v: 1 }, SAVE_VERSION, SEASON_MIGRATIONS).data).toBeNull()
  })

  it('every registered migration is reachable from a real old version', () => {
    // A migration keyed above the current version can never run, and is a sign
    // someone bumped the constant and the key inconsistently.
    for (const reg of [
      { name: 'season', current: SAVE_VERSION, migrations: SEASON_MIGRATIONS },
      { name: 'career', current: CAREER_SAVE_VERSION, migrations: CAREER_MIGRATIONS },
    ]) {
      for (const key of Object.keys(reg.migrations).map(Number)) {
        expect(key, `${reg.name} migration from v${key} can never run`).toBeLessThan(reg.current)
        expect(key, `${reg.name} migration from v${key} is not a valid version`).toBeGreaterThan(0)
      }
    }
  })

  it('A CURRENT SAVE OF EACH KIND SURVIVES ITS OWN REGISTRY', () => {
    expect(migrateSave({ v: SAVE_VERSION }, SAVE_VERSION, SEASON_MIGRATIONS).data).not.toBeNull()
    expect(migrateSave({ v: CAREER_SAVE_VERSION }, CAREER_SAVE_VERSION, CAREER_MIGRATIONS).data).not.toBeNull()
  })
})
