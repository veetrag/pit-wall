import type { RaceConfig, RaceState, Compound } from './types'
import { createRng } from './rng'
import { stepSector } from './race'
import { pitStopTime } from './pitStop'
import { resolveAllocatedCompound, consumeTyreSet } from './tyres'
import { isFinished } from './debrief'

export interface ProjectionResult {
  rejoinPosition: number
  rejoinGap: number
  rejoinGapBehind: number
  driverAheadId: string | null
  driverBehindId: string | null
  lapsProjected: number
  netEstimatePosition: number
  netEstimateLap: number
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
  // Reads the safety car off the state being projected, which is the whole
  // reason safetyCar lives on RaceState (spec 5.3): the "if you pit now"
  // overlay prices a stop under yellow correctly with no extra plumbing.
  const playerTeamId = state.cars.find(c => c.driverId === playerDriverId)!.teamId
  // The EXPECTED stop: a slow stop is bad luck the player cannot plan for, so
  // the overlay never prices one (spec 1.6 §1).
  const stopTime = pitStopTime(config, playerTeamId, state.safetyCar, rngForStop, { allowSlow: false }).total

  projState = {
    ...projState,
    cars: projState.cars.map(car => {
      if (car.driverId !== playerDriverId) return car
      // Fit what the live stop would fit (applyPlayerPit): the set the
      // allocation actually has, consumed and recorded, so the two-compound
      // rule at the flag sees the stop.
      const fitted = resolveAllocatedCompound(newCompound, car.tyreAllocation) ?? newCompound
      return {
        ...car,
        raceTime: car.raceTime + stopTime,
        compound: fitted,
        tyreAge: 0,
        pitsDone: car.pitsDone + 1,
        tyreAllocation: consumeTyreSet(car.tyreAllocation, fitted),
        compoundsUsed: [...car.compoundsUsed, fitted],
      }
    }),
  }

  // Fast-forward horizonLaps; optionally suppress overtake dice
  const projectionConfig = useOvertakeRolls ? config : {
    ...config,
    tuning: { ...config.tuning, overtaking: { ...config.tuning.overtaking, base: 0 } },
  }
  const rng = createRng(seed + 1)
  // Never past the flag: a step after it only adds time to every car.
  for (let i = 0; i < horizonLaps * 3 && !isFinished(projState); i++) {
    projState = stepSector(projectionConfig, projState, rng)
  }

  const playerCar = projState.cars.find(c => c.driverId === playerDriverId)!
  const position = playerCar.position

  const sortedByPosition = [...projState.cars].sort((a, b) => a.position - b.position)
  const aheadCar = sortedByPosition[position - 2] ?? null
  const behindCar = sortedByPosition[position] ?? null
  const rejoinGap = aheadCar ? playerCar.raceTime - aheadCar.raceTime : 0
  const rejoinGapBehind = behindCar ? behindCar.raceTime - playerCar.raceTime : 0

  // Net estimate: continue to longer horizon from where we are now
  const { netEstimateHorizonLaps } = config.tuning.projection
  const extraLaps = netEstimateHorizonLaps - horizonLaps
  let netState = projState
  if (extraLaps > 0) {
    const rng2 = createRng(seed + 2)
    for (let i = 0; i < extraLaps * 3 && !isFinished(netState); i++) {
      netState = stepSector(projectionConfig, netState, rng2)
    }
  }
  const netPlayerCar = netState.cars.find(c => c.driverId === playerDriverId)!
  const netEstimateLap = Math.min(state.lap + netEstimateHorizonLaps, state.totalLaps)

  return {
    rejoinPosition: position,
    rejoinGap: Math.max(0, rejoinGap),
    rejoinGapBehind: Math.max(0, rejoinGapBehind),
    driverAheadId: aheadCar?.driverId ?? null,
    driverBehindId: behindCar?.driverId ?? null,
    lapsProjected: horizonLaps,
    netEstimatePosition: netPlayerCar.position,
    netEstimateLap,
  }
}
