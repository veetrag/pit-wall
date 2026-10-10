import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import type { RaceConfig, RaceState, CarState, SectorResult, DriverSpec, TeamSpec, CircuitSpec, CompoundSpec, TuningConstants } from '@engine/types'
import radioPools from '@data/radio.json'
import { makeDeterministicTuning } from '../fixtures/tuning'

const TUNING: TuningConstants = makeDeterministicTuning()

const CIRCUIT: CircuitSpec = {
  name: 'Test', laps: 30, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}
const COMPOUNDS: Record<string, CompoundSpec> = {
  I: { name: 'Intermediate', type: 'wet', offset: 1.0, lin: 0.03, cliff: 30, pen: 0.05, colorToken: '--tyre-inter' },
  M: { name: 'Medium', type: 'dry', offset: 0.0, lin: 0.04, cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
}
const DRIVER: DriverSpec = {
  id: 'd1', name: 'D1', code: 'D1X', teamId: 't1',
  facets: { pace: 70, racecraft: 80, tyreManagement: 80, consistency: 90, wetWeather: 80, experience: 80 },
}
const TEAM: TeamSpec = {
  id: 't1', name: 'Team', colorPrimary: '#fff', colorSecondary: '#000',
  facets: { power: 80, aero: 80, handling: 80, reliability: 99, pitCrew: 80 },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [DRIVER], teams: [TEAM],
    strategies: [{ teamId: 't1', startCompound: 'M', plannedStops: [] }],
    playerDriverId: 'd1', seed: 1,
  }
}

function makeCar(overrides: Partial<CarState> = {}): CarState {
  return {
    driverId: 'd1', teamId: 't1', position: 1, raceTime: 0, lap: 5,
    sector: 0, compound: 'M', tyreAge: 3, paceMode: 'neutral', pitted: false,
    pitsDone: 0, strategy: { teamId: 't1', startCompound: 'M', plannedStops: [] },
    isPlayer: true,
    tyreAllocation: { S: 4, M: 4, H: 4, I: 3, W: 3 }, compoundsUsed: ['M'], lapsInDirtyAir: 0, retired: false, retiredLap: null, retiredCause: null,
    ...overrides,
  }
}

function makeSpinResult(overrides: Partial<SectorResult> = {}): SectorResult {
  return { driverId: 'd1', sectorTime: 30, tyreContribution: 0, trafficPenalty: 0, noiseSample: 0, spinLoss: 0, ...overrides }
}

function makeState(overrides: Partial<RaceState> = {}): RaceState {
  return {
    lap: 5, sector: 0, totalLaps: 30, cars: [makeCar()], sectorResults: [],
    overtakeEvents: [],
    safetyCar: null,
    incidents: [], trackEvolutionLaps: 5, rngState: 1,
    weatherTimeline: Array(30).fill('WET'), weatherState: 'WET',
    ...overrides,
  }
}

let fakeClock = 0

describe('processRadioTick — wet spin alert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // radioMapper's pit-radio cooldown is tracked in module-level state shared
    // across tests in this file — advance the clock far past any prior test's
    // window instead of resetting to 0, or leftover cooldown state suppresses
    // the very first push of the next test.
    fakeClock += 1_000_000
    vi.setSystemTime(fakeClock)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires wet_spin exactly when a new spin appears in sectorResults', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
    expect(pushAlert.mock.calls[0]![1]).toBe('urgent')
  })

  it('a spin on wet tyres on a dry track uses the dry_spin pool, never a slicks line', () => {
    const pushAlert = vi.fn()
    const state = makeState({
      weatherState: 'DRY',
      cars: [makeCar({ compound: 'I' })],
      sectorResults: [makeSpinResult({ spinLoss: 3 })],
    })
    processRadioTick(state, makeConfig(), makeRadioState(), pushAlert)
    const text = String(pushAlert.mock.calls[0]?.[0] ?? '')
    expect(radioPools.dry_spin).toContain(text)
    expect(text).not.toMatch(/slicks/i)
  })

  it('a spin on slicks in the wet still uses the wet_spin pool', () => {
    const pushAlert = vi.fn()
    const state = makeState({ weatherState: 'WET', sectorResults: [makeSpinResult({ spinLoss: 3 })] })
    processRadioTick(state, makeConfig(), makeRadioState(), pushAlert)
    expect(radioPools.wet_spin).toContain(String(pushAlert.mock.calls[0]?.[0] ?? ''))
  })

  it('does not fire when there is no spin this tick', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ sectorResults: [makeSpinResult({ spinLoss: 0 })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).not.toHaveBeenCalled()
  })

  it('does not re-fire for the same spin on the next tick (radio state advances)', () => {
    const pushAlert = vi.fn()
    let radio = makeRadioState()
    const spunState = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    radio = processRadioTick(spunState, makeConfig(), radio, pushAlert)
    vi.setSystemTime(fakeClock + 10_000) // clear the cooldown window
    // same sectorResults array — no NEW spin since prevSpinCount already caught up
    processRadioTick(spunState, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
  })

  it('fires again on a second, later spin', () => {
    const pushAlert = vi.fn()
    let radio = makeRadioState()
    const firstSpin = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 })] })
    radio = processRadioTick(firstSpin, makeConfig(), radio, pushAlert)
    vi.setSystemTime(fakeClock + 10_000)
    const secondSpin = makeState({ sectorResults: [makeSpinResult({ spinLoss: 4.2 }), makeSpinResult({ spinLoss: 3.0 })] })
    processRadioTick(secondSpin, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(2)
  })
})

describe('processRadioTick — retirement cause routing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeClock += 1_000_000
    vi.setSystemTime(fakeClock)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // radio.json's 'retired_mechanical' pool is looked up by string key via an
  // `as Record<string, string[]>` cast, so a typo in the trigger name would
  // silently resolve to no line at all rather than a type error. This
  // exercises that lookup end-to-end for a mechanical retirement.
  it('resolves a mechanical retirement to a non-null line from retired_mechanical', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ cars: [makeCar({ retired: true, retiredCause: 'mechanical' })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
    const [message, severity] = pushAlert.mock.calls[0]!
    expect(typeof message).toBe('string')
    expect((message as string).length).toBeGreaterThan(0)
    expect(severity).toBe('urgent')
  })

  it('resolves a tyre retirement to a non-null line from retired', () => {
    const pushAlert = vi.fn()
    const radio = makeRadioState()
    const state = makeState({ cars: [makeCar({ retired: true, retiredCause: 'tyre' })] })
    processRadioTick(state, makeConfig(), radio, pushAlert)
    expect(pushAlert).toHaveBeenCalledTimes(1)
    const [message] = pushAlert.mock.calls[0]!
    expect(typeof message).toBe('string')
    expect((message as string).length).toBeGreaterThan(0)
  })
})
