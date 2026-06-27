import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { PaceMode } from '@engine/types'

const MODES: { mode: PaceMode; label: string; sublabel: string; color: string }[] = [
  { mode: 'conserve', label: 'SAVE',  sublabel: '+0.20s  −25% wear', color: 'var(--positive)' },
  { mode: 'neutral',  label: 'HOLD',  sublabel: 'baseline',          color: 'var(--text-mid)' },
  { mode: 'push',     label: 'PUSH',  sublabel: '−0.15s  +30% wear', color: 'var(--accent-warm)' },
]

export function PaceModeToggle() {
  const raceState = useRaceStore(s => s.raceState)
  const setPaceMode = useRaceStore(s => s.setPaceMode)

  const player = raceState?.cars.find(c => c.isPlayer)
  const current = player?.paceMode ?? 'neutral'

  return (
    <div style={{
      display: 'flex', gap: 6,
      background: 'var(--bg-panel)', borderRadius: 8,
      padding: 6, border: '1px solid var(--line-hair)',
    }}>
      {MODES.map(({ mode, label, sublabel, color }) => {
        const active = current === mode
        return (
          <motion.button
            key={mode}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPaceMode(mode)}
            style={{
              flex: 1, border: 'none', borderRadius: 6, padding: '8px 6px',
              cursor: 'pointer',
              background: active ? color : 'transparent',
              outline: active ? 'none' : `1px solid var(--line-hair)`,
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
              color: active ? 'var(--bg-deep)' : color,
              letterSpacing: '0.08em',
            }}>
              {label}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
              marginTop: 2, fontVariantNumeric: 'tabular-nums',
            }}>
              {sublabel}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
