import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { SafetyCarBanner } from '@ui/SafetyCarBanner'
import { LapChart } from '@ui/LapChart'
import { processCommentaryTick, makeCommentaryState } from '@state/commentaryMapper'
import { useSafetyCarDeployCount, useSafetyCarOnlyDeployCount } from '@hooks/useSafetyCar'
import { renderHook } from '@testing-library/react'
import { cautionWashAlpha, cautionWashColor, RED_WASH_ALPHA, SC_WASH_ALPHA } from '@canvas/cautionWash'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import radioPools from '@data/radio.json'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { SafetyCarState, RaceConfig, RaceState, CarState, CircuitSpec, CompoundSpec, IncidentEvent, WeatherState } from '@engine/types'

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
function state(c: CarState, incidents: IncidentEvent[], safetyCar: SafetyCarState | null): RaceState {
  return {
    lap: 5, sector: 0, totalLaps: 30, cars: [c], sectorResults: [], overtakeEvents: [],
    safetyCar,
    incidents, trackEvolutionLaps: 5, rngState: 1,
    weatherTimeline: Array(30).fill('DRY') as WeatherState[], weatherState: 'DRY',
  }
}


const warning = vi.fn()
vi.mock('@hooks/useHaptics', async (orig) => ({
  ...(await orig<typeof import('@hooks/useHaptics')>()),
  useHaptics: () => ({ impact: vi.fn(), success: vi.fn(), warning }),
}))

const RED: SafetyCarState = { deployedLap: 7, lapsRemaining: 0, cause: 'crash', kind: 'red' }
const ev = (kind: IncidentEvent['kind']): IncidentEvent => ({ lap: 7, sector: 1, kind, driverId: null, timeLoss: null })

beforeEach(() => {
  warning.mockClear()
  useRaceStore.setState({ raceState: null })
  useSettingsStore.setState({ reducedMotion: true, hapticsEnabled: true })
})

describe('the banner', () => {
  it('SAYS RED FLAG on a hot band, with no lap countdown, and buzzes once', () => {
    render(<SafetyCarBanner />)
    act(() => { useRaceStore.setState({ raceState: state(car({}), [ev('crash'), ev('red_flag')], RED) }) })
    expect(screen.getByText('RED FLAG')).toBeTruthy()
    expect(screen.queryByText(/LAPS?$/)).toBeNull()
    expect(screen.getByTestId('safety-car-status').textContent).toMatch(/Red flag/)
    expect(screen.getByTestId('neutralisation-banner').getAttribute('data-kind')).toBe('red')
    expect(warning).toHaveBeenCalledTimes(1)
  })
  it('a VSC and an SC still read as themselves (exhaustive switch)', () => {
    render(<SafetyCarBanner />)
    act(() => { useRaceStore.setState({ raceState: state(car({}), [ev('safety_car_deployed')], { ...RED, kind: 'sc', lapsRemaining: 2 }) }) })
    expect(screen.getByText('⚠ SAFETY CAR')).toBeTruthy()
    act(() => { useRaceStore.setState({ raceState: state(car({}), [ev('vsc_deployed')], { ...RED, kind: 'vsc', lapsRemaining: 2 }) }) })
    expect(screen.getByText('VIRTUAL SAFETY CAR')).toBeTruthy()
  })
})

describe('the deploy counts', () => {
  it('the tower count includes red flags; the coach-mark count is SC/VSC only', () => {
    useRaceStore.setState({ raceState: state(car({}), [ev('safety_car_deployed'), ev('vsc_deployed'), ev('red_flag')], RED) })
    expect(renderHook(() => useSafetyCarDeployCount()).result.current).toBe(3)
    expect(renderHook(() => useSafetyCarOnlyDeployCount()).result.current).toBe(2)
  })
})

describe('the wash', () => {
  it('a red flag washes hot, stronger than the SC, through the stoppage card', () => {
    expect(RED_WASH_ALPHA).toBeGreaterThan(SC_WASH_ALPHA)
    expect(cautionWashAlpha(RED, 'racing')).toBe(RED_WASH_ALPHA)
    expect(cautionWashAlpha(RED, 'red_flag')).toBe(RED_WASH_ALPHA)
    expect(cautionWashColor(RED)).toBe(0xFF4F84)
    expect(cautionWashColor({ ...RED, kind: 'sc' })).toBe(0xFFB020)
    expect(cautionWashColor(null)).toBe(0xFFB020)
  })
})

describe('the lap chart', () => {
  it('draws the red-flag lap as a hot band, distinct from SC and VSC', () => {
    const cars = ['a', 'b'].map((id, i) => ({
      driverId: id, teamId: 't1', isPlayer: i === 0, positions: [i + 1, i + 1, i + 1], pitLaps: [], retiredLap: null, finish: i + 1,
    }))
    const history = { totalLaps: 3, lapsRun: 3, cars, neutralisations: [{ kind: 'red', startLap: 2, endLap: 2 }, { kind: 'sc', startLap: 1, endLap: 1 }] } as unknown as Parameters<typeof LapChart>[0]['history']
    const { container } = render(<LapChart history={history} playerDriverId="a" />)
    const red = container.querySelector('[data-neutralisation="red"]')
    expect(red).not.toBeNull()
    expect(red!.getAttribute('data-fill')).toBe('var(--hot)')
    expect(container.querySelector('[data-neutralisation="sc"]')!.getAttribute('data-fill')).toBe('var(--caution)')
  })
})

let clock = 0
describe('the radio', () => {
  beforeEach(() => { vi.useFakeTimers(); clock += 1_000_000; vi.setSystemTime(clock) })
  afterEach(() => { vi.useRealTimers() })

  it('the engineer calls the red flag, once', () => {
    const push = vi.fn()
    const s = state(car({}), [ev('crash'), ev('red_flag')], RED)
    const next = processRadioTick(s, config, makeRadioState(), push)
    expect(push).toHaveBeenCalledTimes(1)
    expect(radioPools.red_flag).toContain(String(push.mock.calls[0]?.[0]))
    expect(next.prevRedFlags).toBe(1)
    clock += 10_000; vi.setSystemTime(clock)
    processRadioTick(s, config, next, push)
    expect(push).toHaveBeenCalledTimes(1)
  })
  it('a red flag is not mistaken for a VSC: no vsc_box call', () => {
    const push = vi.fn()
    const c = car({ strategy: { teamId: 't1', startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] } })
    processRadioTick(state(c, [ev('vsc_deployed')], RED), config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
  })
})

describe('the commentary', () => {
  it('announces no pit lines on a restart tick (planned stops consumed, not made)', () => {
    const cfg = { ...config, drivers: config.drivers }
    const before = state(car({ pitsDone: 0 }), [ev('red_flag')], RED)
    const prev = { ...makeCommentaryState(before), started: true }
    const after = state(car({ pitsDone: 1 }), [ev('red_flag'), ev('red_flag_restart')], null)
    const { lines } = processCommentaryTick(after, cfg, prev)
    expect(lines.some(l => /pit/i.test(l) && !/red flag/i.test(l))).toBe(false)
    // Control: the same pitsDone bump WITHOUT a restart does announce.
    const plain = processCommentaryTick(state(car({ pitsDone: 1 }), [], null), cfg, { ...makeCommentaryState(state(car({ pitsDone: 0 }), [], null)), started: true })
    expect(plain.lines.length).toBeGreaterThan(0)
  })
})
