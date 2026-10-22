import { create } from 'zustand'
import type { DebriefResult } from '@engine/types'
import type { WhatIfEdit, WhatIfResult } from '@engine/debrief'
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

let whatIfHandle: DebriefHandle | null = null
let whatIfTimer: ReturnType<typeof setTimeout> | null = null
let whatIfToken = 0
/** Cancels any running what-if and invalidates its callbacks (the token moves on). */
function stopWhatIf() {
  whatIfHandle?.cancel(); whatIfHandle = null
  if (whatIfTimer) { clearTimeout(whatIfTimer); whatIfTimer = null }
  whatIfToken++
}
/**
 * Friendly copy for a failed what-if (item 16a). `reason` is the runner's text:
 * the engine's RangeError string, or 'timeout'. Only the copy is ever shown.
 */
export function whatIfFailureCopy(reason: string | undefined): string {
  if (reason !== undefined && /RangeError/.test(reason)) {
    return /sets left/.test(reason) ? 'No sets of that tyre were left.' : "That change isn't possible in this race."
  }
  return "Couldn't run that plan."
}

const WHATIF_IDLE = { status: 'idle' as const, edit: null, result: null }

interface DebriefStore {
  status: 'idle' | 'running' | 'done' | 'failed'
  done: number
  total: number
  result: DebriefResult | null
  /** The lap chart's data for `raceKey`. Survives a failed/timed-out judging; cleared by cancel. */
  history: LapHistory | null
  /** Identifies the race this debrief belongs to; results for any other race are ignored. */
  raceKey: string | null
  /** The race the debrief judged, kept until cancel so a what-if can run after raceStore resets (spec 1.6 §5). */
  job: DebriefJob | null
  whatIf: {
    status: 'idle' | 'running' | 'done' | 'failed'; edit: WhatIfEdit | null; result: WhatIfResult | null
    /** Only on 'failed': the runner's short reason; show it through whatIfFailureCopy. */
    reason?: string
  }
  runWhatIf: (edit: WhatIfEdit) => void
  clearWhatIf: () => void
  start: (job: DebriefJob, raceKey: string) => void
  cancel: () => void
}

export const useDebriefStore = create<DebriefStore>((set, get) => ({
  status: 'idle', done: 0, total: 0, result: null, history: null, raceKey: null, job: null, whatIf: WHATIF_IDLE,

  start(job, raceKey) {
    stop(); stopWhatIf()
    set({ status: 'running', done: 0, total: 0, result: null, history: null, raceKey, job, whatIf: WHATIF_IDLE })
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

  runWhatIf(edit) {
    const { status, job } = get()
    if (status !== 'done' || !job) return
    stopWhatIf()
    const token = whatIfToken
    const live = () => token === whatIfToken
    const fail = (reason: string) => set(s => ({ whatIf: { ...s.whatIf, status: 'failed', reason } }))
    set({ whatIf: { status: 'running', edit, result: null } })
    whatIfTimer = setTimeout(() => { if (live()) { stopWhatIf(); fail('timeout') } }, job.config.tuning.debrief.timeoutMs)
    // A runner without whatIf (older literals) can never answer: report failed, never hang.
    if (!runner.whatIf) { stopWhatIf(); fail('no runner'); return }
    try {
      whatIfHandle = runner.whatIf(job, edit, {
        done: (result) => { if (live()) { stopWhatIf(); set({ whatIf: { status: 'done', edit, result } }) } },
        failed: (reason) => { if (live()) { stopWhatIf(); fail(reason) } },
      })
    } catch (e) {
      stopWhatIf(); set({ whatIf: { status: 'failed', edit, result: null, reason: String(e) } })
    }
  },

  clearWhatIf() { stopWhatIf(); set({ whatIf: WHATIF_IDLE }) },

  cancel() {
    stop(); stopWhatIf()
    set({ status: 'idle', done: 0, total: 0, result: null, history: null, raceKey: null, job: null, whatIf: WHATIF_IDLE })
  },
}))
