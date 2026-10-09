import { judgeCalls } from '@engine/debrief'
import type { DebriefJob } from '@state/debriefRunner'

self.onmessage = (e: MessageEvent<DebriefJob>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  try {
    const { config, seed, calls } = e.data
    const result = judgeCalls(config, seed, calls, (done, total) => post({ type: 'progress', done, total }))
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'failed', reason: String(err) })
  }
}
