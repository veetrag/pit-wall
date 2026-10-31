import { describe, it, expect, vi, beforeEach } from 'vitest'

const mem = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) },
    remove: async ({ key }: { key: string }) => { mem.delete(key) },
  },
}))

import { useStartsStore, STARTS_KEY, MAX_STARTS, type SaveResult } from '@state/startsStore'
import { encodeStart, decodeStart } from '@state/startCode'
import { FULL } from '../fixtures/startPayloads'

// Lap 20 (calls cut before it): FULL's lap 35 prices par at P1 in this build, so importCode would say 'unplayable'.
function saved(r: SaveResult) { if (!r.ok) throw new Error('save refused'); return r }
const VALID = { ...FULL, startLap: 20, calls: FULL.calls.filter(c => c.step < 60), recipe: { ...FULL.recipe, overlay: null, gridOrder: null } }

describe('MY STARTS', () => {
  beforeEach(() => { mem.clear(); useStartsStore.setState({ starts: [] }) })

  it('saves newest first and persists the codes', async () => {
    const { id } = saved(useStartsStore.getState().save(VALID, 1000))
    expect(useStartsStore.getState().starts[0]!.id).toBe(id)
    await vi.waitFor(() => expect(JSON.parse(mem.get(STARTS_KEY)!).starts).toHaveLength(1))
  })
  it('dedupes an import of a start already saved', () => {
    useStartsStore.getState().save(VALID, 1000)
    const r = useStartsStore.getState().importCode(encodeStart({ ...VALID, name: 'Renamed by a friend' }), 2000)
    expect(r.ok).toBe(true)
    expect(useStartsStore.getState().starts).toHaveLength(1)
  })
  it('keeps at most 30, dropping the oldest, and says the list was full', () => {
    for (let i = 0; i < MAX_STARTS; i++) useStartsStore.getState().save({ ...VALID, recipe: { ...VALID.recipe, seed: i } }, i)
    const res = saved(useStartsStore.getState().save({ ...VALID, recipe: { ...VALID.recipe, seed: 999 } }, 999))
    expect(res.full).toBe(true)
    expect(useStartsStore.getState().starts).toHaveLength(MAX_STARTS)
    expect(useStartsStore.getState().starts.some(s => decodeStart(s.code).ok && (decodeStart(s.code) as { ok: true; payload: typeof VALID }).payload.recipe.seed === 0)).toBe(false)
  })
  it('rename keeps the id; remove deletes', () => {
    const { id } = saved(useStartsStore.getState().save(VALID, 1))
    useStartsStore.getState().rename(id, 'MY NIGHT')
    const s = useStartsStore.getState().starts[0]!
    expect(s.id).toBe(id)
    expect((decodeStart(s.code) as { ok: true; payload: typeof VALID }).payload.name).toBe('MY NIGHT')
    useStartsStore.getState().remove(id)
    expect(useStartsStore.getState().starts).toEqual([])
  })
  it('import reports the decoder reason for garbage', () => {
    expect(useStartsStore.getState().importCode('hello')).toEqual({ ok: false, reason: 'format' })
  })
  it('drops undecodable stored entries on load and survives garbage storage', async () => {
    mem.set(STARTS_KEY, JSON.stringify({ v: 1, starts: [{ id: 'x', code: 'PW1-junk', savedAt: 1, best: null }] }))
    await useStartsStore.getState().load()
    expect(useStartsStore.getState().starts).toEqual([])
    mem.set(STARTS_KEY, '{nope'); await useStartsStore.getState().load()
    expect(useStartsStore.getState().starts).toEqual([])
  })
  // A start whose checksum is good but which this build's data rejects (here a
  // grid that is not a full permutation) must survive load AND the next write (I1).
  const STALE = encodeStart({ ...VALID, recipe: { ...VALID.recipe, gridOrder: ['d_voss'] } })
  it('keeps a stored start that no longer validates, through load and a later write', async () => {
    expect(decodeStart(STALE).ok).toBe(false)
    expect(decodeStart(STALE, { validate: false }).ok).toBe(true)
    mem.set(STARTS_KEY, JSON.stringify({ v: 1, starts: [{ id: 'stale', code: STALE, savedAt: 1, best: null }] }))
    await useStartsStore.getState().load()
    expect(useStartsStore.getState().starts.map(s => s.id)).toEqual(['stale'])
    saved(useStartsStore.getState().save(VALID, 2))
    useStartsStore.getState().rename('stale', 'STILL MINE')
    await vi.waitFor(() => expect(JSON.parse(mem.get(STARTS_KEY)!).starts.map((s: { id: string }) => s.id)).toContain('stale'))
    expect(JSON.parse(mem.get(STARTS_KEY)!).starts).toHaveLength(2)
  })
  it('refuses to save a payload that fails validation', () => {
    const bad = { ...VALID, recipe: { ...VALID.recipe, gridOrder: ['d_voss'] } }
    expect(useStartsStore.getState().save(bad, 1)).toEqual({ ok: false, reason: 'invalid' })
    expect(useStartsStore.getState().starts).toEqual([])
  })
  it('records a best per start', () => {
    const { id } = saved(useStartsStore.getState().save(VALID, 1))
    useStartsStore.getState().recordBest(id, { met: false, position: 8, retired: false })
    useStartsStore.getState().recordBest(id, { met: true, position: 5, retired: false })
    expect(useStartsStore.getState().starts[0]!.best).toEqual({ position: 5, met: true })
  })
})
