import type { RaceConfig, CarState, SectorIndex, SectorResult } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { tyreDelta } from './tyres'

// Convert a 0-100 facet to the 0-9 engine rating (0=best, 9=worst)
function facetToRating9(facet: number): number {
  return (1 - facet / 100) * 9
}

export function computeSectorTime(
  config: RaceConfig,
  car: CarState,
  sector: SectorIndex,
  rng: Rng,
): SectorResult {
  const { tuning, circuit, compounds } = config
  const base = circuit.sectorBase[sector]!

  const driver = config.drivers.find(d => d.id === car.driverId)!
  const team = config.teams.find(t => t.id === car.teamId)!
  const df = driver.facets
  const tf = team.facets

  // --- Car delta: per-sector from matching facet (S1←power, S2←aero, S3←handling) ---
  const governingFacet = [tf.power, tf.aero, tf.handling][sector]!
  const carRating = facetToRating9(governingFacet)
  const weight = tuning.carPerformance.sectorSplit[sector]!
  const carDelta = carRating * tuning.carPerformance.deltaPerRating * weight * 3

  // --- Driver delta: from pace facet ---
  // Rescale 0-9 to 0-10 to match the driverPerformance.deltaPerSkill tuning constant
  const driverSkill = facetToRating9(df.pace) / 9 * 10
  const driverWeight = tuning.driverPerformance.sectorSplit[sector]!
  const driverDelta = driverSkill * tuning.driverPerformance.deltaPerSkill * driverWeight * 3

  // --- Tyre delta: effAge defers the cliff for good tyre managers on CONSERVE ---
  const compoundSpec = compounds[car.compound]!
  const degMultiplier = tuning.paceModes[car.paceMode].degMultiplier
  const tyreManagementFactor = 1 - (df.tyreManagement / 100) * 0.25
  const effAge = car.tyreAge * tyreManagementFactor * degMultiplier
  const tyreSectorDelta = tyreDelta(compoundSpec, effAge) / 3

  // --- Fuel: lighter as laps complete ---
  const fuelDelta = -(car.lap * tuning.fuel.effectPerLap) / 3

  // --- Track evolution ---
  const trackFraction = Math.max(0, 1 - car.lap / tuning.trackEvolution.decayLaps)
  const trackDelta = (tuning.trackEvolution.startDelta * trackFraction) / 3

  // --- Pace mode delta ---
  const modeDelta = tuning.paceModes[car.paceMode].paceDelta / 3

  // --- Noise: reduced by high consistency ---
  const [noise] = gaussianPair(rng)
  const effSigma = tuning.noise.sigmaPerSector * (1 - (df.consistency / 100) * 0.4)
  const noiseSample = noise * effSigma

  const raw = base + carDelta + driverDelta + tyreSectorDelta + fuelDelta + trackDelta + modeDelta + noiseSample

  return {
    driverId: car.driverId,
    sectorTime: Math.max(raw, base * 0.85),
    tyreContribution: tyreSectorDelta,
    trafficPenalty: 0,
    noiseSample,
  }
}
