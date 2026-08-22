import type { RaceConfig, CarState, SectorIndex, SectorResult, WeatherState } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { tyreDelta, effectiveTyreAge } from './tyres'
import { crossoverPenalty } from './weather'

// Convert a 0-100 facet to the 0-9 engine rating (0=best, 9=worst)
function facetToRating9(facet: number): number {
  return (1 - facet / 100) * 9
}

export function computeSectorTime(
  config: RaceConfig,
  car: CarState,
  sector: SectorIndex,
  rng: Rng,
  weatherState: WeatherState = 'DRY',
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
  // Per-circuit sensitivity, used RAW (spec §3, the owner's decision, and §5.1).
  // The vectors do NOT all sum to 1 -- car spans 0.78 (harbour_lights) to 1.05
  // (grand_savane), driver 1.00 to 1.36 (harbour_lights) -- so a circuit changes
  // HOW MUCH the car and driver matter, not merely which sector they matter in.
  // That is what makes MODEL_SPEC.md §3's per-circuit |dpos| ratio band of
  // 1.5-2.5x reachable from the 1.00x the calendar measured while these fields
  // were dead. Do not normalise them.
  // Was: tuning.carPerformance.sectorSplit[sector].
  const weight = circuit.carSensitivity[sector]!
  const carDelta = carRating * tuning.carPerformance.deltaPerRating * weight * 3

  // --- Driver delta: from pace facet ---
  // Rescale 0-9 to 0-10 to match the driverPerformance.deltaPerSkill tuning constant
  const driverSkill = facetToRating9(df.pace) / 9 * 10
  // Was: tuning.driverPerformance.sectorSplit[sector]. See the note above.
  const driverWeight = circuit.driverSensitivity[sector]!
  const driverDelta = driverSkill * tuning.driverPerformance.deltaPerSkill * driverWeight * 3

  // --- Tyre delta: effAge defers the cliff for good tyre managers on CONSERVE,
  // and accelerates it for the wrong compound in the wrong weather ---
  const cpSpec = compounds[car.compound]!
  const effAge = effectiveTyreAge(car, driver, weatherState, tuning)
  const tyreSectorDelta = tyreDelta(cpSpec, effAge) / 3

  // --- Weather crossover penalty (wrong compound type) ---
  const cpPenalty = crossoverPenalty(car.compound, weatherState, tuning) / 3

  // --- Fuel: lighter as laps complete ---
  const fuelDelta = -(car.lap * tuning.fuel.effectPerLap) / 3

  // --- Track evolution ---
  const trackFraction = Math.max(0, 1 - car.lap / tuning.trackEvolution.decayLaps)
  const trackDelta = (tuning.trackEvolution.startDelta * trackFraction) / 3

  // --- Pace mode delta ---
  const modeDelta = tuning.paceModes[car.paceMode].paceDelta / 3

  // --- Noise: reduced by high consistency ---
  const [noise, noise2] = gaussianPair(rng)
  const effSigma = tuning.noise.sigmaPerSector * (1 - (df.consistency / 100) * tuning.noise.consistencyReliefFactor)
  const noiseSample = noise * effSigma

  // --- Wet mismatch risk: dry-compound tyres in the wet can genuinely spin,
  // costing a chunk of real time. Chance scales with weather severity, mitigated
  // (not eliminated) by the driver's wetWeather skill — nobody is safe on slicks
  // in the wet, but a skilled wet driver spins less often. Rolled per sector.
  let spinLoss = 0
  if (cpSpec.type === 'dry' && weatherState !== 'DRY') {
    const baseChance = tuning.weather.wetIncident.spinChance[weatherState]
    const wetSkillRelief = (df.wetWeather / 100) * tuning.weather.wetSkillReliefMax
    const effChance = baseChance * (1 - wetSkillRelief)
    if (rng() < effChance) {
      const magnitude = tuning.weather.wetIncident.spinTimeLossMean + noise2 * tuning.weather.wetIncident.spinTimeLossSigma
      spinLoss = Math.max(0, magnitude)
    }
  } else if (cpSpec.type === 'wet' && weatherState === 'DRY') {
    // Mirrored risk: wet-family tyres on a genuinely dry track — cold, greasy,
    // and prone to a moment under braking, same consequence as slicks in the
    // wet above, just a single flat chance since there's only one direction
    // of mismatch to model here (inters/wets are legitimate in DAMP).
    const baseChance = tuning.weather.wetIncident.dryTrackSpinChance
    const wetSkillRelief = (df.wetWeather / 100) * tuning.weather.wetSkillReliefMax
    const effChance = baseChance * (1 - wetSkillRelief)
    if (rng() < effChance) {
      const magnitude = tuning.weather.wetIncident.spinTimeLossMean + noise2 * tuning.weather.wetIncident.spinTimeLossSigma
      spinLoss = Math.max(0, magnitude)
    }
  }

  const raw = base + carDelta + driverDelta + tyreSectorDelta + cpPenalty + fuelDelta + trackDelta + modeDelta + noiseSample + spinLoss

  return {
    driverId: car.driverId,
    sectorTime: Math.max(raw, base * 0.85),
    tyreContribution: tyreSectorDelta,
    trafficPenalty: 0,
    noiseSample,
    spinLoss,
  }
}
