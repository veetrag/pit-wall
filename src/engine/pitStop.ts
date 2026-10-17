import type { RaceConfig, RaceState } from './types'
import { gaussianPair, type Rng } from './rng'
import { effectivePitLaneLoss } from './incidents'

/** What one stop cost. `slow` is the part of `total` that was a slow stop (0 if it was not). */
export interface PitStopCost { total: number; slow: number }

/**
 * Standard normal CDF, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). Plain
 * arithmetic, so it is as deterministic as the rest of the engine.
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const poly = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  const erf = 1 - poly * Math.exp(-(x * x) / 2)
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

/** Lane loss plus the team's effective mean stationary time. No rng: the expected stop. */
export function expectedPitStopTime(config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar']): number {
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  // Under yellow the lane loss is the neutralisation's, not the circuit value.
  return effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) +
    (config.tuning.pit.stopMean - crewFactor * config.tuning.pit.pitCrewMeanRelief)
}

/**
 * The slow-stop seconds for a standard normal sample `g` (spec 2026-10-17 §1).
 * Slow when Φ(g) > 1 - p, i.e. g > Φ⁻¹(1 - p); the depth into that tail sets
 * where in [slowStopMin, slowStopMax] it lands. p = 0 returns 0 without even
 * evaluating Φ.
 */
export function slowStopComponent(config: RaceConfig, teamId: string, g: number): number {
  const pit = config.tuning.pit
  if (pit.slowStopChance <= 0) return 0
  const crew = config.teams.find(t => t.id === teamId)!.facets.pitCrew / 100
  const p = pit.slowStopChance * (1 - crew * pit.pitCrewSlowRelief)
  if (p <= 0) return 0
  const u = normalCdf(g)
  if (!(u > 1 - p)) return 0 // also 0 for a NaN draw
  const frac = Math.min(1, (u - (1 - p)) / p)
  return pit.slowStopMin + (pit.slowStopMax - pit.slowStopMin) * frac
}

/**
 * The time one pit stop costs, for ANY stop: an AI decision, the player's
 * plan, or the player's PIT button. One model, so a player's pit crew counts
 * however the stop is called. Draws exactly one gaussianPair from `rng`: the
 * first value is the stationary-time noise, the second decides a slow stop --
 * no extra draw, so the stream is the same with slow stops on or off.
 * `allowSlow: false` prices the expected stop (the projection).
 */
export function pitStopTime(
  config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng,
  opts: { allowSlow?: boolean } = {},
): PitStopCost {
  const [stopNoise, g2] = gaussianPair(rng)
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
  // Same association as the pre-1.6 expression ((lane + mean) + noise x sigma),
  // so a zero slow chance is byte-identical to it.
  const base = expectedPitStopTime(config, teamId, safetyCar) + stopNoise * effectiveStopSigma
  const slow = opts.allowSlow === false ? 0 : slowStopComponent(config, teamId, g2)
  return { total: base + slow, slow }
}
