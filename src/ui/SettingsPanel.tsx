import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '@state/settingsStore'

function Toggle({ label, sublabel, value, onChange }: {
  label: string; sublabel: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: '1px solid var(--line-hair)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: '0.04em' }}>
          {label}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => onChange(!value)}
        style={{
          width: 52, height: 30, borderRadius: 15, border: 'none',
          background: value ? 'var(--accent)' : 'var(--bg-elevated)',
          outline: value ? 'none' : '1px solid var(--line-hair)',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <motion.div
          animate={{ x: value ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            position: 'absolute', top: 4, width: 22, height: 22,
            borderRadius: '50%', background: value ? 'var(--bg-deep)' : 'var(--text-dim)',
          }}
        />
      </motion.button>
    </div>
  )
}

function SettingsPanelDrawer({ onClose }: { onClose: () => void }) {
  const { soundEnabled, hapticsEnabled, reducedMotion, setSoundEnabled, setHapticsEnabled, setReducedMotion } = useSettingsStore()

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>
          SETTINGS
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid var(--line-hair)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer',
          }}
        >
          DONE
        </motion.button>
      </div>

      <Toggle label="Sound" sublabel="Engine, pit, and UI sound effects" value={soundEnabled} onChange={setSoundEnabled} />
      <Toggle label="Haptics" sublabel="Vibration feedback on device" value={hapticsEnabled} onChange={setHapticsEnabled} />
      <Toggle label="Reduce Motion" sublabel="Simplifies animations for accessibility" value={reducedMotion} onChange={setReducedMotion} />
    </motion.div>
  )
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        title="Settings"
        style={{
          background: 'transparent', border: '1px solid var(--line-hair)',
          borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-dim)',
          fontFamily: 'var(--font-display)', fontSize: 14, lineHeight: 1,
        }}
      >
        ⚙
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
            />
            <SettingsPanelDrawer onClose={() => setOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
