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

// opacity, icon size, label color for each cell index 0..4
const CELL_OPACITY   = [1, 0.9, 0.75, 0.60, 0.45] as const
const CELL_ICON_SZ   = [20, 18, 16, 15, 14] as const
const CELL_LABEL_CLR = [
  '#F2F5FF', '#F2F5FF', 'var(--text-mid)', 'var(--text-mid)', 'var(--text-dim)',
] as const

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
  const opacity = CELL_OPACITY[index] ?? 0.45
  const iconSz   = CELL_ICON_SZ[index] ?? 14
  const labelClr = CELL_LABEL_CLR[index] ?? 'var(--text-dim)'
  const dashed   = index >= 2

  return (
    <motion.div
      animate={pulse ? { opacity: [opacity, opacity * 0.5, opacity] } : { opacity }}
      transition={pulse ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '4px 5px',
        border: dashed
          ? `1px dashed rgba(42,51,80,${opacity})`
          : `1px solid ${color}40`,
        borderRadius: 6,
        background: '#1B2238',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: iconSz, lineHeight: 1 }}>{WEATHER_ICON[state]}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: index === 0 ? 9 : 8, fontWeight: 700,
        color: labelClr,
        letterSpacing: '0.08em', marginTop: 2,
      }}>
        {WEATHER_LABEL[state]}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 7,
        color: 'var(--text-dim)', letterSpacing: '0.06em', marginTop: 1,
      }}>
        {label}
      </span>
      {index >= 2 && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 7,
          color: 'var(--text-dim)', letterSpacing: '0.04em', marginTop: 1,
        }}>
          {Math.round(confidence * 100)}%
        </span>
      )}
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
      display: 'flex', alignItems: 'center', gap: 3,
      padding: '5px 8px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
      height: 72, flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 7,
        color: 'var(--text-dim)', letterSpacing: '0.12em',
        marginRight: 2, flexShrink: 0,
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
      }}>
        WX
      </span>
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
      {(wetIncoming || rainIncoming) && (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
            color: wetIncoming ? 'var(--accent-warm)' : 'var(--tyre-inter, #39B54A)',
            letterSpacing: '0.08em', marginLeft: 2, flexShrink: 0,
          }}
        >
          {wetIncoming ? '⚠ WET' : '⚠ RAIN'}
        </motion.span>
      )}
    </div>
  )
}
