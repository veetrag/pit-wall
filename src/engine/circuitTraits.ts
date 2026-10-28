import type { CircuitSpec, RaceConfig, TuningConstants } from './types'

/** What effectiveTyreAge needs to price wear: the tuning and the circuit raced. */
export type TyreContext = Pick<RaceConfig, 'tuning' | 'circuit'>

export interface CircuitTraits { wear: number; crashRisk: number; neutralisationRisk: number }

/**
 * The circuit's race-behaviour multipliers (spec 2026-10-24 §1.3). Every absent
 * field is exactly 1, so a circuit with no trait races exactly as before --
 * byteIdentity and every shipped seed depend on that. Pure, no rng.
 */
export function circuitTraits(circuit: CircuitSpec, tuning: TuningConstants): CircuitTraits {
  const night = circuit.timeOfDay === 'night' ? tuning.timeOfDay.nightWearFactor : 1
  return {
    wear: (circuit.tyreWear ?? 1) * night,
    crashRisk: circuit.crashRisk ?? 1,
    neutralisationRisk: circuit.neutralisationRisk ?? 1,
  }
}
