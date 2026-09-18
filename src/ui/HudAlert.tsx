import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'

export type AlertSeverity = 'info' | 'caution' | 'urgent'
export type AlertMessage = {
  id: string
  severity: AlertSeverity
  category: string
  message: string
  icon: string
}

/*
 * Tokens, not hex. info/urgent were already exactly --accent and --accent-warm,
 * so those two are a pure rename.
 *
 * `caution` was #F2C94C, which is --tyre-medium -- the one reuse the token file
 * explicitly legislates against, because it ties a race-control state to tyre
 * semantics (CLAUDE.md 6.3): a medium-shod car on a caution-flashed row would
 * be drawn in the same yellow as the flag. It now uses --caution, the token
 * that exists for this, which also makes an alert match the safety-car banner
 * and the scenario briefing. Visible change: caution alerts shift yellow to
 * amber. --caution measures 9.66:1 on --bg-panel and 8.62:1 on --bg-elevated.
 */
const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info:    'var(--accent)',
  caution: 'var(--caution)',
  urgent:  'var(--accent-warm)',
}
const SEVERITY_BG: Record<AlertSeverity, string> = {
  info:    'transparent',
  caution: 'transparent',
  urgent:  'rgba(255,77,94,0.08)',
}

function AlertBanner({ alert, onDismiss }: { alert: AlertMessage; onDismiss: () => void }) {
  const color = SEVERITY_COLOR[alert.severity]
  const bg    = SEVERITY_BG[alert.severity]

  // Auto-dismiss after 4s
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <motion.div
      initial={{ y: -44, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -44, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        height: 44, flexShrink: 0,
        borderLeft: `3px solid ${color}`,
        background: bg,
        borderBottom: '1px solid var(--line-hair)',
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>{alert.icon}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
        color: color, letterSpacing: '0.1em', flexShrink: 0,
      }}>
        {alert.category}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-hi)', flex: 1, minWidth: 0,
      }}>
        {alert.message}
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss alert"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-dim)', fontSize: 14, flexShrink: 0,
          padding: '2px 4px', lineHeight: 1,
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
