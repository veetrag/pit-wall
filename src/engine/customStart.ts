import type { RaceConfig, RaceState } from './types'
import type { Rng } from './rng'
import type { PlayerCall } from './playerCalls'
import { applyPlanHold } from './playerCalls'
import { replay } from './debrief'
import { stepSector } from './race'

const AUTOPILOT = '__none__'

/** The calls made before the handover lap, in log order. */
export function prefixCalls(calls: readonly PlayerCall[], startLap: number): PlayerCall[] {
  return calls.filter(c => c.step < startLap * 3)
}

/**
 * A custom start's handover (spec 2026-10-24 §5.3): the race replayed with the
 * player's own calls up to the start of `startLap + 1`, and the LIVE rng --
 * continuing with a fresh one would fork the race. A plan hold left open (the
 * pit panel was up at the moment) is released; that draws nothing.
 */
export function handoverFromCalls(config: RaceConfig, calls: readonly PlayerCall[], startLap: number): { state: RaceState; rng: Rng } {
  const { state, rng } = replay(config, config.seed, prefixCalls(calls, startLap), startLap * 3)
  return { state: applyPlanHold(state, false), rng }
}

/** Par: where the player's car finishes when the AI drives it from the handover (the scenarios.test rule). */
export function parFromHandover(config: RaceConfig, calls: readonly PlayerCall[], startLap: number): { position: number; retired: boolean } {
  const { state, rng } = handoverFromCalls(config, calls, startLap)
  const auto: RaceConfig = { ...config, playerDriverId: AUTOPILOT }
  let s: RaceState = { ...state, cars: state.cars.map(c => ({ ...c, isPlayer: false })) }
  const total = (config.lapsOverride ?? config.circuit.laps) * 3
  for (let i = startLap * 3; i < total; i++) s = stepSector(auto, s, rng)
  const car = s.cars.find(c => c.driverId === config.playerDriverId)
  return { position: car?.position ?? s.cars.length, retired: car?.retired ?? true }
}
