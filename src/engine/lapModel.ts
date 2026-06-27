import type { RaceConfig, CarState, SectorIndex, SectorResult } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { tyreDelta } from './tyres'

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

  // Car performance delta prorated to one sector (1/3 lap)
  const carDeltaPerLap = team.rating * tuning.carPerformance.deltaPerRating
  const carDelta = carDeltaPerLap * circuit.carSensitivity[sector]! * 3

  // Driver performance delta
  const driverDeltaPerLap = driver.skill * tuning.driverPerformance.deltaPerSkill
  const driverDelta = driverDeltaPerLap * circuit.driverSensitivity[sector]! * 3

  // Tyre delta (per-lap value prorated to sector, scaled by pace mode deg multiplier)
  const compoundSpec = compounds[car.compound]!
  const tyrePerLap = tyreDelta(compoundSpec, car.tyreAge)
  const tyreSectorDelta = (tyrePerLap / 3) * tuning.paceModes[car.paceMode].degMultiplier

  // Fuel: lighter car is faster; each completed lap burns one unit
  const fuelDelta = -(car.lap * tuning.fuel.effectPerLap) / 3

  // Track evolution: green track at start, decays to 0 over decayLaps
  const trackFraction = Math.max(0, 1 - car.lap / tuning.trackEvolution.decayLaps)
  const trackDelta = (tuning.trackEvolution.startDelta * trackFraction) / 3

  // Pace mode delta
  const modeDelta = tuning.paceModes[car.paceMode].paceDelta / 3

  // Gaussian noise
  const [noise] = gaussianPair(rng)
  const noiseSample = noise * tuning.noise.sigmaPerSector

  const raw = base + carDelta + driverDelta + tyreSectorDelta + fuelDelta + trackDelta + modeDelta + noiseSample

  return {
    driverId: car.driverId,
    sectorTime: Math.max(raw, base * 0.85),
    tyreContribution: tyreSectorDelta,
    trafficPenalty: 0,
    noiseSample,
  }
}
