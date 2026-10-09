import type { RaceConfig, RaceState } from './types'
import { initRace, stepSector } from './race'
import { createRng, type Rng } from './rng'
import { applyCall, type PlayerCall } from './playerCalls'

/** The same finish condition raceStore.step uses. */
export function isFinished(state: RaceState): boolean {
  return state.lap >= state.totalLaps && state.sector === 0
}

/**
 * Runs a race forward from `start`, applying every call whose step is at or
 * after start.step at exactly that step (before the step is simulated), until
 * `untilStep` (exclusive of calls at that step) or the flag.
 */
export function simulate(
  config: RaceConfig,
  start: { state: RaceState; step: number },
  rng: Rng,
  calls: readonly PlayerCall[],
  untilStep = Number.POSITIVE_INFINITY,
): { state: RaceState; step: number } {
  const pending = calls.filter(c => c.step >= start.step).slice().sort((a, b) => a.step - b.step)
  let { state, step } = start
  let i = 0
  for (;;) {
    if (step >= untilStep) break
    while (i < pending.length && pending[i]!.step === step) {
      state = applyCall(config, state, pending[i]!, rng)
      i++
    }
    if (isFinished(state)) break
    state = stepSector(config, state, rng)
    step++
  }
  return { state, step }
}

/** The race as it happened: (config, seed, calls) -> identical state. */
export function replay(
  config: RaceConfig, seed: number, calls: readonly PlayerCall[], untilStep?: number,
): { state: RaceState; step: number; rng: Rng } {
  const rng = createRng(seed)
  const out = simulate(config, { state: initRace(config), step: 0 }, rng, calls, untilStep)
  return { ...out, rng }
}
