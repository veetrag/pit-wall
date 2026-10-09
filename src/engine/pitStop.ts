import type { RaceConfig, RaceState } from './types'
import { gaussianPair, type Rng } from './rng'
import { effectivePitLaneLoss } from './incidents'

/**
 * The time one pit stop costs, for ANY stop: an AI decision, the player's
 * plan, or the player's PIT button. One model, so a player's pit crew counts
 * however the stop is called. Draws exactly one gaussianPair from `rng`.
 */
export function pitStopTime(
  config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng,
): number {
  const [stopNoise] = gaussianPair(rng)
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  const effectiveStopMean = config.tuning.pit.stopMean - crewFactor * config.tuning.pit.pitCrewMeanRelief
  const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
  // Under yellow this is laneTimeLossUnderSc, not the circuit value.
  return effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) +
    effectiveStopMean + stopNoise * effectiveStopSigma
}
