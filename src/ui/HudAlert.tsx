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

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info:    '#00E5D0',
  caution: '#F2C94C',
  urgent:  '#FF4D5E',
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
