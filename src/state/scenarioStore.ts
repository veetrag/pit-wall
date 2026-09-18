import { create } from 'zustand'
import type { ScenarioSpecData } from '@data/validators'

export interface ScenarioOutcome {
  met: boolean
  position: number
  retired: boolean
}

interface ScenarioStore {
  active: ScenarioSpecData | null
  outcome: ScenarioOutcome | null
  select: (spec: ScenarioSpecData) => void
  recordOutcome: (outcome: ScenarioOutcome) => void
  exit: () => void
}

/**
 * Scenario mode's own state, deliberately NOT part of seasonStore.
 *
 * A scenario has no standings, no development points and no round, and season
 * state is what gets persisted -- keeping them apart means a scenario can never
 * write into a saved championship. seasonStore.phase still does the routing.
 */
export const useScenarioStore = create<ScenarioStore>((set) => ({
  active: null,
  outcome: null,
  select: (spec) => set({ active: spec, outcome: null }),
  recordOutcome: (outcome) => set({ outcome }),
  exit: () => set({ active: null, outcome: null }),
}))
