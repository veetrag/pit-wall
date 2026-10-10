import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE, PRESS, ScreenFrame, ScreenHeader, KitToggle, Segmented, Pill, useReducedMotion } from '@ui/kit'
import { useSettingsStore, type SimSpeed, type Difficulty } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { useSeasonStore } from '@state/seasonStore'
import { useUiTap } from '@hooks/useUiTap'

// ── Shared primitives ─────────────────────────────────────────────────────────

function GroupHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 8 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, textTransform: 'uppercase', color: 'var(--lilac-dim)' }}>{title}</h2>
      {right}
    </div>
  )
}

/** Grape slanted row: label and sub on the left, a segmented control on the right. */
function SegRow({ label, sub, minWidth, children }: { label: string; sub: string; minWidth: number; children: ReactNode }) {
  return (
    <div className="slant-row" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '8px 18px 8px 20px', background: 'var(--grape)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, color: 'var(--white)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'var(--lilac)' }}>{sub}</span>
      </div>
      <div style={{ flexShrink: 0, minWidth }}>{children}</div>
    </div>
  )
}

const SPEED_OPTIONS = [
  { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' },
]
const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'rookie', label: 'Rookie' }, { value: 'pro', label: 'Pro' },
]

// ── Full settings screen (menu nav) ──────────────────────────────────────────

export function SettingsScreen() {
  const exitSettings = useSeasonStore(s => s.exitSettings)
  const {
    soundEnabled, hapticsEnabled, reducedMotion,
    simSpeed, proMode, skipStartSequence, difficulty, coachMarksSeen,
    setSoundEnabled, setHapticsEnabled, setReducedMotion,
    setSimSpeed, setProMode, setSkipStartSequence, setDifficulty, setCoachMarksSeen,
  } = useSettingsStore()

  return (
    <ScreenFrame label="Settings">
      <ScreenHeader title="Settings" onBack={exitSettings} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
        <GroupHead title="Audio & feel" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <KitToggle label="Sound effects" sub="Engine, pit and UI audio" checked={soundEnabled} onChange={setSoundEnabled} />
          <KitToggle label="Haptic feedback" sub="Vibration on pit stops and actions" checked={hapticsEnabled} onChange={setHapticsEnabled} />
          <KitToggle label="Reduce motion" sub="Simpler animations everywhere" checked={reducedMotion} onChange={setReducedMotion} />
        </div>

        <GroupHead title="Gameplay" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SegRow minWidth={156} label="Sim speed" sub="Default playback speed">
            <Segmented ariaLabel="Sim speed" options={SPEED_OPTIONS} value={String(simSpeed)}
              onChange={v => setSimSpeed(Number(v) as SimSpeed)} />
          </SegRow>
          <SegRow minWidth={150} label="Difficulty" sub="Pro fields sharper, more aggressive rival strategy">
            <Segmented ariaLabel="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
          </SegRow>
          <KitToggle label="Skip start sequence" sub="Jump straight to racing" checked={skipStartSequence} onChange={setSkipStartSequence} />
          <KitToggle label="Pro mode" sub="Hides recommended tyre hints" checked={proMode} onChange={setProMode} />
          <KitToggle
            label="Replay tutorial"
            sub="Show the first-race coaching again"
            checked={!coachMarksSeen}
            onChange={(v) => { setCoachMarksSeen(!v); useCoachStore.getState().reset() }}
          />
        </div>

        <GroupHead title="Account" right={<Pill>Coming soon</Pill>} />
        <KitToggle label="Cloud save" sub="Google Play Games" checked={false} onChange={() => {}} disabled />

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, color: 'var(--lilac)' }}>Privacy policy · Coming soon</span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--lilac-dim)' }}>Pit Wall v{__APP_VERSION__}</span>
        </div>
      </div>
    </ScreenFrame>
  )
}

// ── In-race floating drawer ───────────────────────────────────────────────────

function SettingsPanelDrawer({ onClose }: { onClose: () => void }) {
  const { soundEnabled, hapticsEnabled, reducedMotion, setSoundEnabled, setHapticsEnabled, setReducedMotion } = useSettingsStore()
  const uiTap = useUiTap()
  const reduced = useReducedMotion()
  const slide = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: { duration: 0.22, ease: EASE } }
  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label="Settings" {...slide}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--night)', clipPath: 'polygon(0 3%,100% 0,100% 100%,0 100%)',
        padding: 'calc(16px + 3%) 16px calc(24px + var(--safe-bottom, 0px))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 30, color: 'var(--white)' }}>SETTINGS</span>
        <motion.button type="button" whileTap={{ scale: 0.96 }} transition={PRESS} onClick={() => { uiTap(); onClose() }}
          className="kit-focus" style={{ height: 48, minWidth: 80, padding: '0 20px', borderRadius: 999, border: 'none', background: 'var(--grape)', color: 'var(--white)', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14, letterSpacing: 1, cursor: 'pointer' }}>
          DONE
        </motion.button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <KitToggle label="Sound" sub="Engine, pit, and UI sound effects" checked={soundEnabled} onChange={setSoundEnabled} />
        <KitToggle label="Haptics" sub="Vibration feedback on device" checked={hapticsEnabled} onChange={setHapticsEnabled} />
        <KitToggle label="Reduce motion" sub="Simplifies animations" checked={reducedMotion} onChange={setReducedMotion} />
      </div>
    </motion.div>
  )
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <motion.button type="button" whileTap={{ scale: 0.96 }} transition={PRESS} onClick={() => setOpen(true)} title="Settings" aria-label="Settings"
        className="kit-focus"
        style={{
          background: 'var(--grape)', border: 'none', borderRadius: 999, width: 48, height: 48,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--lilac)', fontSize: 20, lineHeight: 1,
        }}>
        ⚙
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ink-rgb), 0.6)', zIndex: 99 }} />
            <SettingsPanelDrawer onClose={() => setOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
