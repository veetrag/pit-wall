import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { towerV2, rejoinTrainSize } from '@state/towerV2'
import { TimingTower, trainBracketSegments } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { PitPanel } from '@ui/PitPanel'
import { act } from 'react'
import { initRace } from '@engine/race'
import { projectPitNow, projectPitState, type ProjectionResult } from '@engine/projection'
import { drsTrains } from '@engine/drs'
import type { RaceConfig, RaceState } from '@engine/types'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

function setup(enabled = true) {
  const base = makeConfig({}, 5, 'veloce')
  const config = { ...base, allDry: true as const, playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ drs: { enabled } }) }
  const s = initRace(config)
  const order = s.cars.map(c => c.driverId)
  const gaps = [0, 0.5, 1.2, 1.6, 2.7]               // cars 0-3 a train (each within 1.0 s); car 4 is 1.1 s back
  const cars = s.cars.map((c, i) => ({ ...c, lap: 6, raceTime: i < gaps.length ? gaps[i]! : 50 + 5 * i }))   // the rest spaced well apart: no second train
  const state = { ...s, lap: 6, sector: 0 as const, cars, weatherState: 'DRY' as const }
  return { config, state, order }
}

function mount(enabled: boolean) {
  const { config, state } = setup(enabled)
  useRaceStore.setState({ config, raceState: { ...state, cars: state.cars.map((c, i) => ({ ...c, position: i + 1 })) }, phase: 'racing' })
  render(<TimingTower />)
}

afterEach(cleanup)

