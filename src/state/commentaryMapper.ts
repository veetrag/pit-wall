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
  prevPitsDone: Record<string, number>
  prevRetired: Record<string, boolean>
  prevWeatherState: WeatherState
  prevLap: number
  started: boolean
}

export function makeCommentaryState(): CommentaryState {
  return {
    prevOvertakeCount: 0,
    prevPitsDone: {},
    prevRetired: {},
    prevWeatherState: 'DRY',
    prevLap: -1,
    started: false,
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

  // Pits + retirements — any car in the top 10 by current position
  for (const car of state.cars) {
    const prevPits = prev.prevPitsDone[car.driverId] ?? 0
    if (car.pitsDone > prevPits && car.position <= BROADCAST_POSITION_CUTOFF) {
      const line = fill('pit', { lap, code: codeFor(config, car.driverId), compound: car.compound })
      if (line) lines.push(line)
    }
    next.prevPitsDone[car.driverId] = car.pitsDone

    const wasRetired = prev.prevRetired[car.driverId] ?? false
    if (car.retired && !wasRetired) {
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
