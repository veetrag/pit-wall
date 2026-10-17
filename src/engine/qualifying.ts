import type {
  RaceConfig, CarState, SectorIndex, Compound, WeatherState,
  QualifyingCall, QualifyingLap, QualifyingResult, StrategyBrain,
} from './types'
import type { Rng } from './rng'
import { createRng } from './rng'
import { computeSectorTime } from './lapModel'
import { openingTimeline } from './weather'
import { UNLIMITED_TYRE_ALLOCATION } from './tyres'

/**
 * One flying lap per car, resolved by the same lap model that drives the race.
 *
 * That reuse is the point: a car that is fast in the race is fast in qualifying
 * BECAUSE it is the same model, so the upgrades bought in Development move the
 * grid without qualifying ever learning that progression exists.
 *
 * Pure and headless per CLAUDE.md 3 -- all randomness arrives through `rng`.
 */

// A qualifying lap is deliberately NOT a race lap. Each departure has a reason:
//   fuel zeroed        -- a qualifying car runs light; a race-start fuel load
//                         would make qualifying slower than the race's last lap
//   lapsInDirtyAir 0   -- a flying lap is run in clear air by definition
//   safetyCar null     -- there is no race running
//   tyreAge 0          -- a qualifying tyre is new
//
// paceMode is ALWAYS 'neutral'. computeSectorTime already adds
// paceModes[car.paceMode].paceDelta / 3 per sector, so mapping attack onto a
// pace mode as well as applying the attack paceDelta would double-count it.
function qualifyingCar(
  driverId: string,
  teamId: string,
  compound: Compound,
): CarState {
  return {
    driverId,
    teamId,
    position: 0,
    raceTime: 0,
    lap: 0,
    sector: 0 as SectorIndex,
    compound,
    tyreAge: 0,
    paceMode: 'neutral',
    pitted: false,
    pitsDone: 0,
    strategy: { teamId, startCompound: compound, plannedStops: [] },
    isPlayer: false,
    tyreAllocation: { ...UNLIMITED_TYRE_ALLOCATION },
    compoundsUsed: [compound],
    lapsInDirtyAir: 0,
    retired: false,
    retiredLap: null,
    retiredCause: null,
  }
}

/** The softest compound legal for these conditions. */
function softestFor(weather: WeatherState): Compound {
  if (weather === 'WET') return 'W'
  if (weather === 'DAMP') return 'I'
  return 'S'
}

/**
 * A rival's call comes from its team's existing strategy brain tier, which
 * buildRaceConfig already resolves and already varies by difficulty. Reusing it
 * means higher difficulties field more attacking rivals for the same reason
 * they field better race strategists -- rather than inventing a second AI.
 */
function rivalCall(brain: StrategyBrain, weather: WeatherState): QualifyingCall {
  const softest = softestFor(weather)
  if (brain === 'optimal') return { compound: softest, attack: 'attack' }
  if (brain === 'smart') return { compound: softest, attack: 'balanced' }
  return { compound: weather === 'DRY' ? 'M' : softest, attack: 'balanced' }
}

export function runQualifying(
  config: RaceConfig,
  rng: Rng,
  playerCall: QualifyingCall,
): QualifyingResult {
  const q = config.tuning.qualifying

  // Same weather the grid will form up in, derived the same way initRace does,
  // so a wet race is preceded by a wet qualifying.
  const timeline = openingTimeline({
    laps: config.circuit.laps,
    circuit: config.circuit,
    tuning: config.tuning,
    seed: config.seed,
    weatherSeed: config.weatherSeed,
    dryStart: config.dryStart,
    allDry: config.allDry,
  })
  const weather: WeatherState = timeline[0] ?? 'DRY'

  const laps: QualifyingLap[] = config.drivers.map(driver => {
    const isPlayer = driver.id === config.playerDriverId
    const brain = (config.strategies.find(s => s.teamId === driver.teamId)?.brain
      ?? 'naive') as StrategyBrain
    const call = isPlayer ? playerCall : rivalCall(brain, weather)
    const level = q.attackLevels[call.attack]

    const car = qualifyingCar(driver.id, driver.teamId, call.compound)
    let time = 0
    for (let s = 0; s < 3; s++) {
      time += computeSectorTime(config, car, s as SectorIndex, rng, weather, null).sectorTime
    }

    // Fuel is charged per lap completed, and a qualifying car runs light, so
    // the race's fuel term does not apply. computeSectorTime charges it from
    // car.lap, which is 0 here -- no subtraction needed, documented so nobody
    // "fixes" it later by adding a fuel load.

    time += level.paceDelta

    const scrappy = rng() < level.errorChance
    if (scrappy) time += q.scrappyLapPenalty

    return {
      driverId: driver.id,
      teamId: driver.teamId,
      time,
      compound: call.compound,
      attack: call.attack,
      scrappy,
    }
  })

  // Tie-break by driverId so the order is total and therefore reproducible.
  laps.sort((a, b) => (a.time - b.time) || a.driverId.localeCompare(b.driverId))

  return { laps, order: laps.map(l => l.driverId) }
}

/** The RNG stream qualifying draws from. Separate from the race seed. */
export function qualifyingRng(config: RaceConfig): Rng {
  return createRng(config.qualifyingSeed ?? config.seed + config.tuning.qualifying.seedOffset)
}
