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

function WeatherCell({
  label, state, dimmed, pulse,
}: {
  label: string
  state: WeatherState
  dimmed?: boolean
  pulse?: boolean
}) {
  const color = WEATHER_COLOR[state]
  return (
    <motion.div
      animate={pulse ? { opacity: [1, 0.5, 1] } : { opacity: dimmed ? 0.55 : 1 }}
      transition={pulse ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : {}}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '3px 6px',
        border: dimmed ? '1px dashed rgba(42,51,80,0.8)' : `1px solid ${color}30`,
        borderRadius: 6,
        background: dimmed ? 'transparent' : `${color}12`,
      }}
    >
      <span style={{ fontSize: 11 }}>{WEATHER_ICON[state]}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
        color: dimmed ? 'var(--text-dim)' : color,
        letterSpacing: '0.1em', marginTop: 1,
      }}>
        {WEATHER_LABEL[state]}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 7,
        color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: 1,
      }}>
        {label}
      </span>
    </motion.div>
  )
}

export function WeatherStrip() {
  const raceState = useRaceStore(s => s.raceState)

  if (!raceState) return null

  const lap = raceState.lap
  const timeline = raceState.weatherTimeline
  const now: WeatherState = timeline[lap] ?? raceState.weatherState ?? 'DRY'
  const lap1: WeatherState = timeline[lap + 1] ?? now
  const lap2: WeatherState = timeline[lap + 2] ?? lap1

  const wetIncoming = now !== 'WET' && (lap1 === 'WET' || lap2 === 'WET')
  const rainIncoming = now === 'DRY' && (lap1 !== 'DRY' || lap2 !== 'DRY')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 7,
        color: 'var(--text-dim)', letterSpacing: '0.12em',
        marginRight: 2, flexShrink: 0,
      }}>
        WX
      </span>
      <WeatherCell label="NOW" state={now} />
      <span style={{ color: 'var(--text-dim)', fontSize: 8, flexShrink: 0 }}>›</span>
      <WeatherCell label="+1" state={lap1} />
      <span style={{ color: 'var(--text-dim)', fontSize: 8, flexShrink: 0 }}>›</span>
      <WeatherCell label="+2" state={lap2} dimmed />
      {(wetIncoming || rainIncoming) && (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
            color: wetIncoming ? 'var(--accent-warm)' : 'var(--tyre-inter, #39B54A)',
            letterSpacing: '0.08em', marginLeft: 4, flexShrink: 0,
          }}
        >
          {wetIncoming ? '⚠ WET' : '⚠ RAIN'}
        </motion.span>
      )}
    </div>
  )
}
