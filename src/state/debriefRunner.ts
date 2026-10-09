import type { RaceConfig } from '@engine/types'
import type { DebriefResult } from '@engine/types'
import type { PlayerCall } from '@engine/playerCalls'
import { judgeCalls } from '@engine/debrief'

export interface DebriefJob { config: RaceConfig; seed: number; calls: PlayerCall[] }
export interface DebriefHandle { cancel(): void }
export interface DebriefRunner {
  start(job: DebriefJob, on: {
    progress(done: number, total: number): void
    done(result: DebriefResult): void
    failed(reason: string): void
  }): DebriefHandle
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
}
