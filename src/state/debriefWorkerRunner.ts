import type { DebriefRunner } from './debriefRunner'

/**
 * The ONLY file that constructs the debrief Worker. Imported by App.tsx
 * alone and re-exported by nothing: vitest cannot construct a Worker, so a
 * barrel that re-exported this would break every test that touched it --
 * the same rule src/sync/index.ts keeps for the Play Games plugin.
 */
export const workerRunner: DebriefRunner = {
  start(job, on) {
    const w = new Worker(new URL('../workers/debrief.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ type: string; done?: number; total?: number; result?: unknown; reason?: string }>) => {
      const m = e.data
      if (m.type === 'progress') on.progress(m.done ?? 0, m.total ?? 0)
      else if (m.type === 'done') { on.done(m.result as Parameters<typeof on.done>[0]); w.terminate() }
      else if (m.type === 'failed') { on.failed(m.reason ?? 'failed'); w.terminate() }
    }
    w.onerror = (e) => { on.failed(e.message); w.terminate() }
    w.postMessage(job)
    return { cancel: () => w.terminate() }
  },
}
