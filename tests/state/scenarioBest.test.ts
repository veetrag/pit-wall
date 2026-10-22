import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useScenarioStore, betterBest, SCENARIO_BEST_KEY } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

const SPEC = loadGameData().scenarios[0]!
beforeEach(() => { mem.clear(); useScenarioStore.setState({ active: null, outcome: null, best: {} }) })

describe('scenario bests (spec 1.6 §8)', () => {
  it('a met goal beats any unmet one; then the better finish; a DNF ranks last', () => {
    expect(betterBest(undefined, { position: 9, met: false })).toEqual({ position: 9, met: false })
    expect(betterBest({ position: 2, met: false }, { position: 5, met: true })).toEqual({ position: 5, met: true })
    expect(betterBest({ position: 5, met: true }, { position: 3, met: true })).toEqual({ position: 3, met: true })
    expect(betterBest({ position: null, met: false }, { position: 14, met: false })).toEqual({ position: 14, met: false })
    expect(betterBest({ position: 14, met: false }, { position: null, met: false })).toEqual({ position: 14, met: false })
  })

  it('the ranking holds with the arguments reversed (item 16c)', () => {
    // The new result is now the worse one: the stored best must stand.
    expect(betterBest({ position: 5, met: true }, { position: 2, met: false })).toEqual({ position: 5, met: true })
    expect(betterBest({ position: 3, met: true }, { position: 5, met: true })).toEqual({ position: 3, met: true })
    expect(betterBest({ position: 4, met: false }, { position: 9, met: false })).toEqual({ position: 4, met: false })
    expect(betterBest({ position: 9, met: false }, { position: 4, met: false })).toEqual({ position: 4, met: false })
    expect(betterBest({ position: null, met: false }, { position: null, met: false })).toEqual({ position: null, met: false })
    expect(betterBest({ position: 20, met: false }, { position: null, met: false })).toEqual({ position: 20, met: false })
    expect(betterBest({ position: null, met: false }, { position: 20, met: false })).toEqual({ position: 20, met: false })
  })

  it('recordOutcome remembers the best across a reload', async () => {
    useScenarioStore.getState().select(SPEC)
    useScenarioStore.getState().recordOutcome({ met: true, position: 3, retired: false })
    useScenarioStore.getState().recordOutcome({ met: false, position: 8, retired: false })
    await vi.waitFor(() => expect(JSON.parse(mem.get(SCENARIO_BEST_KEY) ?? '{}')[SPEC.id]).toEqual({ position: 3, met: true }))
    useScenarioStore.setState({ best: {} })
    await useScenarioStore.getState().loadBest()
    expect(useScenarioStore.getState().best[SPEC.id]).toEqual({ position: 3, met: true })
  })

  it('a retirement is stored as DNF', async () => {
    useScenarioStore.getState().select(SPEC)
    useScenarioStore.getState().recordOutcome({ met: false, position: 17, retired: true })
    expect(useScenarioStore.getState().best[SPEC.id]).toEqual({ position: null, met: false })
  })

  it('a result recorded before loadBest resolves does not wipe stored bests', async () => {
    mem.set(SCENARIO_BEST_KEY, JSON.stringify({ other_one: { position: 1, met: true } }))
    useScenarioStore.getState().select(SPEC)
    useScenarioStore.getState().recordOutcome({ met: false, position: 6, retired: false })
    await vi.waitFor(() => expect(JSON.parse(mem.get(SCENARIO_BEST_KEY)!)).toEqual({
      other_one: { position: 1, met: true }, [SPEC.id]: { position: 6, met: false },
    }))
  })

  it('reads malformed storage as no bests', async () => {
    mem.set(SCENARIO_BEST_KEY, '{"x": {"position": "P3"}}')
    await useScenarioStore.getState().loadBest()
    expect(useScenarioStore.getState().best).toEqual({})
  })
})
