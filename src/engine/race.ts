import type { RaceConfig, RaceState, CarState, SectorIndex, OvertakeEvent } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'
import { computeSectorTime } from './lapModel'

export function initRace(config: RaceConfig): RaceState {
  const cars: CarState[] = config.drivers.map((driver, i) => {
    const strategy = config.strategies.find(s => s.teamId === driver.teamId) ?? {
      teamId: driver.teamId, startCompound: 'M' as const, plannedStops: [],
    }
    return {
      driverId: driver.id,
      teamId: driver.teamId,
      position: i + 1,
      raceTime: 0,
      lap: 0,
      sector: 0 as SectorIndex,
      compound: strategy.startCompound,
      tyreAge: 0,
      paceMode: 'neutral',
      pitted: false,
      pitsDone: 0,
      strategy,
      isPlayer: driver.id === config.playerDriverId,
    }
  })

  return {
    lap: 0,
    sector: 0,
    totalLaps: config.circuit.laps,
    cars,
    sectorResults: [],
    overtakeEvents: [],
    trackEvolutionLaps: 0,
    rngState: config.seed,
  }
}

export function stepSector(config: RaceConfig, state: RaceState, rng: Rng): RaceState {
  const sector = state.sector as SectorIndex
  const newSectorResults = [...state.sectorResults]
  const newOvertakeEvents: OvertakeEvent[] = [...state.overtakeEvents]

  // 1. Compute sector time for each car
  const updatedCars: CarState[] = state.cars.map(car => {
    const result = computeSectorTime(config, car, sector, rng)
    newSectorResults.push(result)
    return { ...car, raceTime: car.raceTime + result.sectorTime }
  })

  // 2. Sort by raceTime (fastest first = leader) then apply traffic penalty
  const sorted = [...updatedCars].sort((a, b) => a.raceTime - b.raceTime)
  const penalisedCars = sorted.map((car, idx) => {
    if (idx === 0) return car
    const ahead = sorted[idx - 1]!
    const gap = car.raceTime - ahead.raceTime
    if (gap <= config.tuning.traffic.gapThreshold) {
      return { ...car, raceTime: car.raceTime + config.tuning.traffic.penalty / 3 }
    }
    return car
  })

  // 3. Sector-boundary overtake checks
  const afterOvertakes = resolveOvertakes(config, penalisedCars, sector, state.lap, rng, newOvertakeEvents)

  // 4. Advance sector/lap counters, handle pit stops, increment tyre age
  const nextSector = ((sector + 1) % 3) as SectorIndex
  const lapCompleted = sector === 2

  const finalCars: CarState[] = afterOvertakes.map(car => {
    let updated = { ...car }
    if (lapCompleted) {
      updated.tyreAge += 1
      updated.lap += 1
      const plannedStop = car.strategy.plannedStops.find(s => s.lap === updated.lap)
      if (plannedStop && !car.isPlayer) {
        const [stopNoise] = gaussianPair(rng)
        const stopTime = config.tuning.pit.laneTimeLoss +
          config.tuning.pit.stopMean +
          stopNoise * config.tuning.pit.stopSigma
        updated = {
          ...updated,
          raceTime: updated.raceTime + stopTime,
          compound: plannedStop.compound,
          tyreAge: 0,
          pitsDone: updated.pitsDone + 1,
        }
      }
    }
    return updated
  })

  // Re-sort and assign positions
  const resorted = [...finalCars].sort((a, b) => a.raceTime - b.raceTime)
  const positioned = resorted.map((car, idx) => ({ ...car, position: idx + 1 }))

  return {
    ...state,
    lap: lapCompleted ? state.lap + 1 : state.lap,
    sector: nextSector,
    trackEvolutionLaps: lapCompleted ? state.trackEvolutionLaps + 1 : state.trackEvolutionLaps,
    cars: positioned,
    sectorResults: newSectorResults,
    overtakeEvents: newOvertakeEvents,
  }
}

function resolveOvertakes(
  config: RaceConfig,
  cars: CarState[],
  sector: SectorIndex,
  lap: number,
  rng: Rng,
  events: OvertakeEvent[],
): CarState[] {
  const sorted = [...cars].sort((a, b) => a.raceTime - b.raceTime)
  const result = [...sorted]
  const sectorEase = config.tuning.overtaking.sectorFactor[sector]!

  // Find the single most eligible pair (smallest gap within threshold, pace advantage > 0)
  // One overtake per sector boundary — the overtaking discipline rule.
  let bestIdx = -1
  let bestProb = 0

  for (let i = 1; i < result.length; i++) {
    const behind = result[i]!
    const ahead = result[i - 1]!
    const gap = behind.raceTime - ahead.raceTime
    if (gap > config.tuning.traffic.gapThreshold) continue

    const paceAdv = calculatePaceAdvantage(config, behind, ahead)
    const prob = Math.min(
      0.85,
      config.tuning.overtaking.base * sectorEase +
      paceAdv * config.tuning.overtaking.paceMultiplier * sectorEase,
    )
    if (prob > bestProb) {
      bestProb = prob
      bestIdx = i
    }
  }

  if (bestIdx > 0 && rng() < bestProb) {
    const behind = result[bestIdx]!
    const ahead = result[bestIdx - 1]!
    result[bestIdx - 1] = behind
    result[bestIdx] = ahead
    events.push({ lap, sector, overtakerId: behind.driverId, overtakenId: ahead.driverId })
  }

  return result
}

function calculatePaceAdvantage(config: RaceConfig, faster: CarState, slower: CarState): number {
  const fasterTeam = config.teams.find(t => t.id === faster.teamId)!
  const slowerTeam = config.teams.find(t => t.id === slower.teamId)!
  const carAdv = (slowerTeam.rating - fasterTeam.rating) * config.tuning.carPerformance.deltaPerRating
  const fasterDriver = config.drivers.find(d => d.id === faster.driverId)!
  const slowerDriver = config.drivers.find(d => d.id === slower.driverId)!
  const driverAdv = (slowerDriver.skill - fasterDriver.skill) * config.tuning.driverPerformance.deltaPerSkill
  return Math.max(0, carAdv + driverAdv)
}
