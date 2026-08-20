import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import type { PlayerStrategyChoice } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { loadGameData } from '@data/validators'
import { generateWeatherTimeline, createRng, type WeatherState } from '@engine/index'
import circuitsJson from '@data/circuits.json'
import compoundsData from '@data/compounds.json'

type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
type CompoundEntry = { name: string; type: string; colorToken: string }
type CircuitEntry = {
  name: string; laps: number; flag?: string; location?: string;
  rainProbability?: number; weatherBias?: string; characterNote?: string;
  funFacts?: string[];
}
const compounds = (compoundsData as unknown as { compounds: Record<string, CompoundEntry> }).compounds
const allCircuits = (circuitsJson as unknown as { circuits: Record<string, CircuitEntry> }).circuits
const GAME_DATA = loadGameData()

const DRY_COMPOUNDS: Compound[] = ['S', 'M', 'H']
const START_COMPOUNDS: Compound[] = ['S', 'M', 'H', 'I', 'W']
const COMPOUND_SHORT_LABEL: Record<Compound, string> = { S: 'SOFT', M: 'MED', H: 'HARD', I: 'INTER', W: 'WET' }

const COMPOUND_COLORS: Record<string, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter, #39B54A)',
  W: 'var(--tyre-wet, #4DA6FF)',
}

// Literal hex, not CSS var() — WeatherStrip.tsx's shared convention, since
// these get alpha suffixes concatenated onto them for glow/wash below.
const WEATHER_ICON: Record<WeatherState, string> = { DRY: '☀', DAMP: '⛅', WET: '🌧' }
const WEATHER_COLOR: Record<WeatherState, string> = { DRY: '#F2C94C', DAMP: '#39B54A', WET: '#4DA6FF' }

function recommendedStartCompound(weather: WeatherState): Compound {
  if (weather === 'WET') return 'W'
  if (weather === 'DAMP') return 'I'
  return 'M'
}

// Real, seeded forecast for THIS specific attempt — not the circuit's base
// probability. Uses the exact same seed derivation initRace() uses
// (seed + 999999) so what's shown here is what the race actually opens with.
function computeStartWeather(circuitId: string, laps: number, seed: number): WeatherState[] {
  const spec = GAME_DATA.circuits[circuitId]
  if (!spec) return ['DRY']
  return generateWeatherTimeline(laps, spec, GAME_DATA.tuning, createRng(seed + 999999))
}

// Minimum laps required between two planned stops (and from a stop to the flag).
const MIN_STINT_GAP = 4

function CompoundChips({ value, onChange, size = 'sm' }: { value: Compound; onChange: (c: Compound) => void; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 28 : 20
  const fontSize = size === 'md' ? 12 : 10
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {DRY_COMPOUNDS.map(c => {
        const color = COMPOUND_COLORS[c] ?? 'var(--text-mid)'
        const selected = value === c
        return (
          <motion.button
            key={c}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(c)}
            style={{
              width: dim, height: dim, borderRadius: '50%',
              border: selected ? `1.5px solid ${color}` : '1px solid var(--line-hair)',
              background: selected ? color : 'var(--bg-panel)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize, fontWeight: 700,
              color: selected ? 'var(--bg-deep)' : 'var(--text-mid)',
              cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
            }}
          >
            {c}
          </motion.button>
        )
      })}
    </div>
  )
}

