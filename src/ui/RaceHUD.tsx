import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import { useClockStore, type GameSpeed } from '@state/clockStore'
import { useCoachStore } from '@state/coachStore'
import { useCoachingActive } from '@hooks/useCoachingActive'
import { useSettingsStore } from '@state/settingsStore'
import { CoachMark } from './CoachMark'
import { GameClock } from './GameClock'
import { SafetyCarBanner } from './SafetyCarBanner'
import { StartScreen } from './StartScreen'
import { TimingTower } from './TimingTower'
import { PaceModeToggle } from './PaceModeToggle'
import { PitPanel, PitButton } from './PitPanel'
import { WeatherStrip } from './WeatherStrip'
import { HudAlert } from './HudAlert'
import { CommentaryTicker } from './CommentaryTicker'
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

// Top-level group label — bolder/brighter than a component's own internal
// sub-label (e.g. TRACK inside LIVE RACE) so the HUD reads as a small number
// of clear sections rather than an unlabelled stack of panels.
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '7px 10px 5px',
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
      color: 'var(--accent)', letterSpacing: '0.14em',
      borderBottom: '1px solid var(--line-hair)',
    }}>
      {children}
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

/**
 * Retires the first-race tutorial once both coach marks have been dismissed.
 *
 * Extracted from `RaceHUD` so it can be unit-tested without mounting the HUD
 * (which drags in PixiJS via `TrackCanvas`, which jsdom cannot render).
 */
export function useRetireCoachTutorial(): void {
  const done = useCoachStore(s => s.done)
  const setCoachMarksSeen = useSettingsStore(s => s.setCoachMarksSeen)
  useEffect(() => {
    // All four, not just the original two. Adding a mark without adding it
    // here would retire the tutorial before the new mark had ever been shown.
    if (done.timing_tower && done.pace_modes && done.tyre_cliff && done.projection) {
      setCoachMarksSeen(true)
    }
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Requests the two marks that have no natural trigger of their own.
 *
 * The cliff and the projection are requested by the things that cause them
 * (TelemetryZone, PitPanel). The tower and the pace trade are always on
 * screen, so they are keyed to the lap instead: the tower at lights-out,
 * because it is the first thing a new player has to read, and the pace trade
 * once the race is actually running and the tyres have started to go off.
 *
 * Re-requesting on later laps is harmless and deliberate: coachStore refuses a
 * mark while another is active, so a request dropped at lap 1 is made again at
 * lap 2 rather than lost.
 */
function useTutorialMarks(): void {
  const coaching = useCoachingActive()
  const lap = useRaceStore(s => s.raceState?.lap ?? 0)
  const request = useCoachStore(s => s.request)
  useEffect(() => {
    if (!coaching) return
    if (lap >= 0) request('timing_tower')
    if (lap >= 2) request('pace_modes')
  }, [coaching, lap, request])
}

export function RaceHUD() {
  const phase = useRaceStore(s => s.phase)
  useRetireCoachTutorial()
  useTutorialMarks()

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

            {/* LIVE RACE — conditions (weather/radio), track, and car telemetry:
                everything describing what's happening right now, grouped under
                one label instead of an unlabelled stack of panels. */}
            <div style={{
              flexShrink: 0, margin: '8px 8px 0',
              background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <GroupLabel>LIVE RACE</GroupLabel>

              {(phase === 'racing' || phase === 'starting') && <WeatherStrip />}

              {/* HUD alert slot — 0px collapsed / 44px active */}
              {(phase === 'racing' || phase === 'starting') && <HudAlert />}

              {/* Neutral broadcast ticker — factual events, any car */}
              {(phase === 'racing' || phase === 'starting') && <CommentaryTicker />}

              {/* Track sub-section */}
              <div style={{
                margin: '8px 8px 0',
                background: 'var(--bg-panel)', border: '1px solid var(--line-hair)',
                borderRadius: 8, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '6px 10px 4px',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  color: 'var(--text-dim)', letterSpacing: '0.12em',
                  borderBottom: '1px solid var(--line-hair)',
                }}>
                  TRACK
                </div>
                <div style={{ height: 160, position: 'relative', background: 'var(--bg-deep)' }}>
                  <PitTimer />
                  <CanvasBoundary>
                    <TrackCanvas />
                  </CanvasBoundary>
                </div>
              </div>

              {/* Telemetry zone — 130px */}
              {(phase === 'racing' || phase === 'starting') && (
                <div style={{ margin: '6px 8px 8px' }}>
                  <TelemetryZone />
                </div>
              )}
            </div>

            {/* Safety car — spec section 6 surface 1, above the tower because
                its consequence (the field bunching) is read in the tower. */}
            {(phase === 'racing' || phase === 'starting') && <SafetyCarBanner />}

            {/* RACE LEADERBOARD — full field by default, NEARBY toggle for a
                tighter context window (label lives in TimingTower's own header) */}
            <div style={{
              flex: 1, overflow: 'hidden',
              margin: '8px 8px 0', minHeight: 0,
            }}>
              <TimingTower />
            </div>

            {/* RACE CONTROL — the player's actual levers over the race, kept
                at the bottom for thumb reach */}
            <div style={{
              background: 'var(--bg-panel)',
              borderTop: '1px solid var(--line-hair)',
              flexShrink: 0,
            }}>
              <GroupLabel>RACE CONTROL</GroupLabel>
              <div style={{
                padding: '8px 12px 10px',
                display: 'flex', gap: 8, alignItems: 'stretch',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <PaceModeToggle />
                </div>
                <PitButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PitPanel />

      <CoachMark
        id="timing_tower"
        title="READ THE TOWER"
        body="Every car, in order, with the gap to the one ahead. Your row is the teal one. Those gaps are the whole game — when one falls under a second, a move is on."
      />
      <CoachMark
        id="pace_modes"
        title="PACE COSTS TYRES"
        body="PUSH buys lap time and spends tyre life. SAVE does the opposite. There is no free setting — every second you gain now is a second you may give back when the rubber goes."
      />
      <CoachMark
        id="tyre_cliff"
        title="THE CLIFF IS COMING"
        body="Tyre pace falls away gently, then collapses. That gauge is counting down the laps until it does — once you are past it you lose far more than a pit stop costs."
      />
      <CoachMark
        id="projection"
        title="WHAT PITTING COSTS YOU"
        body="This is where you would rejoin if you boxed right now, traffic included. Compare it with where you are before you commit."
      />
    </div>
  )
}
