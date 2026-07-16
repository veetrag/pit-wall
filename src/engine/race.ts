import type { RaceConfig, RaceState, CarState, SectorIndex, OvertakeEvent, WeatherState } from './types'
import type { Rng } from './rng'
import { createRng, gaussianPair } from './rng'
import { computeSectorTime } from './lapModel'
import { generateWeatherTimeline } from './weather'
import { aiDecision } from './strategy'
import { UNLIMITED_TYRE_ALLOCATION, consumeTyreSet, effectiveTyreAge, tyreCliffFraction } from './tyres'

export function initRace(config: RaceConfig): RaceState {
  const cars: CarState[] = config.drivers.map((driver, i) => {
    const isPlayer = driver.id === config.playerDriverId
    const strategy = (isPlayer && config.playerStrategyOverride)
      ? config.playerStrategyOverride
      : config.strategies.find(s => s.teamId === driver.teamId) ?? {
          teamId: driver.teamId, startCompound: 'M' as const, plannedStops: [],
        }
    const baseAllocation = config.tyreAllocationBase ?? UNLIMITED_TYRE_ALLOCATION
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
      isPlayer,
      tyreAllocation: consumeTyreSet({ ...baseAllocation }, strategy.startCompound),
      compoundsUsed: [strategy.startCompound],
      lapsInDirtyAir: 0,
      retired: false,
      retiredLap: null,
    }
  })

  // Weather timeline (separate RNG stream so it doesn't affect main race seed)
  const weatherRng = createRng(config.weatherSeed ?? config.seed + 999999)
  const weatherTimeline = generateWeatherTimeline(
    config.circuit.laps,
    config.circuit,
    config.tuning,
    weatherRng,
  )
  const weatherState: WeatherState = weatherTimeline[0] ?? 'DRY'

  return {
    lap: 0,
    sector: 0,
    totalLaps: config.circuit.laps,
    cars,
    sectorResults: [],
    overtakeEvents: [],
    trackEvolutionLaps: 0,
    rngState: config.seed,
    weatherTimeline,
    weatherState,
  }
}

