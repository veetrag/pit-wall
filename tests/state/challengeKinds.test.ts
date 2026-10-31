import { describe, it, expect, vi, beforeEach } from 'vitest'

const mem = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) },
    remove: async ({ key }: { key: string }) => { mem.delete(key) },
  },
}))

import { useScenarioStore, SCENARIO_BEST_KEY } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

const spec = loadGameData().scenarios[0]!

describe('challenge kinds', () => {
  beforeEach(() => { mem.clear(); useScenarioStore.setState({ active: null, outcome: null, best: {} }) })

  it('a scenario outcome is remembered under scenarios.best', async () => {
    useScenarioStore.getState().select(spec)
    useScenarioStore.getState().recordOutcome({ met: true, position: 3, retired: false })
    await vi.waitFor(() => expect(mem.get(SCENARIO_BEST_KEY)).toContain(spec.id))
  })
  it('a daily or start outcome never touches scenarios.best', async () => {
    for (const kind of ['daily', 'start'] as const) {
      useScenarioStore.getState().select({ ...spec, id: `x-${kind}`, kind })
      useScenarioStore.getState().recordOutcome({ met: true, position: 1, retired: false })
    }
    await new Promise(r => setTimeout(r, 10))
    expect(mem.get(SCENARIO_BEST_KEY)).toBeUndefined()
    expect(useScenarioStore.getState().best).toEqual({})
    expect(useScenarioStore.getState().outcome).toEqual({ met: true, position: 1, retired: false })
  })
})
