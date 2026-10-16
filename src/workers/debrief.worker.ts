import { judgeCalls } from '@engine/debrief'
import { lapHistory } from '@engine/raceHistory'
import type { DebriefJob } from '@state/debriefRunner'

self.onmessage = (e: MessageEvent<DebriefJob>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  const { config, seed, calls } = e.data
  try {
    post({ type: 'history', history: lapHistory(config, seed, calls) })
  } catch { /* the chart is optional; the verdicts still run */ }
  try {
    let lastPct = -1
    const result = judgeCalls(config, seed, calls, (done, total) => {
      const pct = Math.floor((done / total) * 100)
      if (pct !== lastPct || done === total) { lastPct = pct; post({ type: 'progress', done, total }) }
    })
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'failed', reason: String(err) })
  }
}
