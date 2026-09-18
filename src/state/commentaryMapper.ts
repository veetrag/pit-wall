import commentaryData from '@data/commentary.json'
import type { RaceState, RaceConfig, WeatherState } from '@engine/types'

type CommentaryPool = Record<string, string[]>
const pools = commentaryData as CommentaryPool

function fill(trigger: string, vars: Record<string, string | number> = {}): string | null {
  const pool = pools[trigger]
  if (!pool || pool.length === 0) return null
  const line = pool[Math.floor(Math.random() * pool.length)]!
  return line.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

// Neutral broadcast voice — factual, third-person, terse. Distinct from
// radioMapper's emotive pit-engineer voice: this only reports what happened,
// to any car, not just the player's.
export interface CommentaryState {
  prevOvertakeCount: number
  prevIncidentCount: number
  prevPitsDone: Record<string, number>
  prevRetired: Record<string, boolean>
  prevWeatherState: WeatherState
  prevLap: number
  started: boolean
}

/**
 * @param joinedAtLap the lap the ticker first sees. Non-zero means the race was
 *   already underway when this ticker was mounted -- a scenario takeover, where
 *   "Lights out and away we go" would be announcing a start that happened
 *   fourteen laps ago. Expressed as the join lap rather than a `isScenario`
 *   flag so the mapper stays ignorant of game modes: any future mid-race entry
 *   gets the right behaviour for free.
 */
export function makeCommentaryState(joinedAtLap = 0): CommentaryState {
  return {
    prevOvertakeCount: 0,
    prevIncidentCount: 0,
    prevPitsDone: {},
    prevRetired: {},
    prevWeatherState: 'DRY',
    prevLap: -1,
    started: joinedAtLap > 0,
  }
}

function codeFor(config: RaceConfig, driverId: string): string {
  return config.drivers.find(d => d.id === driverId)?.code ?? driverId.replace('d_', '').toUpperCase().slice(0, 3)
}

// Only the top-10 is broadcast-worthy — a backmarker shuffle among P16/P17
// isn't a line, but the same event inside the points is.
const BROADCAST_POSITION_CUTOFF = 10

export function processCommentaryTick(
  state: RaceState,
  config: RaceConfig,
  prev: CommentaryState,
): { lines: string[]; next: CommentaryState } {
  const next: CommentaryState = {
    ...prev,
    prevPitsDone: { ...prev.prevPitsDone },
    prevRetired: { ...prev.prevRetired },
  }
  const lines: string[] = []
  const lap = state.lap + 1

  if (!prev.started) {
    lines.push(fill('race_start') ?? '')
    next.started = true
  }

  // Overtakes — only the newest event(s) this tick, only if it landed inside the top 10
  const newOvertakeCount = state.overtakeEvents.length
  if (newOvertakeCount > prev.prevOvertakeCount) {
    for (let i = prev.prevOvertakeCount; i < newOvertakeCount; i++) {
      const ev = state.overtakeEvents[i]!
      const overtaker = state.cars.find(c => c.driverId === ev.overtakerId)
      if (overtaker && overtaker.position <= BROADCAST_POSITION_CUTOFF) {
        const line = fill('overtake', {
          lap: ev.lap + 1,
          attacker: codeFor(config, ev.overtakerId),
          defender: codeFor(config, ev.overtakenId),
          pos: overtaker.position,
        })
        if (line) lines.push(line)
      }
    }
  }
  next.prevOvertakeCount = newOvertakeCount

  // Incidents — only entries appended since the last tick. The log is
  // append-only and reaches ~100 entries in a race, so re-reading it whole
  // every tick would flood the ticker. Same shape as prevOvertakeCount above.
  const newIncidentCount = state.incidents.length
  for (let i = prev.prevIncidentCount; i < newIncidentCount; i++) {
    const ev = state.incidents[i]!
    const code = ev.driverId ? codeFor(config, ev.driverId) : ''
    const evLap = ev.lap + 1
    switch (ev.kind) {
      case 'driver_error': {
        const line = fill('driver_error', { lap: evLap, code, loss: (ev.timeLoss ?? 0).toFixed(1) })
        if (line) lines.push(line)
        break
      }
      case 'crash': {
        const line = fill('crash', { lap: evLap, code })
        if (line) lines.push(line)
        break
      }
      case 'safety_car_deployed': {
        const line = fill('safety_car_deployed', { lap: evLap })
        if (line) lines.push(line)
        break
      }
      case 'safety_car_ended': {
        const line = fill('safety_car_ended', { lap: evLap })
        if (line) lines.push(line)
        break
      }
      default: {
        const _exhaustive: never = ev.kind
        void _exhaustive
      }
    }
  }
  next.prevIncidentCount = newIncidentCount

  // Pits + retirements — any car in the top 10 by current position
  for (const car of state.cars) {
    const prevPits = prev.prevPitsDone[car.driverId] ?? 0
    if (car.pitsDone > prevPits && car.position <= BROADCAST_POSITION_CUTOFF) {
      const line = fill('pit', { lap, code: codeFor(config, car.driverId), compound: car.compound })
      if (line) lines.push(line)
    }
    next.prevPitsDone[car.driverId] = car.pitsDone

    // A crash already produced its own, more specific line from the incident
    // log above. Emitting the generic one too would report it twice.
    const wasRetired = prev.prevRetired[car.driverId] ?? false
    if (car.retired && !wasRetired && car.retiredCause !== 'crash') {
      const line = fill('retired', { lap: car.retiredLap ?? lap, code: codeFor(config, car.driverId), pos: car.position })
      if (line) lines.push(line)
    }
    next.prevRetired[car.driverId] = car.retired
  }

  // Weather transitions
  if (state.weatherState !== prev.prevWeatherState) {
    const key = state.weatherState === 'WET' ? 'weather_wet' : state.weatherState === 'DAMP' ? 'weather_damp' : 'weather_dry'
    const line = fill(key, { lap })
    if (line) lines.push(line)
  }
  next.prevWeatherState = state.weatherState

  // Final lap
  if (state.lap === state.totalLaps - 1 && prev.prevLap < state.totalLaps - 1) {
    const line = fill('final_lap', { lap })
    if (line) lines.push(line)
  }
  next.prevLap = state.lap

  return { lines: lines.filter(Boolean), next }
}
