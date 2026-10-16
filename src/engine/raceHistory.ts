import type { NeutralisationKind, RaceConfig, RaceState } from './types'
import { initRace } from './race'
import { replay } from './debrief'
import type { PlayerCall } from './playerCalls'

/**
 * The lap chart's data (spec 2026-10-16 §4): every car's position at the end of
 * every lap, its stops and its retirement, plus the SC/VSC periods.
 *
 * Built on `replay` itself (via its read-only per-step observer, ruling P2), so
 * it is the race as it happened, never an approximation;
 * tests/engine/raceHistory.test.ts pins it against the live race. Runs once per
 * race, off the result screen's critical path, inside the debrief runner. It
 * adds nothing to RaceState and so cannot disturb the golden race.
 */
export interface CarHistory {
  driverId: string
  teamId: string
  isPlayer: boolean
  /** positions[0] = grid slot; positions[k] = position at the end of lap k. A retired car's array stops at the last lap it completed, so its length equals retiredLap. */
  positions: number[]
  /** 1-based lap of each stop, one entry per stop, in order. */
  pitLaps: number[]
  /** 1-based lap on which the car retired, or null. */
  retiredLap: number | null
  /** Final classified position (retired cars after every runner, as the race sorts them). */
  finish: number
}

export interface NeutralisationPeriod { kind: NeutralisationKind; startLap: number; endLap: number }

export interface LapHistory { totalLaps: number; lapsRun: number; cars: CarHistory[]; neutralisations: NeutralisationPeriod[] }

export function lapHistory(config: RaceConfig, seed: number, calls: readonly PlayerCall[]): LapHistory {
  const grid = initRace(config)
  const cars: CarHistory[] = grid.cars.map(c => ({
    driverId: c.driverId, teamId: c.teamId, isPlayer: c.isPlayer,
    positions: [c.position], pitLaps: [], retiredLap: null, finish: c.position,
  }))
  const byId = new Map(cars.map(h => [h.driverId, h]))
  const pitsAtLastSample = new Map(grid.cars.map(c => [c.driverId, c.pitsDone]))

  const sampleLapEnd = (state: Readonly<RaceState>) => {
    if (state.sector !== 0) return
    // A lap just completed; state.lap is its 1-based number.
    const lap = state.lap
    for (const car of state.cars) {
      const h = byId.get(car.driverId)
      if (h === undefined || h.retiredLap !== null) continue
      // Manual stops land between steps and AI/plan stops at the boundary;
      // either way they show up as pitsDone growing across this lap.
      const before = pitsAtLastSample.get(car.driverId) ?? 0
      for (let k = before; k < car.pitsDone; k++) h.pitLaps.push(lap)
      pitsAtLastSample.set(car.driverId, car.pitsDone)
      if (car.retired) {
        h.retiredLap = (car.retiredLap ?? lap - 1) + 1
        continue
      }
      h.positions.push(car.position)
    }
  }

  const { state } = replay(config, seed, calls, undefined, sampleLapEnd)

  for (const car of state.cars) {
    const h = byId.get(car.driverId)
    if (h !== undefined) h.finish = car.position
  }

  const neutralisations: NeutralisationPeriod[] = []
  let open: { kind: NeutralisationKind; startLap: number } | null = null
  for (const ev of state.incidents) {
    if (ev.kind === 'safety_car_deployed' || ev.kind === 'vsc_deployed') {
      open = { kind: ev.kind === 'vsc_deployed' ? 'vsc' : 'sc', startLap: ev.lap + 1 }
    } else if ((ev.kind === 'safety_car_ended' || ev.kind === 'vsc_ended') && open !== null) {
      neutralisations.push({ ...open, endLap: ev.lap + 1 })
      open = null
    }
  }
  // A race can end under a neutralisation (race.ts only clears it at a boundary).
  if (open !== null) neutralisations.push({ ...open, endLap: Math.max(open.startLap, state.lap) })

  return { totalLaps: state.totalLaps, lapsRun: state.lap, cars, neutralisations }
}
