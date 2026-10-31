import { create } from 'zustand'
import { z } from 'zod'
import { Preferences } from '@capacitor/preferences'
import { loadGameData } from '@data/validators'
import { generateDaily, dateKey, type DailyChallenge } from './daily'
import { betterBest, type ScenarioOutcome } from './scenarioStore'

export const DAILY_BEST_KEY = 'daily.best'
export interface DailyBest { signature: string; position: number | null; met: boolean }
const BestSchema = z.record(z.string(), z.object({ signature: z.string(), position: z.number().nullable(), met: z.boolean() }))

export function pruneBests(b: Record<string, DailyBest>, keep: number): Record<string, DailyBest> {
  return Object.fromEntries(Object.keys(b).sort().slice(-keep).map(k => [k, b[k]!]))
}

async function readBest(): Promise<Record<string, DailyBest>> {
  try {
    const { value } = await Preferences.get({ key: DAILY_BEST_KEY })
    const parsed = BestSchema.safeParse(value ? JSON.parse(value) : {})
    return parsed.success ? parsed.data : {}
  } catch { return {} }
}

let writeChain: Promise<void> = Promise.resolve()

interface DailyStore {
  today: DailyChallenge | null
  status: 'idle' | 'building' | 'ready' | 'failed'
  best: Record<string, DailyBest>
  build: (now?: Date) => void
  loadBest: () => Promise<void>
  record: (outcome: ScenarioOutcome) => void
  bestFor: (d: DailyChallenge) => DailyBest | null
}

/**
 * Today's challenge and a personal best per day. Nothing else: no streak, no
 * history view, no countdown, no reward (spec 2026-10-24 §4, R16).
 */
export const useDailyStore = create<DailyStore>((set, get) => ({
  today: null,
  status: 'idle',
  best: {},
  build(now = new Date()) {
    const key = dateKey(now)
    if (get().today?.dateKey === key && get().status === 'ready') return
    set({ status: 'building' })
    // Deferred so the tab paints its loader first (R17).
    setTimeout(() => {
      try { set({ today: generateDaily(key), status: 'ready' }) } catch { set({ status: 'failed' }) }
    }, 0)
  },
  async loadBest() { const stored = await readBest(); set(s => ({ best: { ...stored, ...s.best } })) },
  record(outcome) {
    const d = get().today
    if (!d) return
    const prev = get().bestFor(d) ?? undefined
    const merged = betterBest(prev, { position: outcome.retired ? null : outcome.position, met: outcome.met })
    const entry: DailyBest = { signature: d.signature, ...merged }
    set(s => ({ best: { ...s.best, [d.dateKey]: entry } }))
    writeChain = writeChain.then(async () => {
      try {
        const stored = await readBest()
        const next = pruneBests({ ...stored, [d.dateKey]: entry }, loadGameData().tuning.daily.keepDays)
        await Preferences.set({ key: DAILY_BEST_KEY, value: JSON.stringify(next) })
      } catch { /* best-effort; the in-memory best stands */ }
    })
  },
  bestFor(d) {
    const b = get().best[d.dateKey]
    return b && b.signature === d.signature ? b : null
  },
}))
