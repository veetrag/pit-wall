import { drsTrains } from '@engine/index'
import type { RaceConfig, RaceState } from '@engine/types'

/**
 * Spec §3.4: consecutive car pairs inside each DRS train, for the canvas link.
 * Empty while DRS is disabled (drsTrains itself ignores `enabled`). Computed
 * once per race-state change, never per frame.
 */
export function trainLinkPairs(config: RaceConfig, state: Pick<RaceState, 'cars'>): [string, string][] {
  if (!config.tuning.drs.enabled) return []
  const out: [string, string][] = []
  for (const t of drsTrains(config, state)) {
    for (let i = 1; i < t.carIds.length; i++) out.push([t.carIds[i - 1]!, t.carIds[i]!])
  }
  return out
}
