import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { applyCall, type PlayerCall } from '@engine/playerCalls'
import { handoverFromCalls, parFromHandover, prefixCalls } from '@engine/customStart'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig, RaceState } from '@engine/types'
import { neutralisationKind } from '@engine/incidents'
import { redFlagPending } from '@engine/redFlag'
import { makeConfig, type TuningOverrides } from '../fixtures/raceHarness'

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

// A forced crash -> red flag (the redFlagCalls.test harness). The red flag
// stands mid-lap and its restart completes the lap, so a lap-boundary handover
// lands on the restart's result: pinned here across the red-flag lap.
const CRASH = {
  incidents: {
    driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
    safetyCar: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    vsc: { crashDeployChance: 0, mechanicalDeployChance: 0 },
    redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
  },
  mechanicalFailure: { baseChancePerLap: 0 },
  tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
}
function redConfig(): RaceConfig {
  const base = makeConfig(CRASH as TuningOverrides, 9)
  const player = base.drivers[0]!
  return {
    ...base,
    lapsOverride: 20,
    allDry: true,
    drivers: base.drivers.map((d, i) => ({ ...d, facets: { ...d.facets, consistency: i === 5 ? 0 : 100 } })),
    playerDriverId: player.id,
    playerStrategyOverride: { teamId: player.teamId, startCompound: 'M', plannedStops: [{ lap: 8, compound: 'H' }] },
  }
}

describe('custom start handover through a red flag', () => {
  const rc = redConfig()
  // The pit panel is open over the red flag (hold at step 1), the restart tyre is chosen at the pending step.
  const RED_CALLS: PlayerCall[] = [
    { step: 1, kind: 'hold_plan', hold: true },
    { step: 2, kind: 'restart_tyre', compound: 'S' },
    { step: 3, kind: 'hold_plan', hold: false },
    { step: 7, kind: 'pace', mode: 'push' },
  ]
  function liveRed(untilStep: number): RaceState[] {
    const rng = createRng(rc.seed)
    let s = initRace(rc)
    const seen: RaceState[] = [s]
    for (let step = 0; step < untilStep; step++) {
      for (const c of RED_CALLS) if (c.step === step) s = applyCall(rc, s, c, rng)
      s = stepSector(rc, s, rng)
      seen.push(s)
    }
    return seen
  }
  it('premise: a red flag stands and its restart is pending inside lap 1', () => {
    const seen = liveRed(3)
    expect(neutralisationKind(seen[1]!.safetyCar)).toBe('red')
    expect(redFlagPending(seen[2]!)).toBe(true)
  })
  it('HANDOVER MATCHES THE LIVE RACE across the red-flag lap and restart', () => {
    for (const lap of [1, 2, 3, 5]) {
      const { state } = handoverFromCalls(rc, RED_CALLS, lap)
      const seen = liveRed(lap * 3)
      // At lap 1 the panel is still open (released at step 3): the handover drops the hold, nothing else.
      const { planHold: _h, ...expected } = seen[seen.length - 1]!
      expect(JSON.stringify(state), `lap ${lap}`).toBe(JSON.stringify(expected))
    }
  }, 60_000)
  it('par honours lapsOverride: the AI drives to the shortened flag', () => {
    expect(rc.lapsOverride).toBe(20)
    const { state, rng } = handoverFromCalls(rc, RED_CALLS, 2)
    const auto = { ...rc, playerDriverId: '__none__' }
    let s: RaceState = { ...state, cars: state.cars.map(c => ({ ...c, isPlayer: false })) }
    for (let i = 2 * 3; i < 20 * 3; i++) s = stepSector(auto, s, rng)
    expect(s.lap).toBe(20)
    const car = s.cars.find(c => c.driverId === rc.playerDriverId)!
    expect(parFromHandover(rc, RED_CALLS, 2)).toEqual({ position: car.position, retired: car.retired })
  }, 60_000)
})
