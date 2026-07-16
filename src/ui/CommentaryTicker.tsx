import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { makeCommentaryState, processCommentaryTick, type CommentaryState } from '@state/commentaryMapper'

const MAX_FEED = 8

// Neutral broadcast ticker — factual events for any car, distinct from the
// emotive pit-engineer radio line above it. Always shows the latest line;
// idles on "LAP N/TOTAL" when nothing newsworthy has happened recently.
export function CommentaryTicker() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const stateRef = useRef<CommentaryState>(makeCommentaryState())
  const [feed, setFeed] = useState<string[]>([])

  useEffect(() => {
    if (!raceState || !config) return
    const { lines, next } = processCommentaryTick(raceState, config, stateRef.current)
    stateRef.current = next
    if (lines.length > 0) {
      setFeed(prev => [...lines, ...prev].slice(0, MAX_FEED))
    }
  }, [raceState, config])

  if (!raceState) return null

  const current = feed[0] ?? `Lap ${raceState.lap + 1} of ${raceState.totalLaps}`

  return (
    <div style={{
      padding: '5px 10px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
      overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>📡</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={current}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mid)',
            letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {current}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
