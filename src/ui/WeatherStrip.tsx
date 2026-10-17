import { useMemo, useState } from 'react'
import { Pill } from '@ui/kit'
import { useUiTap } from '@hooks/useUiTap'
import { useRaceStore } from '@state/raceStore'
import type { WeatherState } from '@engine/types'
import { forecast, type WeatherForecast } from '@engine/forecast'

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
  DRY:  '#CFC8F2', // lilac: dry is the neutral state
  DAMP: '#3DDC84', // = --tyre-inter
  WET:  '#4DA6FF', // = --tyre-wet
}

function WeatherCell({ label, state }: { label: string; state: WeatherState }) {
  const color = WEATHER_COLOR[state]
  return (
    <div
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '7px 6px',
        border: `1.5px solid ${color}55`,
        borderRadius: 8,
        background: `${color}12`,
        // NOW gets a soft glow so the live reading feels active.
        boxShadow: `0 0 12px ${color}40`,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{WEATHER_ICON[state]}</span>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
        color: 'var(--white)', letterSpacing: '0.06em', marginTop: 3,
      }}>
        {WEATHER_LABEL[state]}
      </span>
      <span style={{
        fontFamily: 'var(--font-body)', fontSize: 9,
        color: 'var(--lilac-dim)', letterSpacing: '0.05em', marginTop: 1,
      }}>
        {label}
      </span>
    </div>
  )
}

/**
 * The forecast for the current race moment (spec 1.6 §3). Narrow selectors:
 * the timeline array and the seed are stable for a race, so this recomputes
 * once per lap, not once per sector.
 */
function useForecast(): { now: WeatherState; f: WeatherForecast } | null {
  const lap = useRaceStore(s => s.raceState?.lap)
  const now = useRaceStore(s => s.raceState?.weatherState)
  const timeline = useRaceStore(s => s.raceState?.weatherTimeline)
  const totalLaps = useRaceStore(s => s.raceState?.totalLaps)
  const config = useRaceStore(s => s.config)
  return useMemo(() => {
    if (lap === undefined || now === undefined || !timeline || !config) return null
    const state = { lap, weatherState: now, weatherTimeline: timeline, totalLaps: totalLaps ?? timeline.length }
    return { now, f: forecast(state, config) }
  }, [lap, now, timeline, totalLaps, config])
}

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)

/** Words for the forecast: the strip carries the chance, the chip never prints a percentage (ruling R10). */
export function forecastText(f: WeatherForecast, now: WeatherState): { strip: string; chip: string; worsening: boolean } {
  switch (f.kind) {
    case 'steady':
      return { strip: 'NO CHANGE EXPECTED', chip: now === 'DRY' ? 'dry ahead' : 'steady', worsening: false }
    case 'rain':
    case 'drying': {
      const word = f.kind === 'rain' ? 'RAIN' : 'DRYING'
      const when = f.fromLap === 1 && f.toLap === 1 ? 'NEXT LAP' : `IN ${range(f.fromLap, f.toLap)} LAP${f.toLap === 1 ? '' : 'S'}`
      return {
        strip: `${word} ${when} · ${Math.round(f.chance * 100)}%`,
        chip: `${f.kind} in ${range(f.fromLap, f.toLap)}L`,
        worsening: f.kind === 'rain',
      }
    }
    default: { const never: never = f; return never }
  }
}

/**
 * The collapsed forecast: "{icon} {NOW} · {outlook}" (see forecastText).
 *
 * Controlled when `expanded`/`onToggle` are passed (RaceHUD renders the full
 * strip below the track band); otherwise it keeps its own open state.
 */
export function WeatherChip({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void }) {
  const fc = useForecast()
  const uiTap = useUiTap()
  const [ownOpen, setOwnOpen] = useState(false)
  if (!fc) return null

  const open = expanded ?? ownOpen
  const text = forecastText(fc.f, fc.now)

  return (
    <button
      type="button"
      className="kit-focus"
      aria-expanded={open}
      onClick={() => { uiTap(); if (onToggle) onToggle(); else setOwnOpen(o => !o) }}
      style={{ background: 'none', border: 'none', padding: 0, minHeight: 48, cursor: 'pointer', borderRadius: 999,
        display: 'inline-flex', alignItems: 'center' }}
    >
      <Pill tone={text.worsening ? 'rain' : 'default'}>
        <span aria-hidden="true">{WEATHER_ICON[fc.now]}</span> {WEATHER_LABEL[fc.now]} · {text.chip}
      </Pill>
    </button>
  )
}

export function WeatherStrip() {
  const fc = useForecast()
  if (!fc) return null
  const text = forecastText(fc.f, fc.now)
  const urgent = fc.f.kind === 'rain'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      padding: '7px 8px',
      background: 'var(--grape)',
      borderBottom: '1px solid var(--line-hair)',
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--lilac-dim)', letterSpacing: '0.14em' }}>
        WEATHER
      </span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 30%', display: 'flex' }}>
          <WeatherCell label="NOW" state={fc.now} />
        </div>
        {/* The forecast: one honest line, never a lap-by-lap read of the true timeline. */}
        <div role="status" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
          border: `1px dashed ${urgent ? 'var(--tyre-wet)' : 'var(--dusk)'}`, padding: '6px 8px',
          fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', fontSize: 15,
          color: urgent ? 'var(--white)' : 'var(--lilac)', letterSpacing: 0.5, textAlign: 'center',
        }}>
          {text.strip}
        </div>
      </div>
    </div>
  )
}
