import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { TyreMeter } from '@ui/kit'
import { TelemetryZone, cliffStatus, thermalMeter } from '@ui/TelemetryZone'
import { PitPanel } from '@ui/PitPanel'
import { useRaceStore } from '@state/raceStore'
import { NEW_COACH_MARKS } from '@state/coachMarks'
import { initRace } from '@engine/race'
import { outLapCost } from '@engine/thermal'
import type { CarState, RaceConfig, RaceState, ThermalState } from '@engine/types'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

afterEach(cleanup)

const th = (temp: number, over: Partial<ThermalState> = {}): ThermalState =>
  ({ temp, coldLaps: 0, grainLaps: 0, heatWear: 0, ...over })

/** A dry bengaluru race with tyreTemp on (or off), the player's car patched. */
function race(on: boolean, patch: Partial<CarState> = {}): { config: RaceConfig; state: RaceState } {
  const base = makeConfig({}, 11, 'bengaluru')
  const config: RaceConfig = { ...base, allDry: true, playerDriverId: 'd_voss',
    tuning: makeDeterministicTuning(on ? { tyreTemp: { enabled: true } } : {}) }
  const s = initRace(config)
  const cars = s.cars.map(c => c.isPlayer ? { ...c, ...patch } : c)
  return { config, state: { ...s, lap: 8, weatherState: 'DRY', cars } }
}

describe('the tyre meter temperature band (spec §5.4)', () => {
  it('the meter states the zone in words, not only colour', () => {
    render(<TyreMeter compound="H" wear={0.2} lapsOnTyre={1} cliffLaps={20} thermal={{ zone: 'cold', pos: 0.1, grainLaps: 0 }} />)
    expect(screen.getByText('COLD')).toBeTruthy()
    expect(screen.getByRole('meter', { name: /tyre temperature/i }).getAttribute('aria-valuetext')).toBe('Cold')
  })

  it('in window and overheating read as words too', () => {
    render(<TyreMeter compound="M" wear={0.2} lapsOnTyre={6} cliffLaps={12} thermal={{ zone: 'window', pos: 0.5, grainLaps: 0 }} />)
    expect(screen.getByText('IN WINDOW')).toBeTruthy()
    cleanup()
    render(<TyreMeter compound="S" wear={0.2} lapsOnTyre={6} cliffLaps={12} thermal={{ zone: 'hot', pos: 0.9, grainLaps: 0 }} />)
    expect(screen.getByText('HOT')).toBeTruthy()
    expect(screen.getByRole('meter', { name: /tyre temperature/i }).getAttribute('aria-valuetext')).toBe('Overheating')
  })

  it('graining shows a countdown chip', () => {
    render(<TyreMeter compound="M" wear={0.3} lapsOnTyre={4} cliffLaps={9} thermal={{ zone: 'cold', pos: 0.05, grainLaps: 3 }} />)
    expect(screen.getByText('GRAINING 3L')).toBeTruthy()
  })

  it('without thermal the meter is unchanged (no temperature row)', () => {
    render(<TyreMeter compound="M" wear={0.3} lapsOnTyre={4} cliffLaps={9} />)
    expect(screen.queryByRole('meter', { name: /tyre temperature/i })).toBeNull()
    expect(screen.queryByText(/COLD|IN WINDOW|HOT|GRAINING/)).toBeNull()
  })

  it('never shows a temperature in degrees (ruling H5)', () => {
    render(<TyreMeter compound="H" wear={0.2} lapsOnTyre={1} cliffLaps={20} thermal={{ zone: 'hot', pos: 0.95, grainLaps: 2 }} />)
    expect(document.body.textContent).not.toMatch(/°|\bC\b/)
  })
})

