import type { RaceConfig, RaceState, CarState, Compound, WeatherState } from './types'
import { resolveAllocatedCompound, consumeTyreSet } from './tyres'
import { bestDryCompound } from './strategy'
import { neutralisationKind } from './incidents'

/**
 * The conditions a red-flag restart is decided on, read from the state BEFORE
 * the lap-completing tick that restarts the race (the pending state the
 * player's card shows). The restart lap is `state.lap + 1`. One derivation for
 * the engine, the card default and the card itself (preflight S6).
 */
export function restartConditions(state: RaceState): { weather: WeatherState; lapsLeft: number } {
  const restartLap = state.lap + 1
  return {
    weather: state.weatherTimeline[restartLap] ?? state.weatherState,
    lapsLeft: state.totalLaps - restartLap,
  }
}

/**
 * Which tyre a car gets at the red-flag restart (spec 2026-10-17 §4, ruling
 * R11), and whether that change consumes its next planned stop. `car.lap` is
 * the lap about to start. `chosen` is the player's restart_tyre call (Task 10).
 */
export function restartTyre(
  config: RaceConfig, car: CarState, weather: WeatherState, lapsLeft: number, chosen?: Compound,
): { compound: Compound; consumesPlan: boolean } {
  // The engine never executes the team default for the player; only a chosen plan.
  const plan = car.isPlayer && !config.playerStrategyOverride ? [] : car.strategy.plannedStops
  const next = plan[car.pitsDone]
  const inWindow = next !== undefined && next.lap - car.lap <= config.tuning.incidents.redFlag.planWindowLaps
  const consumesPlan = inWindow && weather === 'DRY'
  if (chosen !== undefined) return { compound: chosen, consumesPlan }
  if (weather === 'WET') return { compound: 'W', consumesPlan: false }
  if (weather === 'DAMP') return { compound: 'I', consumesPlan: false }
  if (consumesPlan && next !== undefined) return { compound: next.compound, consumesPlan: true }
  if (config.compounds[car.compound]?.type === 'dry') return { compound: car.compound, consumesPlan: false }
  return { compound: bestDryCompound(config, lapsLeft), consumesPlan: false }
}

/**
 * The restart, in one step: order frozen as it stands (the incoming
 * `position`, i.e. the order the pending state showed -- preflight S9),
 * raceTime re-gridded to leader + (pos - 1) x qualifying.gridSlotGapSec (the
 * start-grid gap), and a free tyre change for every running car -- no stop
 * time; pitsDone + 1 only when a planned stop is consumed. Retired cars are
 * frozen. Pure.
 */
export function applyRedFlagRestart(
  config: RaceConfig, cars: CarState[], weather: WeatherState, lapsLeft: number, playerChoice?: Compound,
): CarState[] {
  const gap = config.tuning.qualifying.gridSlotGapSec
  const order = cars.filter(c => !c.retired).sort((a, b) => a.position - b.position)
  const leader = order[0]?.raceTime ?? 0
  const slot = new Map(order.map((c, i) => [c.driverId, i]))
  return cars.map(car => {
    const i = slot.get(car.driverId)
    if (i === undefined) return car
    const regridded: CarState = { ...car, raceTime: leader + i * gap }
    const { compound, consumesPlan } = restartTyre(config, car, weather, lapsLeft, car.isPlayer ? playerChoice : undefined)
    const resolved = resolveAllocatedCompound(compound, car.tyreAllocation)
    if (!resolved) return regridded      // no sets of any kind left: it restarts on what it has
    return {
      ...regridded,
      compound: resolved,
      tyreAge: 0,
      pitsDone: car.pitsDone + (consumesPlan ? 1 : 0),
      tyreAllocation: consumeTyreSet(car.tyreAllocation, resolved),
      compoundsUsed: [...car.compoundsUsed, resolved],
    }
  })
}

/** A red flag stands and the next step completes the lap: the restart. The UI stops here for the player's tyre. */
export function redFlagPending(state: RaceState): boolean {
  return neutralisationKind(state.safetyCar) === 'red' && state.sector === 2
}

/**
 * What the engine would fit for the player at this restart with no call --
 * the AI rule, resolved against the allocation exactly as applyRedFlagRestart
 * does (preflight E20) -- under the same restartConditions (S6). The card's default.
 */
export function defaultRestartCompound(config: RaceConfig, state: RaceState): Compound {
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return 'M'
  const { weather, lapsLeft } = restartConditions(state)
  const { compound } = restartTyre(config, player, weather, lapsLeft)
  return resolveAllocatedCompound(compound, player.tyreAllocation) ?? player.compound
}
