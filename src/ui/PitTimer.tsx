import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useReducedMotion } from '@ui/kit'

export function PitTimer() {
  const playerInPit = useRaceStore(s => s.playerInPit)
  const hasConfig = useRaceStore(s => s.config !== null)
  // The stop that HAPPENED (spec 1.6 §1), latched by raceStore at the stop.
  const stopDuration = useRaceStore(s => s.lastStopTime)
  const slow = useRaceStore(s => s.lastStopSlow)
  const reduced = useReducedMotion()
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

  if (!visible || !hasConfig) return null

  // A slow stop is urgent news: the whole card goes hot, ink on hot, and the
  // words say so -- colour is never the only signal.
  const isSlow = slow > 0
  const fg = isSlow ? 'var(--ink)' : 'var(--hot)'

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        data-testid="pit-timer"
        data-slow={isSlow ? 'true' : 'false'}
        role="status"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'absolute', top: 8, left: 8, right: 8,
          background: isSlow ? 'var(--hot)' : 'var(--night)', borderRadius: 8,
          border: '1px solid var(--hot)',
          padding: '10px 14px', zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--font-display)', fontSize: 11,
          color: fg, letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{isSlow ? `SLOW STOP +${slow.toFixed(1)}s` : 'PIT STOP'}</span>
          <span>{stopDuration.toFixed(1)}s</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--ink)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: reduced ? 0 : stopDuration / 10, ease: 'linear' }}
            style={{ height: '100%', background: isSlow ? 'var(--ink)' : 'var(--hot)', borderRadius: 2 }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
