import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSeasonStore } from '@state/seasonStore'
import circuitsData from '@data/circuits.json'
import compoundsData from '@data/compounds.json'

type Compound = 'S' | 'M' | 'H' | 'I' | 'W'
type CompoundEntry = { name: string; type: string; colorToken: string }
const compounds = compoundsData as Record<string, CompoundEntry>
const circuit = (circuitsData as Record<string, { name: string; laps: number; rainProbability?: number; weatherBias?: string; characterNote?: string }>)['silverpark']!

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

export function RaceSetup() {
  const confirmRaceSetup = useSeasonStore(s => s.confirmRaceSetup)
  const [startCompound, setStartCompound] = useState<Compound>('M')
  const [pitLap, setPitLap] = useState(15)

  const rain = circuit.rainProbability ?? 0.1

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
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.2em' }}>
          PRE-RACE SETUP
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>
          Strategy Plan
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                ROUND 1 · CIRCUIT
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)' }}>
                {circuit.name.toUpperCase()}
              </div>
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
            PLANNED PIT STOP
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)' }}>
              Target lap
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent)',
            }}>
              LAP {pitLap}
            </div>
          </div>

          <input
            type="range"
            min={5}
            max={circuit.laps - 3}
            value={pitLap}
            onChange={e => setPitLap(Number(e.target.value))}
            style={{
              width: '100%', height: 4, borderRadius: 2,
              accentColor: 'var(--accent)',
              cursor: 'pointer',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP 5</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>LAP {circuit.laps - 3}</div>
          </div>

          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'var(--bg-panel)', border: '1px solid var(--line-hair)',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
            lineHeight: 1.5,
          }}>
            PLAN: {startCompound} → {startCompound === 'S' ? 'M' : startCompound === 'M' ? 'H' : 'M'} on lap {pitLap}
            <br />
            <span style={{ color: 'var(--text-mid)' }}>You can override this live during the race.</span>
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-hair)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={confirmRaceSetup}
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
