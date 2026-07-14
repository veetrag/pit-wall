import { useState } from 'react'
import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useSeasonStore } from '@state/seasonStore'
import type { PlayerStrategyChoice } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
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

const DRY_COMPOUNDS: Compound[] = ['S', 'M', 'H']

const COMPOUND_COLORS: Record<string, string> = {
  S: 'var(--tyre-soft)',
  M: 'var(--tyre-medium)',
  H: 'var(--tyre-hard)',
  I: 'var(--tyre-inter, #39B54A)',
  W: 'var(--tyre-wet, #4DA6FF)',
}

function rainLabel(prob: number): string {
  if (prob >= 0.5) return 'HIGH CHANCE OF RAIN'
  if (prob >= 0.25) return 'POSSIBLE SHOWERS'
  return 'LIKELY DRY'
}

function rainColor(prob: number): string {
  if (prob >= 0.5) return 'var(--accent-warm)'
  if (prob >= 0.25) return 'var(--tyre-inter, #39B54A)'
  return 'var(--tyre-medium)'
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
  const defaultIdx = raceIndex % CIRCUIT_ORDER.length
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx)
  const circuitId = CIRCUIT_ORDER[selectedIdx] ?? CIRCUIT_ORDER[0]!
  const circuit = allCircuits[circuitId]!
  const roundNum = raceIndex + 1
  const [startCompound, setStartCompound] = useState<Compound>('M')
  const [stopCount, setStopCount] = useState<1 | 2>(1)
  const [pitLap1, setPitLap1] = useState(Math.round(circuit.laps * 0.45))
  const [pitCompound1, setPitCompound1] = useState<Compound>('H')
  const [pitLap2, setPitLap2] = useState(Math.round(circuit.laps * 0.7))
  const [pitCompound2, setPitCompound2] = useState<Compound>('M')

  const rain = circuit.rainProbability ?? 0.1

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
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {CIRCUIT_ORDER.map((cId, i) => {
              const c = allCircuits[cId]
              if (!c) return null
              const active = i === selectedIdx
              return (
                <motion.button
                  key={cId}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSelectedIdx(i)
                    setPitLap1(Math.round(c.laps * (stopCount === 2 ? 0.33 : 0.45)))
                    setPitLap2(Math.round(c.laps * 0.7))
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
            {/* Rain probability */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                WEATHER FORECAST
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                color: rainColor(rain), letterSpacing: '0.08em',
              }}>
                {rainLabel(rain)}
              </div>
            </div>
            <div style={{
              height: 4, borderRadius: 2,
              background: 'var(--line-hair)', overflow: 'hidden',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${rain * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                style={{ height: '100%', borderRadius: 2, background: rainColor(rain) }}
              />
            </div>

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
          <div style={{ display: 'flex', gap: 8 }}>
            {DRY_COMPOUNDS.map(c => {
              const spec = compounds[c]!
              const color = COMPOUND_COLORS[c] ?? 'var(--text-mid)'
              const selected = startCompound === c
              return (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setStartCompound(c)}
                  style={{
                    flex: 1, border: selected ? `1.5px solid ${color}` : '1px solid var(--line-hair)',
                    borderRadius: 10, padding: '12px 8px',
                    background: selected ? `${color}18` : 'var(--bg-panel)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    outline: 'none',
                    boxShadow: selected ? `0 0 16px ${color}30` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--bg-deep)',
                  }}>
                    {c}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: selected ? color : 'var(--text-mid)', letterSpacing: '0.06em' }}>
                    {spec.name.toUpperCase()}
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