describe('TelemetryZone reads the band from the engine (spec §5.4)', () => {
  it('maps the window onto the middle half of the bar, so the marker agrees with the label', () => {
    const { config, state } = race(true, { compound: 'H' })     // window H [92, 115]
    const at = (temp: number) => {
      const s = { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, thermal: th(temp) } : c) }
      return thermalMeter(s, config)!
    }
    expect(at(92)).toEqual({ zone: 'window', pos: 0.25, grainLaps: 0 })
    expect(at(115).pos).toBe(0.75)
    expect(at(91).zone).toBe('cold')
    expect(at(91).pos).toBeLessThan(0.25)
    expect(at(60).pos).toBe(0)
    expect(at(140).pos).toBe(1)
    expect(at(120).zone).toBe('hot')
  })

  it('is absent while tyre temperature is off', () => {
    const { config, state } = race(false)
    expect(thermalMeter(state, config)).toBeUndefined()
    act(() => { useRaceStore.setState({ config, raceState: state }) })
    render(<TelemetryZone />)
    expect(screen.queryByRole('meter', { name: /tyre temperature/i })).toBeNull()
    expect(screen.getByRole('meter', { name: /tyre wear/i })).toBeTruthy()
  })

  it('renders the band and the graining countdown for the player', () => {
    const { config, state } = race(true, { compound: 'M', thermal: th(60, { grainLaps: 2 }) })
    act(() => { useRaceStore.setState({ config, raceState: state }) })
    render(<TelemetryZone />)
    expect(screen.getByRole('meter', { name: /tyre temperature/i }).getAttribute('aria-valuetext')).toBe('Cold')
    expect(screen.getByText('GRAINING 2L')).toBeTruthy()
  })

  it('PER-LAP WEAR PROBES IGNORE ACCUMULATED HEAT (TelemetryZone CLIFF ~nL)', () => {
    const { config, state } = race(true, { compound: 'H', tyreAge: 6, paceMode: 'neutral', thermal: th(100) })
    const heated = { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, thermal: th(100, { heatWear: 3 }) } : c) }
    const cool = cliffStatus(state, config)!
    const hot = cliffStatus(heated, config)!
    expect(hot.wearRate).toBe(cool.wearRate)                  // the rate does not absorb the accumulated heat
    expect(hot.effAge).toBeCloseTo(cool.effAge + 3, 12)       // ...but the age does
    expect(hot.cliffIn).toBe(Math.max(0, Math.ceil((hot.spec!.cliff - hot.effAge) / cool.wearRate)))
  })
})

describe('pit panel out-lap price (spec §5.4)', () => {
  beforeEach(() => {
    useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null, updateProjection: () => {} })
  })

  function open(config: RaceConfig, state: RaceState) {
    render(<PitPanel />)
    act(() => { useRaceStore.setState({ pitPanelOpen: true, config, raceState: state, projectionResult: null }) })
  }

  it('prices each compound under its chip, and describes the chip with it', () => {
    const { config, state } = race(true, { compound: 'M', tyreAge: 14, thermal: th(95) })
    open(config, state)
    const player = state.cars.find(c => c.isPlayer)!
    const hard = outLapCost(config, player, 'H', 'DRY')
    expect(hard).toBeGreaterThan(0.05)
    const line = screen.getByText(`OUT-LAP +${hard.toFixed(2)}s`)
    const chip = screen.getByRole('radio', { name: /HARD/ })
    expect(chip.getAttribute('aria-describedby')).toBe(line.id)
    // A soft barely notices the blankets: under 0.05 s it is not worth a line.
    expect(outLapCost(config, player, 'S', 'DRY')).toBeLessThan(0.05)
    expect(screen.getByRole('radio', { name: /SOFT/ }).getAttribute('aria-describedby')).toBeNull()
  })

  it('no out-lap line while tyre temperature is off, or under a safety car (ruling H6)', () => {
    const off = race(false, { compound: 'M', tyreAge: 14 })
    open(off.config, off.state)
    expect(screen.queryByText(/OUT-LAP/)).toBeNull()
    cleanup()
    const on = race(true, { compound: 'M', tyreAge: 14, thermal: th(95) })
    open(on.config, { ...on.state, safetyCar: { deployedLap: 7, lapsRemaining: 3, cause: 'crash' } })
    expect(screen.queryByText(/OUT-LAP/)).toBeNull()
  })
})

describe('tyre_temp coach mark', () => {
  it('tyre_temp is a new coach mark', () => {
    expect(NEW_COACH_MARKS).toContain('tyre_temp')
  })
})
