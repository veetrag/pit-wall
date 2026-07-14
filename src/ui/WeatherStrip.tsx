import { motion } from 'framer-motion'
import { useRaceStore } from '@state/raceStore'
import type { WeatherState } from '@engine/types'

const WEATHER_ICON: Record<WeatherState, string> = {
  DRY:  '☀',
  DAMP: '⛅',
  WET:  '🌧',
}
const WEATHER_LABEL: Record<WeatherState, string> = {
  DRY:  'DRY',
  DAMP: 'DAMP',
  WET:  'WET',
}
const WEATHER_COLOR: Record<WeatherState, string> = {
  DRY:  'var(--tyre-medium)',
  DAMP: 'var(--tyre-inter, #39B54A)',
  WET:  'var(--tyre-wet, #4DA6FF)',
}

// Depth-of-forecast cues: only the border/background haze fades with distance —
// text stays legible all the way out so the +3/+4 cells aren't just decorative.
const CELL_BG_OPACITY = [1, 0.85, 0.65, 0.5, 0.4] as const
const CELL_ICON_SZ    = [24, 21, 18, 18, 17] as const

function WeatherCell({
  label, state, index, confidence, pulse,
}: {
  label: string
  state: WeatherState
  index: number
  confidence: number
  pulse?: boolean
}) {
  const color = WEATHER_COLOR[state]
  const bgOpacity = CELL_BG_OPACITY[index] ?? 0.4
  const iconSz = CELL_ICON_SZ[index] ?? 17
  const isNow = index === 0
  const dashed = index >= 2

  return (
    <motion.div
      animate={pulse ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
      transition={pulse ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: isNow ? '7px 6px' : '6px 4px',
        border: dashed
          ? `1px dashed rgba(90,102,140,${bgOpacity})`
          : `1.5px solid ${color}55`,
        borderRadius: 8,
        background: isNow ? `${color}12` : `rgba(27,34,56,${bgOpacity})`,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: iconSz, lineHeight: 1 }}>{WEATHER_ICON[state]}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: isNow ? 12 : 10, fontWeight: 700,
        color: isNow ? '#F2F5FF' : 'var(--text-mid)',
        letterSpacing: '0.06em', marginTop: 3,
      }}>
        {WEATHER_LABEL[state]}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9,
        color: 'var(--text-dim)', letterSpacing: '0.05em', marginTop: 1,
      }}>
        {label}{index >= 2 ? ` · ${Math.round(confidence * 100)}%` : ''}
      </span>
    </motion.div>
  )
}

export function WeatherStrip() {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)

  if (!raceState) return null

  const lap = raceState.lap
  const timeline = raceState.weatherTimeline
  const defaultConf: [number, number, number, number, number] = [1.0, 1.0, 0.85, 0.65, 0.45]
  const confidence = config?.tuning.weather.forecastConfidence ?? defaultConf

  const now:  WeatherState = timeline[lap]     ?? raceState.weatherState ?? 'DRY'
  const lap1: WeatherState = timeline[lap + 1] ?? now
  const lap2: WeatherState = timeline[lap + 2] ?? lap1
  const lap3: WeatherState = timeline[lap + 3] ?? lap2
  const lap4: WeatherState = timeline[lap + 4] ?? lap3

  const states: WeatherState[] = [now, lap1, lap2, lap3, lap4]
  const cellLabels = ['NOW', '+1', '+2', '+3', '+4']

  const wetIncoming  = now !== 'WET'  && states.slice(1).some(s => s === 'WET')
  const rainIncoming = now === 'DRY'  && states.slice(1).some(s => s !== 'DRY')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '7px 8px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--text-dim)', letterSpacing: '0.14em',
        }}>
          WEATHER
        </span>
        {(wetIncoming || rainIncoming) && (
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              color: wetIncoming ? 'var(--accent-warm)' : 'var(--tyre-inter, #39B54A)',
              letterSpacing: '0.06em',
            }}
          >
            {wetIncoming ? '⚠ WET INCOMING' : '⚠ RAIN INCOMING'}
          </motion.span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {states.map((state, i) => (
          <WeatherCell
            key={i}
            label={cellLabels[i]!}
            state={state}
            index={i}
            confidence={confidence[i] ?? 1.0}
            pulse={i > 0 && (wetIncoming || rainIncoming) && state !== now}
          />
        ))}
      </div>
    </div>
  )
}
