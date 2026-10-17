import type { SafetyCarState } from '@engine/types'
import type { RacePhase } from '@state/raceStore'
import { neutralisationKind } from '@engine/incidents'

/**
 * The track canvas's caution wash. Deliberately modest (spec section 6 surface
 * 5: the banner is the signal, this is atmosphere). The VSC wash is about half
 * the SC's so the two are distinguishable at a glance (spec 1.5 §1); a red flag
 * washes hot and stronger (spec 1.6 §4).
 *
 * Gated on phase because a race can END under a neutralisation and the canvas
 * renders in every phase except idle -- the results screen must not sit under
 * an unexplained wash. The red-flag card's phase keeps the wash behind it.
 */
export const SC_WASH_ALPHA = 0.05
export const VSC_WASH_ALPHA = 0.025
export const RED_WASH_ALPHA = 0.08

/** 0xFF4F84 mirrors --hot and 0xFFB020 mirrors --caution in src/styles/tokens.css -- change them together. */
export function cautionWashColor(safetyCar: SafetyCarState | null): number {
  const kind = neutralisationKind(safetyCar)
  switch (kind) {
    case 'red': return 0xFF4F84
    case 'sc':
    case 'vsc':
    case null: return 0xFFB020
    default: { const never: never = kind; return never }
  }
}

export function cautionWashAlpha(safetyCar: SafetyCarState | null, phase: RacePhase): number {
  if (phase !== 'racing' && phase !== 'starting' && phase !== 'red_flag') return 0
  const kind = neutralisationKind(safetyCar)
  switch (kind) {
    case null: return 0
    case 'sc': return SC_WASH_ALPHA
    case 'vsc': return VSC_WASH_ALPHA
    case 'red': return RED_WASH_ALPHA
    default: { const never: never = kind; return never }
  }
}
