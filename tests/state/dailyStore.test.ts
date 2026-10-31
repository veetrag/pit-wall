import { describe, it, expect, vi, beforeEach } from 'vitest'

const mem = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) },
    remove: async ({ key }: { key: string }) => { mem.delete(key) },
  },
}))

import { useDailyStore, DAILY_BEST_KEY, pruneBests } from '@state/dailyStore'
import { useScenarioStore } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

const DAY = new Date(2026, 9, 28, 9, 0)

describe('daily bests', () => {
  beforeEach(() => { mem.clear(); useDailyStore.setState({ today: null, status: 'idle', best: {} }); useScenarioStore.setState({ active: null, outcome: null }) })

  it('builds today and keeps the better result', async () => {
    useDailyStore.getState().build(DAY)
    await vi.waitFor(() => expect(useDailyStore.getState().status).toBe('ready'))
    const today = useDailyStore.getState().today!
    useScenarioStore.getState().select({ ...today.spec, kind: 'daily' })
    useDailyStore.getState().record({ met: false, position: 9, retired: false })
    useDailyStore.getState().record({ met: true, position: 4, retired: false })
    useDailyStore.getState().record({ met: false, position: 12, retired: false })
    expect(useDailyStore.getState().bestFor(today)).toEqual({ signature: today.signature, position: 4, met: true })
    await vi.waitFor(() => expect(JSON.parse(mem.get(DAILY_BEST_KEY)!)['2026-10-28'].position).toBe(4))
  }, 60_000)

  it('ignores a best recorded under another signature (a different challenge that day)', async () => {
    mem.set(DAILY_BEST_KEY, JSON.stringify({ '2026-10-28': { signature: 'other:1:2:d_x', position: 1, met: true } }))
    await useDailyStore.getState().loadBest()
    useDailyStore.getState().build(DAY)
    await vi.waitFor(() => expect(useDailyStore.getState().status).toBe('ready'))
    expect(useDailyStore.getState().bestFor(useDailyStore.getState().today!)).toBeNull()
  }, 60_000)

  it('prunes to the newest N days', () => {
    const day = (i: number) => new Date(2026, 0, 1 + i)
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const b = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [key(day(i)), { signature: 's', position: 1, met: true }]))
    const kept = Object.keys(pruneBests(b, 30)).sort()
    expect(kept).toHaveLength(30)
    expect(kept[0]).toBe(key(day(10)))
    expect(kept[kept.length - 1]).toBe(key(day(39)))
  })

  it('reads garbage storage as no bests', async () => {
    mem.set(DAILY_BEST_KEY, '{not json')
    await useDailyStore.getState().loadBest()
    expect(useDailyStore.getState().best).toEqual({})
  })

  it('ignores an outcome whose active spec is not today\'s daily', async () => {
    useDailyStore.getState().build(DAY)
    await vi.waitFor(() => expect(useDailyStore.getState().status).toBe('ready'))
    const today = useDailyStore.getState().today!
    useScenarioStore.getState().select({ ...today.spec, id: 'daily-2026-10-27', kind: 'daily' })
    useDailyStore.getState().record({ met: true, position: 1, retired: false })
    useScenarioStore.getState().select({ ...today.spec, kind: 'scenario' })
    useDailyStore.getState().record({ met: true, position: 1, retired: false })
    expect(useDailyStore.getState().best).toEqual({})
  }, 60_000)

  it('prunes the persisted best on write', async () => {
    const keep = loadGameData().tuning.daily.keepDays
    // Distinct sortable keys across months to avoid invalid dates.
    const keys = Array.from({ length: keep + 5 }, (_, i) => `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`)
    mem.set(DAILY_BEST_KEY, JSON.stringify(Object.fromEntries(keys.map(k => [k, { signature: 's', position: 1, met: true }]))))
    useDailyStore.getState().build(DAY)
    await vi.waitFor(() => expect(useDailyStore.getState().status).toBe('ready'))
    const today = useDailyStore.getState().today!
    useScenarioStore.getState().select({ ...today.spec, kind: 'daily' })
    useDailyStore.getState().record({ met: true, position: 2, retired: false })
    await vi.waitFor(() => expect(Object.keys(JSON.parse(mem.get(DAILY_BEST_KEY)!))).toContain('2026-10-28'))
    const persisted = Object.keys(JSON.parse(mem.get(DAILY_BEST_KEY)!)).sort()
    expect(persisted).toHaveLength(keep)
    expect(persisted[persisted.length - 1]).toBe('2026-10-28')
    expect(persisted).not.toContain(keys[0])
  }, 60_000)
})
