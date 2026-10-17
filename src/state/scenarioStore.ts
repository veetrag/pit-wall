import { create } from 'zustand'
import { z } from 'zod'
import { Preferences } from '@capacitor/preferences'
import type { ScenarioSpecData } from '@data/validators'

export interface ScenarioOutcome { met: boolean; position: number; retired: boolean }
/** position null = DNF. */
export interface ScenarioBest { position: number | null; met: boolean }
export const SCENARIO_BEST_KEY = 'scenarios.best'

const BestSchema = z.record(z.string(), z.object({ position: z.number().nullable(), met: z.boolean() }))

/** Met beats unmet; then the better finish; a DNF ranks below any finish (spec 1.6 §8). */
export function betterBest(a: ScenarioBest | undefined, b: ScenarioBest): ScenarioBest {
  if (!a) return b
  if (a.met !== b.met) return a.met ? a : b
  if (a.position === null) return b
  if (b.position === null) return a
  return b.position < a.position ? b : a
}

async function readBest(): Promise<Record<string, ScenarioBest>> {
  try {
    const { value } = await Preferences.get({ key: SCENARIO_BEST_KEY })
    const parsed = BestSchema.safeParse(value ? JSON.parse(value) : {})
    return parsed.success ? parsed.data : {}
  } catch { return {} }
}

function mergeBest(
  stored: Record<string, ScenarioBest>, live: Record<string, ScenarioBest>,
): Record<string, ScenarioBest> {
  return { ...stored, ...Object.fromEntries(Object.entries(live).map(([k, v]) => [k, betterBest(stored[k], v)])) }
}

// Writes are serialised: two quick results must not read the same stale snapshot.
let writeChain: Promise<void> = Promise.resolve()

interface ScenarioStore {
  active: ScenarioSpecData | null
  outcome: ScenarioOutcome | null
  best: Record<string, ScenarioBest>
  select: (spec: ScenarioSpecData) => void
  recordOutcome: (outcome: ScenarioOutcome) => void
  loadBest: () => Promise<void>
  exit: () => void
}

/**
 * Scenario mode's own state, deliberately NOT part of seasonStore -- a
 * scenario can never write into a saved championship. Its one persisted thing
 * is the per-scenario best (spec 1.6 §8), under its own Preferences key.
 */
export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  active: null,
  outcome: null,
  best: {},
  select: (spec) => set({ active: spec, outcome: null }),
  recordOutcome: (outcome) => {
    const id = get().active?.id
    if (!id) { set({ outcome }); return }
    const entry: ScenarioBest = { position: outcome.retired ? null : outcome.position, met: outcome.met }
    set(s => ({ outcome, best: { ...s.best, [id]: betterBest(s.best[id], entry) } }))
    // Read-merge-write: a result recorded before loadBest resolved must not wipe older bests.
    writeChain = writeChain.then(async () => {
      try {
        const stored = await readBest()
        const merged = { ...stored, [id]: betterBest(stored[id], entry) }
        await Preferences.set({ key: SCENARIO_BEST_KEY, value: JSON.stringify(merged) })
        set(s => ({ best: mergeBest(merged, s.best) }))
      } catch { /* persistence is best-effort; the in-memory best stands */ }
    })
  },
  loadBest: async () => {
    const stored = await readBest()
    set(s => ({ best: mergeBest(stored, s.best) }))
  },
  exit: () => set({ active: null, outcome: null }),
}))
