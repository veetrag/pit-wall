import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore, type ActiveRadioRequest } from '@state/raceStore'
import { useClockStore } from '@state/clockStore'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { KitButton, TYRE_NAME, EASE, useReducedMotion } from '@ui/kit'

const TICK_MS = 100
const VISUALLY_HIDDEN = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
} as const

/**
 * The driver asks a yes/no question (spec 2026-10-17 §2). Above the HUD alert;
 * the race keeps running. The countdown runs only while the race clock does
 * (ruling R7); at zero it is a NO.
 */
function RequestCard({ req }: { req: ActiveRadioRequest }) {
  const answer = useRaceStore(s => s.answerRadioRequest)
  const dismiss = useRaceStore(s => s.dismissRadioRequest)
  // Config is non-null while a request exists (phase 'racing').
  const expiryMs = useRaceStore(s => s.config!.tuning.radioRequests.expirySec * 1000)
  const racing = useRaceStore(s => s.phase === 'racing')
  const clockRunning = useClockStore(s => s.speed > 0 && s.appVisible)
  const running = racing && clockRunning
  const reduced = useReducedMotion()
  const { impact } = useHaptics()
  const [left, setLeft] = useState(expiryMs)

  // One buzz on arrival: the card has a new id every time.
  useEffect(() => { impact(ImpactStyle.Medium) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft(l => l - TICK_MS), TICK_MS)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => { if (left <= 0) dismiss() }, [left, dismiss])

  const yesLabel = req.kind === 'box' ? `Yes, box for ${TYRE_NAME[req.compound ?? 'M']}` : 'Yes, push'
  const frac = Math.max(0, Math.min(1, left / expiryMs))

  return (
    <motion.div
      data-testid="radio-request"
      role="group"
      aria-label="Driver radio request"
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: -18 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 18 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="slant-lg text-zoom"
      style={{
        margin: '8px 8px 0', padding: '8px 10px 0 18px', flexShrink: 0,
        background: 'var(--grape)', color: 'var(--white)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {/* Announced once, assertively: it is a question with a deadline. */}
      <span role="alert" style={VISUALLY_HIDDEN}>{`Driver radio: ${req.line}`}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 15, color: 'var(--lilac-dim)', flexShrink: 0 }}>
          DRIVER
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{req.line}</span>
        <KitButton variant="primary" size="sm" ariaLabel={yesLabel} onClick={() => answer(true)} style={{ height: 48, minWidth: 64 }}>
          YES
        </KitButton>
        <KitButton variant="secondary" size="sm" ariaLabel="No" onClick={() => answer(false)} style={{ height: 48, minWidth: 56 }}>
          NO
        </KitButton>
      </div>
      <div style={{ height: 3, background: 'var(--ink)', marginBottom: 6 }}>
        <div
          data-testid="radio-request-bar"
          data-remaining={Math.max(0, left)}
          style={{ height: '100%', width: '100%', transformOrigin: 'left', transform: `scaleX(${frac})`, background: 'var(--lilac-dim)' }}
        />
      </div>
    </motion.div>
  )
}

export function RadioRequest() {
  const req = useRaceStore(s => s.radioRequest)
  return <AnimatePresence>{req && <RequestCard key={req.id} req={req} />}</AnimatePresence>
}
