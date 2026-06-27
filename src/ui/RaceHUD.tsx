import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { GameClock } from './GameClock'
import { StartScreen } from './StartScreen'
import { TimingTower } from './TimingTower'
import { TyreGauge } from './TyreGauge'
import { PaceModeToggle } from './PaceModeToggle'
import { PitPanel, PitButton } from './PitPanel'
import { TrackCanvas } from '@canvas/TrackCanvas'

function SpeedControl() {
  const speed = useClockStore(s => s.speed)
  const setSpeed = useClockStore(s => s.setSpeed)
  const phase = useRaceStore(s => s.phase)

  if (phase !== 'racing') return null

  const options: { v: GameSpeed; label: string }[] = [
    { v: 0, label: '⏸' },
    { v: 1, label: '1×' },
    { v: 2, label: '2×' },
    { v: 4, label: '4×' },
  ]

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(({ v, label }) => (
        <motion.button
          key={v}
          whileTap={{ scale: 0.9 }}
          onClick={() => setSpeed(v)}
          style={{
            border: 'none', borderRadius: 6, padding: '6px 12px',
            background: speed === v ? 'var(--accent)' : 'var(--bg-elevated)',
            color: speed === v ? 'var(--bg-deep)' : 'var(--text-mid)',
            fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
            outline: speed === v ? 'none' : '1px solid var(--line-hair)',
          }}
        >
          {label}
        </motion.button>
      ))}
    </div>
  )
}

function FinishBanner() {
  const raceState = useRaceStore(s => s.raceState)
  const winner = raceState?.cars.find(c => c.position === 1)
  const driverCode = winner?.driverId.replace('d_', '').toUpperCase() ?? '---'

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
        borderRadius: 10, padding: '12px 28px', textAlign: 'center', zIndex: 50,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        RACE FINISHED
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
        {driverCode} WINS
      </div>
    </motion.div>
  )
}

export function RaceHUD() {
  const phase = useRaceStore(s => s.phase)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-deep)',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      position: 'relative', overflow: 'hidden',
    }}>
      <GameClock />

      <AnimatePresence mode="wait">
        {phase === 'idle' ? (
          <StartScreen key="start" />
        ) : (
          <motion.div
            key="race"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
          >
            {phase === 'finished' && <FinishBanner />}

            {/* Main area: canvas + tower */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '8px 8px 0', minHeight: 0 }}>
              <div style={{ flex: 1, overflow: 'hidden', borderRadius: 8, background: 'var(--bg-deep)' }}>
                <TrackCanvas />
              </div>
              <div style={{ width: 252, marginLeft: 8, overflowY: 'auto', flexShrink: 0 }}>
                <TimingTower />
              </div>
            </div>

            {/* Bottom control strip */}
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-panel)',
              borderTop: '1px solid var(--line-hair)',
              display: 'flex', flexDirection: 'column', gap: 10,
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <PaceModeToggle />
                </div>
                <TyreGauge />
                <PitButton />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SpeedControl />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PitPanel />
    </div>
  )
}
