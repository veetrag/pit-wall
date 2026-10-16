import type { SafetyCarState } from '@engine/types'
import type { RacePhase } from '@state/raceStore'
import { neutralisationKind } from '@engine/incidents'

/**
 * The track canvas's caution wash. Deliberately modest (spec section 6 surface
 * 5: the banner is the signal, this is atmosphere). The VSC wash is about half
 * the SC's so the two are distinguishable at a glance (spec 1.5 §1).
 *
 * Gated on phase because a race can END under a neutralisation and the canvas
 * renders in every phase except idle -- the results screen must not sit under
 * an unexplained yellow wash.
 */
export const SC_WASH_ALPHA = 0.05
export const VSC_WASH_ALPHA = 0.025

export function cautionWashAlpha(safetyCar: SafetyCarState | null, phase: RacePhase): number {
  if (phase !== 'racing' && phase !== 'starting') return 0
  const kind = neutralisationKind(safetyCar)
  if (kind === 'sc') return SC_WASH_ALPHA
  if (kind === 'vsc') return VSC_WASH_ALPHA
  return 0
}
