import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pill } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
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
// Literal hex, not CSS var() — these get alpha suffixes concatenated on
// (e.g. `${color}55`) for the glow/border below, which only works with a
// real hex string.
const WEATHER_COLOR: Record<WeatherState, string> = {
  DRY:  '#F2C94C',
  DAMP: '#39B54A',
  WET:  '#4DA6FF',
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
        // NOW gets a soft glow so the live reading feels active — the hazy
        // forecast cells (already faded via bgOpacity/iconSz) stay flat,
        // reinforcing "this one is real, those are a forecast."
        boxShadow: isNow ? `0 0 12px ${color}40` : 'none',
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

const DEFAULT_CONFIDENCE: [number, number, number, number, number] = [1.0, 1.0, 0.85, 0.65, 0.45]

/** NOW plus the next four laps, and the confidence for each -- shared by the strip and the chip. */
function useForecast(): { states: WeatherState[]; confidence: readonly number[] } | null {
  const raceState = useRaceStore(s => s.raceState)
  const config = useRaceStore(s => s.config)
  if (!raceState) return null

  const lap = raceState.lap
  const timeline = raceState.weatherTimeline
  const confidence = config?.tuning.weather.forecastConfidence ?? DEFAULT_CONFIDENCE

  const now:  WeatherState = timeline[lap]     ?? raceState.weatherState ?? 'DRY'
  const lap1: WeatherState = timeline[lap + 1] ?? now
  const lap2: WeatherState = timeline[lap + 2] ?? lap1
  const lap3: WeatherState = timeline[lap + 3] ?? lap2
  const lap4: WeatherState = timeline[lap + 4] ?? lap3
  return { states: [now, lap1, lap2, lap3, lap4], confidence }
}

/**
 * The collapsed forecast: "{icon} {NOW} · rain {p}% in {n}L", or "· dry ahead"
 * when none of the next four laps is damp or wet. {p} is that lap's forecast
 * confidence, the same number the full strip prints under its +2..+4 cells.
 *
 * Controlled when `expanded`/`onToggle` are passed (RaceHUD renders the full
 * strip below the track band); otherwise it keeps its own open state.
 */
export function WeatherChip({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void }) {
  const forecast = useForecast()
  const uiTap = useUiTap()
  const [ownOpen, setOwnOpen] = useState(false)
  if (!forecast) return null

  const open = expanded ?? ownOpen
  const { states, confidence } = forecast
  const now = states[0] ?? 'DRY'
  const n = states.findIndex((st, i) => i > 0 && st !== 'DRY')
  const ahead = n > 0
    ? `rain ${Math.round((confidence[n] ?? 1) * 100)}% in ${n}L`
    : 'dry ahead'

  return (
    <button
      type="button"
      className="kit-focus"
      aria-expanded={open}
      onClick={() => { uiTap(); if (onToggle) onToggle(); else setOwnOpen(o => !o) }}
      style={{ background: 'none', border: 'none', padding: 0, minHeight: 48, cursor: 'pointer', borderRadius: 999,
        display: 'inline-flex', alignItems: 'center' }}
    >
      <Pill tone={n > 0 ? 'caution' : 'default'}>
        <span aria-hidden="true">{WEATHER_ICON[now]}</span> {WEATHER_LABEL[now]} · {ahead}
      </Pill>
    </button>
  )
}

export function WeatherStrip() {
  const forecast = useForecast()
  if (!forecast) return null

  const { states, confidence } = forecast
  const now = states[0] ?? 'DRY'
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
