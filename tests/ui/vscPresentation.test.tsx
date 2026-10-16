import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { SafetyCarBanner } from '@ui/SafetyCarBanner'
import { PitPanel } from '@ui/PitPanel'
import { loadGameData } from '@data/validators'
import { makeTuning } from '../fixtures/tuning'
import type { IncidentEvent, RaceConfig, RaceState, SafetyCarState } from '@engine/types'

const warning = vi.fn()
vi.mock('@hooks/useHaptics', async (orig) => ({
  ...(await orig<typeof import('@hooks/useHaptics')>()),
  useHaptics: () => ({ impact: vi.fn(), success: vi.fn(), warning }),
}))

const ev = (kind: IncidentEvent['kind']): IncidentEvent => ({ lap: 3, sector: 0, kind, driverId: null, timeLoss: null })
const VSC: SafetyCarState = { deployedLap: 3, lapsRemaining: 2, cause: 'mechanical', kind: 'vsc' }

function setRace(safetyCar: SafetyCarState | null, incidents: IncidentEvent[]) {
  act(() => { useRaceStore.setState({ raceState: { safetyCar, incidents } as unknown as RaceState }) })
}

describe('SafetyCarBanner under a VSC', () => {
  beforeEach(() => {
    warning.mockClear()
    useRaceStore.setState({ raceState: null })
    useSettingsStore.setState({ reducedMotion: false, hapticsEnabled: true })
  })

  it('says VIRTUAL SAFETY CAR with a VSC chip and the countdown -- words, not just colour', () => {
    render(<SafetyCarBanner />)
    setRace(VSC, [ev('vsc_deployed')])
    expect(screen.getByText(/VIRTUAL SAFETY CAR/)).toBeTruthy()
    expect(screen.getByText('VSC')).toBeTruthy()
    expect(screen.getByText(/2 LAPS/)).toBeTruthy()
  })

  it('announces "Virtual safety car deployed" once, then the countdown', () => {
    render(<SafetyCarBanner />)
    setRace(VSC, [ev('vsc_deployed')])
    expect(screen.getByTestId('safety-car-status').textContent).toMatch(/^Virtual safety car deployed\. 2 laps remaining\.$/)
    setRace({ ...VSC, lapsRemaining: 1 }, [ev('vsc_deployed')])
    expect(screen.getByTestId('safety-car-status').textContent).toBe('Virtual safety car. 1 lap remaining.')
  })

  it('buzzes once per deployment, and again when an SC supersedes the VSC', () => {
    render(<SafetyCarBanner />)
    setRace(VSC, [ev('vsc_deployed')])
    setRace({ ...VSC, lapsRemaining: 1 }, [ev('vsc_deployed')])
    expect(warning).toHaveBeenCalledTimes(1)
    setRace({ ...VSC, kind: 'sc', lapsRemaining: 4 }, [ev('vsc_deployed'), ev('vsc_ended'), ev('safety_car_deployed')])
    expect(warning).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/⚠ SAFETY CAR/)).toBeTruthy()
  })

  it('announces the green flag when the VSC ends', () => {
    render(<SafetyCarBanner />)
    setRace(VSC, [ev('vsc_deployed')])
    setRace(null, [ev('vsc_deployed'), ev('vsc_ended')])
    expect(screen.getByTestId('green-flag-status').textContent).toBe('Green flag. Racing resumes.')
  })
})

describe('PitPanel under a VSC', () => {
  const DATA = loadGameData()
  const circuit = DATA.circuits['veloce']!          // pitLaneTimeLoss 18.0
  const tuning = makeTuning({ incidents: { vsc: { laneLossFactor: 0.6 } } })
  const config = {
    circuit, tuning, compounds: DATA.compounds, drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: DATA.drivers.drivers[0]!.id, seed: 1,
  } as RaceConfig

  beforeEach(() => {
    useRaceStore.setState({ pitPanelOpen: false, raceState: null, config: null, projectionResult: null, updateProjection: () => {} })
  })

  it('states the VSC loss and labels the saving UNDER VSC', () => {
    render(<PitPanel />)
    act(() => {
      useRaceStore.setState({
        pitPanelOpen: true, config, projectionResult: null,
        raceState: { safetyCar: VSC, incidents: [], lap: 10, weatherTimeline: [], weatherState: 'DRY' } as unknown as RaceState,
      })
    })
    expect(screen.getByText(/PIT LOSS 10\.8s/)).toBeTruthy()
    expect(screen.getByText(/−7\.2s UNDER VSC/)).toBeTruthy()
    expect(screen.queryByText(/UNDER SAFETY CAR/)).toBeNull()
  })
})
