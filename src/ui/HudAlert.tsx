import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { EASE, useReducedMotion } from '@ui/kit'

export type AlertSeverity = 'info' | 'caution' | 'urgent'
export type AlertMessage = {
  id: string
  severity: AlertSeverity
  category: string
  message: string
  icon: string
}

/*
 * Race Day Bold: a filled slant banner. Fill and text are tokens; caution is
 * --caution (never --tyre-medium -- a race-control state must not share a tyre
 * colour, CLAUDE.md 6.3). Ink on hot/caution, white on grape.
 */
const SEVERITY_FILL: Record<AlertSeverity, string> = {
  info:    'var(--grape)',
  caution: 'var(--caution)',
  urgent:  'var(--hot)',
}
const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  info:    'var(--white)',
  caution: 'var(--ink)',
  urgent:  'var(--ink)',
}

function AlertBanner({ alert, onDismiss }: { alert: AlertMessage; onDismiss: () => void }) {
  const fill = SEVERITY_FILL[alert.severity]
  const text = SEVERITY_TEXT[alert.severity]
  const reduced = useReducedMotion()

  // Auto-dismiss after 4s
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { x: -18, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 18, opacity: 0 } }

  return (
    <motion.div
      {...enter}
      transition={{ duration: 0.18, ease: EASE }}
      className="slant-lg text-zoom"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 4px 0 18px', margin: '8px 8px 0',
        minHeight: 48, flexShrink: 0,
        background: fill, color: text,
      }}
    >
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 16,
        letterSpacing: 0.5, flexShrink: 0,
      }}>
        RADIO
      </span>
      <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>{alert.icon}</span>
      {/* The tag already says RADIO; repeating a RADIO category beside it is noise. */}
      {alert.category !== 'RADIO' && (
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 800,
          letterSpacing: 1, flexShrink: 0, opacity: 0.8,
        }}>
          {alert.category}
        </span>
      )}
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0,
      }}>
        {alert.message}
      </span>
      <button
        type="button"
        className="kit-focus"
        onClick={onDismiss}
        aria-label="Dismiss alert"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: text, fontSize: 18, flexShrink: 0,
          width: 48, height: 48, padding: 0, lineHeight: 1,
        }}
      >
        ×
      </button>
    </motion.div>
  )
}

export function HudAlert() {
  const alerts = useRaceStore(s => s.hudAlerts)
  const dismissAlert = useRaceStore(s => s.dismissAlert)

  const top = alerts[0]

  return (
    <AnimatePresence>
      {top && (
        <AlertBanner
          key={top.id}
          alert={top}
          onDismiss={() => dismissAlert(top.id)}
        />
      )}
    </AnimatePresence>
  )
}
