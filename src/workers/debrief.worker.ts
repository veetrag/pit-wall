import { judgeCalls } from '@engine/debrief'
import type { DebriefJob } from '@state/debriefRunner'

self.onmessage = (e: MessageEvent<DebriefJob>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  try {
    const { config, seed, calls } = e.data
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
