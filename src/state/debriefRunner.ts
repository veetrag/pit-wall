import type { RaceConfig } from '@engine/types'
import type { DebriefResult } from '@engine/types'
import type { PlayerCall } from '@engine/playerCalls'
import type { RaceRecipe } from './raceRecipe'
import { judgeCalls, whatIf, type WhatIfEdit, type WhatIfResult } from '@engine/debrief'
import { lapHistory, type LapHistory } from '@engine/raceHistory'

export type DebriefMessage = { type: 'debrief'; job: DebriefJob } | { type: 'whatIf'; job: DebriefJob; edit: WhatIfEdit }

export interface DebriefJob { config: RaceConfig; seed: number; calls: PlayerCall[]; recipe?: RaceRecipe }
export interface DebriefHandle { cancel(): void }
export interface DebriefRunner {
  start(job: DebriefJob, on: {
    progress(done: number, total: number): void
    done(result: DebriefResult): void
    failed(reason: string): void
    /** The lap chart's data, delivered before judging starts so a judging timeout never costs the chart. */
    history(h: LapHistory): void
  }): DebriefHandle
  /**
   * Spec 1.6 §5: one edited stop against the real plan. Its own handle, its own cancel.
   * Optional so pre-1.6 runner literals still type-check; the store treats an absent one as failed.
   */
  whatIf?(job: DebriefJob, edit: WhatIfEdit, on: { done(r: WhatIfResult): void; failed(reason: string): void }): DebriefHandle
}

/**
 * Runs the debrief on the calling thread, after a macrotask so start()
 * returns first. For tests and as a fallback; the app installs the worker
 * runner (src/state/debriefWorkerRunner.ts) at startup.
 */
export const inProcessRunner: DebriefRunner = {
  start(job, on) {
    let cancelled = false
    setTimeout(() => {
      if (cancelled) return
      try {
        const h = lapHistory(job.config, job.seed, job.calls)
        if (!cancelled) on.history(h)
      } catch { /* the chart is optional; the verdicts still run */ }
      if (cancelled) return
      try {
        let lastPct = -1
        const result = judgeCalls(job.config, job.seed, job.calls, (d, t) => {
          const pct = Math.floor((d / t) * 100)
          if (!cancelled && (pct !== lastPct || d === t)) { lastPct = pct; on.progress(d, t) }
        })
        if (!cancelled) on.done(result)
      } catch (e) {
        if (!cancelled) on.failed(String(e))
      }
    }, 0)
    return { cancel: () => { cancelled = true } }
  },
  whatIf(job, edit, on) {
    let cancelled = false
    setTimeout(() => {
      if (cancelled) return
      try { const r = whatIf(job.config, job.seed, job.calls, edit); if (!cancelled) on.done(r) }
      catch (e) { if (!cancelled) on.failed(String(e)) }
    }, 0)
    return { cancel: () => { cancelled = true } }
  },
}
