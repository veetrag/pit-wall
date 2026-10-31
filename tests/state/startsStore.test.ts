import { describe, it, expect, vi, beforeEach } from 'vitest'

const mem = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) },
    remove: async ({ key }: { key: string }) => { mem.delete(key) },
  },
}))

import { useStartsStore, STARTS_KEY, MAX_STARTS } from '@state/startsStore'
import { encodeStart, decodeStart } from '@state/startCode'
import { FULL } from '../fixtures/startPayloads'

// Lap 20 (calls cut before it): FULL's lap 35 prices par at P1 in this build, so importCode would say 'unplayable'.
const VALID = { ...FULL, startLap: 20, calls: FULL.calls.filter(c => c.step < 60), recipe: { ...FULL.recipe, overlay: null, gridOrder: null } }

describe('MY STARTS', () => {
  beforeEach(() => { mem.clear(); useStartsStore.setState({ starts: [] }) })

  it('saves newest first and persists the codes', async () => {
    const { id } = useStartsStore.getState().save(VALID, 1000)
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
    const res = useStartsStore.getState().save({ ...VALID, recipe: { ...VALID.recipe, seed: 999 } }, 999)
    expect(res.full).toBe(true)
    expect(useStartsStore.getState().starts).toHaveLength(MAX_STARTS)
    expect(useStartsStore.getState().starts.some(s => decodeStart(s.code).ok && (decodeStart(s.code) as { ok: true; payload: typeof VALID }).payload.recipe.seed === 0)).toBe(false)
  })
  it('rename keeps the id; remove deletes', () => {
    const { id } = useStartsStore.getState().save(VALID, 1)
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
  it('records a best per start', () => {
    const { id } = useStartsStore.getState().save(VALID, 1)
    useStartsStore.getState().recordBest(id, { met: false, position: 8, retired: false })
    useStartsStore.getState().recordBest(id, { met: true, position: 5, retired: false })
    expect(useStartsStore.getState().starts[0]!.best).toEqual({ position: 5, met: true })
  })
})
