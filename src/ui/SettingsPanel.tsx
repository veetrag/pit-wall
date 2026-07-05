import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore, type SimSpeed, type Difficulty } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ label, sublabel, value, onChange }: {
  label: string; sublabel: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '13px 0', borderBottom: '1px solid var(--line-hair)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', letterSpacing: '0.03em' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sublabel}</div>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => onChange(!value)}
        style={{
          width: 50, height: 28, borderRadius: 14, border: 'none',
          background: value ? 'var(--accent)' : 'var(--bg-elevated)',
          outline: value ? 'none' : '1px solid var(--line-hair)',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <motion.div
          animate={{ x: value ? 22 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
            background: value ? 'var(--bg-deep)' : 'var(--text-dim)',
          }}
        />
      </motion.button>
    </div>
  )
}

function SpeedSelect({ value, onChange }: { value: SimSpeed; onChange: (v: SimSpeed) => void }) {
  const opts: SimSpeed[] = [1, 2, 4]
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--line-hair)' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)' }}>Sim speed</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Default playback speed</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {opts.map(o => (
          <motion.button key={o} whileTap={{ scale: 0.92 }} onClick={() => onChange(o)}
            style={{
              width: 40, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: value === o ? 'var(--accent)' : 'var(--bg-elevated)',
              color: value === o ? 'var(--bg-deep)' : 'var(--text-mid)',
              outline: value === o ? 'none' : '1px solid var(--line-hair)',
              fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
            }}>
            {o}×
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function DifficultySelect({ value, onChange }: { value: Difficulty; onChange: (v: Difficulty) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--line-hair)' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-hi)' }}>Difficulty</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Pro fields sharper, more aggressive rival strategy</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['rookie', 'pro'] as Difficulty[]).map(d => (
          <motion.button key={d} whileTap={{ scale: 0.92 }} onClick={() => onChange(d)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: value === d ? 'var(--accent)' : 'var(--bg-elevated)',
              color: value === d ? 'var(--bg-deep)' : 'var(--text-mid)',
              outline: value === d ? 'none' : '1px solid var(--line-hair)',
              fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.05em', textTransform: 'capitalize',
            }}>
            {d}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.15em', marginTop: 20, marginBottom: 2 }}>
      {title}
    </div>
  )
}

// ── Full settings screen (menu nav) ──────────────────────────────────────────

export function SettingsScreen() {
  const exitSettings = useSeasonStore(s => s.exitSettings)
  const {
    soundEnabled, hapticsEnabled, reducedMotion,
    simSpeed, proMode, skipStartSequence, difficulty,
    setSoundEnabled, setHapticsEnabled, setReducedMotion,
    setSimSpeed, setProMode, setSkipStartSequence, setDifficulty,
  } = useSettingsStore()

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--line-hair)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>CONFIG</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>Settings</div>
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={exitSettings}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', letterSpacing: '0.08em' }}>
          BACK
        </motion.button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 24px' }}>
        <SectionHeader title="AUDIO" />
        <Toggle label="Sound effects" sublabel="Engine, pit, and UI audio" value={soundEnabled} onChange={setSoundEnabled} />

        <SectionHeader title="HAPTICS & MOTION" />
        <Toggle label="Haptic feedback" sublabel="Vibration on pit stops and actions" value={hapticsEnabled} onChange={setHapticsEnabled} />
        <Toggle label="Reduce motion" sublabel="Simplifies animations throughout" value={reducedMotion} onChange={setReducedMotion} />

        <SectionHeader title="GAMEPLAY" />
        <SpeedSelect value={simSpeed} onChange={setSimSpeed} />
        <Toggle label="Skip start sequence" sublabel="Jump straight to racing" value={skipStartSequence} onChange={setSkipStartSequence} />
        <DifficultySelect value={difficulty} onChange={setDifficulty} />
        <Toggle label="Pro mode" sublabel="Hides recommended tyre hints" value={proMode} onChange={setProMode} />

        <SectionHeader title="ABOUT" />
        <div style={{ padding: '13px 0', borderBottom: '1px solid var(--line-hair)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-mid)' }}>Version</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>v0.1 alpha</span>
        </div>
        <div style={{ padding: '13px 0', borderBottom: '1px solid var(--line-hair)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-mid)' }}>Privacy policy</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.04em' }}>Coming soon</span>
        </div>

        {/* Cloud save seam */}
        <div style={{ marginTop: 20, padding: '13px 16px', borderRadius: 10, border: '1px solid var(--line-hair)', opacity: 0.35 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-mid)', letterSpacing: '0.04em' }}>Cloud save</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Google Play sign-in — coming in a future update</div>
        </div>
      </div>
    </motion.div>
  )
}

// ── In-race floating drawer ───────────────────────────────────────────────────

function SettingsPanelDrawer({ onClose }: { onClose: () => void }) {
  const { soundEnabled, hapticsEnabled, reducedMotion, setSoundEnabled, setHapticsEnabled, setReducedMotion } = useSettingsStore()
  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0',
        padding: '20px 20px 32px', borderTop: '1px solid var(--line-hair)', zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>SETTINGS</span>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}
          style={{ background: 'transparent', border: '1px solid var(--line-hair)', borderRadius: 6, padding: '4px 10px', color: 'var(--text-dim)', fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer' }}>
          DONE
        </motion.button>
      </div>
      <Toggle label="Sound" sublabel="Engine, pit, and UI sound effects" value={soundEnabled} onChange={setSoundEnabled} />
      <Toggle label="Haptics" sublabel="Vibration feedback on device" value={hapticsEnabled} onChange={setHapticsEnabled} />
      <Toggle label="Reduce motion" sublabel="Simplifies animations" value={reducedMotion} onChange={setReducedMotion} />
    </motion.div>
  )
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => setOpen(true)} title="Settings"
        style={{
          background: 'transparent', border: '1px solid var(--line-hair)', borderRadius: 6,
          padding: '6px 10px', cursor: 'pointer', color: 'var(--text-dim)',
          fontFamily: 'var(--font-display)', fontSize: 14, lineHeight: 1,
        }}>
        ⚙
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }} />
            <SettingsPanelDrawer onClose={() => setOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
