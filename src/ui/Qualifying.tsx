import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { loadGameData } from '@data/validators'
import { generateWeatherTimeline, createRng, type WeatherState } from '@engine/index'
import type { Compound, AttackLevel, QualifyingLap } from '@engine/index'
import { useUiTap } from '@hooks/useUiTap'

const GAME_DATA = loadGameData()

const DRY_COMPOUNDS: Compound[] = ['S', 'M', 'H']
const WET_COMPOUNDS: Compound[] = ['I', 'W']
const COMPOUND_LABEL: Record<Compound, string> = { S: 'SOFT', M: 'MED', H: 'HARD', I: 'INTER', W: 'WET' }
const COMPOUND_COLORS: Record<Compound, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter, #39B54A)',
  W: 'var(--tyre-wet, #4DA6FF)',
}

const ATTACK_ORDER: AttackLevel[] = ['conserve', 'balanced', 'attack']
const ATTACK_LABEL: Record<AttackLevel, string> = { conserve: 'CONSERVE', balanced: 'BALANCED', attack: 'ATTACK' }

// Same seed derivation used by RaceSetup's forecast strip -- this is the
// starting conditions the qualifying session itself will actually run under,
// not a generic probability, so the compound chips offered here match what
// the session needs.
function computeQualifyingWeather(circuitId: string, laps: number, seed: number): WeatherState {
  const spec = GAME_DATA.circuits[circuitId]
  if (!spec) return 'DRY'
  const timeline = generateWeatherTimeline(laps, spec, GAME_DATA.tuning, createRng(seed + 999999))
  return timeline[0] ?? 'DRY'
}

function formatDelta(v: number): string {
  return v > 0 ? `+${v.toFixed(2)}s` : `${v.toFixed(2)}s`
}

function formatTime(t: number): string {
  const mins = Math.floor(t / 60)
  const secs = (t % 60).toFixed(3).padStart(6, '0')
  return `${mins}:${secs}`
}

