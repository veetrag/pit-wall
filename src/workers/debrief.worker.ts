import { judgeCalls, whatIf } from '@engine/debrief'
import { lapHistory } from '@engine/raceHistory'
import type { DebriefMessage } from '@state/debriefRunner'

self.onmessage = (e: MessageEvent<DebriefMessage>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  const msg = e.data
  if (msg.type === 'whatIf') {
    try { post({ type: 'whatIf-done', result: whatIf(msg.job.config, msg.job.seed, msg.job.calls, msg.edit) }) }
    catch (err) { post({ type: 'failed', reason: String(err) }) }
    return
  }
  const { config, seed, calls } = msg.job
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
