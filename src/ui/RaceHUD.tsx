import { useEffect, useState } from 'react'
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
import { WeatherStrip, WeatherChip } from './WeatherStrip'
import { HudAlert } from './HudAlert'
import { CommentaryTicker } from './CommentaryTicker'
import { TelemetryZone } from './TelemetryZone'
import { TrackCanvas } from '@canvas/TrackCanvas'
import { StartLights } from './StartLights'
import { SettingsPanel } from './SettingsPanel'
import { PitTimer } from './PitTimer'
import { Component, type ReactNode } from 'react'
import { useUiTap } from '@hooks/useUiTap'
import { useReducedMotion, PRESS, ScreenFrame, HOLD_EXIT } from '@ui/kit'

class CanvasBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e: unknown) { return { error: String(e) } }
  componentDidCatch(e: unknown) { console.error('[CanvasBoundary]', e) }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 16, color: 'var(--hot)', fontFamily: 'var(--font-body)', fontSize: 11 }}>
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
  const uiTap = useUiTap()
  const reduced = useReducedMotion()

  if (phase !== 'racing') return null

  const options: { v: GameSpeed; label: string; aria?: string }[] = [
    { v: 0, label: 'II', aria: 'Pause' },
    { v: 1, label: '1×' },
    { v: 2, label: '2×' },
    { v: 4, label: '4×' },
  ]

  return (
    <div role="group" aria-label="Race speed" style={{ display: 'flex', gap: 2 }}>
      {options.map(({ v, label, aria }) => {
        const on = speed === v
        return (
          <motion.button
            key={v}
            type="button"
            aria-label={aria}
            aria-pressed={on}
            className="slant-sm kit-focus"
            whileTap={reduced ? undefined : { scale: 0.96 }} transition={PRESS}
            onClick={() => { uiTap(); setSpeed(v) }}
            style={{
              width: 48, height: 48, border: 'none', padding: 0, cursor: 'pointer',
              background: on ? 'var(--volt)' : 'var(--grape)',
              color: on ? 'var(--ink)' : 'var(--lilac)',
              fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 18,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {label}
          </motion.button>
        )
      })}
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
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8,
      padding: '8px 12px 10px',
      flexShrink: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
          color: 'var(--lilac-dim)', letterSpacing: 1, textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {config?.circuit.name ?? ''}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 900, fontStyle: 'italic',
          color: 'var(--white)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {/* Big Shoulders has no tabular figures (tnum is a no-op): a box sized
              to the total's digit count keeps "/58" from twitching each lap. */}
          L<span style={{ display: 'inline-block', minWidth: `${String(raceState.totalLaps).length * 0.55}em`, textAlign: 'right' }}>{raceState.lap + 1}</span><span style={{ color: 'var(--lilac-dim)' }}>/{raceState.totalLaps}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <SpeedControl />
        <SettingsPanel />
      </div>
    </div>
  )
}

/**
 * The track as a band: night background, bottom edge slanted. The weather chip
 * sits OUTSIDE the clipped layer (the slant would cut it off at the right
 * edge) and toggles the full forecast strip below the band.
 */
function TrackBand({ live }: { live: boolean }) {
  const [weatherOpen, setWeatherOpen] = useState(false)
  return (
    <>
      <div style={{ position: 'relative', height: 168, flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, background: 'var(--night)',
          clipPath: 'polygon(0 0,100% 0,100% 88%,0 100%)',
        }}>
          <PitTimer />
          <CanvasBoundary>
            <TrackCanvas />
          </CanvasBoundary>
        </div>
        {live && (
          <div style={{ position: 'absolute', right: 10, bottom: 22 }}>
            <WeatherChip expanded={weatherOpen} onToggle={() => setWeatherOpen(o => !o)} />
          </div>
        )}
      </div>
      {live && weatherOpen && <WeatherStrip />}
    </>
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
        background: 'var(--dusk)', border: '1px solid var(--volt)',
        borderRadius: 10, padding: '12px 28px', textAlign: 'center', zIndex: 50,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--lilac-dim)', letterSpacing: '0.1em' }}>
        RACE FINISHED
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--volt)', marginTop: 2 }}>
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
 * screen, so they are keyed to the lap instead: the tower as soon as the race
 * is running, because it is the first thing a new player has to read, and the
 * pace trade once the tyres have started to go off.
 *
 * `racePhase === 'racing'` IS LOAD-BEARING, and is not the same as seasonStore
 * being in its racing phase (which useCoachingActive already checks).
 *
 * Without it, both marks were requested during the 'starting' phase, while the
 * lights sequence was still running. CoachMark pauses by calling setSpeed(0)
 * -- and StartLights calls setSpeed(simSpeed) when the lights go out, which
 * happens AFTER. The pause was discarded and the card sat on screen while the
 * race ran away underneath it. Measured on a real phone: READ THE TOWER was
 * still up on LAP 18, tyres past the cliff, the race half-decided.
 *
 * Re-requesting on later laps is harmless and deliberate: coachStore refuses a
 * mark while another is active, so a request dropped at lap 2 is made again at
 * lap 3 rather than lost.
 */
function useTutorialMarks(): void {
  const coaching = useCoachingActive()
  const racePhase = useRaceStore(s => s.phase)
  const lap = useRaceStore(s => s.raceState?.lap ?? 0)
  const request = useCoachStore(s => s.request)
  useEffect(() => {
    if (!coaching || racePhase !== 'racing') return
    request('timing_tower')
    if (lap >= 2) request('pace_modes')
  }, [coaching, racePhase, lap, request])
}

export function RaceHUD() {
  const phase = useRaceStore(s => s.phase)
  useRetireCoachTutorial()
  useTutorialMarks()
  const live = phase === 'racing' || phase === 'starting'

  return (
    <ScreenFrame label="Race">
      <GameClock />

      <AnimatePresence initial={false}>
        {phase === 'idle' ? (
          <StartScreen key="start" />
        ) : (
          <motion.div
            key="race"
            initial={{ opacity: 0, zIndex: 1 }}
            animate={{ opacity: 1, zIndex: 1 }}
            exit={HOLD_EXIT}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', boxSizing: 'border-box', background: 'var(--ink)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
          >
            {phase === 'finished' && <FinishBanner />}
            {phase === 'starting' && <StartLights />}

            {/* Status bar: circuit · lap · speed controls */}
            <StatusBar />

            <TrackBand live={live} />

            {/* HUD alert slot — collapsed when there is nothing to say */}
            {live && <HudAlert />}

            {/* Neutral broadcast ticker — factual events, any car */}
            {live && <CommentaryTicker />}

            {/* Safety car — spec section 6 surface 1, above the tower because
                its consequence (the field bunching) is read in the tower. */}
            {live && <SafetyCarBanner />}

            <div style={{ flex: 1, overflow: 'hidden', margin: '8px 8px 0', minHeight: 0 }}>
              <TimingTower />
            </div>

            {live && (
              <div style={{ flexShrink: 0, margin: '6px 8px 0' }}>
                <TelemetryZone />
              </div>
            )}

            {/* The player's levers, at the bottom for thumb reach */}
            <div style={{
              padding: '8px 8px 10px', flexShrink: 0,
              display: 'flex', gap: 8, alignItems: 'stretch',
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

      <CoachMark
        id="timing_tower"
        title="READ THE TOWER"
        body="Every car, in order, with the gap to the one ahead. Your row is the yellow one. Those gaps are the whole game — when one falls under a second, a move is on."
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
    </ScreenFrame>
  )
}
