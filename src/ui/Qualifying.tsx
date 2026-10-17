import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { isSprintRound } from '@state/sprint'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { loadGameData } from '@data/validators'
import { openingTimeline, type WeatherState } from '@engine/index'
import type { Compound, AttackLevel, QualifyingLap } from '@engine/index'
import { useUiTap } from '@hooks/useUiTap'
import { ScreenFrame, ScreenHeader, Pill, TyreChip, KitButton, StandingRow, TYRE_COLOR, TYRE_NAME, PRESS } from '@ui/kit'

const GAME_DATA = loadGameData()

const DRY_COMPOUNDS: Compound[] = ['S', 'M', 'H']
const WET_COMPOUNDS: Compound[] = ['I', 'W']
const ATTACK_ORDER: AttackLevel[] = ['conserve', 'balanced', 'attack']
const ATTACK_LABEL: Record<AttackLevel, string> = { conserve: 'SAFE', balanced: 'BAL', attack: 'ATTACK' }

// Same seed derivation used by RaceSetup's forecast strip -- this is the
// starting conditions the qualifying session itself will actually run under,
// not a generic probability, so the compound chips offered here match what
// the session needs.
/**
 * dryStart MUST be passed, or this screen contradicts the race.
 *
 * This was the FOURTH copy of the weather derivation. It still said
 * "TRACK WET - WETS ADVISED" on a real phone after RaceSetup had been fixed,
 * for a round-1 race that starts DRY. It now goes through openingTimeline
 * like everything else.
 */
