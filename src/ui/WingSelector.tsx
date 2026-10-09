import { motion } from 'framer-motion'
import { useUiTap } from '@hooks/useUiTap'
import { useSettingsStore } from '@state/settingsStore'
import { loadGameData } from '@data/validators'
import { WINGS, expectedBestWing, expectedLapDelta, wingD, type Wing } from '@engine/setup'
import type { CircuitSpec, TuningConstants } from '@engine/types'

const GAME_DATA = loadGameData()

const CHARACTER = ['Power track · S1 weighted', 'Aero track · S2 weighted', 'Technical track · S3 weighted'] as const

/** Circuit character from the sector the car weighs most (first wins a tie). */
function circuitCharacter(circuit: CircuitSpec): string {
  const s = circuit.carSensitivity
  const top = s[1] > s[0] && s[1] >= s[2] ? 1 : s[2] > s[0] && s[2] > s[1] ? 2 : 0
  return CHARACTER[top]
}

/**
 * One-line consequence of a wing level at this circuit: expected lap time
 * against the best level, straight-line speed direction, and the wet-weather
 * swing. Arrows and signs, never colour alone.
 */
export function wingTradeLine(circuit: CircuitSpec, tuning: TuningConstants, wing: Wing): string {
  const best = expectedBestWing(circuit, tuning, circuit.rainProbability ?? 0)
  const vsBest = expectedLapDelta(circuit, tuning, wing, 0) - expectedLapDelta(circuit, tuning, best, 0)
  const d = wingD(wing)
  const straights = d < 0 ? '▲' : d > 0 ? '▼' : '—'
  const rain = -3 * d * tuning.setup.wetGain * tuning.setup.wetSeverity.WET // + = slower when wet
  const sign = (x: number) => (x >= 0 ? '+' : '−')
  return `${sign(vsBest)}${Math.abs(vsBest).toFixed(2)} s/lap vs best · Straights ${straights} · Rain ${sign(rain)}${Math.abs(rain).toFixed(1)} s`
}

export function WingSelector({ circuitId, value, onChange }: {
  circuitId: string; value: Wing; onChange: (w: Wing) => void
}) {
  const uiTap = useUiTap()
  const reducedMotion = useSettingsStore(s => s.reducedMotion)
  const circuit = GAME_DATA.circuits[circuitId]
  if (!circuit) return null
  const tuning = GAME_DATA.tuning
  const best = expectedBestWing(circuit, tuning, circuit.rainProbability ?? 0)
  const line = wingTradeLine(circuit, tuning, value)
  const vsBest = expectedLapDelta(circuit, tuning, value, 0) - expectedLapDelta(circuit, tuning, best, 0)
  const split = line.indexOf(' s/lap')
  const head = line.slice(0, split)
  const rest = line.slice(split)

  return (
    <div>
      <div role="radiogroup" aria-label="Wing level" style={{ display: 'flex', gap: 6 }}>
        {WINGS.map(w => {
          const selected = w === value
          return (
            <motion.button
              key={w}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Wing ${w} of 5${w === best ? ', best for this circuit' : ''}`}
              whileTap={{ scale: 0.96 }}
              onClick={() => { uiTap(); onChange(w) }}
              style={{
                flex: 1, minHeight: 56, padding: '6px 0 8px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--bg-panel)',
                border: selected ? '1.5px solid var(--accent)' : '1px solid var(--line-hair)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
              }}
            >
              <div style={{
                width: 14, height: 10 + (w - 1) * 6, borderRadius: 3,
                background: selected ? 'var(--accent)' : 'var(--bg-panel)',
                border: selected ? '1px solid var(--accent)' : '1px solid var(--line-hair)',
                transition: reducedMotion ? 'none' : 'background 0.15s',
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontVariantNumeric: 'tabular-nums', color: selected ? 'var(--text-hi)' : 'var(--text-mid)' }}>
                {w}
              </span>
              <span aria-hidden="true" style={{
                width: 4, height: 4, borderRadius: '50%',
                background: w === best ? 'var(--accent)' : 'transparent',
              }} />
            </motion.button>
          )
        })}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
        {circuitCharacter(circuit)}
      </div>
      <motion.div
        key={line}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.15 }}
        aria-live="polite"
        style={{
          marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
          fontVariantNumeric: 'tabular-nums', color: 'var(--text-mid)',
        }}
      >
        <span style={vsBest > 0.005 ? { color: 'var(--negative)' } : undefined}>{head}</span>{rest}
      </motion.div>
    </div>
  )
}
