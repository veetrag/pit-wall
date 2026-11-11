import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { towerV2, rejoinTrainSize } from '@state/towerV2'
import { TimingTower } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { PitPanel } from '@ui/PitPanel'
import { act } from 'react'
import { initRace } from '@engine/race'
import type { ProjectionResult } from '@engine/projection'
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

describe('rejoin-in-train note (spec §3.4)', () => {
  const proj = (aheadId: string | null, gap: number): ProjectionResult => ({
    rejoinPosition: 5, rejoinGap: gap, rejoinGapBehind: 1, driverAheadId: aheadId, driverBehindId: null,
    lapsProjected: 4, netEstimatePosition: 5, netEstimateLap: 10,
  })

  it('names the train size including the player when rejoining close behind a train car', () => {
    const { config, state, order } = setup()
    expect(order[0], 'the player leads this fixture').toBe('d_voss')
    // Without the player, cars 1-3 still form a train of 3; the player rejoining makes 4.
    expect(rejoinTrainSize(config, state, proj(order[3]!, 0.6))).toBe(4)
  })

  it('is null when the gap is beyond detection, the car ahead is free, or DRS is off', () => {
    const { config, state, order } = setup()
    expect(rejoinTrainSize(config, state, proj(order[3]!, 1.5))).toBeNull()
    expect(rejoinTrainSize(config, state, proj(null, 0.3))).toBeNull()
    const off = setup(false)
    expect(rejoinTrainSize(off.config, off.state, proj(order[3]!, 0.3))).toBeNull()
  })

  it('shows the note in the pit panel only when DRS is on', () => {
    for (const enabled of [true, false]) {
      const { config, state, order } = setup(enabled)
      render(<PitPanel />)
      act(() => {
        useRaceStore.setState({ pitPanelOpen: true, config, raceState: state, projectionResult: proj(order[3]!, 0.6), updateProjection: () => {} })
      })
      const note = screen.queryByText('Rejoins in a DRS train (×4)')
      if (enabled) expect(note).toBeTruthy()
      else expect(note).toBeNull()
      cleanup()
      useRaceStore.setState({ pitPanelOpen: false, projectionResult: null })
    }
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
