import type { RaceConfig, RaceState, Compound } from './types'
import { createRng } from './rng'
import { stepSector } from './race'

export interface ProjectionResult {
  rejoinPosition: number
  rejoinGap: number
  driverAheadId: string | null
  lapsProjected: number
}

export function projectPitNow(
  config: RaceConfig,
  state: RaceState,
  newCompound: Compound,
  seed: number,
): ProjectionResult {
  const { horizonLaps, useOvertakeRolls } = config.tuning.projection
  const playerDriverId = config.playerDriverId

  // Deep-clone to avoid mutating live state
  let projState: RaceState = JSON.parse(JSON.stringify(state)) as RaceState

  // Apply pit stop to player car in the clone
  const rngForStop = createRng(seed)
  const stopTime = config.tuning.pit.laneTimeLoss +
    config.tuning.pit.stopMean +
    (rngForStop() - 0.5) * 2 * config.tuning.pit.stopSigma

  projState = {
    ...projState,
    cars: projState.cars.map(car => {
      if (car.driverId !== playerDriverId) return car
      return { ...car, raceTime: car.raceTime + stopTime, compound: newCompound, tyreAge: 0, pitsDone: car.pitsDone + 1 }
    }),
  }

  // Fast-forward horizonLaps; optionally suppress overtake dice
  const projectionConfig = useOvertakeRolls ? config : {
    ...config,
    tuning: { ...config.tuning, overtaking: { ...config.tuning.overtaking, base: 0 } },
  }
  const rng = createRng(seed + 1)
  for (let i = 0; i < horizonLaps * 3; i++) {
    projState = stepSector(projectionConfig, projState, rng)
  }

  const playerCar = projState.cars.find(c => c.driverId === playerDriverId)!
  const position = playerCar.position

  const sortedByPosition = [...projState.cars].sort((a, b) => a.position - b.position)
  const aheadCar = sortedByPosition[position - 2] ?? null
  const rejoinGap = aheadCar ? playerCar.raceTime - aheadCar.raceTime : 0

  return {
    rejoinPosition: position,
    rejoinGap: Math.max(0, rejoinGap),
    driverAheadId: aheadCar?.driverId ?? null,
    lapsProjected: horizonLaps,
  }
}
