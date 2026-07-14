import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { GameClock } from './GameClock'
import { StartScreen } from './StartScreen'
import { TimingTower } from './TimingTower'
import { PaceModeToggle } from './PaceModeToggle'
import { PitPanel, PitButton } from './PitPanel'
import { WeatherStrip } from './WeatherStrip'
import { HudAlert } from './HudAlert'
import { TelemetryZone } from './TelemetryZone'
import { TrackCanvas } from '@canvas/TrackCanvas'
import { StartLights } from './StartLights'
import { SettingsPanel } from './SettingsPanel'
import { PitTimer } from './PitTimer'
import { Component, type ReactNode } from 'react'

class CanvasBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e: unknown) { return { error: String(e) } }
  componentDidCatch(e: unknown) { console.error('[CanvasBoundary]', e) }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 16, color: 'var(--accent-warm)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        Canvas error: {this.state.error}
      </div>
    )
    return this.props.children
  }
}

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
            border: 'none', borderRadius: 6, padding: '5px 10px',
            background: speed === v ? 'var(--accent)' : 'var(--bg-elevated)',
            color: speed === v ? 'var(--bg-deep)' : 'var(--text-mid)',
            fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
            outline: speed === v ? 'none' : '1px solid var(--line-hair)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {label}
        </motion.button>
      ))}
    </div>
  )
}

function StatusBar() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  const phase = useRaceStore(s => s.phase)

  if (!raceState || phase === 'idle') return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 12px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {config?.circuit.name ?? ''}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
        color: 'var(--accent)', fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.06em',
      }}>
        L{raceState.lap + 1}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>/{raceState.totalLaps}</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SpeedControl />
        <SettingsPanel />
      </div>
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
            {phase === 'starting' && <StartLights />}

            {/* Status bar: circuit · lap · speed controls */}
            <StatusBar />

            {/* Weather strip */}
            {(phase === 'racing' || phase === 'starting') && <WeatherStrip />}

            {/* HUD alert slot — 0px collapsed / 44px active */}
            {(phase === 'racing' || phase === 'starting') && <HudAlert />}

            {/* Track canvas — 160px */}
            <div style={{
              height: 160, flexShrink: 0,
              margin: '8px 8px 0',
              borderRadius: 8, overflow: 'hidden',
              background: 'var(--bg-deep)', position: 'relative',
            }}>
              <PitTimer />
              <CanvasBoundary>
                <TrackCanvas />
              </CanvasBoundary>
            </div>

            {/* Telemetry zone — 130px */}
            {(phase === 'racing' || phase === 'starting') && (
              <div style={{ margin: '6px 8px 0' }}>
                <TelemetryZone />
              </div>
            )}

            {/* Timing tower — compact context window by default, tap to expand */}
            <div style={{
              flex: 1, overflow: 'hidden',
              margin: '6px 8px 0', minHeight: 0,
            }}>
              <TimingTower />
            </div>

            {/* Bottom control strip — thumb zone */}
            <div style={{
              padding: '8px 12px 10px',
              background: 'var(--bg-panel)',
              borderTop: '1px solid var(--line-hair)',
              display: 'flex', gap: 8, alignItems: 'stretch',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PaceModeToggle />
              </div>
              <PitButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PitPanel />
    </div>
  )
}
