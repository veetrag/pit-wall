import { motion } from 'framer-motion'
import type { WeatherForecast } from '@engine/types'

const WEATHER_ICONS: Record<string, string> = {
  DRY: '☀️',
  DAMP: '🌦️',
  WET: '🌧️',
}

const WEATHER_COLORS: Record<string, string> = {
  DRY: 'var(--tyre-medium)',
  DAMP: 'var(--accent)',
  WET: 'var(--tyre-wet, #4DA6FF)',
}

interface WeatherStripProps {
  forecast: WeatherForecast
}

export function WeatherStrip({ forecast }: WeatherStripProps) {
  const cells = [
    { label: 'NOW', state: forecast.currentState, confidence: 1 },
    { label: '+1', state: forecast.lap1, confidence: 1 },
    { label: '+2', state: forecast.lap2, confidence: forecast.lap2Confidence },
  ]

  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'center',
      padding: '6px 12px', background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--line-hair)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginRight: 4 }}>
        WEATHER
      </div>
      {cells.map(cell => (
        <motion.div
          key={cell.label}
          layout
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'var(--bg-elevated)', borderRadius: 8, padding: '4px 10px',
            border: `1px solid ${WEATHER_COLORS[cell.state]}44`,
            opacity: cell.confidence,
          }}
        >
          <div style={{ fontSize: 14 }}>{WEATHER_ICONS[cell.state]}</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: WEATHER_COLORS[cell.state], letterSpacing: '0.05em',
          }}>
            {cell.label}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
