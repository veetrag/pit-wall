import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { PitPanel } from '@ui/PitPanel'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, SafetyCarState } from '@engine/types'

const DATA = loadGameData()
const circuit = DATA.circuits['veloce']!   // pitLaneTimeLoss 18.0
const tuning = makeTuning({})

const config = {
  circuit, tuning, compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
} as RaceConfig

function open(safetyCar: SafetyCarState | null) {
  act(() => {
    useRaceStore.setState({
      pitPanelOpen: true,
      config,
      projectionResult: null,
      raceState: { safetyCar, incidents: [], lap: 10, weatherTimeline: [], weatherState: 'DRY' } as unknown as RaceState,
    })
  })
}

describe('PitPanel safety-car discount', () => {
  beforeEach(() => {
    useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null, updateProjection: () => {} })
  })

  it('states the green-flag pit loss from the circuit', () => {
    render(<PitPanel />)
    open(null)
    expect(screen.getByText(/PIT LOSS/)).toBeTruthy()
    expect(screen.getByText(/18\.0s/), 'veloce pitLaneTimeLoss is 18.0').toBeTruthy()
    expect(screen.queryByText(/UNDER SAFETY CAR/), 'no discount line under green').toBeNull()
  })

  it('states the discounted loss AND the saving under a safety car', () => {
    /*
     * FAILS IF the panel keeps quoting the circuit's green-flag number while a
     * safety car is out -- which is the exact failure that makes the feature
     * unexploitable, since the player has no other way to learn the discount.
     * Both numbers are asserted: the loss that now applies, and the saving
     * against the green-flag figure, because only the saving explains WHY now.
     */
    render(<PitPanel />)
    open({ deployedLap: 9, lapsRemaining: 3, cause: 'crash' })
    const under = tuning.incidents.safetyCar.laneTimeLossUnderSc
    const saving = circuit.pitLaneTimeLoss - under
    expect(saving, 'the fixture must actually produce a discount').toBeGreaterThan(0)
    expect(screen.getByText(new RegExp(`${under.toFixed(1)}s`))).toBeTruthy()
    expect(screen.getByText(/UNDER SAFETY CAR/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`−${saving.toFixed(1)}s`))).toBeTruthy()
  })
})