export function Qualifying() {
  const qualifyingResult = useSeasonStore(s => s.qualifyingResult)
  const playerDriverId = useSeasonStore(s => s.playerDriverId)
  const runQualifyingSession = useSeasonStore(s => s.runQualifyingSession)
  const startRaceFromQualifying = useSeasonStore(s => s.startRaceFromQualifying)
  const currentSeed = useSeasonStore(s => s.currentSeed)
  const currentCircuitId = useSeasonStore(s => s.currentCircuitId)
  const difficulty = useSettingsStore(s => s.difficulty)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const uiTap = useUiTap()

  const circuitId = currentCircuitId()
  const circuit = GAME_DATA.circuits[circuitId]
  const laps = circuit?.laps ?? 50
  const weather = useMemo(
    () => computeQualifyingWeather(circuitId, laps, currentSeed()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circuitId, laps],
  )

  const availableCompounds = weather === 'DRY' ? DRY_COMPOUNDS : [...DRY_COMPOUNDS, ...WET_COMPOUNDS]

  const [compound, setCompound] = useState<Compound>('M')
  const [attack, setAttack] = useState<AttackLevel>('balanced')

  const q = GAME_DATA.tuning.qualifying

  function handleRunLap() {
    uiTap()
    runQualifyingSession({ compound, attack }, difficulty)
  }

  function handleSimulate() {
    uiTap()
    runQualifyingSession({ compound: 'M', attack: 'balanced' }, difficulty)
  }

  function handleToGrid() {
    uiTap()
    startRaceFromQualifying()
  }

  const laps_ = qualifyingResult?.laps ?? []
  const order = qualifyingResult?.order ?? []
  const activePlayerId = playerDriverId
  const playerPosition = activePlayerId ? order.indexOf(activePlayerId) + 1 : 0
  const driverMap = new Map(GAME_DATA.drivers.drivers.map(d => [d.id, d]))
  const teamColorMap = new Map(GAME_DATA.cars.teams.map(t => [t.id, t.colorPrimary]))
  const leaderTime = laps_[0]?.time ?? 0

  const motionLayoutProps = reducedMotion
    ? {}
    : { layout: true, 'data-animated': 'true' as const }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-deep)',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--line-hair)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          QUALIFYING
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          One Flying Lap
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Compound chips */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line-hair)' }}>
          {/*
            The conditions MUST be stated, not implied.
            Before this, `weather` only gated which chips existed -- the player
            was never told it was wet. Found on device: a dry tyre picked in a
            wet session qualified P20, and because the session derives from the
            race seed it cannot be re-run. A decision that is irreversible by
            design has to be an informed one.
          */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
              COMPOUND
            </span>
            <span
              data-testid="qualifying-conditions"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em',
                color: weather === 'DRY' ? 'var(--text-mid)' : 'var(--accent-warm)',
              }}
            >
              {weather === 'DRY' ? 'TRACK DRY' : weather === 'DAMP' ? 'TRACK DAMP · WETS ADVISED' : 'TRACK WET · WETS ADVISED'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {availableCompounds.map(c => {
              const color = COMPOUND_COLORS[c]
              const selected = compound === c
              return (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => { uiTap(); setCompound(c) }}
                  style={{
                    flex: 1, border: selected ? `1.5px solid ${color}` : '1px solid var(--line-hair)',
                    borderRadius: 10, padding: '10px 4px',
                    background: selected
                      ? `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0)), ${color}`
                      : 'var(--bg-panel)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--bg-deep)',
                  }}>
                    {c}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 8.5,
                    color: selected ? 'var(--bg-deep)' : 'var(--text-mid)',
                    letterSpacing: '0.02em', fontWeight: selected ? 700 : 400,
                  }}>
                    {COMPOUND_LABEL[c]}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Attack level chips -- same selected-state language as PaceModeToggle */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line-hair)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
            ATTACK LEVEL
          </div>
          <div style={{
            display: 'flex', gap: 6,
            background: 'var(--bg-panel)', borderRadius: 8,
            padding: 6, border: '1px solid var(--line-hair)',
          }}>
            {ATTACK_ORDER.map(level => {
              const active = attack === level
              const cfg = q.attackLevels[level]
              const color = level === 'attack' ? 'var(--accent-warm)' : level === 'conserve' ? 'var(--positive)' : 'var(--text-mid)'
              return (
                <motion.button
                  key={level}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { uiTap(); setAttack(level) }}
                  role="button"
                  aria-pressed={active}
                  style={{
                    flex: 1, border: 'none', borderRadius: 6, padding: '8px 6px',
                    cursor: 'pointer',
                    background: active ? color : 'transparent',
                    outline: active ? 'none' : '1px solid var(--line-hair)',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
                    color: active ? 'var(--bg-deep)' : color,
                    letterSpacing: '0.08em',
                  }}>
                    {ATTACK_LABEL[level]}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: active ? 'rgba(0,0,0,0.6)' : 'var(--text-dim)',
                    marginTop: 2, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {`${formatDelta(cfg.paceDelta)} · ${Math.round(cfg.errorChance * 100)}% risk`}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Run / Simulate */}
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleRunLap}
            style={{
              flex: 2, border: 'none', borderRadius: 10, padding: '14px 10px',
              background: 'var(--accent)', color: 'var(--bg-deep)', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
            }}
          >
            RUN LAP
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleSimulate}
            style={{
              flex: 1, border: '1px solid var(--line-hair)', borderRadius: 10, padding: '14px 10px',
              background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
            }}
          >
            SIMULATE
          </motion.button>
        </div>

        {/* Result */}
        {qualifyingResult && (
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: 10,
            border: '1px solid var(--line-hair)', overflow: 'hidden',
            // flexShrink 0 is load-bearing, not cosmetic. This box is a child
            // of a flex column, so by default it SHRINKS to fit the space
            // left over -- and with overflow hidden that silently clipped the
            // list to the first four rows. On device the player could not see
            // their own row unless they qualified in the top four, which is
            // precisely when they least need to look. The parent already
            // scrolls; this lets the box claim its natural height so there is
            // something to scroll to.
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 10px 5px', borderBottom: '1px solid var(--line-hair)',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                color: 'var(--accent)', letterSpacing: '0.14em',
              }}>
                QUALIFYING RESULT
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {laps_.map((lap: QualifyingLap, i: number) => {
                const isPlayer = lap.driverId === activePlayerId
                const driver = driverMap.get(lap.driverId)
                const teamColor = driver ? teamColorMap.get(driver.teamId) : undefined
                const gap = lap.time - leaderTime
                return (
                  <motion.div
                    key={lap.driverId}
                    data-testid="qualifying-row"
                    layoutId={lap.driverId}
                    {...motionLayoutProps}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 1fr 60px 60px',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 10px',
                      background: isPlayer ? 'rgba(var(--accent-rgb), 0.07)' : 'transparent',
                      borderLeft: isPlayer ? '2px solid var(--accent)' : `2px solid ${teamColor ? teamColor + '44' : 'transparent'}`,
                      borderBottom: '0.5px solid var(--line-hair)',
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {i + 1}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                      color: isPlayer ? 'var(--accent)' : 'var(--text-hi)', letterSpacing: '0.04em',
                      display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isPlayer ? 'var(--accent)' : (teamColor ?? 'var(--text-dim)'),
                      }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {driver?.code ?? lap.driverId}
                      </span>
                      {lap.scrappy && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700,
                          color: 'var(--accent-warm)', letterSpacing: '0.06em',
                          border: '1px solid var(--accent-warm)', borderRadius: 4,
                          padding: '1px 4px', flexShrink: 0,
                        }}>
                          SCRAPPY
                        </span>
                      )}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: COMPOUND_COLORS[lap.compound],
                      fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                    }}>
                      {lap.compound}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-hi)',
                      fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                    }}>
                      {i === 0 ? formatTime(lap.time) : `+${gap.toFixed(3)}`}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        <span role="status" data-testid="qualifying-status" style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)',
          letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums',
        }}>
          {qualifyingResult ? `Qualified P${playerPosition}` : ''}
        </span>

        {qualifyingResult && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleToGrid}
            style={{
              border: 'none', borderRadius: 10, padding: '14px 10px',
              background: 'var(--accent)', color: 'var(--bg-deep)', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
            }}
          >
            TO THE GRID →
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
