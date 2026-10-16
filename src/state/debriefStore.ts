import { create } from 'zustand'
import type { DebriefResult } from '@engine/types'
import type { LapHistory } from '@engine/raceHistory'
import { inProcessRunner, type DebriefJob, type DebriefRunner, type DebriefHandle } from './debriefRunner'

let runner: DebriefRunner = inProcessRunner
/** The app installs the Worker runner at startup; tests keep the in-process one. */
export function setDebriefRunner(r: DebriefRunner): void { runner = r }

let handle: DebriefHandle | null = null
let timer: ReturnType<typeof setTimeout> | null = null
function stop() {
  handle?.cancel(); handle = null
  if (timer) { clearTimeout(timer); timer = null }
}

interface DebriefStore {
  status: 'idle' | 'running' | 'done' | 'failed'
  done: number
  total: number
  result: DebriefResult | null
  /** The lap chart's data for `raceKey`. Survives a failed/timed-out judging; cleared by cancel. */
  history: LapHistory | null
  /** Identifies the race this debrief belongs to; results for any other race are ignored. */
  raceKey: string | null
  start: (job: DebriefJob, raceKey: string) => void
  cancel: () => void
}

export const useDebriefStore = create<DebriefStore>((set, get) => ({
  status: 'idle', done: 0, total: 0, result: null, history: null, raceKey: null,

  start(job, raceKey) {
    stop()
    set({ status: 'running', done: 0, total: 0, result: null, history: null, raceKey })
    const mine = () => get().raceKey === raceKey && get().status === 'running'
    timer = setTimeout(() => { if (mine()) { stop(); set({ status: 'failed' }) } }, job.config.tuning.debrief.timeoutMs)
    try {
      handle = runner.start(job, {
        progress: (done, total) => { if (mine()) set({ done, total }) },
        done: (result) => { if (mine()) { stop(); set({ status: 'done', result }) } },
        failed: () => { if (mine()) { stop(); set({ status: 'failed' }) } },
        history: (h) => { if (get().raceKey === raceKey) set({ history: h }) },
      })
    } catch {
      stop()
      set({ status: 'failed' })
    }
  },

  cancel() {
    stop()
    set({ status: 'idle', done: 0, total: 0, result: null, history: null, raceKey: null })
  },
}))