export function computeQualifyingWeather(circuitId: string, laps: number, seed: number, dryStart: boolean): WeatherState {
  const spec = GAME_DATA.circuits[circuitId]
  if (!spec) return 'DRY'
  const timeline = openingTimeline({ laps, circuit: spec, tuning: GAME_DATA.tuning, seed, dryStart })
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
  // Round 1 opens dry -- see openingTimeline. Without this the screen says
  // "TRACK WET" for a race that starts DRY.
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const difficulty = useSettingsStore(s => s.difficulty)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const uiTap = useUiTap()

  const circuitId = currentCircuitId()
  const circuit = GAME_DATA.circuits[circuitId]
  const laps = circuit?.laps ?? 50
  const weather = useMemo(
    () => computeQualifyingWeather(circuitId, laps, currentSeed(), raceIndex === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circuitId, laps, raceIndex],
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
  const playerLap = laps_.find(l => l.driverId === activePlayerId)
  const aheadOnCompound = playerLap
    ? laps_.slice(0, Math.max(0, playerPosition - 1)).filter(l => l.compound === playerLap.compound).length
    : 0

  const hasResult = qualifyingResult !== null
  const playerRowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (hasResult) playerRowRef.current?.scrollIntoView?.({ block: 'center' })
  }, [hasResult])

  const motionLayoutProps = reducedMotion
    ? {}
    : { layout: true, 'data-animated': 'true' as const }

  const selCfg = q.attackLevels[attack]
  const colHead = { fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, color: 'var(--lilac-dim)' } as const
  const pickerBtn = { flex: 1, minWidth: 0, height: 48, border: 'none', cursor: 'pointer', padding: 0 } as const

  return (
    <ScreenFrame label="Qualifying">
      <ScreenHeader eyebrow={`QUALIFYING · ${(circuit?.name ?? circuitId).toUpperCase()}`} title="One flying lap" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* The conditions MUST be stated: the session cannot be re-run, so the tyre call has to be informed. */}
        <div data-testid="qualifying-conditions" style={{ alignSelf: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Pill tone={weather === 'DRY' ? 'default' : 'rain'}>
            {weather === 'DRY' ? 'TRACK DRY' : weather === 'DAMP' ? 'TRACK DAMP · WETS ADVISED' : 'TRACK WET · WETS ADVISED'}
          </Pill>
          {/* One session sets the grid for the sprint AND the Grand Prix. */}
          {isSprintRound(raceIndex) && <Pill tone="dusk">SPRINT WEEKEND</Pill>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={colHead}>TYRE</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {availableCompounds.map(c => {
                const selected = compound === c
                return (
                  <motion.button
                    key={c}
                    type="button"
                    className="slant-sm kit-focus"
                    aria-label={TYRE_NAME[c]}
                    aria-pressed={selected}
                                        whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                    transition={PRESS}
                    onClick={() => { uiTap(); setCompound(c) }}
                    style={{
                      ...pickerBtn,
                      background: selected ? 'var(--volt)' : 'var(--grape)',
                      color: selected ? 'var(--ink)' : 'var(--white)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <TyreChip compound={c} size={26} onInk={!selected} />
                  </motion.button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={colHead}>
              {`${ATTACK_LABEL[attack]} · ${formatDelta(selCfg.paceDelta)} · ${Math.round(selCfg.errorChance * 100)}% risk`}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {ATTACK_ORDER.map(level => {
                const active = attack === level
                const cfg = q.attackLevels[level]
                const fill = active ? (level === 'attack' ? 'var(--hot)' : 'var(--white)') : 'var(--grape)'
                return (
                  <motion.button
                    key={level}
                    type="button"
                    className="slant-sm kit-focus"
                    aria-pressed={active}
                                        whileTap={reducedMotion ? undefined : { scale: 0.96 }}
                    transition={PRESS}
                    onClick={() => { uiTap(); setAttack(level) }}
                    style={{
                      ...pickerBtn,
                      background: fill,
                      color: active ? 'var(--ink)' : level === 'conserve' ? 'var(--gain)' : 'var(--white)',
                      fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12,
                    }}
                  >
                    <div>{ATTACK_LABEL[level]}</div>
                    <div style={{ fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{`${Math.round(cfg.errorChance * 100)}%`}</div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>

        {!hasResult && (
          <div className="slant-lg" style={{
            background: 'var(--grape)', color: 'var(--lilac)', padding: '18px 24px',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15,
          }}>
            Pick a tyre and an attack level, then run your lap.
          </div>
        )}
        {!hasResult && (
          <div style={{ display: 'flex', gap: 8 }}>
            <KitButton variant="secondary" size="lg" display={false} onClick={handleSimulate} style={{ width: 120, padding: 0 }}>↺ SIMULATE</KitButton>
            <KitButton variant="primary" size="lg" onClick={handleRunLap} style={{ flex: 1 }}>RUN LAP</KitButton>
          </div>
        )}

        {playerLap && (
          <div className="slant-lg" style={{
            background: 'var(--volt)', color: 'var(--ink)', padding: '14px 24px',
            display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              {/* Big Shoulders has no tabular figures: an invisible 0:00.000 twin reserves the width so P{n} never moves. */}
              <span style={{
                position: 'relative', display: 'inline-block',
                fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 54, lineHeight: 0.9,
                fontVariantNumeric: 'tabular-nums',
              }}>
                <span aria-hidden="true" style={{ visibility: 'hidden' }}>0:00.000</span>
                <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' }}>{formatTime(playerLap.time)}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 40, lineHeight: 0.9 }}>
                {`P${playerPosition}`}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {`+${(playerLap.time - leaderTime).toFixed(3)} to pole · ${aheadOnCompound} ${aheadOnCompound === 1 ? 'car' : 'cars'} on ${TYRE_NAME[playerLap.compound]}s ahead of you`}
            </span>
            {playerLap.scrappy && (
              <span style={{
                alignSelf: 'flex-start', background: 'var(--ink)', color: 'var(--hot)', borderRadius: 999,
                padding: '4px 10px', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 12, letterSpacing: 1,
              }}>SCRAPPY LAP · ERROR ON THE LAP</span>
            )}
          </div>
        )}

        {hasResult && (
          <span role="status" data-testid="qualifying-status" style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--lilac-dim)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {`Qualified P${playerPosition}`}
          </span>
        )}

        {hasResult && (
          // flexShrink 0 is load-bearing: without it this flex child shrank and clipped the grid to 4 rows on device.
          <div aria-label="Grid" style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
            {laps_.map((lap: QualifyingLap, i: number) => {
              const isPlayer = lap.driverId === activePlayerId
              const driver = driverMap.get(lap.driverId)
              const teamColor = (driver ? teamColorMap.get(driver.teamId) : undefined) ?? 'var(--lilac-dim)'
              const gap = lap.time - leaderTime
              return (
                <motion.div
                  key={lap.driverId}
                  ref={isPlayer ? playerRowRef : undefined}
                  layoutId={lap.driverId}
                  {...motionLayoutProps}
                >
                  <StandingRow
                    pos={i + 1}
                    teamColor={teamColor}
                    mine={isPlayer}
                    name={
                      <span data-testid="qualifying-row">
                        {driver?.code ?? lap.driverId}
                        {lap.scrappy && !isPlayer && (
                          <span style={{
                            marginLeft: 6, background: 'var(--hot)', color: 'var(--ink)', borderRadius: 999,
                            padding: '1px 6px', fontWeight: 800, fontSize: 10, letterSpacing: 0.5,
                          }}>SCRAPPY</span>
                        )}
                      </span>
                    }
                    value={i === 0 ? formatTime(lap.time) : `+${gap.toFixed(3)}`}
                    trailing={
                      <span aria-label={TYRE_NAME[lap.compound]} style={{
                        fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 14,
                        color: isPlayer ? 'var(--ink)' : TYRE_COLOR[lap.compound],
                      }}>{lap.compound}</span>
                    }
                  />
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {hasResult && (
        <div style={{ padding: '8px 16px calc(16px + var(--safe-bottom, 0px))', display: 'flex', gap: 8, flexShrink: 0 }}>
          <KitButton variant="secondary" size="lg" display={false} onClick={handleSimulate} style={{ width: 120, padding: 0 }}>↺ SIMULATE</KitButton>
          <KitButton variant="primary" size="lg" onClick={handleToGrid} style={{ flex: 1 }}>TO THE GRID →</KitButton>
        </div>
      )}
    </ScreenFrame>
  )
}
