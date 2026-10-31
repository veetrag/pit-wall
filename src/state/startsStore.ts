import { create } from 'zustand'
import { z } from 'zod'
import { Preferences } from '@capacitor/preferences'
import { decodeStart, encodeStart, type StartPayload } from './startCode'
import { rederive } from './customStart'
import { betterBest, type ScenarioBest, type ScenarioOutcome } from './scenarioStore'

export const STARTS_KEY = 'starts.mine'
export const MAX_STARTS = 30
export interface SavedStart { id: string; code: string; savedAt: number; best: ScenarioBest | null }
const FileSchema = z.object({
  v: z.literal(1),
  starts: z.array(z.object({ id: z.string(), code: z.string(), savedAt: z.number(), best: z.object({ position: z.number().nullable(), met: z.boolean() }).nullable() })),
})

/** Same start = same race, same calls, same lap; the name does not count. */
function sameStart(a: StartPayload, b: StartPayload): boolean {
  return JSON.stringify([a.recipe, a.calls, a.startLap]) === JSON.stringify([b.recipe, b.calls, b.startLap])
}
function payloadOf(s: SavedStart): StartPayload | null { const d = decodeStart(s.code); return d.ok ? d.payload : null }

let writeChain: Promise<void> = Promise.resolve()
function persist(starts: SavedStart[]) {
  writeChain = writeChain.then(async () => {
    try { await Preferences.set({ key: STARTS_KEY, value: JSON.stringify({ v: 1, starts }) }) } catch { /* best-effort */ }
  })
}

type ImportResult = { ok: true; id: string; drift: boolean } | { ok: false; reason: 'format' | 'checksum' | 'newer' | 'invalid' | 'unplayable' }
interface StartsStore {
  starts: SavedStart[]
  load: () => Promise<void>
  save: (p: StartPayload, now?: number) => { id: string; full: boolean }
  importCode: (text: string, now?: number) => ImportResult
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  recordBest: (id: string, o: ScenarioOutcome) => void
}

export const useStartsStore = create<StartsStore>((set, get) => ({
  starts: [],
  async load() {
    try {
      const { value } = await Preferences.get({ key: STARTS_KEY })
      const parsed = FileSchema.safeParse(value ? JSON.parse(value) : { v: 1, starts: [] })
      set({ starts: parsed.success ? parsed.data.starts.filter(s => decodeStart(s.code).ok) : [] })
    } catch { set({ starts: [] }) }
  },
  save(p, now = Date.now()) {
    const existing = get().starts.find(s => { const q = payloadOf(s); return q !== null && sameStart(q, p) })
    if (existing) return { id: existing.id, full: false }
    const code = encodeStart(p)
    const d = decodeStart(code)
    const id = d.ok ? d.id : code.slice(-8)
    const full = get().starts.length >= MAX_STARTS
    const starts = [{ id, code, savedAt: now, best: null }, ...get().starts].slice(0, MAX_STARTS)
    set({ starts }); persist(starts)
    return { id, full }
  },
  importCode(text, now = Date.now()) {
    const d = decodeStart(text)
    if (!d.ok) return { ok: false, reason: d.reason }
    const r = rederive(d.payload)
    if (!r || r.parRetired || r.par <= 1) return { ok: false, reason: 'unplayable' }
    return { ok: true, id: get().save(d.payload, now).id, drift: r.drift }
  },
  rename(id, name) {
    const starts = get().starts.map(s => {
      const p = s.id === id ? payloadOf(s) : null
      return p ? { ...s, code: encodeStart({ ...p, name }) } : s
    })
    set({ starts }); persist(starts)
  },
  remove(id) { const starts = get().starts.filter(s => s.id !== id); set({ starts }); persist(starts) },
  recordBest(id, o) {
    const entry: ScenarioBest = { position: o.retired ? null : o.position, met: o.met }
    const starts = get().starts.map(s => s.id === id ? { ...s, best: betterBest(s.best ?? undefined, entry) } : s)
    set({ starts }); persist(starts)
  },
}))
