import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { Compound } from '@engine/types'
import { useHaptics, ImpactStyle } from '@hooks/useHaptics'
import { soundService } from '@audio/soundService'

const COMPOUNDS: { id: Compound; label: string; colorVar: string }[] = [
  { id: 'S', label: 'SOFT',   colorVar: 'var(--tyre-soft)' },
  { id: 'M', label: 'MEDIUM', colorVar: 'var(--tyre-medium)' },
  { id: 'H', label: 'HARD',   colorVar: 'var(--tyre-hard)' },
]

function PitPanelDrawer() {
  const [selected, setSelected] = useState<Compound>('M')
  const { pitNow, closePitPanel, projectionResult, updateProjection } = useRaceStore()
  const { impact } = useHaptics()

  function handleSelect(c: Compound) {
    setSelected(c)
    updateProjection(c)
  }

  function handleConfirm() {
    impact(ImpactStyle.Heavy)
    soundService.play('pitConfirm')
    pitNow(selected)
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0',
        padding: '20px 20px 32px',
        borderTop: '1px solid var(--line-hair)',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>
          PIT STOP
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={closePitPanel}
          style={{
            background: 'transparent', border: '1px solid var(--line-hair)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer',
          }}
        >
          CANCEL
        </motion.button>
      </div>

      {projectionResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 14px',
            marginBottom: 16, border: '1px solid var(--line-hair)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            PROJECTED REJOIN
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>
              P{projectionResult.rejoinPosition}
            </span>
            {projectionResult.driverAheadId && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', fontVariantNumeric: 'tabular-nums' }}>
                +{projectionResult.rejoinGap.toFixed(1)}s ahead of next
              </span>
            )}
          </div>
        </motion.div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {COMPOUNDS.map(({ id, label, colorVar }) => {
          const active = selected === id
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.94 }}
              onClick={() => handleSelect(id)}
              style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '14px 8px',
                cursor: 'pointer',
                background: active ? colorVar : 'var(--bg-panel)',
                outline: active ? 'none' : `1px solid var(--line-hair)`,
                boxShadow: active ? `0 0 16px ${colorVar}66` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
                color: active ? 'var(--bg-deep)' : colorVar,
                letterSpacing: '0.08em',
              }}>
                {id}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 10,
                color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
                marginTop: 2,
              }}>
                {label}
              </div>
            </motion.button>
          )
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleConfirm}
        style={{
          width: '100%', border: 'none', borderRadius: 10, padding: '16px',
          background: 'var(--accent-warm)', color: 'var(--bg-deep)',
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
        }}
      >
        BOX NOW
      </motion.button>
    </motion.div>
  )
}

export function PitButton() {
  const openPitPanel = useRaceStore(s => s.openPitPanel)
  const phase = useRaceStore(s => s.phase)

  if (phase !== 'racing') return null

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={openPitPanel}
      style={{
        border: '2px solid var(--accent-warm)', borderRadius: 8,
        padding: '12px 24px', background: 'transparent',
        color: 'var(--accent-warm)', fontFamily: 'var(--font-display)',
        fontSize: 16, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      PIT
    </motion.button>
  )
}

export function PitPanel() {
  const pitPanelOpen = useRaceStore(s => s.pitPanelOpen)

  return (
    <AnimatePresence>
      {pitPanelOpen && <PitPanelDrawer />}
    </AnimatePresence>
  )
}