describe('DRS on the tower (spec §3.4)', () => {
  it('derives open / neutralised and train membership for the NEXT sector', () => {
    const { config, state, order } = setup()            // the next sector raced is S1 (index 0), a DRS sector
    const rows = towerV2(config, state)
    expect(rows.get(order[0]!)!.drs).toBeNull()
    expect(rows.get(order[1]!)!.drs).toBe('open')
    expect(rows.get(order[2]!)!.drs, 'the car ahead has DRS too').toBe('neutralised')
    expect(rows.get(order[1]!)!.train).toEqual({ index: 0, size: 4, first: false, last: false })
    expect(rows.get(order[0]!)!.train!.first).toBe(true)
    expect(rows.get(order[3]!)!.train!.last).toBe(true)
    expect(rows.get(order[4]!)!.train).toBeNull()
    expect(rows.get(order[0]!)!.penaltySec).toBe(0)
  })

  it('carries no DRS or train facts while DRS is disabled (the shipped default)', () => {
    const { config, state } = setup(false)
    for (const row of towerV2(config, state).values()) {
      expect(row.drs).toBeNull()
      expect(row.train).toBeNull()
    }
  })

  it('renders a DRS pill and an accessible train label', () => {
    mount(true)
    expect(screen.getAllByText('DRS').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DRS ✕').length).toBeGreaterThan(0)
    expect(screen.getByText('TRAIN ×4')).toBeTruthy()
    // The player leads, so the train's head row is inside the tower's window.
    expect(screen.getAllByLabelText(/in a DRS train of 4/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByLabelText(/DRS open/i).length).toBeGreaterThan(0)
  })

  it('renders no pill, bracket or train label with DRS disabled', () => {
    mount(false)
    expect(screen.queryByText('DRS')).toBeNull()
    expect(screen.queryByText(/TRAIN ×/)).toBeNull()
    expect(screen.queryByLabelText(/DRS/i)).toBeNull()
    expect(document.querySelector('[data-train-bracket]')).toBeNull()
  })
})

describe('DRS-train bracket (spec §3.4)', () => {
  it('draws one continuous bracket spanning the train rows and their gaps', () => {
    mount(true)
    const bars = document.querySelectorAll('[data-train-bracket]')
    expect(bars.length).toBe(1)
  })

  it('segments a train into one run, split by a ghost row, sized from row heights', () => {
    const { config, state, order } = setup()
    const v2 = towerV2(config, state)
    const real = (id: string) => ({ type: 'real' as const, car: state.cars.find(c => c.driverId === id)! })
    const rows = order.slice(0, 6).map(real)
    // player (46) + three 36 rows + three 3 px gaps, from the 2 px list padding
    expect(trainBracketSegments(rows, v2)).toEqual([{ key: `train-${order[0]}`, top: 2, height: 46 + 3 * 36 + 3 * 3 }])
    const split = [rows[0]!, rows[1]!, { type: 'ghost' as const }, rows[2]!, rows[3]!]
    expect(trainBracketSegments(split, v2).map(s => s.key)).toEqual([`train-${order[0]}`, `train-${order[2]}`])
    expect(trainBracketSegments(rows, null)).toEqual([])
  })
})

describe('rejoin-in-train note (spec §3.4)', () => {
  const proj = (trainSize: number | null): ProjectionResult => ({
    rejoinPosition: 5, rejoinGap: 0.6, rejoinGapBehind: 1, driverAheadId: null, driverBehindId: null,
    lapsProjected: 4, netEstimatePosition: 5, netEstimateLap: 10, rejoinTrainSize: trainSize,
  })
  /** A packed field: every car 0.4 s apart, so the player rejoins into the pack. */
  function packed(enabled = true, spacing = 0.4) {
    const { config, state } = setup(enabled)
    return { config, state: { ...state, cars: state.cars.map((c, i) => ({ ...c, raceTime: i * spacing })) } }
  }
  const trainOfPlayer = (config: RaceConfig, s: RaceState) =>
    drsTrains(config, s).find(t => t.carIds.includes(config.playerDriverId))?.carIds.length ?? null

  it('matches drsTrains on the projected state', () => {
    let hits = 0
    for (const spacing of [0.4, 0.8, 3]) {
      const { config, state } = packed(true, spacing)
      for (const c of ['S', 'M', 'H'] as const) {
        for (const seed of [1, 7, 42]) {
          const result = projectPitNow(config, state, c, seed)
          const expected = trainOfPlayer(config, projectPitState(config, state, c, seed))
          expect(result.rejoinTrainSize).toBe(expected)
          expect(rejoinTrainSize(config, result)).toBe(expected)
          if (expected !== null) hits++
        }
      }
    }
    expect(hits, 'the fixture must exercise a real train rejoin').toBeGreaterThan(0)
  })

  it('is null when DRS is off or the rejoin is not in a train', () => {
    const off = packed(false)
    const r = projectPitNow(off.config, off.state, 'M', 42)
    expect(r.rejoinTrainSize).toBeNull()
    expect(rejoinTrainSize(off.config, r)).toBeNull()
    expect(rejoinTrainSize(off.config, proj(4)), 'DRS off overrides any stored size').toBeNull()
    const spread = packed(true, 30)
    const s = projectPitNow(spread.config, spread.state, 'M', 42)
    expect(trainOfPlayer(spread.config, projectPitState(spread.config, spread.state, 'M', 42))).toBeNull()
    expect(rejoinTrainSize(spread.config, s)).toBeNull()
  })

  it('shows the note in the pit panel only when DRS is on', () => {
    for (const enabled of [true, false]) {
      const { config, state } = setup(enabled)
      render(<PitPanel />)
      act(() => {
        useRaceStore.setState({ pitPanelOpen: true, config, raceState: state, projectionResult: proj(4), updateProjection: () => {} })
      })
      const note = screen.queryByText('Rejoins in a DRS train (×4)')
      if (enabled) expect(note).toBeTruthy()
      else expect(note).toBeNull()
      cleanup()
      useRaceStore.setState({ pitPanelOpen: false, projectionResult: null })
    }
  })

  it('shows no note when the projected rejoin is not in a train', () => {
    const { config, state } = setup(true)
    render(<PitPanel />)
    act(() => {
      useRaceStore.setState({ pitPanelOpen: true, config, raceState: state, projectionResult: proj(null), updateProjection: () => {} })
    })
    expect(screen.queryByTestId('rejoin-train-note')).toBeNull()
    useRaceStore.setState({ pitPanelOpen: false, projectionResult: null })
  })
})

describe('canvas DRS-train links (spec §3.4)', () => {
  it('links consecutive train cars, and nothing while DRS is off', async () => {
    const { trainLinkPairs } = await import('../../src/canvas/trainLinks')
    const on = setup(true)
    expect(trainLinkPairs(on.config, on.state)).toEqual([[on.order[0], on.order[1]], [on.order[1], on.order[2]], [on.order[2], on.order[3]]])
    const off = setup(false)
    expect(trainLinkPairs(off.config, off.state)).toEqual([])
  })
})

describe('COLD tag on the tower (2.1, spec §5.4)', () => {
  function coldSetup(on: boolean) {
    const base = makeConfig({}, 5, 'veloce')
    const config: RaceConfig = { ...base, allDry: true, playerDriverId: 'd_voss',
      tuning: makeDeterministicTuning(on ? { tyreTemp: { enabled: true } } : {}) }
    const s = initRace(config)
    const fresh = s.cars[2]!.driverId
    const cars = s.cars.map((c, i) => ({
      ...c, lap: 6, position: i + 1, raceTime: i * 3, tyreAge: c.driverId === fresh ? 0 : 5, pitsDone: c.driverId === fresh ? 1 : 0,
      compound: c.driverId === fresh ? 'H' as const : c.compound,
      ...(on ? { thermal: { temp: c.driverId === fresh ? 70 : 95, coldLaps: 0, grainLaps: 0, heatWear: 0 } } : {}),
    }))
    return { config, state: { ...s, lap: 6, sector: 0 as const, cars, weatherState: 'DRY' as const }, fresh }
  }

  it('flags only a running car on a fresh set below its window', () => {
    const { config, state, fresh } = coldSetup(true)
    const rows = towerV2(config, state)
    expect(rows.get(fresh)!.coldTyres).toBe(true)
    expect([...rows.entries()].filter(([, r]) => r.coldTyres).map(([id]) => id)).toEqual([fresh])
    // A used set that is cold is not "fresh and cold"; a retired car never carries a tag.
    const used = { ...state, cars: state.cars.map(c => c.driverId === fresh ? { ...c, tyreAge: 1 } : c) }
    expect(towerV2(config, used).get(fresh)!.coldTyres).toBe(false)
    const out = { ...state, cars: state.cars.map(c => c.driverId === fresh ? { ...c, retired: true } : c) }
    expect(towerV2(config, out).get(fresh)!.coldTyres).toBe(false)
  })

  it('is false for every row while tyre temperature is off', () => {
    const { config, state } = coldSetup(false)
    for (const row of towerV2(config, state).values()) expect(row.coldTyres).toBe(false)
  })

  it('renders COLD as a word and speaks it in the row label', () => {
    const { config, state } = coldSetup(true)
    useRaceStore.setState({ config, raceState: state, phase: 'racing' })
    render(<TimingTower />)
    expect(screen.getAllByText('COLD')).toHaveLength(1)
    expect(screen.getAllByLabelText(/cold tyres/i)).toHaveLength(1)
  })

  it('renders no COLD tag while off', () => {
    const { config, state } = coldSetup(false)
    useRaceStore.setState({ config, raceState: state, phase: 'racing' })
    render(<TimingTower />)
    expect(screen.queryByText('COLD')).toBeNull()
  })
})
