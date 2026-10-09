import type { CircuitSpec, RaceConfig, SectorIndex, TuningConstants, WeatherState } from './types'

/** Rear-wing level. 1 = lowest downforce (fast on straights), 5 = highest. */
export type Wing = 1 | 2 | 3 | 4 | 5
export const WINGS: readonly Wing[] = [1, 2, 3, 4, 5]

/** Centred wing: -1 (level 1) .. +1 (level 5). Level 3 is exactly 0. */
export function wingD(w: Wing): number { return (w - 3) / 2 }

/** A car's wing. Absent setups, or a car not listed, is level 3 (no effect). */
export function wingOf(config: RaceConfig, driverId: string): Wing {
  return config.setups?.[driverId] ?? 3
}

function severity(t: TuningConstants, weather: WeatherState): number {
  return weather === 'DRY' ? 0 : t.setup.wetSeverity[weather]
}

/** Dry part of one sector's wing delta for centred wing d (seconds). */
function drySector(circuit: CircuitSpec, t: TuningConstants, d: number, sector: SectorIndex): number {
  const w = circuit.carSensitivity[sector]!
  const trade = sector === 0 ? d * t.setup.speedGain * w : -d * t.setup.gripGain * w
  return trade + (t.setup.balanceCost * d * d) / 3
}

/**
 * Seconds added to this car's sector. Pure, no rng. Exactly 0 at level 3.
 * Spec section 2: S1 +d*speedGain*w0; S2/S3 -d*gripGain*w; +balanceCost*d^2/3
 * every sector; -d*wetGain*severity when not dry.
 */
export function wingSectorDelta(config: RaceConfig, driverId: string, sector: SectorIndex, weather: WeatherState): number {
  const d = wingD(wingOf(config, driverId))
  if (d === 0) return 0
  return drySector(config.circuit, config.tuning, d, sector) - d * config.tuning.setup.wetGain * severity(config.tuning, weather)
}

/**
 * Multiplier on the overtake probability at this sector boundary. A lower
 * wing than the defender's helps the attacker; scaled by the sector's
 * overtakingFactor so the straights matter most. Exactly 1 when wings match.
 */
export function wingOvertakeFactor(config: RaceConfig, attackerId: string, defenderId: string, sector: SectorIndex): number {
  const diff = wingD(wingOf(config, defenderId)) - wingD(wingOf(config, attackerId))
  if (diff === 0) return 1
  return Math.max(0, 1 + config.tuning.setup.overtakeGain * diff * config.circuit.overtakingFactor[sector]!)
}

/** Expected per-lap seconds of a wing at a circuit, rain weighted by chance. */
export function expectedLapDelta(circuit: CircuitSpec, t: TuningConstants, wing: Wing, rainChance: number): number {
  const d = wingD(wing)
  const meanSev = (t.setup.wetSeverity.DAMP + t.setup.wetSeverity.WET) / 2
  let s = 0
  for (const sector of [0, 1, 2] as SectorIndex[]) s += drySector(circuit, t, d, sector)
  return s - 3 * d * t.setup.wetGain * meanSev * rainChance
}

/** The level with the lowest expected lap delta. Ties go to the level nearer 3. */
export function expectedBestWing(circuit: CircuitSpec, t: TuningConstants, rainChance: number): Wing {
  const order: Wing[] = [3, 2, 4, 1, 5]
  return order.reduce((b, w) =>
    expectedLapDelta(circuit, t, w, rainChance) < expectedLapDelta(circuit, t, b, rainChance) ? w : b)
}
