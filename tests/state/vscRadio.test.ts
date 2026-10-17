import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import radioPools from '@data/radio.json'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState, CarState, CircuitSpec, CompoundSpec, IncidentEvent, WeatherState } from '@engine/types'

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}
const COMPOUNDS: Record<string, CompoundSpec> = {
  M: { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.04, cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
}
const config: RaceConfig = {
  circuit: CIRCUIT, tuning: makeDeterministicTuning(), compounds: COMPOUNDS,
  drivers: [{ id: 'd1', name: 'D1', code: 'D1X', teamId: 't1', facets: { pace: 70, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 } }],
  teams: [{ id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000', facets: { power: 80, aero: 80, handling: 80, reliability: 99, pitCrew: 80 } }],
  strategies: [{ teamId: 't1', startCompound: 'M', plannedStops: [] }],
  playerDriverId: 'd1', seed: 1,
}
function car(overrides: Partial<CarState>): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 0, lap: 5, sector: 0, compound: 'M', tyreAge: 3,
    paceMode: 'neutral', pitted: false, pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: true, tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0,
    retired: false, retiredLap: null, retiredCause: null, ...overrides,
  }
}
const vscDeployed: IncidentEvent = { lap: 5, sector: 0, kind: 'vsc_deployed', driverId: null, timeLoss: null }
function state(c: CarState, incidents: IncidentEvent[]): RaceState {
  return {
    lap: 5, sector: 0, totalLaps: 30, cars: [c], sectorResults: [], overtakeEvents: [],
    safetyCar: incidents.length ? { deployedLap: 5, lapsRemaining: 2, cause: 'mechanical', kind: 'vsc' } : null,
    incidents, trackEvolutionLaps: 5, rngState: 1,
    weatherTimeline: Array(30).fill('DRY') as WeatherState[], weatherState: 'DRY',
  }
}

let clock = 0
describe('VSC radio', () => {
  beforeEach(() => { vi.useFakeTimers(); clock += 1_000_000; vi.setSystemTime(clock) })
  afterEach(() => { vi.useRealTimers() })

  it('calls the cheap stop when a VSC opens and the planned stop is near', () => {
    const push = vi.fn()
    const c = car({ strategy: { teamId: 't1', startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] } })
    const next = processRadioTick(state(c, [vscDeployed]), config, makeRadioState(), push)
    expect(push).toHaveBeenCalledTimes(1)
    expect(radioPools.vsc_box).toContain(String(push.mock.calls[0]?.[0] ?? ''))
    expect(next.prevVscCount).toBe(1)
  })

  // Pre-flight ruling P6: the line fires only when the player's planned stop is
  // near -- worn tyres alone do not trigger it.
  it('stays quiet on worn tyres when no stop is planned near', () => {
    const push = vi.fn()
    processRadioTick(state(car({ tyreAge: 12 }), [vscDeployed]), config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
  })

  it('stays quiet when the stop is far, and never repeats for the same VSC', () => {
    const push = vi.fn()
    const far = car({ strategy: { teamId: 't1', startCompound: 'M', plannedStops: [{ lap: 25, compound: 'H' }] } })
    const radio = processRadioTick(state(far, [vscDeployed]), config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
    const near = car({ strategy: { teamId: 't1', startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] } })
    processRadioTick(state(near, [vscDeployed]), config, radio, push)
    expect(push, 'the same VSC is not announced twice').not.toHaveBeenCalled()
  })

  // Final review fix 1: the radio reads the live neutralisation, not just the
  // incident log, so it never calls a cheap stop under a VSC that has ended.
  it('stays quiet when the VSC is no longer live', () => {
    const push = vi.fn()
    const near = car({ strategy: { teamId: 't1', startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] } })
    const ended = { ...state(near, [vscDeployed]), safetyCar: null }
    const next = processRadioTick(ended, config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
    expect(next.prevVscCount, 'the ended VSC is still counted, so it is never announced late').toBe(1)
  })
})
