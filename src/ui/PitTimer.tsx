import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { effectivePitLaneLoss } from '@engine/incidents'

export function PitTimer() {
  const playerInPit = useRaceStore(s => s.playerInPit)
  const config = useRaceStore(s => s.config)
  const safetyCar = useRaceStore(s => s.raceState?.safetyCar ?? null)
  const [visible, setVisible] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (playerInPit) {
      setVisible(true)
      setKey(k => k + 1)
    } else {
      const t = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(t)
    }
  }, [playerInPit])

  if (!visible || !config) return null

  // Must be the SAME effective loss raceStore charged the stop, or the timer
  // counts down from a duration the race never used.
  const stopDuration = effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) +
    config.tuning.pit.stopMean

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'absolute', top: 8, left: 8, right: 8,
          background: 'var(--night)', borderRadius: 8,
          border: '1px solid var(--accent-warm)',
          padding: '10px 14px', zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-display)', fontSize: 11,
          color: 'var(--accent-warm)', letterSpacing: '0.1em',
        }}>
          <span>PIT STOP</span>
          <span>{stopDuration.toFixed(1)}s</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-deep)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: stopDuration / 10, ease: 'linear' }}
            style={{ height: '100%', background: 'var(--accent-warm)', borderRadius: 2 }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
