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
  const queue = useRaceStore(s => s.lastStopQueue)
  // Seconds of penalty served at this stop (spec §8.3): the player's latest
  // penalty_served, if it landed this lap or last. A primitive, so ticks without one do not re-render.
  const served = useRaceStore(s => {
    const rs = s.raceState
    if (!rs) return 0
    const id = s.config?.playerDriverId
    for (let i = rs.incidents.length - 1; i >= 0; i--) {
      const ev = rs.incidents[i]!
      if (ev.driverId === id && ev.kind === 'penalty_served') return ev.lap >= rs.lap - 1 ? ev.timeLoss ?? 0 : 0
    }
    return 0
  })
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
        {served > 0 && (
          <div data-testid="pit-timer-penalty" style={{
            fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em',
            color: isSlow ? 'var(--ink)' : 'var(--hot)', fontVariantNumeric: 'tabular-nums',
          }}>
            PENALTY {served.toFixed(1)}s · served first
          </div>
        )}
        {queue > 0 && (
          <div data-testid="pit-timer-queue" style={{
            fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em',
            color: isSlow ? 'var(--ink)' : 'var(--caution)', fontVariantNumeric: 'tabular-nums',
          }}>
            QUEUE +{queue.toFixed(1)}s · double stack
          </div>
        )}
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
