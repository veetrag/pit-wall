import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processRadioTick, makeRadioState } from '@state/radioMapper'
import { initRace } from '@engine/index'
import type { RaceConfig, RaceState } from '@engine/types'
import type { Wing } from '@engine/setup'
import { loadGameData } from '@data/validators'
import radioData from '@data/radio.json'

const DATA = loadGameData()
const LINES = (radioData as Record<string, string[]>)['low_wing_wet']!

function configWith(setups?: Record<string, Wing>): RaceConfig {
  return {
    circuit: DATA.circuits['veloce']!, tuning: DATA.tuning, compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: 'd_voss', seed: 1,
    ...(setups ? { setups } : {}),
  }
}

function stateFor(config: RaceConfig, weatherState: RaceState['weatherState']): RaceState {
  return { ...initRace(config), weatherState }
}

let fakeClock = 0

describe('radio: low wing in the rain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // The cooldown is module-level state shared across tests; jump far past it.
    fakeClock += 1_000_000
    vi.setSystemTime(fakeClock)
  })
  afterEach(() => { vi.useRealTimers() })

  it('has low_wing_wet lines in the radio data', () => {
    expect(LINES.length).toBe(3)
  })

  it('warns once when rain arrives on a low wing, and not again', () => {
    const push = vi.fn()
    const config = configWith({ d_voss: 1 })
    let radio = makeRadioState()

    radio = processRadioTick(stateFor(config, 'DRY'), config, radio, push)
    expect(push).not.toHaveBeenCalled()

    vi.setSystemTime(fakeClock + 10_000)
    radio = processRadioTick(stateFor(config, 'WET'), config, radio, push)
    expect(push).toHaveBeenCalledTimes(1)
    expect(LINES).toContain(push.mock.calls[0]![0])
    expect(radio.lowWingWarned).toBe(true)

    vi.setSystemTime(fakeClock + 20_000)
    processRadioTick(stateFor(config, 'WET'), config, radio, push)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('stays silent on a high wing in the rain', () => {
    const push = vi.fn()
    const config = configWith({ d_voss: 4 })
    processRadioTick(stateFor(config, 'WET'), config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
  })

  it('stays silent when no setups exist', () => {
    const push = vi.fn()
    const config = configWith()
    processRadioTick(stateFor(config, 'WET'), config, makeRadioState(), push)
    expect(push).not.toHaveBeenCalled()
  })
})
