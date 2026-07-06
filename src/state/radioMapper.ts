import radioData from '@data/radio.json'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import type { RaceState, RaceConfig } from '@engine/types'

type RadioPool = Record<string, string[]>
const pools = radioData as RadioPool

function pick(trigger: string, vars: Record<string, string | number> = {}): string | null {
  const pool = pools[trigger]
  if (!pool || pool.length === 0) return null
  const line = pool[Math.floor(Math.random() * pool.length)]!
  return line.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

let lastRadioMs = 0
const RADIO_COOLDOWN_MS = 2000
let lastPriority = 0

function tryPush(
  trigger: string,
  priority: 2 | 1 | 0,
  vars: Record<string, string | number>,
  pushFn: (msg: string, severity: 'info' | 'caution' | 'urgent') => void,
) {
  const now = Date.now()
  if (now - lastRadioMs < RADIO_COOLDOWN_MS && priority <= lastPriority) return
  const line = pick(trigger, vars)
  if (!line) return
  lastRadioMs = now
  lastPriority = priority
  const severity: 'info' | 'caution' | 'urgent' =
    priority === 2 ? 'urgent' : priority === 1 ? 'caution' : 'info'
  pushFn(line, severity)
}

export interface RadioState {
  prevOvertakeCount: number
  prevWeatherState: string
  prevLap: number
  prevPlayerTyreAge: number
  prevPlayerPos: number
  prevGap: number
  hasWon: boolean
  cliffWarned: boolean
}

export function makeRadioState(): RadioState {
  return {
    prevOvertakeCount: 0,
    prevWeatherState: 'DRY',
    prevLap: 0,
    prevPlayerTyreAge: 0,
    prevPlayerPos: -1,
    prevGap: Infinity,
    hasWon: false,
    cliffWarned: false,
  }
}

export function processRadioTick(
  state: RaceState,
  config: RaceConfig,
  radio: RadioState,
  pushAlert: (msg: string, severity: 'info' | 'caution' | 'urgent') => void,
): RadioState {
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return radio

  const next = { ...radio }
  const pos = player.position
  const totalLaps = state.totalLaps
  const compound = config.compounds[player.compound]

  // 1. Tyre cliff (high priority, fire once per stint)
  if (compound) {
    const driver = config.drivers.find(d => d.id === player.driverId)
    const effAge = driver ? effectiveTyreAge(player, driver, state.weatherState, config.tuning) : player.tyreAge
    const cliffFrac = tyreCliffFraction(compound, effAge)
    if (cliffFrac >= 0.75 && !radio.cliffWarned && player.tyreAge > 5) {
      tryPush('tyre_cliff', 2, {}, pushAlert)
      next.cliffWarned = true
    }
    if (player.tyreAge === 0) next.cliffWarned = false // reset after pit
  }

  // 2. Rain state change
  if (state.weatherState !== radio.prevWeatherState) {
    const arrived = state.weatherState !== 'DRY'
    tryPush(arrived ? 'rain_arrived' : 'rain_coming', 2, {}, pushAlert)
    next.prevWeatherState = state.weatherState
  } else if (state.weatherState === 'DRY' && state.lap < totalLaps - 3) {
    // warn if rain appears in near forecast
    const wt = state.weatherTimeline
    if (wt[2] != null && wt[2] !== 'DRY' && radio.prevWeatherState === 'DRY') {
      tryPush('rain_coming', 2, {}, pushAlert)
    }
  }

  // 3. Win / podium (fire once)
  if (state.lap >= totalLaps && !radio.hasWon) {
    if (pos === 1) {
      tryPush('win', 2, { pos }, pushAlert)
    } else if (pos <= 3) {
      tryPush('podium', 2, { pos }, pushAlert)
    }
    next.hasWon = true
  }

  // 4. Pit exit (tyreAge reset from non-zero)
  if (player.tyreAge === 0 && radio.prevPlayerTyreAge > 5) {
    tryPush('pit_exit', 1, {}, pushAlert)
  }
  next.prevPlayerTyreAge = player.tyreAge

  // 5. Overtakes
  const newOvertakes = state.overtakeEvents.length
  if (newOvertakes > radio.prevOvertakeCount) {
    const latest = state.overtakeEvents[newOvertakes - 1]!
    if (latest.overtakerId === player.driverId) {
      tryPush('overtake_made', 1, { pos }, pushAlert)
    } else if (latest.overtakenId === player.driverId) {
      tryPush('overtake_lost', 1, { pos }, pushAlert)
    }
    next.prevOvertakeCount = newOvertakes
  }

  // 6. Final lap
  if (state.lap === totalLaps - 1 && radio.prevLap < totalLaps - 1) {
    tryPush('final_lap', 1, {}, pushAlert)
  }
  next.prevLap = state.lap

  // 7. Gap to car ahead (low priority)
  const ahead = state.cars.find(c => c.position === pos - 1)
  if (ahead) {
    const curGap = Math.abs(player.raceTime - ahead.raceTime)
    const n = curGap.toFixed(1)
    if (curGap < radio.prevGap - 0.5 && curGap < 3) {
      tryPush('gap_closing', 0, { n }, pushAlert)
    } else if (curGap > radio.prevGap + 0.8 && radio.prevGap < 3) {
      tryPush('gap_pulling', 0, { n }, pushAlert)
    }
    next.prevGap = curGap
  }

  next.prevPlayerPos = pos
  return next
}
