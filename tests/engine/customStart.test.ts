import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { applyCall, type PlayerCall } from '@engine/playerCalls'
import { handoverFromCalls, parFromHandover, prefixCalls } from '@engine/customStart'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceState } from '@engine/types'

const config = buildRaceConfig(777, 'd_berg', 'highland', 'pro', { startCompound: 'M', plannedStops: [{ lap: 20, compound: 'H' }], wing: 2 })
const CALLS: PlayerCall[] = [
  { step: 0, kind: 'pace', mode: 'push' },
  { step: 30, kind: 'pace', mode: 'neutral' },
  { step: 45, kind: 'hold_plan', hold: true },
  { step: 46, kind: 'hold_plan', hold: false },
  { step: 50, kind: 'pit', compound: 'H' },
  { step: 90, kind: 'pace', mode: 'conserve' },
  { step: 120, kind: 'hold_plan', hold: true },
]

/** The race as raceStore drives it: calls land between steps. */
function live(untilStep: number): RaceState {
  const rng = createRng(config.seed)
  let s = initRace(config)
  for (let step = 0; step < untilStep; step++) {
    for (const c of CALLS) if (c.step === step) s = applyCall(config, s, c, rng)
    s = stepSector(config, s, rng)
  }
  return s
}

describe('custom start handover', () => {
  it('prefixCalls keeps only calls before the handover', () => {
    expect(prefixCalls(CALLS, 15).map(c => c.step)).toEqual([0, 30])
  })
  it('HANDOVER MATCHES THE LIVE RACE AT EVERY LAP', () => {
    for (const lap of [1, 10, 15, 16, 17, 25, 30]) {
      const { state } = handoverFromCalls(config, CALLS, lap)
      expect(JSON.stringify(state), `lap ${lap}`).toBe(JSON.stringify(live(lap * 3)))
    }
  }, 60_000)
  it('releases a plan hold left open at the handover, drawing nothing', () => {
    const { state } = handoverFromCalls(config, CALLS, 41)   // the hold at step 120 is still open at step 123
    expect(state.planHold).toBeUndefined()
    const { planHold: _h, ...expected } = live(41 * 3)
    expect(JSON.stringify(state)).toBe(JSON.stringify(expected))
  }, 60_000)
  it('returns the LIVE rng: stepping on reproduces the live race', () => {
    const { state, rng } = handoverFromCalls(config, CALLS, 12)
    let a = state
    for (let i = 0; i < 6; i++) a = stepSector(config, a, rng)
    expect(JSON.stringify(a)).toBe(JSON.stringify(live(42)))
  }, 60_000)
  it('par is the AI driving the player car from the handover', () => {
    const par = parFromHandover(config, CALLS, 25)
    const { state, rng } = handoverFromCalls(config, CALLS, 25)
    const auto = { ...config, playerDriverId: '__none__' }
    let s: RaceState = { ...state, cars: state.cars.map(c => ({ ...c, isPlayer: false })) }
    for (let i = 25 * 3; i < config.circuit.laps * 3; i++) s = stepSector(auto, s, rng)
    const car = s.cars.find(c => c.driverId === 'd_berg')!
    expect(par).toEqual({ position: car.position, retired: car.retired })
  }, 60_000)
})
