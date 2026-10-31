import type { PlayerCall } from '@engine/playerCalls'
import { handoverFromCalls, parFromHandover, prefixCalls } from '@engine/customStart'
import { describeSituation, type ScenarioSituation } from '@engine/scenario'
import type { Compound } from '@engine/types'
import { loadGameData } from '@data/validators'
import { buildConfigFromRecipe, type RaceRecipe } from './raceRecipe'
import { gameDataFingerprint } from './fingerprint'
import type { StartPayload } from './startCode'
import type { ActiveChallenge } from './scenarioStore'

export const MAX_CODE_CALLS = 255

export type MakeStartResult = { ok: true; payload: StartPayload } | { ok: false; reason: 'lap_range' | 'par_one' | 'par_retired' | 'too_many_calls' }

export function lapRange(recipe: RaceRecipe): { min: number; max: number } {
  const c = buildConfigFromRecipe(recipe)
  return { min: 1, max: (c.lapsOverride ?? c.circuit.laps) - 3 }
}

export function situationAt(recipe: RaceRecipe, calls: readonly PlayerCall[], lap: number): ScenarioSituation | null {
  const { state } = handoverFromCalls(buildConfigFromRecipe(recipe), calls, lap)
  return describeSituation(state, recipe.playerDriverId)
}

export function defaultStartName(circuitId: string, lap: number): string {
  const name = (loadGameData().circuits[circuitId]?.name ?? circuitId).replace(/\s+GP$/, '').toUpperCase().replace(/[^\x20-\x7E]/g, '')
  const suffix = ` L${lap}`
  return name.slice(0, 24 - suffix.length) + suffix
}

/** Spec 2026-10-24 §5.1, R21: goal = par - 1; par P1 or a retired par refuses the lap. */
export function makeCustomStart(recipe: RaceRecipe, calls: readonly PlayerCall[], lap: number, name?: string): MakeStartResult {
  const range = lapRange(recipe)
  if (!Number.isInteger(lap) || lap < range.min || lap > range.max) return { ok: false, reason: 'lap_range' }
  const prefix = prefixCalls(calls, lap)
  // The share code stores the call count in one byte (spec §5.5).
  if (prefix.length > MAX_CODE_CALLS) return { ok: false, reason: 'too_many_calls' }
  const config = buildConfigFromRecipe(recipe)
  const par = parFromHandover(config, calls, lap)
  if (par.retired) return { ok: false, reason: 'par_retired' }
  if (par.position <= 1) return { ok: false, reason: 'par_one' }
  const sit = situationAt(recipe, calls, lap)!
  return {
    ok: true,
    payload: {
      fingerprint: gameDataFingerprint(), recipe, calls: prefix, startLap: lap,
      expect: { position: sit.position, lapsRemaining: sit.lapsRemaining, compound: sit.compound as Compound, tyreAge: sit.tyreAge, par: par.position },
      name: name ?? defaultStartName(recipe.circuitId, lap),
    },
  }
}

export interface Rederived { situation: ScenarioSituation; par: number; parRetired: boolean; drift: boolean }

/** The start as THIS build plays it, and whether that differs from what the code promised (R23). */
export function rederive(p: StartPayload): Rederived | null {
  const situation = situationAt(p.recipe, p.calls, p.startLap)
  if (!situation) return null
  const par = parFromHandover(buildConfigFromRecipe(p.recipe), p.calls, p.startLap)
  const e = p.expect
  const drift = situation.position !== e.position || situation.lapsRemaining !== e.lapsRemaining
    || situation.compound !== e.compound || situation.tyreAge !== e.tyreAge || par.position !== e.par || par.retired
  return { situation, par: par.position, parRetired: par.retired, drift }
}

export function startChallenge(id: string, p: StartPayload, r: Rederived): ActiveChallenge {
  const circuit = loadGameData().circuits[p.recipe.circuitId]
  return {
    kind: 'start', id: `start-${id}`, name: p.name,
    blurb: `${circuit?.name ?? p.recipe.circuitId}, lap ${p.startLap}. P${r.situation.position} with ${r.situation.lapsRemaining} laps to go.`,
    circuitId: p.recipe.circuitId, seed: p.recipe.seed, playerDriverId: p.recipe.playerDriverId, startLap: p.startLap,
    sprint: p.recipe.sprint || undefined,
    goal: { position: Math.max(1, r.par - 1) },
    expect: { position: r.situation.position, lapsRemaining: r.situation.lapsRemaining, compound: r.situation.compound, tyreAge: r.situation.tyreAge, safetyCarOut: r.situation.safetyCarOut, par: r.par },
    recipe: p.recipe, calls: p.calls,
  }
}