export function stepSector(config: RaceConfig, state: RaceState, rng: Rng): RaceState {
  const sector = state.sector as SectorIndex
  const newSectorResults = [...state.sectorResults]
  const newOvertakeEvents: OvertakeEvent[] = [...state.overtakeEvents]

  // 1. Compute sector time for each car. Retired cars are frozen entirely —
  // no more sector time, no more sim work happens to them.
  const updatedCars: CarState[] = state.cars.map(car => {
    if (car.retired) return car
    const result = computeSectorTime(config, car, sector, rng, state.weatherState)
    newSectorResults.push(result)
    let updated = { ...car, raceTime: car.raceTime + result.sectorTime }

    // Tyre failure risk: once cliffFraction runs meaningfully past the
    // threshold, roll a per-sector chance of a puncture/mechanical failure
    // that ends the car's race outright — the consequence that makes
    // "don't run tyres into the cliff and beyond" a real constraint, not
    // just an ever-steeper (but survivable) time-loss curve.
    const driver = config.drivers.find(d => d.id === car.driverId)!
    const spec = config.compounds[car.compound]
    if (spec) {
      const effAge = effectiveTyreAge(car, driver, state.weatherState, config.tuning)
      const cliffFrac = tyreCliffFraction(spec, effAge)
      const tf = config.tuning.tyreFailure
      const over = cliffFrac - tf.cliffFractionThreshold
      if (over > 0) {
        const chance = Math.min(tf.maxChancePerLap, tf.chancePerLapOverThreshold * over) / 3
        if (rng() < chance) {
          updated = { ...updated, retired: true, retiredLap: car.lap }
        }
      }
    }
    return updated
  })

  // Retired cars stop racing entirely — excluded from traffic, overtakes,
  // dirty air, and AI decisions below; merged back in for final classification.
  const activeCars = updatedCars.filter(c => !c.retired)
  const retiredCars = updatedCars.filter(c => c.retired)

  // 2. Sort by raceTime (fastest first = leader) then apply traffic penalty
  const sorted = [...activeCars].sort((a, b) => a.raceTime - b.raceTime)
  const penalisedCars = sorted.map((car, idx) => {
    if (idx === 0) return car
    const ahead = sorted[idx - 1]!
    const gap = car.raceTime - ahead.raceTime
    if (gap <= config.tuning.traffic.gapThreshold) {
      const paceAdv = calculatePaceAdvantage(config, car, ahead)
      const rawPenalty = config.tuning.traffic.penalty / 3
      const cappedPenalty = Math.min(rawPenalty, paceAdv * config.tuning.traffic.trafficCap)
      return { ...car, raceTime: car.raceTime + cappedPenalty }
    }
    return car
  })

  // 3. Sector-boundary overtake checks
  const afterOvertakesActive = resolveOvertakes(config, penalisedCars, sector, state.lap, rng, newOvertakeEvents)
  const afterOvertakes = [...afterOvertakesActive, ...retiredCars]

  // 4. Advance sector/lap counters, handle pit stops, increment tyre age
  const nextSector = ((sector + 1) % 3) as SectorIndex
  const lapCompleted = sector === 2
  const newLap = lapCompleted ? state.lap + 1 : state.lap

  // Dirty air: a car held within gapThreshold of the car ahead across a whole
  // lap counts as a lap "stuck in traffic" — checked against the post-overtake
  // running order so a successful pass this lap resets the follower's count.
  // Retired cars aren't part of this — they're no longer racing.
  const dirtyAirSorted = [...afterOvertakesActive].sort((a, b) => a.raceTime - b.raceTime)
  const inDirtyAir = new Set<string>()
  for (let i = 1; i < dirtyAirSorted.length; i++) {
    const car = dirtyAirSorted[i]!
    const ahead = dirtyAirSorted[i - 1]!
    if (car.raceTime - ahead.raceTime <= config.tuning.traffic.gapThreshold) {
      inDirtyAir.add(car.driverId)
    }
  }

  const finalCars: CarState[] = afterOvertakes.map(car => {
    let updated = { ...car }
    if (car.retired) return updated // frozen: no more laps, pits, or AI
    if (lapCompleted) {
      updated.tyreAge += 1
      updated.lap += 1
      updated.lapsInDirtyAir = inDirtyAir.has(car.driverId) ? car.lapsInDirtyAir + 1 : 0
      if (!updated.isPlayer) {
        // Build a state view for the AI decision (current positions, new lap)
        const stateForAI: RaceState = { ...state, lap: updated.lap, cars: afterOvertakes }
        const decision = aiDecision(config, updated, stateForAI, rng)
        updated.paceMode = decision.paceMode
        if (decision.pit) {
          const [stopNoise] = gaussianPair(rng)
          const team = config.teams.find(t => t.id === car.teamId)!
          const crewFactor = team.facets.pitCrew / 100
          const effectiveStopMean = config.tuning.pit.stopMean - crewFactor * config.tuning.pit.pitCrewMeanRelief
          const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
          const stopTime = config.tuning.pit.laneTimeLoss +
            effectiveStopMean +
            stopNoise * effectiveStopSigma
          updated = {
            ...updated,
            raceTime: updated.raceTime + stopTime,
            compound: decision.compound,
            tyreAge: 0,
            pitsDone: updated.pitsDone + 1,
            tyreAllocation: consumeTyreSet(updated.tyreAllocation, decision.compound),
            compoundsUsed: [...updated.compoundsUsed, decision.compound],
          }
        }
      }
    }
    return updated
  })

  // Two-compound rule: apply the penalty at the exact tick the race ends, so
  // it's baked into raceTime before the final classification sort below.
  const isRaceEnd = lapCompleted && newLap >= state.totalLaps
  const carsBeforeSort = isRaceEnd && config.mandatoryTwoCompound
    ? finalCars.map(car => {
        if (car.retired) return car // DNFs are exempt — they never finished
        const usedWet = car.compoundsUsed.some(c => c === 'I' || c === 'W')
        if (usedWet) return car // wet-affected races are exempt, matches real regs
        const distinctDry = new Set(car.compoundsUsed).size
        if (distinctDry < 2) {
          return { ...car, raceTime: car.raceTime + config.tuning.tyreRules.twoCompoundPenaltySec }
        }
        return car
      })
    : finalCars

  // Re-sort and assign positions: active cars by raceTime; retired cars sort
  // after every classified runner, ranked by retiredLap descending (later
  // retirement = closer to being classified — real motorsport convention).
  const resorted = [...carsBeforeSort].sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1
    if (a.retired && b.retired) return (b.retiredLap ?? 0) - (a.retiredLap ?? 0)
    return a.raceTime - b.raceTime
  })
  const positioned = resorted.map((car, idx) => ({ ...car, position: idx + 1 }))

  // Advance weather on lap change
  let newWeatherState = state.weatherState
  if (lapCompleted && newLap < state.weatherTimeline.length) {
    newWeatherState = state.weatherTimeline[newLap] ?? state.weatherState
  }

  return {
    ...state,
    lap: newLap,
    sector: nextSector,
    trackEvolutionLaps: lapCompleted ? state.trackEvolutionLaps + 1 : state.trackEvolutionLaps,
    cars: positioned,
    sectorResults: newSectorResults,
    overtakeEvents: newOvertakeEvents,
    weatherState: newWeatherState,
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

    // Hard gate: require genuine pace advantage before any dice roll
    if (paceAdv < config.tuning.overtaking.paceGateMin) continue

    const attackerDriver = config.drivers.find(d => d.id === behind.driverId)!
    const defenderDriver = config.drivers.find(d => d.id === ahead.driverId)!
    const attackMult = config.tuning.overtaking.attackRacecraftBase + (attackerDriver.facets.racecraft / 100)
    const defendMult = 1 - (defenderDriver.facets.racecraft / 100) * config.tuning.overtaking.defenceRacecraftFactor
    const prob = Math.min(
      0.85,
      (config.tuning.overtaking.base * sectorEase +
        paceAdv * config.tuning.overtaking.paceMultiplier * sectorEase) *
        attackMult * defendMult,
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
  // Use average car performance for pace advantage estimate
  const avgFaster = (fasterTeam.facets.power + fasterTeam.facets.aero + fasterTeam.facets.handling) / 3
  const avgSlower = (slowerTeam.facets.power + slowerTeam.facets.aero + slowerTeam.facets.handling) / 3
  const fasterCarRating = (1 - avgFaster / 100) * 9
  const slowerCarRating = (1 - avgSlower / 100) * 9
  const carAdv = (slowerCarRating - fasterCarRating) * config.tuning.carPerformance.deltaPerRating
  const fasterDriver = config.drivers.find(d => d.id === faster.driverId)!
  const slowerDriver = config.drivers.find(d => d.id === slower.driverId)!
  const fasterDriverSkill = (1 - fasterDriver.facets.pace / 100) * 10
  const slowerDriverSkill = (1 - slowerDriver.facets.pace / 100) * 10
  const driverAdv = (slowerDriverSkill - fasterDriverSkill) * config.tuning.driverPerformance.deltaPerSkill

  // Tyre freshness: fresher tyres on the faster car add pace advantage (saturates at 15-lap diff)
  const tyreAgeDiff = slower.tyreAge - faster.tyreAge
  const freshnessAdv = config.tuning.overtaking.tyreFreshnessBonusMax * Math.max(0, tyreAgeDiff) / 15

  // Pace mode: an attacker on PUSH vs. a defender on NEUTRAL/CONSERVE gains a
  // real overtake-probability edge, on top of whatever raceTime gap it already
  // bought them — paceDelta is negative for PUSH (faster), so the attacker's
  // more-negative delta minus the defender's produces a positive advantage.
  const paceModeAdv =
    (config.tuning.paceModes[slower.paceMode].paceDelta - config.tuning.paceModes[faster.paceMode].paceDelta) *
    config.tuning.overtaking.paceModeFactor

  return Math.max(0, carAdv + driverAdv + freshnessAdv + paceModeAdv)
}
