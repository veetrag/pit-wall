import { loadGameData } from '@data/validators'
import { circuitTraits } from '@engine/circuitTraits'
import { Pill } from './Pill'

export type TraitId = 'night' | 'street' | 'high_wear' | 'sc_risk'
const GAME = loadGameData()
const META: Record<TraitId, { text: string; label: string; tone: 'dusk' | 'hot' | 'caution' }> = {
  night: { text: 'NIGHT RACE', label: 'Night race', tone: 'dusk' },
  street: { text: 'STREET', label: 'Street circuit', tone: 'dusk' },
  high_wear: { text: 'HIGH WEAR', label: 'High tyre wear', tone: 'hot' },
  sc_risk: { text: 'SAFETY CAR RISK', label: 'High safety car risk', tone: 'caution' },
}

/** Raw tyreWear at or above this is a HIGH WEAR circuit (presentation threshold, spec 2026-10-24 §1.7). */
export const HIGH_WEAR_THRESHOLD = 1.15

/** Spec 2026-10-24 §1.7: thresholds are presentation, so they live here, not in tuning. */
export function circuitTraitIds(circuitId: string): TraitId[] {
  const c = GAME.circuits[circuitId]
  if (!c) return []
  const t = circuitTraits(c, GAME.tuning)
  const out: TraitId[] = []
  if (c.timeOfDay === 'night') out.push('night')
  if (c.layout === 'street') out.push('street')
  // Raw tyreWear, not circuitTraits().wear, so a night discount can never hide HIGH WEAR.
  if ((c.tyreWear ?? 1) >= HIGH_WEAR_THRESHOLD) out.push('high_wear')
  if (t.crashRisk >= 1.3 || t.neutralisationRisk >= 1.3) out.push('sc_risk')
  return out
}

export function TraitPills({ circuitId }: { circuitId: string }) {
  const ids = circuitTraitIds(circuitId)
  if (ids.length === 0) return null
  return (
    <>
      {ids.map(id => <Pill key={id} tone={META[id].tone} ariaLabel={META[id].label}>{META[id].text}</Pill>)}
    </>
  )
}