export function RaceSetup() {
  const confirmRaceSetup = useSeasonStore(s => s.confirmRaceSetup)
  const backToDriverSelect = useSeasonStore(s => s.backToDriverSelect)
  const uiTap = useUiTap()
  const raceIndex = useSeasonStore(s => s.raceIndex)
  const currentSeed = useSeasonStore(s => s.currentSeed)
  const defaultIdx = raceIndex % CIRCUIT_ORDER.length
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx)
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  // The circuit strip is a horizontal overflow scroller: at round 12 the active
  // chip sits off-screen right, so the player sees rounds 1-3 with nothing
  // apparently selected. Pull it into view on mount and on every round change.
  const chipStripRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const chip = chipStripRef.current?.querySelector(`[data-circuit-idx="${selectedIdx}"]`)
    chip?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [selectedIdx, reducedMotion])
  const circuitId = CIRCUIT_ORDER[selectedIdx] ?? CIRCUIT_ORDER[0]!
  const circuit = allCircuits[circuitId]!
  const roundNum = raceIndex + 1

  // The ACTUAL seeded forecast for this attempt — same seed initRace() will
  // use — not just the circuit's base rain probability. This is what fixes
  // "the race starts wet and we had no idea": the player now sees it here.
  const seed = currentSeed()
  const weatherTimeline = useMemo(
    () => computeStartWeather(circuitId, circuit.laps, seed),
    [circuitId, circuit.laps, seed],
  )
  const startingWeather = weatherTimeline[0] ?? 'DRY'

  const [startCompound, setStartCompound] = useState<Compound>(() => recommendedStartCompound(startingWeather))
  const [stopCount, setStopCount] = useState<1 | 2>(1)
  const [pitLap1, setPitLap1] = useState(Math.round(circuit.laps * 0.45))
  const [pitCompound1, setPitCompound1] = useState<Compound>('H')
  const [pitLap2, setPitLap2] = useState(Math.round(circuit.laps * 0.7))
  const [pitCompound2, setPitCompound2] = useState<Compound>('M')

  // Bounds: each stop needs room from the last (or the start) and from the flag.
  const maxLap1 = stopCount === 2
    ? circuit.laps - 3 - MIN_STINT_GAP
    : circuit.laps - 3
  const minLap2 = pitLap1 + MIN_STINT_GAP
  const maxLap2 = circuit.laps - 2

  function selectStopCount(n: 1 | 2) {
    setStopCount(n)
    if (n === 2) {
      const clampedLap1 = Math.min(pitLap1, circuit.laps - 3 - MIN_STINT_GAP)
      setPitLap1(clampedLap1)
      setPitLap2(prev => Math.max(clampedLap1 + MIN_STINT_GAP, Math.min(prev, circuit.laps - 2)))
    }
  }

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
      {/* Header */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--line-hair)',
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
            PRE-RACE SETUP
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
            Strategy Plan
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => { uiTap(); backToDriverSelect() }}
          style={{ flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line-hair)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', letterSpacing: '0.08em' }}>
          ← BACK
        </motion.button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Circuit selector */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 8 }}>SELECT CIRCUIT</div>
          <div ref={chipStripRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {CIRCUIT_ORDER.map((cId, i) => {
              const c = allCircuits[cId]
              if (!c) return null
              const active = i === selectedIdx
              return (
                <motion.button
                  key={cId}
                  data-circuit-idx={i}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSelectedIdx(i)
                    setPitLap1(Math.round(c.laps * (stopCount === 2 ? 0.33 : 0.45)))
                    setPitLap2(Math.round(c.laps * 0.7))
                    const newWeather = computeStartWeather(cId, c.laps, seed)[0] ?? 'DRY'
                    setStartCompound(recommendedStartCompound(newWeather))
                  }}
                  style={{
                    flexShrink: 0, border: 'none', borderRadius: 10, padding: '10px 14px',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    outline: active ? 'none' : '1px solid var(--line-hair)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}
                >
                  {c.flag && <span style={{ fontSize: 16 }}>{c.flag}</span>}
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: active ? 'var(--bg-deep)' : 'var(--text-mid)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {c.name.toUpperCase().slice(0, 8)}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Circuit Card */}
        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 14,
          border: '1px solid var(--line-hair)', overflow: 'hidden',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--bg-panel) 0%, var(--bg-elevated) 100%)',
            padding: '14px 16px',
            borderBottom: '1px solid var(--line-hair)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 4 }}>
                {`ROUND ${roundNum} · CIRCUIT`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {circuit.flag && <span style={{ fontSize: 22 }}>{circuit.flag}</span>}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)' }}>
                  {circuit.name.toUpperCase()}
                </div>
              </div>
              {circuit.location && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  {circuit.location}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                {circuit.laps}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                LAPS
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Actual seeded starting conditions — not just a probability */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                CONDITIONS AT LIGHTS OUT
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {weatherTimeline.slice(0, 4).map((w, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: i === 0 ? '7px 4px' : '6px 4px',
                    border: `1.5px solid ${WEATHER_COLOR[w]}${i === 0 ? '99' : '44'}`,
                    borderRadius: 8,
                    background: i === 0 ? `${WEATHER_COLOR[w]}18` : 'rgba(27,34,56,0.5)',
                    boxShadow: i === 0 ? `0 0 10px ${WEATHER_COLOR[w]}40` : 'none',
                  }}
                >
                  <span style={{ fontSize: i === 0 ? 18 : 14, lineHeight: 1 }}>{WEATHER_ICON[w]}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: i === 0 ? 11 : 9, fontWeight: 700,
                    color: i === 0 ? 'var(--text-hi)' : 'var(--text-mid)', marginTop: 3,
                  }}>
                    {w}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', marginTop: 1 }}>
                    {i === 0 ? 'LAP 1' : `+${i}`}
                  </span>
                </div>
              ))}
            </div>
            {startingWeather !== 'DRY' && (
              <div style={{
                marginTop: 2, padding: '7px 10px', borderRadius: 8,
                background: `${WEATHER_COLOR[startingWeather]}14`, border: `1px solid ${WEATHER_COLOR[startingWeather]}55`,
                fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-hi)', lineHeight: 1.4,
              }}>
                ⚠ Track is <strong>{startingWeather}</strong> at lights out — starting compound below has been set to {recommendedStartCompound(startingWeather)}.
              </div>
            )}

            {circuit.characterNote && (
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)',
                lineHeight: 1.4, marginTop: 4,
              }}>
                {circuit.characterNote}
              </div>
            )}
            {circuit.funFacts && circuit.funFacts.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {circuit.funFacts.map((fact, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--accent)',
                    display: 'flex', alignItems: 'flex-start', gap: 5,
                  }}>
                    <span style={{ opacity: 0.6, flexShrink: 0 }}>›</span>
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Starting Tyre */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line-hair)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
            STARTING COMPOUND
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {START_COMPOUNDS.map(c => {
              const color = COMPOUND_COLORS[c] ?? 'var(--text-mid)'
              const selected = startCompound === c
              const recommended = c === recommendedStartCompound(startingWeather)
              return (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setStartCompound(c)}
                  style={{
                    flex: 1, border: selected ? `1.5px solid ${color}` : recommended ? `1px dashed ${color}88` : '1px solid var(--line-hair)',
                    borderRadius: 10, padding: '10px 4px',
                    background: selected ? `${color}18` : 'var(--bg-panel)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    outline: 'none',
                    boxShadow: selected ? `0 0 16px ${color}30` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--bg-deep)',
                  }}>
                    {c}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 8.5, color: selected ? color : 'var(--text-mid)', letterSpacing: '0.02em', textAlign: 'center' }}>
                    {COMPOUND_SHORT_LABEL[c]}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Pit Stop Plan */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line-hair)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
              STRATEGY PLAN
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-panel)', borderRadius: 8, padding: 3 }}>
              {([1, 2] as const).map(n => (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => selectStopCount(n)}
                  style={{
                    border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                    background: stopCount === n ? 'var(--accent)' : 'transparent',
                    color: stopCount === n ? 'var(--bg-deep)' : 'var(--text-mid)',
                    fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  }}
                >
                  {n === 1 ? 'ONE STOP' : 'TWO STOP'}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Stop 1 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)' }}>
              Pit {stopCount === 2 ? '1' : ''} — fit
            </div>
            <CompoundChips value={pitCompound1} onChange={setPitCompound1} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>Target lap</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>LAP {pitLap1}</span>
          </div>
          <input
            type="range"
            min={5}
            max={maxLap1}
            value={pitLap1}
            onChange={e => {
              const v = Number(e.target.value)
              setPitLap1(v)
              if (stopCount === 2) setPitLap2(prev => Math.max(prev, v + MIN_STINT_GAP))
            }}
            style={{ width: '100%', height: 4, borderRadius: 2, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, marginBottom: stopCount === 2 ? 16 : 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP 5</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP {maxLap1}</div>
          </div>

          {/* Stop 2 */}
          {stopCount === 2 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-mid)' }}>
                  Pit 2 — fit
                </div>
                <CompoundChips value={pitCompound2} onChange={setPitCompound2} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>Target lap</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>LAP {pitLap2}</span>
              </div>
              <input
                type="range"
                min={minLap2}
                max={maxLap2}
                value={pitLap2}
                onChange={e => setPitLap2(Number(e.target.value))}
                style={{ width: '100%', height: 4, borderRadius: 2, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP {minLap2}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP {maxLap2}</div>
              </div>
            </>
          )}

          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'var(--bg-panel)', border: '1px solid var(--line-hair)',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
            lineHeight: 1.5,
          }}>
            PLAN: {startCompound} → {pitCompound1} on lap {pitLap1}
            {stopCount === 2 && <> → {pitCompound2} on lap {pitLap2}</>}
            <br />
            <span style={{ color: 'var(--text-mid)' }}>You can override this live during the race.</span>
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            uiTap()
            const plannedStops = stopCount === 2
              ? [{ lap: pitLap1, compound: pitCompound1 }, { lap: pitLap2, compound: pitCompound2 }]
              : [{ lap: pitLap1, compound: pitCompound1 }]
            const strategy: PlayerStrategyChoice = { startCompound, plannedStops }
            confirmRaceSetup(circuitId, strategy)
          }}
          style={{
            width: '100%', border: 'none', borderRadius: 10, padding: '16px',
            background: 'var(--accent)', color: 'var(--bg-deep)',
            fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer', outline: 'none',
          }}
        >
          LIGHTS OUT →
        </motion.button>
      </div>
    </motion.div>
  )
}
