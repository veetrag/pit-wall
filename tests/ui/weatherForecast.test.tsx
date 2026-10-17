import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useRaceStore } from '@state/raceStore'
import { WeatherStrip, WeatherChip, forecastText } from '@ui/WeatherStrip'
import { forecast } from '@engine/forecast'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, WeatherState } from '@engine/types'

const DATA = loadGameData()
const config = {
  circuit: DATA.circuits['veloce']!, tuning: makeTuning({}), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams, strategies: DATA.strategies.defaults,
  playerDriverId: DATA.drivers.drivers[0]!.id, seed: 7,
} as RaceConfig

function state(tl: WeatherState[], lap = 10): RaceState {
  return { lap, sector: 0, totalLaps: tl.length, weatherTimeline: tl, weatherState: tl[lap] ?? 'DRY', cars: [], incidents: [], safetyCar: null } as unknown as RaceState
}
const tl = (changeAt: number, then: WeatherState, from: WeatherState = 'DRY') =>
  Array.from({ length: 40 }, (_, i): WeatherState => (i < changeAt ? from : then))

beforeEach(() => { useRaceStore.setState({ raceState: null, config: null }) })

describe('forecastText', () => {
  it('words the three cases, with an en dash and the chance on the strip only', () => {
    expect(forecastText({ kind: 'rain', fromLap: 6, toLap: 9, chance: 0.6 }, 'DRY'))
      .toEqual({ strip: 'RAIN IN 6–9 LAPS · 60%', chip: 'rain in 6–9L', worsening: true })
    expect(forecastText({ kind: 'drying', fromLap: 3, toLap: 5, chance: 0.8 }, 'WET'))
      .toEqual({ strip: 'DRYING IN 3–5 LAPS · 80%', chip: 'drying in 3–5L', worsening: false })
    expect(forecastText({ kind: 'steady' }, 'DRY')).toEqual({ strip: 'NO CHANGE EXPECTED', chip: 'dry ahead', worsening: false })
    expect(forecastText({ kind: 'steady' }, 'DAMP')).toEqual({ strip: 'NO CHANGE EXPECTED', chip: 'steady', worsening: false })
    expect(forecastText({ kind: 'rain', fromLap: 2, toLap: 2, chance: 0.85 }, 'DRY').strip).toBe('RAIN IN 2 LAPS · 85%')
    expect(forecastText({ kind: 'rain', fromLap: 1, toLap: 1, chance: 1 }, 'DRY').strip).toBe('RAIN NEXT LAP · 100%')
  })
})

describe('the strip and the chip read the forecast, never the timeline', () => {
  it('THE STRIP SHOWS THE FORECAST WINDOW, NOT THE TRUE LAP', () => {
    const s = state(tl(17, 'DAMP'))   // true change 7 laps ahead
    act(() => { useRaceStore.setState({ config, raceState: s }) })
    render(<WeatherStrip />)
    const f = forecast(s, config)
    expect(screen.getByText(forecastText(f, 'DRY').strip)).toBeTruthy()
    expect(screen.getByText('DRY')).toBeTruthy()   // the NOW cell stays truthful
    expect(screen.queryByText('+1')).toBeNull()    // the old lap-by-lap cells are gone
  })

  it('the chip keeps NOW truthful and reads the same forecast', () => {
    const s = state(tl(13, 'WET', 'DAMP'))
    act(() => { useRaceStore.setState({ config, raceState: s }) })
    render(<WeatherChip />)
    const text = screen.getByRole('button').textContent ?? ''
    expect(text).toContain('DAMP · ')
    expect(text).toContain(forecastText(forecast(s, config), 'DAMP').chip)
    expect(text).not.toMatch(/%/)
  })

  it('no change in the horizon reads NO CHANGE EXPECTED', () => {
    act(() => { useRaceStore.setState({ config, raceState: state(tl(99, 'WET')) }) })
    render(<WeatherStrip />)
    expect(screen.getByText('NO CHANGE EXPECTED')).toBeTruthy()
  })
})
